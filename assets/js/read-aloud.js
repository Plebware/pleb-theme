// Read Aloud – Full Feature Version
(function() {
    'use strict';

    let isReading = false;
    let utterance = null;
    let highlightTimer = null;
    let words = [];
    let currentWordIndex = 0;
    let availableVoices = [];
    let selectedVoice = null;
    let speechRate = 0.9;
    let avgWordDuration = 150;
    let isInitialized = false;
    let content = '';

    // Get main content text
    function getContentText() {
        const main = document.querySelector('main');
        if (!main) return '';
        let text = main.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    function getWords(text) {
        return text.split(/\s+/);
    }

    function clearHighlights() {
        document.querySelectorAll('.read-aloud-highlight').forEach(el => {
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

        const walker = document.createTreeWalker(
            document.querySelector('main'),
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    let parent = node.parentElement;
                    while (parent) {
                        if (parent.matches && parent.matches('#comments-section, .post-navigation, footer, .excerpt')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let node = walker.nextNode();
        while (node) {
            const text = node.textContent;
            const indexOfWord = text.indexOf(targetWord);
            if (indexOfWord !== -1) {
                const parent = node.parentNode;
                const before = document.createTextNode(text.substring(0, indexOfWord));
                const wordNode = document.createTextNode(text.substring(indexOfWord, indexOfWord + targetWord.length));
                const after = document.createTextNode(text.substring(indexOfWord + targetWord.length));

                const span = document.createElement('span');
                span.className = 'read-aloud-highlight';
                span.style.backgroundColor = '#ffeb3b';
                span.style.color = '#000';
                span.style.padding = '0 2px';
                span.style.borderRadius = '2px';
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

    function startHighlighting() {
        let index = 0;
        const totalWords = words.length;
        const wordDuration = avgWordDuration / speechRate;

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
        currentWordIndex = 0;
    }

    function calibrateTiming(text, durationMs) {
        const wordCount = getWords(text).length;
        if (wordCount === 0) return;
        const actualDurationPerWord = durationMs / wordCount;
        avgWordDuration = (avgWordDuration * 0.3) + (actualDurationPerWord * 0.7);
    }

    function loadVoices() {
        availableVoices = window.speechSynthesis.getVoices();
        if (availableVoices.length === 0) {
            // Try again after a delay
            setTimeout(loadVoices, 200);
            return;
        }
        // Select first English voice by default
        const englishVoice = availableVoices.find(v => v.lang.startsWith('en'));
        if (englishVoice) {
            selectedVoice = englishVoice;
        } else if (availableVoices.length > 0) {
            selectedVoice = availableVoices[0];
        }
        updateVoiceSelector();
    }

    function speakText(text, button) {
        if (!window.speechSynthesis) {
            alert('Your browser does not support speech synthesis.');
            return;
        }

        if (isReading) {
            window.speechSynthesis.cancel();
            stopHighlighting();
            isReading = false;
            button.textContent = '🔊 Listen';
            return;
        }

        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        words = getWords(text);
        currentWordIndex = 0;
        content = text;

        utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = speechRate;
        utterance.pitch = 1;
        utterance.volume = 1;

        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        let startTime = Date.now();

        utterance.onstart = function() {
            isReading = true;
            button.textContent = '⏹ Stop';
            startTime = Date.now();
            startHighlighting();
        };

        utterance.onend = function() {
            const duration = Date.now() - startTime;
            calibrateTiming(text, duration);
            isReading = false;
            button.textContent = '🔊 Listen';
            stopHighlighting();
        };

        utterance.onerror = function() {
            isReading = false;
            button.textContent = '🔊 Listen';
            stopHighlighting();
        };

        window.speechSynthesis.speak(utterance);
    }

    function updateVoiceSelector() {
        const voiceSelect = document.getElementById('read-aloud-voice-select');
        if (!voiceSelect) return;

        const currentVoice = voiceSelect.value;
        voiceSelect.innerHTML = '';
        availableVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });
        if (selectedVoice) {
            voiceSelect.value = selectedVoice.name;
        }
    }

    function createControls(btn) {
        const container = btn.parentElement;

        // Speed control
        const speedContainer = document.createElement('div');
        speedContainer.style.display = 'flex';
        speedContainer.style.alignItems = 'center';
        speedContainer.style.gap = '0.5rem';
        speedContainer.style.margin = '0.5rem 0';
        speedContainer.style.flexWrap = 'wrap';

        const speedLabel = document.createElement('span');
        speedLabel.textContent = 'Speed:';
        speedLabel.style.fontSize = '0.9rem';
        speedLabel.style.fontWeight = '600';

        const speedDisplay = document.createElement('span');
        speedDisplay.textContent = '0.9x';
        speedDisplay.style.fontSize = '0.9rem';
        speedDisplay.style.minWidth = '3rem';

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = 0.5;
        speedSlider.max = 1.8;
        speedSlider.step = 0.1;
        speedSlider.value = speechRate;
        speedSlider.style.width = '120px';
        speedSlider.style.cursor = 'pointer';

        speedSlider.addEventListener('input', function() {
            speechRate = parseFloat(this.value);
            speedDisplay.textContent = speechRate.toFixed(1) + 'x';
        });

        speedContainer.appendChild(speedLabel);
        speedContainer.appendChild(speedSlider);
        speedContainer.appendChild(speedDisplay);

        // Voice selector
        const voiceContainer = document.createElement('div');
        voiceContainer.style.display = 'flex';
        voiceContainer.style.alignItems = 'center';
        voiceContainer.style.gap = '0.5rem';
        voiceContainer.style.margin = '0.5rem 0';
        voiceContainer.style.flexWrap = 'wrap';

        const voiceLabel = document.createElement('span');
        voiceLabel.textContent = 'Voice:';
        voiceLabel.style.fontSize = '0.9rem';
        voiceLabel.style.fontWeight = '600';

        const voiceSelect = document.createElement('select');
        voiceSelect.id = 'read-aloud-voice-select';
        voiceSelect.style.padding = '0.3rem 0.5rem';
        voiceSelect.style.borderRadius = '4px';
        voiceSelect.style.border = '1px solid var(--border, #ddd)';
        voiceSelect.style.backgroundColor = 'var(--bg, #fff)';
        voiceSelect.style.color = 'var(--text, #000)';
        voiceSelect.style.maxWidth = '250px';

        voiceSelect.addEventListener('change', function() {
            const selected = availableVoices.find(v => v.name === this.value);
            if (selected) {
                selectedVoice = selected;
            }
        });

        voiceContainer.appendChild(voiceLabel);
        voiceContainer.appendChild(voiceSelect);

        container.appendChild(speedContainer);
        container.appendChild(voiceContainer);

        // Load voices
        if (window.speechSynthesis.getVoices().length > 0) {
            availableVoices = window.speechSynthesis.getVoices();
            updateVoiceSelector();
        } else {
            window.speechSynthesis.onvoiceschanged = function() {
                availableVoices = window.speechSynthesis.getVoices();
                updateVoiceSelector();
            };
        }
    }

    function initReadAloud() {
        content = getContentText();
        if (!content || content.length < 20) {
            console.warn('Read Aloud: Content too short');
            return;
        }

        const main = document.querySelector('main');
        if (!main) return;

        const container = document.createElement('div');
        container.style.margin = '1rem 0 1.5rem 0';
        container.style.padding = '0.5rem';
        container.style.borderRadius = '8px';
        container.style.backgroundColor = 'var(--secondary-nav-bg, #f4f4f4)';
        container.style.border = '1px solid var(--border, #ddd)';

        const btn = document.createElement('button');
        btn.textContent = '🔊 Listen';
        btn.style.padding = '0.5rem 1.2rem';
        btn.style.backgroundColor = 'var(--brand, #1e6bb8)';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '1rem';
        btn.style.fontWeight = '600';
        btn.style.marginBottom = '0.5rem';

        btn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = 'var(--link-hover, #0d3b66)';
        });
        btn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'var(--brand, #1e6bb8)';
        });

        btn.addEventListener('click', function() {
            speakText(content, btn);
        });

        container.appendChild(btn);
        createControls(btn);

        const firstHeading = main.querySelector('h1, h2');
        if (firstHeading) {
            firstHeading.parentNode.insertBefore(container, firstHeading.nextSibling);
        } else {
            main.insertBefore(container, main.firstChild);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReadAloud);
    } else {
        initReadAloud();
    }
})();
