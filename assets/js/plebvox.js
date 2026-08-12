// assets/js/plebvox.js - Accessibility Fixed (Lighthouse 13.4.1)
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
    let speechSynthSupported = false;
    let browserHasVoices = false;
    let voiceLoadComplete = false;
    let voicePromise = null;
    let sectionCounter = 0;

    // ==========================================
    // BROWSER DETECTION
    // ==========================================
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

    // ==========================================
    // WAIT FOR VOICES - WITH CHROMIUM FALLBACK
    // ==========================================
    function waitForVoices() {
        if (voicePromise) return voicePromise;

        voicePromise = new Promise(function(resolve) {
            if (!('speechSynthesis' in window)) {
                resolve([]);
                return;
            }

            let voices = window.speechSynthesis.getVoices();

            if (voices.length > 0) {
                resolve(voices);
                return;
            }

            function onVoicesChanged() {
                voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                    resolve(voices);
                }
            }

            window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);

            try {
                window.speechSynthesis.cancel();
            } catch (e) {
                // Ignore errors from cancel()
            }

            setTimeout(function() {
                voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                    resolve(voices);
                    return;
                }

                setTimeout(function() {
                    window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
                    voices = window.speechSynthesis.getVoices();
                    resolve(voices);
                }, 1500);
            }, 500);
        });

        return voicePromise;
    }

    // ==========================================
    // GET SECTIONS
    // ==========================================
    function getPlebVoxSections() {
        const main = document.querySelector('main');
        if (!main) return [];

        const sections = [];
        const markers = [];

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

                const range = document.createRange();
                range.setStartAfter(startNode);
                range.setEndBefore(endNode);

                const fragment = range.cloneContents();

                fragment.querySelectorAll(
                    'img, svg, video, audio, canvas, iframe, object, embed, source, track'
                ).forEach(function(element) {
                    element.remove();
                });

                let sectionText = fragment.textContent || '';

                try {
                    sectionText = sectionText.replace(
                        /[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu,
                        ''
                    );
                } catch (e) {
                    console.warn('PlebVox: Unicode emoji filtering is not supported by this browser.');
                }

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

        currentSectionData = sectionData;
        activeControls = controls;

        utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = 1;
        utterance.volume = 1;

        let voiceToUse = null;
        if (selectedVoice && availableVoices.length > 0) {
            voiceToUse = selectedVoice;
        } else if (availableVoices.length > 0) {
            voiceToUse = availableVoices[0];
        }

        waitForVoices().then(function(voices) {
            if (voices.length > 0) {
                availableVoices = voices;
                browserHasVoices = true;
                voiceLoadComplete = true;
                voicesLoaded = true;
                updateAllVoiceSelectors();
                updateVoiceLoadStatus();

                if (!voiceToUse) {
                    const zaVoice = voices.find(v => v.lang === 'en-ZA' || v.lang === 'en_ZA');
                    const ukVoice = voices.find(v => v.lang === 'en-GB' || v.lang === 'en_GB');
                    const auVoice = voices.find(v => v.lang === 'en-AU' || v.lang === 'en_AU');
                    const englishVoice = voices.find(v => v.lang && v.lang.startsWith('en'));
                    voiceToUse = zaVoice || ukVoice || auVoice || englishVoice || voices[0];
                    selectedVoice = voiceToUse;
                }

                if (voiceToUse) {
                    utterance.voice = voiceToUse;
                }
            } else {
                console.log('PlebVox: Browser exposes no speech voices. OS speech engine unavailable.');
                browserHasVoices = false;
                voiceLoadComplete = true;
                updateVoiceLoadStatus();
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
        }).catch(function(e) {
            console.error('Voice loading error:', e);
            try {
                window.speechSynthesis.speak(utterance);
            } catch (err) {
                console.error('Fallback speech failed:', err);
                updateControls(controls, 'idle');
            }
        });
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
    // VOICE LOADING - EVENT-DRIVEN
    // ==========================================
    function loadVoices() {
        if (voicesLoaded) return;

        waitForVoices().then(function(voices) {
            if (voices.length > 0) {
                availableVoices = voices;
                browserHasVoices = true;
                voicesLoaded = true;
                voiceLoadComplete = true;
                console.log(`PlebVox: Voices loaded: ${voices.length}`);

                const zaVoice = voices.find(v => v.lang === 'en-ZA' || v.lang === 'en_ZA');
                const ukVoice = voices.find(v => v.lang === 'en-GB' || v.lang === 'en_GB');
                const auVoice = voices.find(v => v.lang === 'en-AU' || v.lang === 'en_AU');
                const englishVoice = voices.find(v => v.lang && v.lang.startsWith('en'));
                selectedVoice = zaVoice || ukVoice || auVoice || englishVoice || voices[0];

                updateAllVoiceSelectors();
                updateVoiceLoadStatus();
            } else {
                browserHasVoices = false;
                voiceLoadComplete = true;
                console.log('PlebVox: Browser exposes no speech voices. OS speech engine unavailable.');
                updateVoiceLoadStatus();
            }
        }).catch(function(e) {
            console.warn('PlebVox: Voice loading error:', e);
            voiceLoadComplete = true;
            updateVoiceLoadStatus();
        });
    }

    function updateVoiceLoadStatus() {
        const statusElements = document.querySelectorAll('.plebvox-voice-status');
        if (!statusElements.length) return;

        const browser = getBrowserInfo();
        const voiceCount = availableVoices.length;

        let statusText = '';
        let statusColor = '';

        if (!('speechSynthesis' in window)) {
            statusText = '⚠️ Speech synthesis not supported';
            statusColor = '#dc3545';
        } else if (!voiceLoadComplete) {
            statusText = '⏳ Loading voices...';
            statusColor = '#17a2b8';
        } else if (voiceCount > 0) {
            statusText = `✅ ${voiceCount} voice(s) available`;
            statusColor = '#28a745';
        } else {
            statusText = `ℹ️ No system voices (${browser})`;
            statusColor = '#b38600';
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
        const currentValue = select.value;
        select.innerHTML = '';

        if (!('speechSynthesis' in window) || availableVoices.length === 0) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No voices available';
            select.appendChild(option);
            return;
        }

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

        if (currentValue && availableVoices.find(function(v) { return v.name === currentValue; })) {
            select.value = currentValue;
        } else if (selectedVoice) {
            select.value = selectedVoice.name;
        }
    }

    // ==========================================
    // GENERATE UNIQUE ID
    // ==========================================
    function generateUniqueId(prefix) {
        sectionCounter += 1;
        return prefix + '-' + sectionCounter + '-' + Date.now().toString(36);
    }

    // ==========================================
    // CREATE CONTROLS - ACCESSIBILITY FIXED
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
        playBtn.setAttribute('aria-label', `Play Part ${section.number}`);
        playBtn.style.cssText = 'padding: 0.4rem 1rem; background: #1e7e34; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600;';

        const pauseBtn = document.createElement('button');
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.setAttribute('aria-label', `Pause Part ${section.number}`);
        pauseBtn.style.cssText = 'padding: 0.4rem 1rem; background: #ffc107; color: #000; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none;';

        const resumeBtn = document.createElement('button');
        resumeBtn.textContent = '▶ Resume';
        resumeBtn.setAttribute('aria-label', `Resume Part ${section.number}`);
        resumeBtn.style.cssText = 'padding: 0.4rem 1rem; background: #0f7c8c; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none;';

        const stopBtn = document.createElement('button');
        stopBtn.textContent = '⏹ Stop';
        stopBtn.setAttribute('aria-label', `Stop Part ${section.number}`);
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

        // Speed control with proper label
        const speedLabel = document.createElement('label');
        const speedId = generateUniqueId('plebvox-speed');
        speedLabel.textContent = 'Speed:';
        speedLabel.setAttribute('for', speedId);
        speedLabel.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary, #666);';

        const speedDisplay = document.createElement('span');
        speedDisplay.textContent = '0.70x';
        speedDisplay.style.cssText = 'font-size: 0.8rem; min-width: 3rem; color: var(--text-secondary, #666);';
        speedDisplay.id = speedId + '-display';
        speedDisplay.setAttribute('aria-live', 'polite');
        speedDisplay.setAttribute('aria-atomic', 'true');

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.id = speedId;
        speedSlider.min = 0.3;
        speedSlider.max = 1.8;
        speedSlider.step = 0.05;
        speedSlider.value = speechRate;
        speedSlider.setAttribute('aria-label', `Reading speed for Part ${section.number}`);
        speedSlider.setAttribute('aria-valuenow', speechRate);
        speedSlider.setAttribute('aria-valuemin', '0.3');
        speedSlider.setAttribute('aria-valuemax', '1.8');
        speedSlider.style.cssText = 'width: 100px; cursor: pointer;';
        
        speedSlider.addEventListener('input', function() {
            speechRate = parseFloat(this.value);
            speedDisplay.textContent = speechRate.toFixed(2) + 'x';
            this.setAttribute('aria-valuenow', speechRate);
        });

        controlsRow.appendChild(speedLabel);
        controlsRow.appendChild(speedSlider);
        controlsRow.appendChild(speedDisplay);

        // Voice selector with proper label
        const voiceLabel = document.createElement('label');
        const voiceId = generateUniqueId('plebvox-voice');
        voiceLabel.textContent = 'Voice:';
        voiceLabel.setAttribute('for', voiceId);
        voiceLabel.style.cssText = 'font-size: 0.8rem; color: var(--text-secondary, #666);';

        const voiceSelect = document.createElement('select');
        voiceSelect.id = voiceId;
        voiceSelect.className = 'plebvox-voice-select';
        voiceSelect.setAttribute('aria-label', `Select voice for Part ${section.number}`);
        voiceSelect.style.cssText = 'padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid var(--border, #ddd); font-size: 0.75rem; max-width: 180px;';
        
        controls.voiceSelect = voiceSelect;

        if (availableVoices.length > 0) {
            populateVoiceSelector(voiceSelect);
        } else {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'No voices available';
            voiceSelect.appendChild(option);
        }

        voiceSelect.addEventListener('change', function() {
            const selected = availableVoices.find(function(v) { return v.name === this.value; }.bind(this));
            if (selected) {
                selectedVoice = selected;
            }
        });

        controlsRow.appendChild(voiceLabel);
        controlsRow.appendChild(voiceSelect);

        // Voice status indicator
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

        if (!('speechSynthesis' in window)) {
            console.warn('PlebVox: Speech synthesis not available.');
            speechSynthSupported = false;
        } else {
            speechSynthSupported = true;
        }

        sectionDataList = getPlebVoxSections();
        
        if (sectionDataList.length === 0) {
            console.log('PlebVox: No sections found.');
            return;
        }

        console.log(`PlebVox: Found ${sectionDataList.length} section(s)`);

        loadVoices();

        const main = document.querySelector('main');
        if (!main) return;

        sectionDataList.forEach(function(section, index) {
            const controlElement = createSectionControls(section, index);
            section.controlElement = controlElement;
            section.startNode.parentNode.insertBefore(controlElement, section.startNode.nextSibling);
        });

        if ('speechSynthesis' in window) {
            window.speechSynthesis.addEventListener('voiceschanged', function() {
                const voices = window.speechSynthesis.getVoices();
                if (voices.length > 0 && voices.length !== availableVoices.length) {
                    availableVoices = voices;
                    browserHasVoices = true;
                    voiceLoadComplete = true;
                    voicesLoaded = true;
                    updateAllVoiceSelectors();
                    updateVoiceLoadStatus();
                }
            });
        }

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
