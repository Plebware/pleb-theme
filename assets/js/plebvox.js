// assets/js/plebvox.js - v2.5 (Image Safe)
(function() {
    'use strict';

    let isReading = false;
    let isPaused = false;
    let utterance = null;
    let availableVoices = [];
    let selectedVoice = null;
    let speechRate = 0.7;
    let currentCharIndex = 0;
    let currentSectionData = null;
    let activeControls = null;
    let sectionDataList = [];
    let voicesLoaded = false;
    let voiceLoadAttempts = 0;

    // ==========================================
    // BUILD TEXT MAPPING - Image Safe
    // ==========================================
    function buildTextMapping(contentNodes) {
        let speechText = '';
        let mapping = [];
        let hasTextContent = false;

        // Elements to completely ignore
        const ignoreTags = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IMG', 'FIGURE', 'FIGCAPTION', 'SVG', 'CANVAS', 'VIDEO', 'AUDIO', 'IFRAME', 'OBJECT', 'EMBED'];
        
        // Elements that should be treated as block elements
        const blockTags = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE'];

        function processNode(node) {
            // Handle text nodes
            if (node.nodeType === Node.TEXT_NODE) {
                const rawText = node.textContent;
                // Skip if only whitespace
                if (!rawText.trim()) return;
                
                hasTextContent = true;
                const normalizedText = rawText.replace(/\s+/g, ' ');
                
                if (normalizedText.trim().length > 0) {
                    const startOffset = speechText.length;
                    
                    // Add space before if needed
                    if (speechText.length > 0 && 
                        !speechText.endsWith(' ') && 
                        !speechText.endsWith('(') &&
                        !speechText.endsWith('[') &&
                        !speechText.endsWith('{') &&
                        !speechText.endsWith('"') &&
                        !speechText.endsWith("'") &&
                        !speechText.endsWith('\u201C') &&
                        !speechText.endsWith('\u2018')) {
                        speechText += ' ';
                    }
                    
                    speechText += normalizedText;
                    
                    mapping.push({
                        node: node,
                        rawText: rawText,
                        normalizedText: normalizedText,
                        speechStart: startOffset,
                        speechEnd: speechText.length
                    });
                }
                return;
            }

            // Handle element nodes
            if (node.nodeType === Node.ELEMENT_NODE) {
                const tagName = node.tagName.toUpperCase();
                
                // Skip ignored elements entirely (images, figures, etc.)
                if (ignoreTags.includes(tagName)) {
                    return;
                }
                
                // Handle block elements - add spacing
                if (blockTags.includes(tagName)) {
                    if (speechText.length > 0 && 
                        !speechText.endsWith(' ') && 
                        !speechText.endsWith('(') &&
                        !speechText.endsWith('[') &&
                        !speechText.endsWith('{') &&
                        !speechText.endsWith('"') &&
                        !speechText.endsWith("'") &&
                        !speechText.endsWith('\u201C') &&
                        !speechText.endsWith('\u2018')) {
                        speechText += ' ';
                    }
                }
                
                // Process all children (this will skip images via the ignore list)
                node.childNodes.forEach(child => processNode(child));
                
                // Add space after block if needed
                if (blockTags.includes(tagName)) {
                    if (speechText.length > 0 && 
                        !speechText.endsWith(' ') && 
                        !speechText.endsWith(')') &&
                        !speechText.endsWith(']') &&
                        !speechText.endsWith('}') &&
                        !speechText.endsWith('.') &&
                        !speechText.endsWith(',') &&
                        !speechText.endsWith('!') &&
                        !speechText.endsWith('?') &&
                        !speechText.endsWith(';') &&
                        !speechText.endsWith(':') &&
                        !speechText.endsWith('"') &&
                        !speechText.endsWith("'") &&
                        !speechText.endsWith('\u201D') &&
                        !speechText.endsWith('\u2019')) {
                        speechText += ' ';
                    }
                }
            }
        }

        // Process all content nodes
        contentNodes.forEach(node => processNode(node));

        // If no text content, return empty
        if (!hasTextContent || speechText.trim().length === 0) {
            return {
                speechText: '',
                mapping: []
            };
        }

        // Final cleanup
        speechText = speechText.replace(/\s+/g, ' ');
        speechText = speechText.trim();

        // Rebuild mapping with exact positions
        let currentPos = 0;
        let finalMapping = [];

        for (let entry of mapping) {
            const textToAdd = entry.normalizedText.trim();
            if (textToAdd.length > 0) {
                const searchStart = currentPos;
                const indexInSpeech = speechText.indexOf(textToAdd, searchStart);
                
                if (indexInSpeech !== -1) {
                    finalMapping.push({
                        node: entry.node,
                        rawText: entry.rawText,
                        normalizedText: textToAdd,
                        speechStart: indexInSpeech,
                        speechEnd: indexInSpeech + textToAdd.length
                    });
                    currentPos = indexInSpeech + textToAdd.length;
                }
            }
        }

        return {
            speechText: speechText,
            mapping: finalMapping
        };
    }

    // ==========================================
    // GET PLEBVOX SECTIONS
    // ==========================================
    function getPlebVoxSections() {
        const main = document.querySelector('main');
        if (!main) return [];

        const sections = [];
        const walker = document.createTreeWalker(
            main,
            NodeFilter.SHOW_COMMENT,
            {
                acceptNode: function(node) {
                    if (node.textContent && node.textContent.trim() === 'PLEBVOX:START') {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );

        let startNodes = [];
        let node = walker.nextNode();
        while (node) {
            startNodes.push(node);
            node = walker.nextNode();
        }

        if (startNodes.length === 0) {
            console.log('PlebVox: No START markers found');
            return [];
        }

        console.log(`PlebVox: Found ${startNodes.length} START marker(s)`);

        startNodes.forEach((startNode, index) => {
            let endNode = null;
            let nextNode = startNode.nextSibling;
            while (nextNode) {
                if (nextNode.nodeType === Node.COMMENT_NODE && 
                    nextNode.textContent && nextNode.textContent.trim() === 'PLEBVOX:END') {
                    endNode = nextNode;
                    break;
                }
                nextNode = nextNode.nextSibling;
            }

            if (!endNode) {
                console.warn(`PlebVox: No END marker found for START #${index + 1}`);
                return;
            }

            const contentNodes = [];
            let currentNode = startNode.nextSibling;
            while (currentNode && currentNode !== endNode) {
                contentNodes.push(currentNode);
                currentNode = currentNode.nextSibling;
            }

            const mappingData = buildTextMapping(contentNodes);
            
            if (mappingData.speechText.length > 0) {
                console.log(`PlebVox: Section ${sections.length + 1} has ${mappingData.speechText.length} characters of text`);
                sections.push({
                    number: sections.length + 1,
                    text: mappingData.speechText,
                    startNode: startNode,
                    endNode: endNode,
                    contentNodes: contentNodes,
                    mappingData: mappingData,
                    controlElement: null
                });
            } else {
                console.warn(`PlebVox: Section ${sections.length + 1} has no readable text (skipping)`);
            }
        });

        return sections;
    }

    // ==========================================
    // HIGHLIGHTING
    // ==========================================
    function clearHighlights() {
        document.querySelectorAll('.plebvox-highlight').forEach(el => {
            const textNode = el.firstChild;
            const parent = el.parentNode;
            if (textNode) {
                parent.replaceChild(textNode, el);
                parent.normalize();
            }
        });
    }

    function highlightWordByCharIndex(charIndex, sectionData) {
        clearHighlights();
        
        if (!sectionData || !sectionData.mappingData) return;
        
        const mappingData = sectionData.mappingData;
        let targetEntry = null;
        
        for (let entry of mappingData.mapping) {
            if (charIndex >= entry.speechStart && charIndex < entry.speechEnd) {
                targetEntry = entry;
                break;
            }
        }
        
        if (!targetEntry) return;
        
        const node = targetEntry.node;
        const rawText = node.textContent;
        const normalizedText = targetEntry.normalizedText;
        const relativePos = charIndex - targetEntry.speechStart;
        
        let rawPos = 0;
        let normalizedPos = 0;
        
        while (normalizedPos < normalizedText.length && normalizedText[normalizedPos] === ' ') {
            normalizedPos++;
        }
        
        while (rawPos < rawText.length && normalizedPos < relativePos && normalizedPos < normalizedText.length) {
            if (rawText[rawPos] === ' ' || rawText[rawPos] === '\n' || rawText[rawPos] === '\t') {
                rawPos++;
                continue;
            }
            rawPos++;
            normalizedPos++;
        }
        
        let wordStart = rawPos;
        let wordEnd = rawPos;
        
        while (wordStart > 0) {
            const prevChar = rawText[wordStart - 1];
            if (prevChar === ' ' || prevChar === '\n' || prevChar === '\t') break;
            if (prevChar === '.' || prevChar === ',' || prevChar === '!' || 
                prevChar === '?' || prevChar === ';' || prevChar === ':' ||
                prevChar === '"' || prevChar === "'" || prevChar === ')' ||
                prevChar === ']' || prevChar === '}' || prevChar === '-' ||
                prevChar === '\u2019' || prevChar === '\u2018' || prevChar === '\u201C' ||
                prevChar === '\u201D' || prevChar === '\u2026') {
                wordStart--;
                continue;
            }
            break;
        }
        
        while (wordEnd < rawText.length) {
            const nextChar = rawText[wordEnd];
            if (nextChar === ' ' || nextChar === '\n' || nextChar === '\t') break;
            if (nextChar === '.' || nextChar === ',' || nextChar === '!' || 
                nextChar === '?' || nextChar === ';' || nextChar === ':' ||
                nextChar === '"' || nextChar === "'" || nextChar === '(' ||
                nextChar === '[' || nextChar === '{' || nextChar === '-' ||
                nextChar === '\u2019' || nextChar === '\u2018' || nextChar === '\u201C' ||
                nextChar === '\u201D' || nextChar === '\u2026') {
                wordEnd++;
                continue;
            }
            break;
        }
        
        if (wordStart === wordEnd) return;
        
        const parent = node.parentNode;
        const before = document.createTextNode(rawText.substring(0, wordStart));
        const wordNode = document.createTextNode(rawText.substring(wordStart, wordEnd));
        const after = document.createTextNode(rawText.substring(wordEnd));
        
        const span = document.createElement('span');
        span.className = 'plebvox-highlight';
        span.style.backgroundColor = '#ffeb3b';
        span.style.color = '#000';
        span.style.padding = '0 2px';
        span.style.borderRadius = '2px';
        span.style.boxShadow = '0 0 0 2px #f57c00';
        span.appendChild(wordNode);
        
        parent.insertBefore(before, node);
        parent.insertBefore(span, node);
        parent.insertBefore(after, node);
        parent.removeChild(node);
    }

    // ==========================================
    // SPEECH ENGINE
    // ==========================================
    function speakSection(text, sectionData, controls) {
        if (!window.speechSynthesis) {
            alert('Speech synthesis not supported.');
            return;
        }

        if (isReading && currentSectionData === sectionData) {
            if (isPaused) {
                resumeSpeech(controls);
            } else {
                pauseSpeech(controls);
            }
            return;
        }

        if (isReading) {
            window.speechSynthesis.cancel();
            isReading = false;
            isPaused = false;
            clearHighlights();
            if (activeControls) {
                updateControls(activeControls, 'idle');
                updateLED(activeControls, 'idle');
                activeControls = null;
            }
            currentSectionData = null;
        }

        const cleanTextContent = sectionData.mappingData.speechText;
        if (!cleanTextContent || cleanTextContent.length < 2) {
            alert('No readable content in this section.');
            return;
        }

        currentSectionData = sectionData;
        currentCharIndex = 0;
        activeControls = controls;

        utterance = new SpeechSynthesisUtterance(cleanTextContent);
        utterance.rate = speechRate;
        utterance.pitch = 1;
        utterance.volume = 1;

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        } else {
            const voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                const englishVoice = voices.find(v => v.lang && v.lang.startsWith('en'));
                utterance.voice = englishVoice || voices[0];
                selectedVoice = utterance.voice;
            }
        }

        utterance.onstart = function() {
            isReading = true;
            isPaused = false;
            updateControls(controls, 'playing');
            updateLED(controls, 'playing');
            clearHighlights();
        };

        utterance.onboundary = function(event) {
            if (event.name === 'word') {
                currentCharIndex = event.charIndex;
                highlightWordByCharIndex(event.charIndex, sectionData);
            }
        };

        utterance.onend = function() {
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            updateLED(controls, 'idle');
            clearHighlights();
            activeControls = null;
            currentSectionData = null;
        };

        utterance.onerror = function(e) {
            console.error('Speech error:', e);
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            updateLED(controls, 'idle');
            clearHighlights();
            activeControls = null;
            currentSectionData = null;
        };

        try {
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error('Failed to speak:', e);
            updateControls(controls, 'idle');
            updateLED(controls, 'idle');
            activeControls = null;
            currentSectionData = null;
        }
    }

    function pauseSpeech(controls) {
        if (isReading && !isPaused) {
            window.speechSynthesis.pause();
            isPaused = true;
            updateControls(controls, 'paused');
            updateLED(controls, 'paused');
        }
    }

    function resumeSpeech(controls) {
        if (isReading && isPaused) {
            window.speechSynthesis.resume();
            isPaused = false;
            updateControls(controls, 'playing');
            updateLED(controls, 'playing');
        }
    }

    function stopSpeech(controls) {
        if (isReading) {
            window.speechSynthesis.cancel();
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            updateLED(controls, 'idle');
            clearHighlights();
            activeControls = null;
            currentSectionData = null;
        }
    }

    // ==========================================
    // UPDATE CONTROLS UI
    // ==========================================
    function updateControls(controls, state) {
        if (!controls) return;
        
        const playBtn = controls.playBtn;
        const pauseBtn = controls.pauseBtn;
        const resumeBtn = controls.resumeBtn;
        const stopBtn = controls.stopBtn;
        const statusText = controls.statusText;

        playBtn.style.display = 'none';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        stopBtn.style.display = 'none';

        switch(state) {
            case 'idle':
                playBtn.style.display = 'inline-block';
                statusText.textContent = 'Ready';
                break;
            case 'playing':
                pauseBtn.style.display = 'inline-block';
                stopBtn.style.display = 'inline-block';
                statusText.textContent = 'Playing...';
                break;
            case 'paused':
                resumeBtn.style.display = 'inline-block';
                stopBtn.style.display = 'inline-block';
                statusText.textContent = 'Paused';
                break;
        }
    }

    // ==========================================
    // LED CONTROL
    // ==========================================
    function updateLED(controls, state) {
        if (!controls || !controls.led) return;
        
        const led = controls.led;
        led.className = 'plebvox-led';
        
        switch(state) {
            case 'idle':
                led.classList.add('plebvox-led-off');
                led.setAttribute('aria-label', 'PlebVox inactive');
                break;
            case 'playing':
                led.classList.add('plebvox-led-playing');
                led.setAttribute('aria-label', 'PlebVox playing');
                break;
            case 'paused':
                led.classList.add('plebvox-led-paused');
                led.setAttribute('aria-label', 'PlebVox paused');
                break;
        }
    }

    // ==========================================
    // VOICE LOADING
    // ==========================================
    function loadVoices() {
        if (voicesLoaded) return;
        
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
            voiceLoadAttempts++;
            if (voiceLoadAttempts < 20) {
                setTimeout(loadVoices, 200);
            }
            return;
        }

        voicesLoaded = true;
        availableVoices = voices;
        
        const ukMale = availableVoices.find(v => 
            v.name && v.name.toLowerCase().includes('uk') && 
            (v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('daniel'))
        );
        selectedVoice = ukMale || availableVoices.find(v => v.lang && v.lang.startsWith('en')) || availableVoices[0];
        
        updateAllVoiceSelectors();
    }

    function updateAllVoiceSelectors() {
        document.querySelectorAll('.plebvox-voice-select').forEach(select => {
            populateVoiceSelector(select);
        });
    }

    function populateVoiceSelector(select) {
        const currentValue = select.value;
        select.innerHTML = '';
        
        availableVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            let flag = '🌐';
            if (voice.lang === 'en-GB' || voice.lang === 'en_GB') flag = '🇬🇧';
            else if (voice.lang === 'en-US' || voice.lang === 'en_US') flag = '🇺🇸';
            else if (voice.lang === 'en-AU' || voice.lang === 'en_AU') flag = '🇦🇺';
            option.textContent = `${flag} ${voice.name}`;
            select.appendChild(option);
        });
        
        if (selectedVoice && availableVoices.find(v => v.name === selectedVoice.name)) {
            select.value = selectedVoice.name;
        }
    }

    // ==========================================
    // CREATE CONTROLS FOR A SECTION
    // ==========================================
    function createSectionControls(section, sectionIndex) {
        const container = document.createElement('div');
        container.className = `plebvox-control-${sectionIndex}`;
        container.style.cssText = 'margin: 0.75rem 0; padding: 0.75rem 1rem; max-width: 100%; background: var(--secondary-nav-bg, #f4f4f4); border-radius: 8px; border: 1px solid var(--border, #ddd); text-align: center;';

        const headerRow = document.createElement('div');
        headerRow.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 0.5rem;';

        const led = document.createElement('span');
        led.className = 'plebvox-led plebvox-led-off';
        led.setAttribute('aria-label', 'PlebVox inactive');
        led.style.cssText = 'display: inline-block; width: 12px; height: 12px; border-radius: 50%; transition: background-color 0.3s, box-shadow 0.3s; flex-shrink: 0;';
        led.classList.add('plebvox-led-off');

        const title = document.createElement('span');
        title.textContent = `PlebVox — Part ${section.number}`;
        title.style.cssText = 'font-weight: 700; font-size: 1rem; color: var(--text, #000);';

        headerRow.appendChild(led);
        headerRow.appendChild(title);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;';

        const playBtn = document.createElement('button');
        playBtn.className = 'plebvox-play';
        playBtn.textContent = '▶ Play';
        playBtn.style.cssText = 'padding: 0.4rem 1rem; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; transition: background 0.2s;';
        playBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#218838'; });
        playBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#28a745'; });

        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'plebvox-pause';
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.style.cssText = 'padding: 0.4rem 1rem; background: #ffc107; color: #000; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none; transition: background 0.2s;';
        pauseBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#e0a800'; });
        pauseBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#ffc107'; });

        const resumeBtn = document.createElement('button');
        resumeBtn.className = 'plebvox-resume';
        resumeBtn.textContent = '▶ Resume';
        resumeBtn.style.cssText = 'padding: 0.4rem 1rem; background: #17a2b8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none; transition: background 0.2s;';
        resumeBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#138496'; });
        resumeBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#17a2b8'; });

        const stopBtn = document.createElement('button');
        stopBtn.className = 'plebvox-stop';
        stopBtn.textContent = '⏹ Stop';
        stopBtn.style.cssText = 'padding: 0.4rem 1rem; background: #dc3545; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none; transition: background 0.2s;';
        stopBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#c82333'; });
        stopBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#dc3545'; });

        const statusText = document.createElement('span');
        statusText.className = 'plebvox-status';
        statusText.textContent = 'Ready';
        statusText.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary, #666); margin-left: 0.5rem; min-width: 60px;';

        const controls = {
            playBtn: playBtn,
            pauseBtn: pauseBtn,
            resumeBtn: resumeBtn,
            stopBtn: stopBtn,
            statusText: statusText,
            led: led
        };

        playBtn.addEventListener('click', function() {
            speakSection(section.text, section, controls);
        });
        pauseBtn.addEventListener('click', function() {
            pauseSpeech(controls);
        });
        resumeBtn.addEventListener('click', function() {
            resumeSpeech(controls);
        });
        stopBtn.addEventListener('click', function() {
            stopSpeech(controls);
        });

        buttonContainer.appendChild(playBtn);
        buttonContainer.appendChild(pauseBtn);
        buttonContainer.appendChild(resumeBtn);
        buttonContainer.appendChild(stopBtn);
        buttonContainer.appendChild(statusText);

        const controlsRow = document.createElement('div');
        controlsRow.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem;';

        const speedLabel = document.createElement('span');
        speedLabel.textContent = 'Speed:';
        speedLabel.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary, #666);';

        const speedDisplay = document.createElement('span');
        speedDisplay.textContent = '0.70x';
        speedDisplay.style.cssText = 'font-size: 0.8rem; min-width: 3rem; color: var(--text-secondary, #666);';

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = 0.3;
        speedSlider.max = 1.8;
        speedSlider.step = 0.05;
        speedSlider.value = speechRate;
        speedSlider.style.cssText = 'width: 100px; cursor: pointer;';
        speedSlider.addEventListener('input', function() {
            speechRate = parseFloat(this.value);
            speedDisplay.textContent = speechRate.toFixed(2) + 'x';
        });

        controlsRow.appendChild(speedLabel);
        controlsRow.appendChild(speedSlider);
        controlsRow.appendChild(speedDisplay);

        const voiceSelect = document.createElement('select');
        voiceSelect.className = 'plebvox-voice-select';
        voiceSelect.style.cssText = 'padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid var(--border, #ddd); font-size: 0.75rem; max-width: 180px; background: var(--bg, #fff); color: var(--text, #000);';
        
        if (availableVoices.length > 0) {
            populateVoiceSelector(voiceSelect);
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Loading voices...';
            voiceSelect.appendChild(option);
        }

        voiceSelect.addEventListener('change', function() {
            const selected = availableVoices.find(v => v.name === this.value);
            if (selected) {
                selectedVoice = selected;
            }
        });

        controlsRow.appendChild(voiceSelect);

        container.appendChild(headerRow);
        container.appendChild(buttonContainer);
        container.appendChild(controlsRow);

        return container;
    }

    // ==========================================
    // MAIN INITIALIZATION
    // ==========================================
    function initPlebVox() {
        sectionDataList = getPlebVoxSections();
        
        if (sectionDataList.length === 0) {
            console.log('PlebVox: No sections found. Existing articles work normally.');
            return;
        }

        console.log(`PlebVox: Found ${sectionDataList.length} section(s)`);

        if (!voicesLoaded) {
            loadVoices();
        }

        const main = document.querySelector('main');
        if (!main) return;

        sectionDataList.forEach((section, index) => {
            const controlElement = createSectionControls(section, index);
            section.controlElement = controlElement;
            section.startNode.parentNode.insertBefore(controlElement, section.startNode.nextSibling);
        });

        if (!voicesLoaded) {
            window.speechSynthesis.onvoiceschanged = function() {
                if (!voicesLoaded) {
                    loadVoices();
                }
            };
        }

        const style = document.createElement('style');
        style.textContent = `
            .plebvox-highlight {
                transition: background-color 0.1s ease;
            }
            .plebvox-led-off {
                background-color: #dc3545;
                opacity: 0.5;
                box-shadow: none;
            }
            .plebvox-led-playing {
                background-color: #28a745;
                opacity: 1;
                box-shadow: 0 0 8px rgba(40, 167, 69, 0.6);
                animation: plebvox-pulse-green 1.5s ease-in-out infinite;
            }
            .plebvox-led-paused {
                background-color: #ffc107;
                opacity: 1;
                box-shadow: 0 0 8px rgba(255, 193, 7, 0.5);
                animation: plebvox-pulse-amber 1.5s ease-in-out infinite;
            }
            @keyframes plebvox-pulse-green {
                0%, 100% { box-shadow: 0 0 8px rgba(40, 167, 69, 
