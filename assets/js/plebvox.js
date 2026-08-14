// assets/js/plebvox.js - PlebVox 3.0
// Recovered: v2.9 text mapping + word highlighting.
// Retained: accessibility fixes and event-driven voice loading.
(function () {
    'use strict';

    let isReading = false;
    let isPaused = false;
    let utterance = null;
    let availableVoices = [];
    let selectedVoice = null;
    let speechRate = 0.7;
    let currentSectionData = null;
    let activeControls = null;
    let sectionDataList = [];
    let voicesLoaded = false;
    let voiceLoadComplete = false;
    let voicePromise = null;
    let sectionCounter = 0;
    let customHighlightSupported = false;
    const HIGHLIGHT_NAME = 'plebvox-current-word';

    // ==========================================
    // HIGHLIGHTING
    // ==========================================
    function installHighlightStyle() {
        if (!document.getElementById('plebvox-highlight-style')) {
            const style = document.createElement('style');
            style.id = 'plebvox-highlight-style';
            style.textContent = '::highlight(' + HIGHLIGHT_NAME + '){background:#ffeb3b;color:#000;text-shadow:none}.plebvox-highlight{background:#ffeb3b!important;color:#000!important;padding:0 2px;border-radius:2px;box-shadow:0 0 0 2px #f57c00}';
            document.head.appendChild(style);
        }
        customHighlightSupported = !!(window.CSS && CSS.highlights && typeof Highlight === 'function');
    }

    function clearHighlights() {
        if (customHighlightSupported) CSS.highlights.delete(HIGHLIGHT_NAME);
        document.querySelectorAll('.plebvox-highlight').forEach(function (el) {
            const parent = el.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(el.textContent || ''), el);
                parent.normalize();
            }
        });
    }

    // ==========================================
    // TEXT MAPPING
    // ==========================================
    function cleanSpeechText(text) {
        let result = text.replace(/\s+/g, ' ');
        try {
            result = result.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, '');
        } catch (e) {}
        return result;
    }

    function needsSeparator(text) {
        return !!text && !/[\s(\[{\"'“‘]$/.test(text);
    }

    function buildTextMapping(contentNodes) {
        let speechText = '';
        const rawEntries = [];
        const ignore = ['SCRIPT','STYLE','NOSCRIPT','IMG','FIGURE','FIGCAPTION','SVG','CANVAS','VIDEO','AUDIO','IFRAME','OBJECT','EMBED','SOURCE','TRACK'];
        const blocks = ['P','DIV','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE','SECTION','ARTICLE','HEADER','FOOTER','MAIN','ASIDE'];

        function process(node) {
            if (node.nodeType === Node.COMMENT_NODE) return;
            if (node.nodeType === Node.TEXT_NODE) {
                const rawText = node.textContent || '';
                if (!rawText.trim()) return;
                let normalized = cleanSpeechText(rawText);
                if (!normalized.trim()) return;
                if (speechText && needsSeparator(speechText)) speechText += ' ';
                const start = speechText.length;
                speechText += normalized;
                rawEntries.push({ node: node, rawText: rawText, normalized: normalized.trim(), start: start, end: speechText.length });
                return;
            }
            if (node.nodeType !== Node.ELEMENT_NODE) return;
            const tag = node.tagName.toUpperCase();
            if (ignore.includes(tag)) return;
            if (blocks.includes(tag) && speechText && needsSeparator(speechText)) speechText += ' ';
            node.childNodes.forEach(process);
            if (blocks.includes(tag) && speechText && needsSeparator(speechText)) speechText += ' ';
        }

        contentNodes.forEach(process);
        speechText = speechText.replace(/\s+/g, ' ').trim();
        if (!speechText) return { speechText: '', mapping: [] };

        const mapping = [];
        let searchStart = 0;
        rawEntries.forEach(function (entry) {
            const target = entry.normalized;
            const index = speechText.indexOf(target, searchStart);
            if (index !== -1) {
                mapping.push({ node: entry.node, rawText: entry.rawText, normalizedText: target, speechStart: index, speechEnd: index + target.length });
                searchStart = index + target.length;
            }
        });
        return { speechText: speechText, mapping: mapping };
    }

    function rebuildSectionMapping(section) {
        if (!section || !section.startNode || !section.endNode) return;
        const nodes = [];
        let node = section.startNode.nextSibling;
        while (node && node !== section.endNode) {
            if (node.nodeType !== Node.COMMENT_NODE) nodes.push(node);
            node = node.nextSibling;
        }
        section.contentNodes = nodes;
        section.mappingData = buildTextMapping(nodes);
        section.text = section.mappingData.speechText;
    }

    // ==========================================
    // SECTION DISCOVERY
    // ==========================================
    function getPlebVoxSections() {
        const main = document.querySelector('main');
        if (!main) return [];
        const markers = [];
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_COMMENT, {
            acceptNode: function (node) {
                const t = (node.textContent || '').trim();
                return (t === 'PLEBVOX:START' || t === 'PLEBVOX:END') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        let node = walker.nextNode();
        while (node) { markers.push({ node: node, type: node.textContent.trim() }); node = walker.nextNode(); }

        const sections = [];
        let startNode = null;
        markers.forEach(function (marker) {
            if (marker.type === 'PLEBVOX:START') {
                if (!startNode) startNode = marker.node;
                else console.warn('PlebVox: Nested START marker detected.');
                return;
            }
            if (marker.type === 'PLEBVOX:END' && startNode) {
                const endNode = marker.node;
                const nodes = [];
                let current = startNode.nextSibling;
                while (current && current !== endNode) {
                    if (current.nodeType !== Node.COMMENT_NODE) nodes.push(current);
                    current = current.nextSibling;
                }
                const mappingData = buildTextMapping(nodes);
                if (mappingData.speechText) {
                    sections.push({ number: sections.length + 1, text: mappingData.speechText, startNode: startNode, endNode: endNode, contentNodes: nodes, mappingData: mappingData, controlElement: null });
                }
                startNode = null;
            }
        });
        if (startNode) console.warn('PlebVox: START marker has no matching END marker.');
        console.log('PlebVox: Found ' + sections.length + ' readable section(s)');
        return sections;
    }

    // ==========================================
    // WORD RANGE CALCULATION
    // ==========================================
    function isWordChar(ch) {
        if (!ch) return false;
        try { return /[\p{L}\p{N}\p{M}_]/u.test(ch); }
        catch (e) { return /[A-Za-z0-9_]/.test(ch); }
    }

    function wordBounds(text, index) {
        if (!text) return null;
        let i = Math.max(0, Math.min(index, text.length - 1));
        if (!isWordChar(text[i]) && i > 0 && isWordChar(text[i - 1])) i--;
        if (!isWordChar(text[i])) return null;
        let start = i, end = i + 1;
        while (start > 0 && isWordChar(text[start - 1])) start--;
        while (end < text.length && isWordChar(text[end])) end++;
        return { start: start, end: end };
    }

    function normalizedToRaw(rawText, normalizedOffset) {
        let raw = 0, normalized = 0, whitespace = false;
        while (raw < rawText.length && normalized < normalizedOffset) {
            const ch = rawText[raw];
            if (/\s/.test(ch)) {
                if (!whitespace) { normalized++; whitespace = true; }
            } else { whitespace = false; normalized++; }
            raw++;
        }
        return raw;
    }

    function highlightWordByCharIndex(charIndex, section) {
        clearHighlights();
        if (!section || !section.mappingData) return;
        let entry = null;
        for (let i = 0; i < section.mappingData.mapping.length; i++) {
            const candidate = section.mappingData.mapping[i];
            if (charIndex >= candidate.speechStart && charIndex < candidate.speechEnd) { entry = candidate; break; }
        }
        if (!entry || !entry.node || !entry.node.parentNode) return;

        const bounds = wordBounds(entry.normalizedText, charIndex - entry.speechStart);
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
            } catch (e) { console.warn('PlebVox: Custom highlight failed; using fallback.'); }
        }

        const node = entry.node;
        const parent = node.parentNode;
        const raw = node.textContent || '';
        const before = document.createTextNode(raw.slice(0, rawStart));
        const word = document.createTextNode(raw.slice(rawStart, rawEnd));
        const after = document.createTextNode(raw.slice(rawEnd));
        const span = document.createElement('span');
        span.className = 'plebvox-highlight';
        span.appendChild(word);
        if (before.nodeValue) parent.insertBefore(before, node);
        parent.insertBefore(span, node);
        if (after.nodeValue) parent.insertBefore(after, node);
        parent.removeChild(node);
        rebuildSectionMapping(section);
    }

    // ==========================================
    // SPEECH
    // ==========================================
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
        utterance = new SpeechSynthesisUtterance(speechText);
        utterance.rate = speechRate;
        utterance.pitch = 1;
        utterance.volume = 1;

        waitForVoices().then(function (voices) {
            availableVoices = voices;
            if (voices.length) {
                voicesLoaded = true;
                voiceLoadComplete = true;
                updateAllVoiceSelectors();
                updateVoiceLoadStatus();
                if (!selectedVoice || !voices.includes(selectedVoice)) {
                    selectedVoice = voices.find(v => v.lang === 'en-ZA' || v.lang === 'en_ZA') || voices.find(v => v.lang === 'en-GB' || v.lang === 'en_GB') || voices.find(v => v.lang === 'en-AU' || v.lang === 'en_AU') || voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
                }
                if (selectedVoice) utterance.voice = selectedVoice;
            }

            utterance.onstart = function () { isReading = true; isPaused = false; clearHighlights(); updateControls(controls, 'playing'); };
            utterance.onboundary = function (event) { if (event.name === 'word' && typeof event.charIndex === 'number') highlightWordByCharIndex(event.charIndex, section); };
            utterance.onend = function () { isReading = false; isPaused = false; clearHighlights(); updateControls(controls, 'idle'); activeControls = null; currentSectionData = null; };
            utterance.onerror = function (event) { console.error('PlebVox speech error:', event); isReading = false; isPaused = false; clearHighlights(); updateControls(controls, 'idle'); activeControls = null; currentSectionData = null; };
            try { window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance); }
            catch (e) { console.error('PlebVox: Failed to speak:', e); updateControls(controls, 'idle'); }
        });
    }

    function pauseSpeech(controls) { if (isReading && !isPaused) { window.speechSynthesis.pause(); isPaused = true; updateControls(controls, 'paused'); } }
    function resumeSpeech(controls) { if (isReading && isPaused) { window.speechSynthesis.resume(); isPaused = false; updateControls(controls, 'playing'); } }
    function stopSpeech(controls) { try { window.speechSynthesis.cancel(); } catch (e) {} isReading = false; isPaused = false; clearHighlights(); if (controls) updateControls(controls, 'idle'); activeControls = null; currentSectionData = null; }

    // ==========================================
    // CONTROLS
    // ==========================================
    function updateControls(controls, state) {
        if (!controls) return;
        controls.playBtn.style.display = 'none'; controls.pauseBtn.style.display = 'none'; controls.resumeBtn.style.display = 'none'; controls.stopBtn.style.display = 'none';
        if (state === 'playing') { controls.pauseBtn.style.display = 'inline-block'; controls.stopBtn.style.display = 'inline-block'; controls.statusText.textContent = 'Playing...'; }
        else if (state === 'paused') { controls.resumeBtn.style.display = 'inline-block'; controls.stopBtn.style.display = 'inline-block'; controls.statusText.textContent = 'Paused'; }
        else { controls.playBtn.style.display = 'inline-block'; controls.statusText.textContent = 'Ready'; }
    }

    function generateUniqueId(prefix) { sectionCounter++; return prefix + '-' + sectionCounter + '-' + Date.now().toString(36); }

    // ==========================================
    // VOICES
    // ==========================================
    function waitForVoices() {
        if (voicePromise) return voicePromise;
        voicePromise = new Promise(function (resolve) {
            if (!('speechSynthesis' in window)) { resolve([]); return; }
            let voices = window.speechSynthesis.getVoices();
            if (voices.length) { resolve(voices); return; }
            function changed() { voices = window.speechSynthesis.getVoices(); if (voices.length) { window.speechSynthesis.removeEventListener('voiceschanged', changed); resolve(voices); } }
            window.speechSynthesis.addEventListener('voiceschanged', changed);
            try { window.speechSynthesis.cancel(); } catch (e) {}
            setTimeout(function () {
                voices = window.speechSynthesis.getVoices();
                if (voices.length) { window.speechSynthesis.removeEventListener('voiceschanged', changed); resolve(voices); return; }
                setTimeout(function () { window.speechSynthesis.removeEventListener('voiceschanged', changed); resolve(window.speechSynthesis.getVoices()); }, 1500);
            }, 500);
        });
        return voicePromise;
    }

    function loadVoices() {
        if (voicesLoaded) return;
        waitForVoices().then(function (voices) {
            availableVoices = voices;
            voiceLoadComplete = true;
            if (voices.length) {
                selectedVoice = voices.find(v => v.lang === 'en-ZA' || v.lang === 'en_ZA') || voices.find(v => v.lang === 'en-GB' || v.lang === 'en_GB') || voices.find(v => v.lang && v.lang.startsWith('en')) || voices[0];
                voicesLoaded = true;
            }
            updateAllVoiceSelectors(); updateVoiceLoadStatus();
        }).catch(function (e) { console.warn('PlebVox: Voice loading error:', e); voiceLoadComplete = true; updateVoiceLoadStatus(); });
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
        document.querySelectorAll('.plebvox-voice-status').forEach(function (el) {
            if (!('speechSynthesis' in window)) { el.textContent = '⚠️ Speech synthesis not supported'; el.style.color = '#dc3545'; }
            else if (!voiceLoadComplete) { el.textContent = '⏳ Loading voices...'; el.style.color = '#17a2b8'; }
            else if (availableVoices.length) { el.textContent = '✅ ' + availableVoices.length + ' voice(s) available'; el.style.color = '#28a745'; }
            else { el.textContent = 'ℹ️ No system voices (' + getBrowserInfo() + ')'; el.style.color = '#b38600'; }
        });
    }

    function updateAllVoiceSelectors() { document.querySelectorAll('.plebvox-voice-select').forEach(populateVoiceSelector); }

    function populateVoiceSelector(select) {
        const current = select.value;
        select.innerHTML = '';
        if (!availableVoices.length) {
            const option = document.createElement('option'); option.value = ''; option.textContent = 'No voices available'; select.appendChild(option); return;
        }
        availableVoices.forEach(function (voice) {
            const option = document.createElement('option'); option.value = voice.name;
            let flag = '🌐';
            if (/^en[-_]GB$/i.test(voice.lang)) flag = '🇬🇧';
            else if (/^en[-_]US$/i.test(voice.lang)) flag = '🇺🇸';
            else if (/^en[-_]AU$/i.test(voice.lang)) flag = '🇦🇺';
            else if (/^en[-_]ZA$/i.test(voice.lang)) flag = '🇿🇦';
            option.textContent = flag + ' ' + voice.name; select.appendChild(option);
        });
        if (current && availableVoices.some(v => v.name === current)) select.value = current;
        else if (selectedVoice) select.value = selectedVoice.name;
    }

    // ==========================================
    // ACCESSIBLE CONTROLS
    // ==========================================
    function createSectionControls(section, index) {
        const container = document.createElement('div');
        container.className = 'plebvox-control-' + index;
        container.style.cssText = 'margin:.75rem 0;padding:.75rem 1rem;max-width:100%;background:var(--secondary-nav-bg,#f4f4f4);border-radius:8px;border:1px solid var(--border,#ddd);text-align:center;';
        const title = document.createElement('div'); title.textContent = '🔊 PlebVox — Part ' + section.number; title.style.cssText = 'font-weight:700;font-size:1rem;color:var(--text,#000);margin-bottom:.5rem;text-align:center;';
        const buttonContainer = document.createElement('div'); buttonContainer.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem;';
        function button(text, label, css, display) { const b = document.createElement('button'); b.textContent = text; b.setAttribute('aria-label', label); b.style.cssText = css + 'display:' + display + ';'; return b; }
        const base = 'padding:.4rem 1rem;border:none;border-radius:4px;cursor:pointer;font-size:.9rem;font-weight:600;';
        const playBtn = button('▶ Play', 'Play Part ' + section.number, base + 'background:#28a745;color:#fff;', 'inline-block');
        const pauseBtn = button('⏸ Pause', 'Pause Part ' + section.number, base + 'background:#ffc107;color:#000;', 'none');
        const resumeBtn = button('▶ Resume', 'Resume Part ' + section.number, base + 'background:#17a2b8;color:#fff;', 'none');
        const stopBtn = button('⏹ Stop', 'Stop Part ' + section.number, base + 'background:#dc3545;color:#fff;', 'none');
        const statusText = document.createElement('span'); statusText.textContent = 'Ready'; statusText.setAttribute('aria-live','polite'); statusText.style.cssText = 'font-size:.8rem;color:var(--text-secondary,#666);margin-left:.5rem;min-width:60px;';
        const controls = { playBtn:playBtn, pauseBtn:pauseBtn, resumeBtn:resumeBtn, stopBtn:stopBtn, statusText:statusText };
        playBtn.addEventListener('click', function(){ speakSection(section.text, section, controls); });
        pauseBtn.addEventListener('click', function(){ pauseSpeech(controls); });
        resumeBtn.addEventListener('click', function(){ resumeSpeech(controls); });
        stopBtn.addEventListener('click', function(){ stopSpeech(controls); });
        buttonContainer.append(playBtn,pauseBtn,resumeBtn,stopBtn,statusText);

        const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:.75rem;flex-wrap:wrap;margin-top:.25rem;';
        const speedId = generateUniqueId('plebvox-speed'); const speedLabel = document.createElement('label'); speedLabel.textContent = 'Speed:'; speedLabel.setAttribute('for',speedId); speedLabel.style.cssText='font-size:.8rem;color:var(--text-secondary,#666);';
        const speed = document.createElement('input'); speed.type='range'; speed.id=speedId; speed.min='.3'; speed.max='1.8'; speed.step='.05'; speed.value=speechRate; speed.setAttribute('aria-label','Reading speed for Part '+section.number); speed.setAttribute('aria-valuenow',speechRate); speed.setAttribute('aria-valuemin','0.3'); speed.setAttribute('aria-valuemax','1.8'); speed.style.cssText='width:100px;cursor:pointer;';
        const speedDisplay = document.createElement('span'); speedDisplay.textContent='0.70x'; speedDisplay.setAttribute('aria-live','polite'); speedDisplay.style.cssText='font-size:.8rem;min-width:3rem;color:var(--text-secondary,#666);';
        speed.addEventListener('input',function(){ speechRate=parseFloat(this.value); speedDisplay.textContent=speechRate.toFixed(2)+'x'; this.setAttribute('aria-valuenow',speechRate); });

        const voiceId = generateUniqueId('plebvox-voice'); const voiceLabel=document.createElement('label'); voiceLabel.textContent='Voice:'; voiceLabel.setAttribute('for',voiceId); voiceLabel.style.cssText='font-size:.8rem;color:var(--text-secondary,#666);';
        const voice=document.createElement('select'); voice.id=voiceId; voice.className='plebvox-voice-select'; voice.setAttribute('aria-label','Select voice for Part '+section.number); voice.style.cssText='padding:.2rem .4rem;border-radius:4px;border:1px solid var(--border,#ddd);font-size:.75rem;max-width:180px;'; populateVoiceSelector(voice);
        voice.addEventListener('change',function(){ const selected=availableVoices.find(v=>v.name===this.value); if(selected) selectedVoice=selected; });
        const voiceStatus=document.createElement('span'); voiceStatus.className='plebvox-voice-status'; voiceStatus.setAttribute('aria-live','polite'); voiceStatus.style.cssText='font-size:.7rem;color:var(--text-secondary,#666);margin-left:.25rem;';
        row.append(speedLabel,speed,speedDisplay,voiceLabel,voice,voiceStatus);
        container.append(title,buttonContainer,row);
        return container;
    }

    // ==========================================
    // INIT
    // ==========================================
    function initPlebVox() {
        installHighlightStyle();
        if (!('speechSynthesis' in window)) { console.warn('PlebVox: Speech synthesis not available.'); return; }
        sectionDataList = getPlebVoxSections();
        if (!sectionDataList.length) return;
        loadVoices();
        const main = document.querySelector('main'); if (!main) return;
        sectionDataList.forEach(function(section,index){ const control=createSectionControls(section,index); section.controlElement=control; section.startNode.parentNode.insertBefore(control,section.startNode.nextSibling); });
        window.speechSynthesis.addEventListener('voiceschanged',function(){ const voices=window.speechSynthesis.getVoices(); if(voices.length){ availableVoices=voices; voicesLoaded=true; voiceLoadComplete=true; updateAllVoiceSelectors(); updateVoiceLoadStatus(); } });
        setTimeout(updateVoiceLoadStatus,1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPlebVox); else initPlebVox();
})();
