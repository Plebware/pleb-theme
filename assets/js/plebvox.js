// assets/js/plebvox.js - PlebVox 3.4
// Static DOM-to-speech character mapping. Diagnostic callback is optional and
// only active when the hosting test page defines window.__plebvoxDiagnosticBoundary.
(function () {
    'use strict';

    let isReading = false, isPaused = false, utterance = null;
    let availableVoices = [], selectedVoice = null;
    let speechRate = 0.7, currentSectionData = null, activeControls = null;
    let sectionDataList = [], voicesLoaded = false, voiceLoadComplete = false;
    let voicePromise = null, sectionCounter = 0, customHighlightSupported = false;
    const HIGHLIGHT_NAME = 'plebvox-current-word';

    function installHighlightStyle() {
        if (!document.getElementById('plebvox-highlight-style')) {
            const s = document.createElement('style'); s.id = 'plebvox-highlight-style';
            s.textContent = '::highlight(' + HIGHLIGHT_NAME + '){background:#ffeb3b;color:#000;text-shadow:none}.plebvox-highlight{background:#ffeb3b!important;color:#000!important;padding:0 2px;border-radius:2px;box-shadow:0 0 0 2px #f57c00}';
            document.head.appendChild(s);
        }
        customHighlightSupported = !!(window.CSS && CSS.highlights && typeof Highlight === 'function');
    }
    function clearHighlights() {
        if (customHighlightSupported) { try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch (e) {} }
        document.querySelectorAll('.plebvox-highlight').forEach(function (el) { const p=el.parentNode; if(p){p.replaceChild(document.createTextNode(el.textContent||''),el);p.normalize();} });
    }
    function isPlebVoxControl(node){return node&&node.nodeType===Node.ELEMENT_NODE&&typeof node.className==='string'&&node.className.indexOf('plebvox-control-')===0;}
    function collectSectionNodes(startNode,endNode){const nodes=[];let n=startNode?startNode.nextSibling:null;while(n&&n!==endNode){if(n.nodeType!==Node.COMMENT_NODE&&!isPlebVoxControl(n))nodes.push(n);n=n.nextSibling;}return nodes;}
    function isIgnoredElement(tag){return ['SCRIPT','STYLE','NOSCRIPT','IMG','FIGURE','FIGCAPTION','SVG','CANVAS','VIDEO','AUDIO','IFRAME','OBJECT','EMBED','SOURCE','TRACK'].includes(tag);}
    function isBlockElement(tag){return ['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE'].includes(tag);}
    function isEmojiChar(ch){try{return /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/u.test(ch);}catch(e){return false;}}
    function buildTextMapping(contentNodes){
        const chars=[],map=[];let lastWasSpace=false;
        function appendSpace(node,offset){if(!chars.length||lastWasSpace)return;chars.push(' ');map.push({node:node,offset:offset});lastWasSpace=true;}
        function appendText(node){const raw=node.textContent||'';for(let i=0;i<raw.length;i++){const ch=raw[i];if(isEmojiChar(ch))continue;if(/\s/.test(ch)){appendSpace(node,i);continue;}chars.push(ch);map.push({node:node,offset:i});lastWasSpace=false;}}
        function process(node){if(node.nodeType===Node.COMMENT_NODE)return;if(node.nodeType===Node.TEXT_NODE){appendText(node);return;}if(node.nodeType!==Node.ELEMENT_NODE||isPlebVoxControl(node))return;const tag=node.tagName.toUpperCase();if(isIgnoredElement(tag))return;if(isBlockElement(tag))appendSpace(null,0);node.childNodes.forEach(process);if(isBlockElement(tag))appendSpace(null,0);}
        contentNodes.forEach(process);while(chars.length&&chars[0]===' '){chars.shift();map.shift();}while(chars.length&&chars[chars.length-1]===' '){chars.pop();map.pop();}
        const speechText=chars.join('');if(!speechText)return{speechText:'',mapping:[]};
        const mapping=[];let entry=null;for(let i=0;i<speechText.length;i++){const m=map[i];if(!m||!m.node)continue;if(!entry||entry.node!==m.node||entry.speechEnd!==i||entry.rawEnd!==m.offset){entry={node:m.node,rawText:m.node.textContent||'',speechStart:i,speechEnd:i+1,rawStart:m.offset,rawEnd:m.offset+1,charMap:[]};mapping.push(entry);}else{entry.speechEnd=i+1;entry.rawEnd=m.offset+1;}entry.charMap.push({speech:i,raw:m.offset});}
        return{speechText:speechText,mapping:mapping,charMap:map};
    }
    function rebuildSectionMapping(section){if(!section||!section.startNode||!section.endNode)return;section.contentNodes=collectSectionNodes(section.startNode,section.endNode);section.mappingData=buildTextMapping(section.contentNodes);section.text=section.mappingData.speechText;}
    function getPlebVoxSections(){const main=document.querySelector('main');if(!main)return[];const walker=document.createTreeWalker(main,NodeFilter.SHOW_COMMENT,{acceptNode:function(n){const t=(n.textContent||'').trim();return t==='PLEBVOX:START'||t==='PLEBVOX:END'?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});const markers=[];let n=walker.nextNode();while(n){markers.push({node:n,type:n.textContent.trim()});n=walker.nextNode();}const sections=[];let startNode=null;markers.forEach(function(m){if(m.type==='PLEBVOX:START'){if(!startNode)startNode=m.node;return;}if(m.type==='PLEBVOX:END'&&startNode){const endNode=m.node,nodes=collectSectionNodes(startNode,endNode),md=buildTextMapping(nodes);if(md.speechText)sections.push({number:sections.length+1,text:md.speechText,startNode:startNode,endNode:endNode,contentNodes:nodes,mappingData:md,controlElement:null});startNode=null;}});return sections;}
    function isWordChar(ch){if(!ch)return false;try{return /[\p{L}\p{N}\p{M}_]/u.test(ch);}catch(e){return /[A-Za-z0-9_]/.test(ch);}}
    function wordBounds(text,index){if(!text)return null;let i=Math.max(0,Math.min(index,text.length-1));if(!isWordChar(text[i])&&i>0&&isWordChar(text[i-1]))i--;if(!isWordChar(text[i]))return null;let a=i,b=i+1;while(a>0&&isWordChar(text[a-1]))a--;while(b<text.length&&isWordChar(text[b]))b++;return{start:a,end:b};}
    function findDomPosition(section,charIndex){const map=section&&section.mappingData&&section.mappingData.charMap||[];if(!map.length)return null;let i=Math.max(0,Math.min(charIndex,map.length-1));while(i>=0&&(!map[i]||!map[i].node))i--;return i>=0?{node:map[i].node,offset:map[i].offset}:null;}
    function highlightWordByCharIndex(charIndex,section){if(!section||!section.mappingData)return;clearHighlights();const text=section.mappingData.speechText||'',bounds=wordBounds(text,charIndex);if(!bounds)return;const first=findDomPosition(section,bounds.start),last=findDomPosition(section,bounds.end-1);if(!first||!last||!first.node||!last.node)return;if(customHighlightSupported){try{const range=new Range();range.setStart(first.node,first.offset);range.setEnd(last.node,last.offset+1);CSS.highlights.set(HIGHLIGHT_NAME,new Highlight(range));return;}catch(e){}}if(first.node===last.node){const node=first.node,p=node.parentNode,raw=node.textContent||'',before=document.createTextNode(raw.slice(0,first.offset)),word=document.createTextNode(raw.slice(first.offset,last.offset+1)),after=document.createTextNode(raw.slice(last.offset+1)),span=document.createElement('span');span.className='plebvox-highlight';span.appendChild(word);if(before.nodeValue)p.insertBefore(before,node);p.insertBefore(span,node);if(after.nodeValue)p.insertBefore(after,node);p.removeChild(node);rebuildSectionMapping(section);}}

    function speakSection(text,section,controls){
        if(!window.speechSynthesis){alert('Speech synthesis is not available in this browser.');return;}
        if(isReading&&currentSectionData===section){if(isPaused)resumeSpeech(controls);else pauseSpeech(controls);return;}
        if(isReading)stopSpeech(activeControls);rebuildSectionMapping(section);const speechText=section.mappingData.speechText;if(!speechText||speechText.length<2){alert('No readable content in this section.');return;}
        currentSectionData=section;activeControls=controls;utterance=new SpeechSynthesisUtterance(speechText);utterance.rate=speechRate;utterance.pitch=1;utterance.volume=1;
        waitForVoices().then(function(voices){
            availableVoices=voices;if(voices.length){voicesLoaded=true;voiceLoadComplete=true;updateAllVoiceSelectors();updateVoiceLoadStatus();if(!selectedVoice||!voices.includes(selectedVoice))selectedVoice=voices.find(v=>/^en[-_]ZA$/i.test(v.lang))||voices.find(v=>/^en[-_]GB$/i.test(v.lang))||voices.find(v=>/^en[-_]AU$/i.test(v.lang))||voices.find(v=>/^en/i.test(v.lang))||voices[0];if(selectedVoice){utterance.voice=selectedVoice;if(selectedVoice.lang)utterance.lang=selectedVoice.lang;}}
            utterance.onstart=function(){isReading=true;isPaused=false;clearHighlights();updateControls(controls,'playing');};
            utterance.onboundary=function(event){
                if(typeof event.charIndex==='number'&&event.charIndex>=0){
                    if(typeof window.__plebvoxDiagnosticBoundary==='function'){try{window.__plebvoxDiagnosticBoundary(event,utterance.text,section);}catch(e){}}
                    highlightWordByCharIndex(event.charIndex,section);
                } else if(typeof window.__plebvoxDiagnosticBoundary==='function'){try{window.__plebvoxDiagnosticBoundary(event,utterance.text,section);}catch(e){}}
            };
            utterance.onend=function(){isReading=false;isPaused=false;clearHighlights();updateControls(controls,'idle');activeControls=null;currentSectionData=null;};
            utterance.onerror=function(event){console.error('PlebVox speech error:',event);isReading=false;isPaused=false;clearHighlights();updateControls(controls,'idle');activeControls=null;currentSectionData=null;};
            try{window.speechSynthesis.cancel();window.speechSynthesis.speak(utterance);}catch(e){console.error('PlebVox: failed to speak',e);updateControls(controls,'idle');}
        });
    }
    function pauseSpeech(controls){if(isReading&&!isPaused){window.speechSynthesis.pause();isPaused=true;updateControls(controls,'paused');}}
    function resumeSpeech(controls){if(isReading&&isPaused){window.speechSynthesis.resume();isPaused=false;updateControls(controls,'playing');}}
    function stopSpeech(controls){try{window.speechSynthesis.cancel();}catch(e){}isReading=false;isPaused=false;clearHighlights();if(controls)updateControls(controls,'idle');activeControls=null;currentSectionData=null;}
    function updateControls(c,state){if(!c)return;c.playBtn.style.display='none';c.pauseBtn.style.display='none';c.resumeBtn.style.display='none';c.stopBtn.style.display='none';if(state==='playing'){c.pauseBtn.style.display='inline-block';c.stopBtn.style.display='inline-block';c.statusText.textContent='Playing...';}else if(state==='paused'){c.resumeBtn.style.display='inline-block';c.stopBtn.style.display='inline-block';c.statusText.textContent='Paused';}else{c.playBtn.style.display='inline-block';c.statusText.textContent='Ready';}}
    function generateUniqueId(prefix){sectionCounter++;return prefix+'-'+sectionCounter+'-'+Date.now().toString(36);}
    function waitForVoices(){if(voicePromise)return voicePromise;voicePromise=new Promise(function(resolve){if(!('speechSynthesis'in window)){resolve([]);return;}let voices=window.speechSynthesis.getVoices();if(voices.length){resolve(voices);return;}function changed(){voices=window.speechSynthesis.getVoices();if(voices.length){window.speechSynthesis.removeEventListener('voiceschanged',changed);resolve(voices);}}window.speechSynthesis.addEventListener('voiceschanged',changed);setTimeout(function(){voices=window.speechSynthesis.getVoices();if(voices.length){window.speechSynthesis.removeEventListener('voiceschanged',changed);resolve(voices);return;}setTimeout(function(){window.speechSynthesis.removeEventListener('voiceschanged',changed);resolve(window.speechSynthesis.getVoices());},1500);},500);});return voicePromise;}
    function loadVoices(){if(voicesLoaded)return;waitForVoices().then(function(v){availableVoices=v;voiceLoadComplete=true;if(v.length){selectedVoice=v.find(x=>/^en[-_]ZA$/i.test(x.lang))||v.find(x=>/^en[-_]GB$/i.test(x.lang))||v.find(x=>/^en/i.test(x.lang))||v[0];voicesLoaded=true;}updateAllVoiceSelectors();updateVoiceLoadStatus();}).catch(function(e){voiceLoadComplete=true;updateVoiceLoadStatus();});}
    function getBrowserInfo(){const ua=navigator.userAgent.toLowerCase();if(navigator.brave)return'Brave';if(ua.includes('vivaldi'))return'Vivaldi';if(ua.includes('edg'))return'Edge';if(ua.includes('firefox'))return'Firefox';if(ua.includes('chrome'))return'Chrome';if(ua.includes('safari'))return'Safari';return'Unknown';}
    function updateVoiceLoadStatus(){document.querySelectorAll('.plebvox-voice-status').forEach(function(el){if(!('speechSynthesis'in window))el.textContent='⚠️ Speech synthesis not supported';else if(!voiceLoadComplete)el.textContent='⏳ Loading voices...';else if(availableVoices.length)el.textContent='✅ '+availableVoices.length+' voice(s) available';else el.textContent='ℹ️ No system voices ('+getBrowserInfo()+')';});}
    function updateAllVoiceSelectors(){document.querySelectorAll('.plebvox-voice-select').forEach(populateVoiceSelector);}
    function populateVoiceSelector(select){const current=select.value;select.innerHTML='';availableVoices.forEach(function(v){const o=document.createElement('option');o.value=v.name+'|'+v.lang;o.textContent=v.name+' ('+v.lang+')';select.appendChild(o);});if(current)select.value=current;}
    function buildControls(section){const wrap=document.createElement('div');wrap.className='plebvox-controls';const play=document.createElement('button');play.className='plebvox-control-play';play.textContent='▶️ Read';const pause=document.createElement('button');pause.className='plebvox-control-pause';pause.textContent='⏸️ Pause';const resume=document.createElement('button');resume.className='plebvox-control-resume';resume.textContent='▶️ Resume';const stop=document.createElement('button');stop.className='plebvox-control-stop';stop.textContent='⏹️ Stop';const status=document.createElement('span');status.className='plebvox-status';status.textContent='Ready';play.onclick=function(){speakSection(section.text,section,controls);};pause.onclick=function(){pauseSpeech(controls);};resume.onclick=function(){resumeSpeech(controls);};stop.onclick=function(){stopSpeech(controls);};wrap.append(play,pause,resume,stop,status);const controls={container:wrap,playBtn:play,pauseBtn:pause,resumeBtn:resume,stopBtn:stop,statusText:status};return controls;}
    function init(){installHighlightStyle();sectionDataList=getPlebVoxSections();sectionDataList.forEach(function(section){const c=buildControls(section);section.controlElement=c;section.endNode.parentNode.insertBefore(c.container,section.endNode);});loadVoices();}
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
