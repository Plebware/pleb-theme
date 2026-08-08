// assets/js/plebvox.js - SIMPLIFIED VERSION
(function() {
    'use strict';

    // ==========================================
    // STATE
    // ==========================================
    let isReading = false;
    let isPaused = false;
    let utterance = null;
    let availableVoices = [];
    let selectedVoice = null;
    let speechRate = 0.7;
    let currentSectionData = null;
    let activeControls = null;
    let sectionDataList = [];

    // ==========================================
    // GET SECTIONS - SIMPLIFIED
    // ==========================================
    function getPlebVoxSections() {
        const main = document.querySelector('main');
        if (!main) return [];

        const sections = [];
        
        // Find all START comment nodes
        const startNodes = [];
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

        let node = walker.nextNode();
        while (node) {
            startNodes.push(node);
            node = walker.nextNode();
        }

        if (startNodes.length === 0) {
            return [];
        }

        console.log(`PlebVox: Found ${startNodes.length} sections`);

        // Process each START node
        startNodes.forEach((startNode, index) => {
            // Find END
            let endNode = null;
            let current = startNode.nextSibling;
            while (current) {
                if (current.nodeType === Node.COMMENT_NODE && 
                    current.textContent && current.textContent.trim() === 'PLEBVOX:END') {
                    endNode = current;
                    break;
                }
                current = current.nextSibling;
            }

            if (!endNode) {
                console.warn(`No END for section ${index + 1}`);
                return;
            }

            // Get ALL text between START and END
            let sectionText = '';
            let currentText = startNode.nextSibling;
            while (currentText && currentText !== endNode) {
                // Skip comment nodes
                if (currentText.nodeType !== Node.COMMENT_NODE) {
                    if (currentText.textContent) {
                        sectionText += currentText.textContent + ' ';
                    }
                }
                currentText = currentText.nextSibling;
            }

            // Clean the text
            sectionText = sectionText.replace(/\s+/g, ' ').trim();

            if (sectionText.length > 0) {
                sections.push({
                    number: sections.length + 1,
                    text: sectionText,
                    startNode: startNode,
                    endNode: endNode,
                    controlElement: null
                });
                console.log(`Section ${sections.length}: ${sectionText.substring(0, 50)}... (${sectionText.length} chars)`);
            }
        });

        return sections;
    }

    // ==========================================
    // SPEAK SECTION
    // ==========================================
    function speakSection(text, sectionData, controls) {
        if (!window.speechSynthesis) {
            alert('Speech synthesis not supported.');
            return;
        }

        if (isReading) {
            window.speechSynthesis.cancel();
            isReading = false;
            if (activeControls) {
                updateControls(activeControls, 'idle');
                activeControls = null;
            }
        }

        if (!text || text.length < 2) {
            alert('No readable content.');
            return;
        }

        currentSectionData = sectionData;
        activeControls = controls;

        utterance = new SpeechSynthesisUtterance(text);
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
            updateControls(controls, 'playing');
        };

        utterance.onend = function() {
            isReading = false;
            updateControls(controls, 'idle');
            activeControls = null;
        };

        utterance.onerror = function(e) {
            console.error('Speech error:', e);
            isReading = false;
            updateControls(controls, 'idle');
            activeControls = null;
        };

        try {
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error('Failed to speak:', e);
            updateControls(controls, 'idle');
        }
    }

    function pauseSpeech(controls) {
        if (isReading && !isPaused) {
            window.speechSynthesis.pause();
            isPaused = true;
            updateControls(controls, 'paused');
        }
    }

    function resumeSpeech(controls) {
        if (isReading && isPaused) {
            window.speechSynthesis.resume();
            isPaused = false;
            updateControls(controls, 'playing');
        }
    }

    function stopSpeech(controls) {
        if (isReading) {
            window.speechSynthesis.cancel();
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            activeControls = null;
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
    // VOICE LOADING
    // ==========================================
    function loadVoices() {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
            setTimeout(loadVoices, 300);
            return;
        }

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
        if (selectedVoice) {
            select.value = selectedVoice.name;
        }
    }

    // ==========================================
    // CREATE CONTROLS
    // ==========================================
    function createSectionControls(section, sectionIndex) {
        const container = document.createElement('div');
        container.className = `plebvox-control-${sectionIndex}`;
        container.style.cssText = 'margin: 0.75rem 0; padding: 0.75rem 1rem; max-width: 100%; background: var(--secondary-nav-bg, #f4f4f4); border-radius: 8px; border: 1px solid var(--border, #ddd); text-align: center;';

        const title = document.createElement('div');
        title.textContent = `🔊 PlebVox — Part ${section.number}`;
        title.style.cssText = 'font-weight: 700; font-size: 1rem; color: var(--text, #000); margin-bottom: 0.5rem; text-align: center;';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;';

        const playBtn = document.createElement('button');
        playBtn.textContent = '▶ Play';
        playBtn.style.cssText = 'padding: 0.4rem 1rem; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;';

        const pauseBtn = document.createElement('button');
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.style.cssText = 'padding: 0.4rem 1rem; background: #ffc107; color: #000; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none;';

        const resumeBtn = document.createElement('button');
        resumeBtn.textContent = '▶ Resume';
        resumeBtn.style.cssText = 'padding: 0.4rem 1rem; background: #17a2b8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none;';

        const stopBtn = document.createElement('button');
        stopBtn.textContent = '⏹ Stop';
        stopBtn.style.cssText = 'padding: 0.4rem 1rem; background: #dc3545; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none;';

        const statusText = document.createElement('span');
        statusText.textContent = 'Ready';
        statusText.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary, #666); margin-left: 0.5rem; min-width: 60px;';

        const controls = {
            playBtn: playBtn,
            pauseBtn: pauseBtn,
            resumeBtn: resumeBtn,
            stopBtn: stopBtn,
            statusText: statusText
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

        // Speed and voice row
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
        voiceSelect.style.cssText = 'padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid var(--border, #ddd); font-size: 0.75rem; max-width: 180px;';
        
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

        container.appendChild(title);
        container.appendChild(buttonContainer);
        container.appendChild(controlsRow);

        return container;
    }

    // ==========================================
    // INIT
    // ==========================================
    function initPlebVox() {
        sectionDataList = getPlebVoxSections();
        
        if (sectionDataList.length === 0) {
            console.log('PlebVox: No sections found.');
            return;
        }

        console.log(`PlebVox: Found ${sectionDataList.length} section(s)`);

        loadVoices();

        const main = document.querySelector('main');
        if (!main) return;

        sectionDataList.forEach((section, index) => {
            const controlElement = createSectionControls(section, index);
            section.controlElement = controlElement;
            section.startNode.parentNode.insertBefore(controlElement, section.startNode.nextSibling);
        });

        window.speechSynthesis.onvoiceschanged = function() {
            if (availableVoices.length === 0) {
                loadVoices();
            }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlebVox);
    } else {
        initPlebVox();
    }

})();
