// assets/js/plebvox.js - PlebVox 3.3
// Mobile fix: use a timed word-highlighting fallback when SpeechSynthesis
// does not emit boundary events, while retaining native CSS Highlight API
// and the existing DOM fallback when boundary events are available.
(function () {
    'use strict';

    let isReading = false, isPaused = false, utterance = null;
    let availableVoices = [], selectedVoice = null;
    let speechRate = 0.7, currentSectionData = null, activeControls = null;
    let sectionDataList = [], voicesLoaded = false, voiceLoadComplete = false;
    let voicePromise = null, sectionCounter = 0, customHighlightSupported = false;
    let fallbackTimer = null, boundarySeen = false, fallbackWordIndex = 0;
    const HIGHLIGHT_NAME = 'plebvox-current-word';

    function installHighlightStyle() {
        if (!document.getElementById('plebvox-highlight-style')) {
            const s = document.createElement('style');
            s.id = 'plebvox-highlight-style';
            s.textContent = '::highlight(' + HIGHLIGHT_NAME + '){background:#ffeb3b;color:#000;text-shadow:none}.plebvox-highlight{background:#ffeb3b!important;color:#000!important;padding:0 2px;border-radius:2px;box-shadow:0 0 0 2px #f57c00}';
            document.head.appendChild(s);
        }
        customHighlightSupported = !!(window.CSS && CSS.highlights && typeof Highlight === 'function');
        console.log('PlebVox 3.3: CSS Highlight API ' + (customHighlightSupported ? 'available' : 'unavailable; DOM fallback enabled'));
    }

    function clearFallbackTimer() {
        if (fallbackTimer) {
            clearTimeout(fallbackTimer);
            fallbackTimer = null;
        }
    }

    function clearHighlights() {
        clearFallbackTimer();
        if (customHighlightSupported) {
            try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch (e) {}
        }
        document.querySelectorAll('.plebvox-highlight').forEach(function (el) {
            const p = el.parentNode;
            if (p) {
                p.replaceChild(document.createTextNode(el.textContent || ''), el);
                p.normalize();
            }
        });
    }

    function cleanSpeechText(text) {
        let r = (text || '').replace(/\s+/g, ' ');
        try { r = r.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, ''); } catch (e) {}
        return r;
    }

    function needsSeparator(t) { return !!t && !/[\s(\[{\"'“‘]$/.test(t); }

    function isPlebVoxControl(node) {
        return node && node.nodeType === Node.ELEMENT_NODE && typeof node.className === 'string' && node.className.indexOf('plebvox-control-') === 0;
    }

    function collectSectionNodes(startNode, endNode) {
        const nodes = [];
        let n = startNode ? startNode.nextSibling : null;
        while (n && n !== endNode) {
            if (n.nodeType !== Node.COMMENT_NODE && !isPlebVoxControl(n)) nodes.push(n);
            n = n.nextSibling;
        }
        return nodes;
    }

    function buildTextMapping(contentNodes) {
        let speechText = '', entries = [];
        const ignore = ['SCRIPT','STYLE','NOSCRIPT','IMG','FIGURE','FIGCAPTION','SVG','CANVAS','VIDEO','AUDIO','IFRAME','OBJECT','EMBED','SOURCE','TRACK'];
        const blocks = ['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE'];
        function process(node) {
            if (node.nodeType === Node.COMMENT_NODE) return;
            if (node.nodeType === Node.TEXT_NODE) {
                const raw = node.textContent || '';
                if (!raw.trim()) return;
                const normalized = cleanSpeechText(raw).trim();
                if (!normalized) return;
                if (speechText && needsSeparator(speechText)) speechText += ' ';
                speechText += normalized;
                entries.push({node:node, rawText:raw, normalizedText:normalized});
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE || isPlebVoxControl(node)) return;
            const tag = node.tagName.toUpperCase();
            if (ignore.includes(tag)) return;
            if (blocks.includes(tag) && speechText && needsSeparator(speechText)) speechText += ' ';
            node.childNodes.forEach(process);
            if (blocks.includes(tag) && speechText && needsSeparator(speechText)) speechText += ' ';
        }
        contentNodes.forEach(process);
        speechText = speechText.replace(/\s+/g, ' ').trim();
        if (!speechText) return {speechText:'', mapping:[]};
        const mapping = [];
        let searchStart = 0;
        entries.forEach(function (e) {
            const i = speechText.indexOf(e.normalizedText, searchStart);
            if (i >= 0) {
                mapping.push({node:e.node, rawText:e.rawText, normalizedText:e.normalizedText, speechStart:i, speechEnd:i + e.normalizedText.length});
                searchStart = i + e.normalizedText.length;
            }
        });
        return {speechText:speechText, mapping:mapping};
    }

    function rebuildSectionMapping(section) {
        if (!section || !section.startNode || !section.endNode) return;
        const nodes = collectSectionNodes(section.startNode, section.endNode);
        section.contentNodes = nodes;
        section.mappingData = buildTextMapping(nodes);
        section.text = section.mappingData.speechText;
    }

    function getPlebVoxSections() {
        const main = document.querySelector('main');
        if (!main) return [];
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_COMMENT, {
            acceptNode:function(n) {
                const t = (n.textContent || '').trim();
                return t === 'PLEBVOX:START' || t === 'PLEBVOX:END' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        const markers = [];
        let n = walker.nextNode();
        while (n) { markers.push({node:n, type:n.textContent.trim()}); n = walker.nextNode(); }
        const sections = [];
        let startNode = null;
        markers.forEach(function(m) {
            if (m.type === 'PLEBVOX:START') {
                if (!startNode) startNode = m.node;
                else console.warn('PlebVox: nested START marker');
                return;
            }
            if (m.type === 'PLEBVOX:END' && startNode) {
                const endNode = m.node;
                const nodes = collectSectionNodes(startNode, endNode);
                const md = buildTextMapping(nodes);
                if (md.speechText) sections.push({number:sections.length + 1, text:md.speechText, startNode:startNode, endNode:endNode, contentNodes:nodes, mappingData:md, controlElement:null});
                startNode = null;
            }
        });
        if (startNode) console.warn('PlebVox: START marker has no matching END marker');
        return sections;
    }

    function isWordChar(ch) {
        if (!ch) return false;
        try { return /[\p{L}\p{N}\p{M}_]/u.test(ch); } catch (e) { return /[A-Za-z0-9_]/.test(ch); }
    }

    function wordBounds(text, index) {
        if (!text) return null;
        let i = Math.max(0, Math.min(index, text.length - 1));
        if (!isWordChar(text[i]) && i > 0 && isWordChar(text[i - 1])) i--;
        if (!isWordChar(text[i])) return null;
        let a = i, b = i + 1;
        while (a > 0 && isWordChar(text[a - 1])) a--;
        while (b < text.length && isWordChar(text[b])) b++;
        return {start:a, end:b};
    }

    function normalizedToRaw(rawText, offset) {
        let raw = 0, norm = 0, ws = false;
        while (raw < rawText.length && norm < offset) {
            const ch = rawText[raw];
            if (/\s/.test(ch)) { if (!ws) { norm++; ws = true; } }
            else { ws = false; norm++; }
            raw++;
        }
        return raw;
    }

    function findMappingEntry(section, charIndex) {
        const m = section && section.mappingData && section.mappingData.mapping || [];
        for (let i = 0; i < m.length; i++) if (charIndex >= m[i].speechStart && charIndex < m[i].speechEnd) return m[i];
        for (let i = 0; i < m.length; i++) if (charIndex === m[i].speechEnd) return m[i];
        return null;
    }

    function highlightWordByCharIndex(charIndex, section) {
        if (!section || !section.mappingData) return;
        clearHighlights();
        const entry = findMappingEntry(section, charIndex);
        if (!entry || !entry.node || !entry.node.parentNode) return;
        let relative = charIndex - entry.speechStart;
        if (relative >= entry.normalizedText.length) relative = entry.normalizedText.length - 1;
        const bounds = wordBounds(entry.normalizedText, relative);
        if (!bounds) return;
        const rawStart = normalizedToRaw(entry.rawText, bounds.start);
        const rawEnd = normalizedToRaw(entry.rawText, bounds.end);
        if (rawEnd <= rawStart) return;
        if (customHighlightSupported) {
            try {
                const range = new Range();
                range.setStart(entry.node, rawStart);
                range.setEnd(entry.node, rawEnd);
                CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
                return;
            } catch (e) { console.warn('PlebVox: CSS highlight failed; using DOM fallback', e); }
        }
        const node = entry.node, p = node.parentNode, raw = node.textContent || '';
        const before = document.createTextNode(raw.slice(0, rawStart));
        const word = document.createTextNode(raw.slice(rawStart, rawEnd));
        const after = document.createTextNode(raw.slice(rawEnd));
        const span = document.createElement('span');
        span.className = 'plebvox-highlight';
        span.appendChild(word);
        if (before.nodeValue) p.insertBefore(before, node);
        p.insertBefore(span, node);
        if (after.nodeValue) p.insertBefore(after, node);
        p.removeChild(node);
        rebuildSectionMapping(section);
    }

    function getWordStarts(text) {
        const starts = [];
        let inWord = false;
        for (let i = 0; i < text.length; i++) {
            const word = isWordChar(text[i]);
            if (word && !inWord) starts.push(i);
            inWord = word;
        }
        return starts;
    }

    // Android/browser speech engines may speak correctly but emit no boundary events.
    // In that case, estimate word timing so accessibility highlighting still works.
    function startMobileHighlightFallback(section) {
        clearFallbackTimer();
        if (!section || !section.mappingData || boundarySeen) return;
        const text = section.mappingData.speechText || '';
        const starts = getWordStarts(text);
        if (!starts.length) return;
        fallbackWordIndex = 0;

        function tick() {
            if (!isReading || isPaused || currentSectionData !== section || boundarySeen) return;
            if (fallbackWordIndex >= starts.length) return;
            const index = starts[fallbackWordIndex++];
            highlightWordByCharIndex(index, section);
            const bounds = wordBounds(text, index);
            const chars = bounds ? bounds.end - bounds.start : 5;
            const msPerChar = 115 / Math.max(0.5, speechRate);
            const delay = Math.max(180, Math.min(950, Math.round(chars * msPerChar + 110)));
            fallbackTimer = setTimeout(tick, delay);
        }
        tick();
    }

    function speakSection(text, section, controls) {
        if (!window.speechSynthesis) { alert('Speech synthesis is not available in this browser.'); return; }
        if (isReading && currentSectionData === section) {
            if (isPaused) resumeSpeech(controls); else pauseSpeech(controls);
            return;
        }
        if (isReading) stopSpeech(activeControls);
        rebuildSectionMapping(section);
        const speechText = section.mappingData.speechText;
        if (!speechText || speechText.length < 2) { alert('No readable content in this section.'); return; }
        currentSectionData = section;
        activeControls = controls;
        boundarySeen = false;
        fallbackWordIndex = 0;
        utterance = new SpeechSynthesisUtterance(speechText);
        utterance.rate = speechRate;
        utterance.pitch = 1;
        utterance.volume = 1;

        waitForVoices().then(function(voices) {
            availableVoices = voices;
            if (voices.length) {
                voicesLoaded = true;
                voiceLoadComplete = true;
                updateAllVoiceSelectors();
                updateVoiceLoadStatus();
                if (!selectedVoice || !voices.includes(selectedVoice)) {
                    selectedVoice = voices.find(v => /^en[-_]ZA$/i.test(v.lang)) || voices.find(v => /^en[-_]GB$/i.test(v.lang)) || voices.find(v => /^en[-_]AU$/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang)) || voices[0];
                }
                if (selectedVoice) {
                    utterance.voice = selectedVoice;
                    if (selectedVoice.lang) utterance.lang = selectedVoice.lang;
                }
            }

            utterance.onstart = function() {
                isReading = true;
                isPaused = false;
                boundarySeen = false;
                clearHighlights();
                updateControls(controls, 'playing');
                // Give browsers a short opportunity to provide native boundary events.
                // If none arrive, switch to the mobile-safe timed fallback.
                fallbackTimer = setTimeout(function() {
                    if (!boundarySeen && isReading && !isPaused) startMobileHighlightFallback(section);
                }, 900);
            };

            utterance.onboundary = function(event) {
                if (typeof event.charIndex !== 'number' || event.charIndex < 0) return;
                boundarySeen = true;
                clearFallbackTimer();
                highlightWordByCharIndex(event.charIndex, section);
            };

            utterance.onend = function() {
                isReading = false;
                isPaused = false;
                clearHighlights();
                updateControls(controls, 'idle');
                activeControls = null;
                currentSectionData = null;
            };

            utterance.onerror = function(event) {
                console.error('PlebVox speech error:', event);
                isReading = false;
                isPaused = false;
                clearHighlights();
                updateControls(controls, 'idle');
                activeControls = null;
                currentSectionData = null;
            };

            try {
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utterance);
            } catch (e) {
                console.error('PlebVox: failed to speak', e);
                updateControls(controls, 'idle');
            }
        });
    }

    function pauseSpeech(controls) {
        if (isReading && !isPaused) {
            window.speechSynthesis.pause();
            isPaused = true;
            clearFallbackTimer();
            updateControls(controls, 'paused');
        }
    }

    function resumeSpeech(controls) {
        if (isReading && isPaused) {
            window.speechSynthesis.resume();
            isPaused = false;
            updateControls(controls, 'playing');
            if (!boundarySeen && currentSectionData) startMobileHighlightFallback(currentSectionData);
        }
    }

    function stopSpeech(controls) {
        try { window.speechSynthesis.cancel(); } catch (e) {}
        isReading = false;
        isPaused = false;
        boundarySeen = false;
        clearHighlights();
        if (controls) updateControls(controls, 'idle');
        activeControls = null;
        currentSectionData = null;
    }

    function updateControls(c, state) {
        if (!c) return;
        c.playBtn.style.display = 'none';
        c.pauseBtn.style.display = 'none';
        c.resumeBtn.style.display = 'none';
        c.stopBtn.style.display = 'none';
        if (state === 'playing') {
            c.pauseBtn.style.display = 'inline-block';
            c.stopBtn.style.display = 'inline-block';
            c.statusText.textContent = 'Playing...';
        } else if (state === 'paused') {
            c.resumeBtn.style.display = 'inline-block';
            c.stopBtn.style.display = 'inline-block';
            c.statusText.textContent = 'Paused';
        } else {
            c.playBtn.style.display = 'inline-block';
            c.statusText.textContent = 'Ready';
        }
    }

    function generateUniqueId(prefix) { sectionCounter++; return prefix + '-' + sectionCounter + '-' + Date.now().toString(36); }

    function waitForVoices() {
        if (voicePromise) return voicePromise;
        voicePromise = new Promise(function(resolve) {
            if (!('speechSynthesis' in window)) { resolve([]); return; }
            let voices = window.speechSynthesis.getVoices();
            if (voices.length) { resolve(voices); return; }
            function changed() {
                voices = window.speechSynthesis.getVoices();
                if (voices.length) {
                    window.speechSynthesis.removeEventListener('voiceschanged', changed);
                    resolve(voices);
                }
            }
            window.speechSynthesis.addEventListener('voiceschanged', changed);
            try { window.speechSynthesis.cancel(); } catch (e) {}
            setTimeout(function() {
                voices = window.speechSynthesis.getVoices();
                if (voices.length) {
                    window.speechSynthesis.removeEventListener('voiceschanged', changed);
                    resolve(voices);
                    return;
                }
                setTimeout(function() {
                    window.speechSynthesis.removeEventListener('voiceschanged', changed);
                    resolve(window.speechSynthesis.getVoices());
                }, 1500);
            }, 500);
        });
        return voicePromise;
    }

    function loadVoices() {
        if (voicesLoaded) return;
        waitForVoices().then(function(v) {
            availableVoices = v;
            voiceLoadComplete = true;
            if (v.length) {
                selectedVoice = v.find(x => /^en[-_]ZA$/i.test(x.lang)) || v.find(x => /^en[-_]GB$/i.test(x.lang)) || v.find(x => /^en/i.test(x.lang)) || v[0];
                voicesLoaded = true;
            }
            updateAllVoiceSelectors();
            updateVoiceLoadStatus();
        }).catch(function(e) {
            console.warn('PlebVox: voice loading error', e);
            voiceLoadComplete = true;
            updateVoiceLoadStatus();
        });
    }

    function getBrowserInfo() {
        const ua = navigator.userAgent.toLowerCase();
        if (navigator.brave) return 'Brave';
        if (ua.includes('vivaldi')) return 'Vivaldi';
        if (ua.includes('edg')) return 'Edge';
        if (ua.includes('firefox')) return 'Firefox';
        if (ua.includes('chrome')) return 'Chrome';
        if (ua.includes('safari')) return 'Safari';
        return 'Unknown';
    }

    function updateVoiceLoadStatus() {
        document.querySelectorAll('.plebvox-voice-status').forEach(function(el) {
            if (!('speechSynthesis' in window)) el.textContent = '⚠️ Speech synthesis not supported';
            else if (!voiceLoadComplete) el.textContent = '⏳ Loading voices...';
            else if (availableVoices.length) el.textContent = '✅ ' + availableVoices.length + ' voice(s) available';
            else el.textContent = 'ℹ️ No system voices (' + getBrowserInfo() + ')';
        });
    }

    function updateAllVoiceSelectors() { document.querySelectorAll('.plebvox-voice-select').forEach(populateVoiceSelector); }

    function populateVoiceSelector(select) {
        const current = select.value;
        select.innerHTML = '';
        if (!availableVoices.length) {
            const o = document.createElement('option'); o.value = ''; o.textContent = 'No voices available'; select.appendChild(o); return;
        }
        availableVoices.forEach(function(v) {
            const o = document.createElement('option');
            o.value = v.name;
            let f = '🌐';
            if (/^en[-_]GB$/i.test(v.lang)) f = '🇬🇧';
            else if (/^en[-_]US$/i.test(v.lang)) f = '🇺🇸';
            else if (/^en[-_]AU$/i.test(v.lang)) f = '🇦🇺';
            else if (/^en[-_]ZA$/i.test(v.lang)) f = '🇿🇦';
            o.textContent = f + ' ' + v.name;
            select.appendChild(o);
        });
        if (current && availableVoices.some(v => v.name === current)) select.value = current;
        else if (selectedVoice) select.value = selectedVoice.name;
    }

    function createSectionControls(section, index) {
        const container = document.createElement('div');
        container.className = 'plebvox-control-' + index;
        container.setAttribute('data-plebvox-ui', 'true');
        container.setAttribute('aria-label', 'PlebVox controls for Part ' + section.number);
        container.style.cssText = 'margin:.75rem 0;padding:.75rem 1rem;max-width:100%;background:var(--secondary-nav-bg,#f4f4f4);border-radius:8px;border:1px solid var(--border,#ddd);text-align:center;';
        const title = document.createElement('div');
        title.textContent = '🔊 PlebVox — Part ' + section.number;
        title.style.cssText = 'font-weight:700;font-size:1rem;color:var(--text,#000);margin-bottom:.5rem;text-align:center;';
        const bc = document.createElement('div');
        bc.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;';
        function btn(t, l, css, d) { const b = document.createElement('button'); b.textContent=t; b.setAttribute('aria-label',l); b.style.cssText=css+'display:'+d+';'; return b; }
        const base='padding:.4rem 1rem;border:none;border-radius:4px;cursor:pointer;font-size:.9rem;font-weight:600;';
        const play=btn('▶ Play','Play Part '+section.number,base+'background:#28a745;color:#fff;','inline-block');
        const pause=btn('⏸ Pause','Pause Part '+section.number,base+'background:#ffc107;color:#000;','none');
        const resume=btn('▶ Resume','Resume Part '+section.number,base+'background:#17a2b8;color:#fff;','none');
        const stop=btn('⏹ Stop','Stop Part '+section.number,base+'background:#dc3545;color:#fff;','none');
        const status=document.createElement('span'); status.textContent='Ready'; status.setAttribute('aria-live','polite'); status.style.cssText='font-size:.8rem;color:var(--text-secondary,#666);margin-left:.5rem;min-width:60px;';
        const controls={playBtn:play,pauseBtn:pause,resumeBtn:resume,stopBtn:stop,statusText:status};
        play.addEventListener('click',()=>speakSection(section.text,section,controls));
        pause.addEventListener('click',()=>pauseSpeech(controls));
        resume.addEventListener('click',()=>resumeSpeech(controls));
        stop.addEventListener('click',()=>stopSpeech(controls));
        bc.append(play,pause,resume,stop,status);
        const row=document.createElement('div'); row.style.cssText='display:flex;justify-content:center;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:.25rem;';
        const sid=generateUniqueId('plebvox-speed'), sl=document.createElement('label'); sl.textContent='Speed:'; sl.setAttribute('for',sid);
        const speed=document.createElement('input'); speed.id=sid; speed.type='range'; speed.min='0.5'; speed.max='2'; speed.step='0.1'; speed.value=speechRate; speed.setAttribute('aria-label','Reading speed'); speed.addEventListener('input',function(){speechRate=parseFloat(this.value);});
        const vid=generateUniqueId('plebvox-voice'), vl=document.createElement('label'); vl.textContent='Voice:'; vl.setAttribute('for',vid);
        const vs=document.createElement('select'); vs.id=vid; vs.className='plebvox-voice-select'; vs.setAttribute('aria-label','Select reading voice'); vs.style.cssText='max-width:240px;padding:.25rem;';
        vs.addEventListener('change',function(){const found=availableVoices.find(v=>v.name===this.value);if(found)selectedVoice=found;});
        const statusVoice=document.createElement('div'); statusVoice.className='plebvox-voice-status'; statusVoice.setAttribute('aria-live','polite'); statusVoice.style.cssText='font-size:.75rem;margin-top:.35rem;';
        row.append(sl,speed,vl,vs); container.append(title,bc,row,statusVoice); populateVoiceSelector(vs);
        return {element:container,playBtn:play,pauseBtn:pause,resumeBtn:resume,stopBtn:stop,statusText:status};
    }

    function initPlebVox() {
        if (!('speechSynthesis' in window)) { console.warn('PlebVox: speech synthesis unavailable'); return; }
        installHighlightStyle();
        sectionDataList=getPlebVoxSections();
        if (!sectionDataList.length) return;
        sectionDataList.forEach(function(section,index){const controls=createSectionControls(section,index);section.controlElement=controls.element;section.startNode.parentNode.insertBefore(controls.element,section.startNode.nextSibling);});
        loadVoices();
        console.log('PlebVox 3.3: initialized');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initPlebVox); else initPlebVox();
})();
