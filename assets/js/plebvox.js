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
    let voicesLoaded = false;
    let voiceLoadAttempts = 0;
    let voiceLoadTimeout = null;
    let speechSynthSupported = false;
    let browserHasVoices = false;
    let voiceLoadComplete = false;

    // ==========================================
    // BROWSER DETECTION - FIXED ORDER
    // ==========================================
    function getBrowserInfo() {
        const ua = navigator.userAgent.toLowerCase();

        // Check for specific browsers first (Brave contains Chrome in UA)
        if (ua.indexOf('vivaldi') !== -1) return 'Vivaldi';
        if (ua.indexOf('brave') !== -1) return 'Brave';
        if (ua.indexOf('edg') !== -1) return 'Edge';
        if (ua.indexOf('firefox') !== -1) return 'Firefox';
        if (ua.indexOf('chrome') !== -1) return 'Chrome';
        if (ua.indexOf('safari') !== -1) return 'Safari';

        return 'Unknown';
    }

    // ==========================================
    // GET SECTIONS
    // ==========================================
    function getPlebVoxSections() {
        const main = document.querySelector('main');
        if (!main) return [];

        const sections = [];
        const markers = [];

        // Find ALL PLEBVOX marker comments in document order.
        const walker = document.createTreeWalker(
            main,
            NodeFilter.SHOW_COMMENT,
            {
                acceptNode: function(node) {
                    const text = node.textContent ? node.textContent.trim() : '';
                    if (text === 'PLEBVOX:START' || text === 'PLEBVOX:END') {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );

        let node = walker.nextNode();
        while (node) {
            markers.push({
                node: node,
                type: node.textContent.trim()
            });
            node = walker.nextNode();
        }

        if (markers.length === 0) {
            return [];
        }

        // Pair each START with the next END in document order.
        let startNode = null;
        let sectionNumber = 0;

        markers.forEach(function(marker) {
            if (marker.type === 'PLEBVOX:START') {
                if (!startNode) {
                    startNode = marker.node;
                } else {
                    console.warn('PlebVox: Nested START marker detected; ignoring the nested START.');
                }
                return;
            }

            if (marker.type === 'PLEBVOX:END' && startNode) {
                const endNode = marker.node;
                sectionNumber += 1;

                // Use a DOM Range so content can contain arbitrary nested HTML.
                const range = document.createRange();
                range.setStartAfter(startNode);
                range.setEndBefore(endNode);

                const fragment = range.cloneContents();

                // Visual/media elements are not spoken. Removing them from the
                // cloned fragment also prevents image alt text from entering
                // the spoken text accidentally.
                fragment.querySelectorAll(
                    'img, svg, video, audio, canvas, iframe, object, embed, source, track'
                ).forEach(function(element) {
                    element.remove();
                });

                // Extract only the remaining prose text.
                let sectionText = fragment.textContent || '';

                // Remove emoji and related pictographic presentation characters.
                // This deliberately affects the speech copy only; the page itself
                // remains unchanged and continues to display its emojis normally.
                try {
                    sectionText = sectionText.replace(
                        /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu,
                        ''
                    );
                } catch (e) {
                    // Older browsers may not support Unicode property escapes.
                    // Keep the text intact rather than breaking PlebVox entirely.
                    console.warn('PlebVox: Unicode emoji filtering is not supported by this browser.');
                }

                // Clean whitespace left by removed visual/decorative content.
                sectionText = sectionText.replace(/\s+/g, ' ').trim();

                if (sectionText.length > 0) {
                    sections.push({
                        number: sections.length + 1,
                        text: sectionText,
                        startNode: startNode,
                        endNode: endNode,
                        controlElement: null
                    });
                    console.log(
                        `Section ${sections.length}: ${sectionText.substring(0, 50)}... (${sectionText.length} chars)`
                    );
                } else {
                    console.warn(`PlebVox: Section ${sectionNumber} contains no readable prose.`);
                }

                startNode = null;
            }
        });

        if (startNode) {
            console.warn('PlebVox: START marker has no matching END marker.');
        }

        console.log(`PlebVox: Found ${sections.length} readable section(s)`);
        return sections;
    }

    // ==========================================
    // SPEAK SECTION
    // ==========================================
    function speakSection(text, sectionData, controls) {
        if (!window.speechSynthesis) {
            console.warn('PlebVox: Speech synthesis not available.');
            alert('Speech synthesis is not available in this browser.');
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

        // Check if speech synthesis is supported but has no voices
        if (!browserHasVoices && availableVoices.length === 0) {
            console.log('PlebVox: No voices available, attempting to speak with browser default voice.');
        }

        currentSectionData = sectionData;
        activeControls = controls;

        utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = 1;
        utterance.volume = 1;

        // Only assign a voice if one is available
        if (selectedVoice && availableVoices.length > 0) {
            utterance.voice = selectedVoice;
        } else if (availableVoices.length > 0) {
            const englishVoice = availableVoices.find(v => v.lang && v.lang.startsWith('en'));
            utterance.voice = englishVoice || availableVoices[0];
            selectedVoice = utterance.voice;
        } else {
            // No voices available - let the browser use its default
            console.log('PlebVox: Speaking with browser default voice (no voices installed)');
        }

        utterance.onstart = function() {
            isReading = true;
            isPaused = false;
            updateControls(controls, 'playing');
        };

        utterance.onend = function() {
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            activeControls = null;
        };

        utterance.onerror = function(e) {
            console.error('Speech error:', e);
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            activeControls = null;
        };

        try {
            window.speechSynthesis.speak(utterance);
        } catch (e) {
            console.error('Failed to speak:', e);
            updateControls(controls, 'idle');
            alert('Speech synthesis failed. Please check your browser settings.');
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
    // VOICE LOADING - FIXED
    // ==========================================
    function loadVoices() {
        // Clear any pending timeout
        if (voiceLoadTimeout) {
            clearTimeout(voiceLoadTimeout);
            voiceLoadTimeout = null;
        }

        // Check if speech synthesis is supported
        if (!('speechSynthesis' in window)) {
            console.warn('PlebVox: Speech synthesis not supported in this browser.');
            speechSynthSupported = false;
            browserHasVoices = false;
            voiceLoadComplete = true;
            updateVoiceSelectors();
            updateVoiceLoadStatus();
            return;
        }

        speechSynthSupported = true;
        console.log('PlebVox: Speech synthesis available');

        // Get voices
        let voices = [];
        try {
            voices = window.speechSynthesis.getVoices();
        } catch (e) {
            console.warn('PlebVox: Error getting voices:', e);
        }

        // If no voices, try waiting for them to load
        if (!voices || voices.length === 0) {
            voiceLoadAttempts++;
            
            // If we've tried too many times, give up
            if (voiceLoadAttempts > 20) {
                console.warn('PlebVox: No voices found after 20 attempts (6 seconds). Giving up.');
                browserHasVoices = false;
                availableVoices = [];
                voiceLoadComplete = true;
                updateVoiceSelectors();
                updateVoiceLoadStatus();
                return;
            }

            // Try again after a delay
            voiceLoadTimeout = setTimeout(function() {
                loadVoices();
            }, 300);
            return;
        }

        // Voices found!
        browserHasVoices = true;
        availableVoices = voices;
        voicesLoaded = true;
        voiceLoadComplete = true;
        console.log(`PlebVox: Voices loaded: ${voices.length}`);

        // Select default voice with regional preference
        const zaVoice = availableVoices.find(v => v.lang === 'en-ZA' || v.lang === 'en_ZA');
        const ukVoice = availableVoices.find(v => v.lang === 'en-GB' || v.lang === 'en_GB');
        const auVoice = availableVoices.find(v => v.lang === 'en-AU' || v.lang === 'en_AU');
        const englishVoice = availableVoices.find(v => v.lang && v.lang.startsWith('en'));
        selectedVoice = zaVoice || ukVoice || auVoice || englishVoice || availableVoices[0];

        updateAllVoiceSelectors();
        updateVoiceLoadStatus();
    }

    function updateVoiceLoadStatus() {
        // Update ALL status indicators, not just the first one
        const statusElements = document.querySelectorAll('.plebvox-voice-status');
        if (!statusElements.length) return;

        const browser = getBrowserInfo();
        const voiceCount = availableVoices.length;

        let statusText = '';
        let statusColor = '';

        if (!speechSynthSupported) {
            statusText = '⚠️ Speech synthesis not supported';
            statusColor = '#dc3545';
        } else if (!voiceLoadComplete) {
            statusText = '⏳ Loading voices...';
            statusColor = '#17a2b8';
        } else if (voiceCount > 0) {
            statusText = `✅ ${voiceCount} voice(s) available`;
            statusColor = '#28a745';
        } else if (voiceLoadAttempts > 20) {
            statusText = `⚠️ No selectable voices in ${browser}`;
            statusColor = '#ffc107';
        } else {
            statusText = '⏳ Loading voices...';
            statusColor = '#17a2b8';
        }

        statusElements.forEach(function(statusEl) {
            statusEl.textContent = statusText;
            statusEl.style.color = statusColor;
        });
    }

    function updateAllVoiceSelectors() {
        document.querySelectorAll('.plebvox-voice-select').forEach(function(select) {
            populateVoiceSelector(select);
        });
    }

    function populateVoiceSelector(select) {
        // Preserve the current value
        const currentValue = select.value;
        select.innerHTML = '';

        // If no voices available, show a message
        if (!speechSynthSupported || availableVoices.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Browser default voice';
            select.appendChild(option);
            return;
        }

        // Add voices
        availableVoices.forEach(function(voice) {
            const option = document.createElement('option');
            option.value = voice.name;
            let flag = '🌐';
            if (voice.lang === 'en-GB' || voice.lang === 'en_GB') flag = '🇬🇧';
            else if (voice.lang === 'en-US' || voice.lang === 'en_US') flag = '🇺🇸';
            else if (voice.lang === 'en-AU' || voice.lang === 'en_AU') flag = '🇦🇺';
            else if (voice.lang === 'en-ZA' || voice.lang === 'en_ZA') flag = '🇿🇦';
            option.textContent = `${flag} ${voice.name}`;
            select.appendChild(option);
        });

        // Restore selected voice if still available
        if (currentValue && availableVoices.find(function(v) { return v.name === currentValue; })) {
            select.value = currentValue;
        } else if (selectedVoice) {
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
            statusText: statusText,
            voiceSelect: null
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
        
        controls.voiceSelect = voiceSelect;

        if (availableVoices.length > 0) {
            populateVoiceSelector(voiceSelect);
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Browser default voice';
            voiceSelect.appendChild(option);
        }

        voiceSelect.addEventListener('change', function() {
            const selected = availableVoices.find(function(v) { return v.name === this.value; }.bind(this));
            if (selected) {
                selectedVoice = selected;
            }
        });

        controlsRow.appendChild(voiceSelect);

        // Voice status indicator - each control gets its own
        const voiceStatus = document.createElement('span');
        voiceStatus.className = 'plebvox-voice-status';
        voiceStatus.style.cssText = 'font-size: 0.7rem; color: var(--text-secondary, #666); margin-left: 0.25rem;';
        voiceStatus.textContent = 'Loading...';
        controlsRow.appendChild(voiceStatus);

        container.appendChild(title);
        container.appendChild(buttonContainer);
        container.appendChild(controlsRow);

        return container;
    }

    // ==========================================
    // INIT
    // ==========================================
    function initPlebVox() {
        console.log('PlebVox: Browser:', getBrowserInfo());
        
        sectionDataList = getPlebVoxSections();
        
        if (sectionDataList.length === 0) {
            console.log('PlebVox: No sections found.');
            return;
        }

        console.log(`PlebVox: Found ${sectionDataList.length} section(s)`);

        // Load voices (will retry if needed)
        loadVoices();

        const main = document.querySelector('main');
        if (!main) return;

        sectionDataList.forEach(function(section, index) {
            const controlElement = createSectionControls(section, index);
            section.controlElement = controlElement;
            section.startNode.parentNode.insertBefore(controlElement, section.startNode.nextSibling);
        });

        // Listen for voice changes
        if ('speechSynthesis' in window) {
            window.speechSynthesis.onvoiceschanged = function() {
                if (availableVoices.length === 0) {
                    // Reset attempts and try loading again
                    voiceLoadAttempts = 0;
                    voiceLoadComplete = false;
                    loadVoices();
                } else {
                    // Voices may have changed, update the list
                    const newVoices = window.speechSynthesis.getVoices();
                    if (newVoices && newVoices.length !== availableVoices.length) {
                        availableVoices = newVoices;
                        browserHasVoices = newVoices.length > 0;
                        voiceLoadComplete = true;
                        updateAllVoiceSelectors();
                        updateVoiceLoadStatus();
                    }
                }
            };
        }

        // Update status after a moment
        setTimeout(function() {
            updateVoiceLoadStatus();
        }, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlebVox);
    } else {
        initPlebVox();
    }

})();
