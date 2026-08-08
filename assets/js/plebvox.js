// assets/js/plebvox.js
(function() {
    'use strict';

    let isReading = false;
    let isPaused = false;
    let utterance = null;
    let highlightTimer = null;
    let words = [];
    let currentWordIndex = 0;
    let availableVoices = [];
    let selectedVoice = null;
    let speechRate = 0.7;
    let avgWordDuration = 200;
    let activeSectionIndex = -1;
    let sections = [];
    let currentSectionText = '';
    let currentSectionIndex = -1;
    let resumePosition = 0;

    // ==========================================
    // CLEAN TEXT - Remove emojis & symbols
    // ==========================================
    function cleanText(text) {
        text = text.replace(/[\u{1F600}-\u{1F9FF}]/gu, '');
        text = text.replace(/[\u{2600}-\u{27BF}]/gu, '');
        text = text.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
        text = text.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
        text = text.replace(/[™®©†‡°§¶•·…′″‽¿¡]/g, '');
        text = text.replace(/[^\w\s.,!?;:'"()\-]/g, ' ');
        text = text.replace(/\s+/g, ' ');
        return text.trim();
    }

    // ==========================================
    // GET PLEBVOX SECTIONS FROM PAGE
    // ==========================================
    function getPlebVoxSections() {
        const main = document.querySelector('main');
        if (!main) return [];

        const html = main.innerHTML;
        const sections = [];
        const startMarker = '<!-- PLEBVOX:START -->';
        const endMarker = '<!-- PLEBVOX:END -->';

        let startIndex = html.indexOf(startMarker);
        let sectionNumber = 1;

        while (startIndex !== -1) {
            const endIndex = html.indexOf(endMarker, startIndex + startMarker.length);
            if (endIndex === -1) break;

            const contentStart = startIndex + startMarker.length;
            const contentEnd = endIndex;
            let sectionHtml = html.substring(contentStart, contentEnd);
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = sectionHtml;
            const sectionText = tempDiv.textContent || tempDiv.innerText || '';
            const cleanSectionText = cleanText(sectionText.trim());

            if (cleanSectionText.length > 0) {
                sections.push({
                    number: sectionNumber,
                    text: cleanSectionText,
                    html: sectionHtml,
                    start: startIndex,
                    end: endIndex + endMarker.length
                });
                sectionNumber++;
            }

            startIndex = html.indexOf(startMarker, endIndex + endMarker.length);
        }

        return sections;
    }

    // ==========================================
    // WORDS FOR HIGHLIGHTING
    // ==========================================
    function getWords(text) {
        return text.split(/\s+/);
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

    function highlightWord(index) {
        clearHighlights();
        if (index < 0 || index >= words.length) return;

        const targetWord = words[index];
        if (!targetWord) return;

        const sectionEl = document.querySelector(`.plebvox-section-${activeSectionIndex}`);
        if (!sectionEl) return;

        const walker = document.createTreeWalker(
            sectionEl,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node = walker.nextNode();
        while (node) {
            const text = node.textContent;
            const indexOfWord = text.toLowerCase().indexOf(targetWord.toLowerCase());
            if (indexOfWord !== -1) {
                const parent = node.parentNode;
                const before = document.createTextNode(text.substring(0, indexOfWord));
                const wordNode = document.createTextNode(text.substring(indexOfWord, indexOfWord + targetWord.length));
                const after = document.createTextNode(text.substring(indexOfWord + targetWord.length));

                const span = document.createElement('span');
                span.className = 'plebvox-highlight';
                span.style.backgroundColor = '#ffeb3b';
                span.style.color = '#000';
                span.style.padding = '0 2px';
                span.style.borderRadius = '2px';
                span.style.boxShadow = '0 0 0 2px #f57c00';
                span.style.transition = 'background-color 0.1s ease';
                span.appendChild(wordNode);

                parent.insertBefore(before, node);
                parent.insertBefore(span, node);
                parent.insertBefore(after, node);
                parent.removeChild(node);
                break;
            }
            node = walker.nextNode();
        }
    }

    function startHighlighting(text, sectionIndex) {
        words = getWords(text);
        let index = 0;
        const totalWords = words.length;
        const wordDuration = avgWordDuration / speechRate;

        activeSectionIndex = sectionIndex;
        highlightWord(index);
        currentWordIndex = index;

        if (highlightTimer) clearInterval(highlightTimer);

        highlightTimer = setInterval(() => {
            index++;
            if (index >= totalWords) {
                clearInterval(highlightTimer);
                highlightTimer = null;
                clearHighlights();
                return;
            }
            currentWordIndex = index;
            highlightWord(index);
        }, wordDuration);
    }

    function startHighlightingFrom(text, sectionIndex, startWordIndex) {
        words = getWords(text);
        let index = startWordIndex;
        const totalWords = words.length;
        const wordDuration = avgWordDuration / speechRate;

        activeSectionIndex = sectionIndex;
        highlightWord(index);
        currentWordIndex = index;

        if (highlightTimer) clearInterval(highlightTimer);

        highlightTimer = setInterval(() => {
            index++;
            if (index >= totalWords) {
                clearInterval(highlightTimer);
                highlightTimer = null;
                clearHighlights();
                return;
            }
            currentWordIndex = index;
            highlightWord(index);
        }, wordDuration);
    }

    function stopHighlighting() {
        if (highlightTimer) {
            clearInterval(highlightTimer);
            highlightTimer = null;
        }
        clearHighlights();
        activeSectionIndex = -1;
        currentWordIndex = 0;
    }

    // ==========================================
    // SPEAK SECTION WITH PAUSE/RESUME
    // ==========================================
    function speakSection(text, sectionIndex, controls) {
        if (!window.speechSynthesis) {
            alert('Speech synthesis not supported.');
            return;
        }

        if (isReading && currentSectionIndex === sectionIndex) {
            if (isPaused) {
                resumeSpeech(controls);
            } else {
                pauseSpeech(controls);
            }
            return;
        }

        if (isReading) {
            window.speechSynthesis.cancel();
            stopHighlighting();
            isReading = false;
            isPaused = false;
        }

        const cleanTextContent = cleanText(text);
        if (!cleanTextContent || cleanTextContent.length < 2) {
            alert('No readable content in this section.');
            return;
        }

        currentSectionText = cleanTextContent;
        currentSectionIndex = sectionIndex;
        resumePosition = 0;

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
            startHighlighting(cleanTextContent, sectionIndex);
        };

        utterance.onend = function() {
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            stopHighlighting();
        };

        utterance.onerror = function(e) {
            console.error('Speech error:', e);
            isReading = false;
            isPaused = false;
            updateControls(controls, 'idle');
            stopHighlighting();
        };

        utterance.onboundary = function(event) {
            if (event.name === 'word') {
                resumePosition = event.charIndex;
            }
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
            if (highlightTimer) {
                clearInterval(highlightTimer);
                highlightTimer = null;
            }
        }
    }

    function resumeSpeech(controls) {
        if (isReading && isPaused) {
            window.speechSynthesis.resume();
            isPaused = false;
            updateControls(controls, 'playing');
            
            if (currentSectionText) {
                const textBefore = currentSectionText.substring(0, resumePosition);
                const wordsBefore = getWords(textBefore);
                const wordIndex = wordsBefore.length;
                startHighlightingFrom(currentSectionText, activeSectionIndex, wordIndex);
            }
        }
    }

    function stopSpeech(controls) {
        if (isReading) {
            window.speechSynthesis.cancel();
            isReading = false;
            isPaused = false;
            stopHighlighting();
            updateControls(controls, 'idle');
        }
    }

    // ==========================================
    // UPDATE CONTROLS UI
    // ==========================================
    function updateControls(controls, state) {
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
        updateVoiceSelectors();
    }

    function updateVoiceSelectors() {
        document.querySelectorAll('.plebvox-voice-select').forEach(select => {
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
            if (selectedVoice) {
                select.value = selectedVoice.name;
            }
        });
    }

    // ==========================================
    // CREATE CONTROLS FOR A SECTION (CENTERED)
    // ==========================================
    function createSectionControls(section, sectionIndex) {
        const container = document.createElement('div');
        container.className = `plebvox-section-${sectionIndex}`;
        container.style.cssText = 'margin: 0.75rem auto; padding: 0.75rem 1rem; max-width: 800px; background: var(--secondary-nav-bg, #f4f4f4); border-radius: 8px; border: 1px solid var(--border, #ddd); text-align: center;';

        // Section title
        const title = document.createElement('div');
        title.textContent = `🔊 PlebVox — Part ${section.number}`;
        title.style.cssText = 'font-weight: 700; font-size: 1rem; color: var(--text, #000); margin-bottom: 0.5rem; text-align: center;';

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.5rem;';

        // Play button
        const playBtn = document.createElement('button');
        playBtn.className = 'plebvox-play';
        playBtn.textContent = '▶ Play';
        playBtn.style.cssText = 'padding: 0.4rem 1rem; background: #28a745; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; transition: background 0.2s;';
        playBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#218838'; });
        playBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#28a745'; });

        // Pause button
        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'plebvox-pause';
        pauseBtn.textContent = '⏸ Pause';
        pauseBtn.style.cssText = 'padding: 0.4rem 1rem; background: #ffc107; color: #000; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none; transition: background 0.2s;';
        pauseBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#e0a800'; });
        pauseBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#ffc107'; });

        // Resume button
        const resumeBtn = document.createElement('button');
        resumeBtn.className = 'plebvox-resume';
        resumeBtn.textContent = '▶ Resume';
        resumeBtn.style.cssText = 'padding: 0.4rem 1rem; background: #17a2b8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none; transition: background 0.2s;';
        resumeBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#138496'; });
        resumeBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#17a2b8'; });

        // Stop button
        const stopBtn = document.createElement('button');
        stopBtn.className = 'plebvox-stop';
        stopBtn.textContent = '⏹ Stop';
        stopBtn.style.cssText = 'padding: 0.4rem 1rem; background: #dc3545; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; font-weight: 600; display: none; transition: background 0.2s;';
        stopBtn.addEventListener('mouseenter', function() { this.style.backgroundColor = '#c82333'; });
        stopBtn.addEventListener('mouseleave', function() { this.style.backgroundColor = '#dc3545'; });

        // Status text
        const statusText = document.createElement('span');
        statusText.className = 'plebvox-status';
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
            speakSection(section.text, sectionIndex, controls);
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

        // Controls row (speed & voice)
        const controlsRow = document.createElement('div');
        controlsRow.style.cssText = 'display: flex; justify-content: center; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.25rem;';

        // Speed control
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

        // Voice selector
        if (availableVoices.length > 0) {
            const voiceSelect = document.createElement('select');
            voiceSelect.className = 'plebvox-voice-select';
            voiceSelect.style.cssText = 'padding: 0.2rem 0.4rem; border-radius: 4px; border: 1px solid var(--border, #ddd); font-size: 0.75rem; max-width: 180px; background: var(--bg, #fff); color: var(--text, #000);';
            
            availableVoices.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.name;
                let flag = '🌐';
                if (voice.lang === 'en-GB' || voice.lang === 'en_GB') flag = '🇬🇧';
                else if (voice.lang === 'en-US' || voice.lang === 'en_US') flag = '🇺🇸';
                else if (voice.lang === 'en-AU' || voice.lang === 'en_AU') flag = '🇦🇺';
                option.textContent = `${flag} ${voice.name}`;
                voiceSelect.appendChild(option);
            });
            
            if (selectedVoice) {
                voiceSelect.value = selectedVoice.name;
            }

            voiceSelect.addEventListener('change', function() {
                const selected = availableVoices.find(v => v.name === this.value);
                if (selected) {
                    selectedVoice = selected;
                }
            });

            controlsRow.appendChild(voiceSelect);
        }

        container.appendChild(title);
        container.appendChild(buttonContainer);
        container.appendChild(controlsRow);

        return container;
    }

    // ==========================================
    // MAIN INITIALIZATION
    // ==========================================
    function initPlebVox() {
        sections = getPlebVoxSections();
        
        if (sections.length === 0) {
            console.log('PlebVox: No sections found. Existing articles work normally.');
            return;
        }

        console.log(`PlebVox: Found ${sections.length} section(s)`);

        if (availableVoices.length === 0) {
            loadVoices();
        }

        const main = document.querySelector('main');
        if (!main) return;

        // Main PlebVox container
        const mainContainer = document.createElement('div');
        mainContainer.id = 'plebvox-container';
        mainContainer.style.cssText = 'margin: 1rem auto 2rem auto; max-width: 900px; padding: 0 0.5rem;';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'text-align: center; margin-bottom: 0.75rem; font-size: 1.1rem; font-weight: 700; color: var(--text, #000);';
        header.textContent = '🔊 PlebVox — Listen to this article';
        mainContainer.appendChild(header);

        sections.forEach((section, index) => {
            const sectionControls = createSectionControls(section, index);
            mainContainer.appendChild(sectionControls);
        });

        // Insert after first heading or at top
        const firstHeading = main.querySelector('h1, h2, h3');
        if (firstHeading) {
            firstHeading.parentNode.insertBefore(mainContainer, firstHeading.nextSibling);
        } else {
            main.insertBefore(mainContainer, main.firstChild);
        }

        // Styles
        const style = document.createElement('style');
        style.textContent = `
            .plebvox-section-${sections.length - 1} {
                animation: plebvoxFadeIn 0.3s ease;
            }
            @keyframes plebvoxFadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    // ==========================================
    // RUN
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPlebVox);
    } else {
        initPlebVox();
    }

})();
