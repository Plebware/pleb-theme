// Read Aloud with Word Highlighting - Multi-Voice Support
(function() {
    'use strict';

    let utterance = null;
    let isReading = false;
    let wordOffsets = [];
    let lastHighlightedIndex = -1;
    let availableVoices = [];
    let selectedVoice = null;
    let preferredVoiceName = null;

    // ==========================================
    // 1. GET CONTENT FROM PAGE
    // ==========================================
    function getContentText() {
        const main = document.querySelector('main');
        if (!main) return '';
        
        const clone = main.cloneNode(true);
        
        const excludeSelectors = [
            '#comments-section',
            '.post-navigation',
            'footer',
            '.excerpt'
        ];
        
        excludeSelectors.forEach(function(selector) {
            const elements = clone.querySelectorAll(selector);
            elements.forEach(function(el) {
                el.remove();
            });
        });
        
        let text = clone.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    // ==========================================
    // 2. CLEAN TEXT - REMOVE EMOJIS & SYMBOLS
    // ==========================================
    function cleanText(text) {
        text = text.replace(/[\u{1F600}-\u{1F9FF}]/gu, '');
        text = text.replace(/[\u{2600}-\u{27BF}]/gu, '');
        text = text.replace(/[\u{1F300}-\u{1F5FF}]/gu, '');
        text = text.replace(/[\u{1F680}-\u{1F6FF}]/gu, '');
        text = text.replace(/[\u{1F700}-\u{1F77F}]/gu, '');
        text = text.replace(/[\u{1F780}-\u{1F7FF}]/gu, '');
        text = text.replace(/[\u{1F800}-\u{1F8FF}]/gu, '');
        text = text.replace(/[\u{1F900}-\u{1F9FF}]/gu, '');
        text = text.replace(/[\u{1FA00}-\u{1FA6F}]/gu, '');
        text = text.replace(/[\u{1FA70}-\u{1FAFF}]/gu, '');
        text = text.replace(/[™®©†‡°§¶•·…′″‽¿¡]/g, '');
        text = text.replace(/[^\w\s.,!?;:'"()\-]/g, ' ');
        text = text.replace(/\s+/g, ' ');
        text = text.trim();
        return text;
    }

    // ==========================================
    // 3. GET WORD POSITIONS
    // ==========================================
    function getWordOffsets(text) {
        const words = text.split(/\s+/);
        let offset = 0;
        const offsets = [];
        
        words.forEach(function(word) {
            if (word.length > 0) {
                offsets.push({
                    word: word,
                    start: offset,
                    end: offset + word.length
                });
                offset += word.length + 1;
            }
        });
        
        return offsets;
    }

    // ==========================================
    // 4. HIGHLIGHT CURRENT WORD
    // ==========================================
    function highlightWord(index) {
        const highlights = document.querySelectorAll('.read-aloud-highlight');
        highlights.forEach(function(el) {
            const textNode = el.firstChild;
            const parent = el.parentNode;
            if (textNode) {
                parent.replaceChild(textNode, el);
                parent.normalize();
            }
        });

        if (index < 0 || index >= wordOffsets.length) {
            return;
        }

        const targetWord = wordOffsets[index];
        if (!targetWord) {
            return;
        }

        const walker = document.createTreeWalker(
            document.querySelector('main'),
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    let parent = node.parentElement;
                    while (parent) {
                        if (parent.matches && parent.matches(
                            '#comments-section, .post-navigation, footer, .excerpt'
                        )) {
                            return NodeFilter.FILTER_REJECT;
                        }
                        parent = parent.parentElement;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        let currentOffset = 0;
        let node = walker.nextNode();
        
        while (node) {
            const text = node.textContent;
            const nextOffset = currentOffset + text.length;
            
            if (targetWord.start >= currentOffset && targetWord.start < nextOffset) {
                const startInNode = targetWord.start - currentOffset;
                const endInNode = Math.min(targetWord.end - currentOffset, text.length);
                
                if (startInNode < text.length && endInNode > startInNode) {
                    const parent = node.parentNode;
                    const before = document.createTextNode(text.substring(0, startInNode));
                    const wordNode = document.createTextNode(text.substring(startInNode, endInNode));
                    const after = document.createTextNode(text.substring(endInNode));
                    
                    const span = document.createElement('span');
                    span.className = 'read-aloud-highlight';
                    span.style.backgroundColor = '#ffeb3b';
                    span.style.color = '#000';
                    span.style.padding = '0 2px';
                    span.style.borderRadius = '2px';
                    span.style.boxShadow = '0 0 0 2px #f57c00';
                    span.style.transition = 'background-color 0.1s';
                    span.appendChild(wordNode);
                    
                    parent.insertBefore(before, node);
                    parent.insertBefore(span, node);
                    parent.insertBefore(after, node);
                    parent.removeChild(node);
                }
                break;
            }
            
            currentOffset = nextOffset;
            node = walker.nextNode();
        }
    }

    // ==========================================
    // 5. LOAD AND SELECT VOICE
    // ==========================================
    function loadVoices() {
        return new Promise(function(resolve) {
            let voices = window.speechSynthesis.getVoices();
            if (voices.length > 0) {
                resolve(voices);
                return;
            }
            
            window.speechSynthesis.onvoiceschanged = function() {
                voices = window.speechSynthesis.getVoices();
                resolve(voices);
            };
            
            setTimeout(function() {
                voices = window.speechSynthesis.getVoices();
                if (voices.length > 0) {
                    resolve(voices);
                }
            }, 1000);
        });
    }

    // ==========================================
    // 6. FIND VOICE BY PREFERENCE
    // ==========================================
    function findVoiceByPreference(voices, preference) {
        // If we have a stored preference, try that first
        if (preferredVoiceName) {
            const found = voices.find(function(v) {
                return v.name === preferredVoiceName;
            });
            if (found) return found;
        }
        
        // If no preference, try default order
        const voicePriority = [
            // Google Voices
            { name: 'Google UK English Male', lang: 'en-GB' },
            { name: 'Google US English', lang: 'en-US' },
            { name: 'Google UK English Female', lang: 'en-GB' },
            { name: 'Google Australian English', lang: 'en-AU' },
            { name: 'Google South African English', lang: 'en-ZA' },
            
            // Microsoft Voices
            { name: 'Microsoft George - English (United Kingdom)', lang: 'en-GB' },
            { name: 'Microsoft David - English (United States)', lang: 'en-US' },
            { name: 'Microsoft James - English (United States)', lang: 'en-US' },
            { name: 'Microsoft Susan - English (United Kingdom)', lang: 'en-GB' },
            { name: 'Microsoft Catherine - English (Australia)', lang: 'en-AU' },
            
            // macOS Voices
            { name: 'Daniel', lang: 'en-GB' },
            { name: 'Alex', lang: 'en-US' },
            { name: 'Samantha', lang: 'en-US' },
            { name: 'Karen', lang: 'en-AU' },
            { name: 'Tessa', lang: 'en-ZA' },
            { name: 'Lee', lang: 'en-AU' },
            
            // Any by language (fallback)
            { lang: 'en-GB' },
            { lang: 'en-US' },
            { lang: 'en-AU' },
            { lang: 'en-ZA' }
        ];

        // Try to find a match based on preference
        if (preference) {
            // Try exact name match first
            let found = voices.find(function(v) {
                return v.name && v.name.toLowerCase().includes(preference.toLowerCase());
            });
            if (found) return found;
            
            // Try language match
            const langMap = {
                'uk': 'en-GB',
                'us': 'en-US',
                'australian': 'en-AU',
                'south african': 'en-ZA'
            };
            
            for (let key in langMap) {
                if (preference.toLowerCase().includes(key)) {
                    found = voices.find(function(v) {
                        return v.lang === langMap[key];
                    });
                    if (found) return found;
                    break;
                }
            }
        }

        // Try priority list
        for (let pattern of voicePriority) {
            const found = voices.find(function(voice) {
                if (pattern.name && pattern.lang) {
                    return voice.name === pattern.name && voice.lang === pattern.lang;
                } else if (pattern.name) {
                    return voice.name === pattern.name;
                } else if (pattern.lang) {
                    return voice.lang === pattern.lang;
                }
                return false;
            });
            
            if (found) {
                return found;
            }
        }

        // Ultimate fallback: any English voice
        return voices.find(function(v) {
            return v.lang && v.lang.startsWith('en');
        }) || voices[0] || null;
    }

    // ==========================================
    // 7. POPULATE VOICE SELECTOR
    // ==========================================
    function populateVoiceSelector(selectElement) {
        selectElement.innerHTML = '';
        
        // Add default option
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = '🌐 Auto-detect Best Voice';
        selectElement.appendChild(defaultOption);
        
        // Add quick presets
        const presets = [
            { label: '🇬🇧 UK English', value: 'uk' },
            { label: '🇺🇸 US English', value: 'us' },
            { label: '🇦🇺 Australian English', value: 'australian' },
            { label: '🇿🇦 South African English', value: 'south african' }
        ];
        
        const presetGroup = document.createElement('optgroup');
        presetGroup.label = '⭐ Quick Presets';
        
        presets.forEach(function(preset) {
            const option = document.createElement('option');
            option.value = 'preset:' + preset.value;
            option.textContent = preset.label;
            presetGroup.appendChild(option);
        });
        
        selectElement.appendChild(presetGroup);
        
        // Group all voices by language
        const grouped = {};
        availableVoices.forEach(function(voice) {
            const lang = voice.lang || 'unknown';
            if (!grouped[lang]) {
                grouped[lang] = [];
            }
            grouped[lang].push(voice);
        });
        
        const sortedLangs = Object.keys(grouped).sort();
        
        sortedLangs.forEach(function(lang) {
            const optgroup = document.createElement('optgroup');
            const langName = lang.replace('en-', '');
            const flags = {
                'GB': '🇬🇧',
                'US': '🇺🇸',
                'AU': '🇦🇺',
                'ZA': '🇿🇦',
                'CA': '🇨🇦',
                'IN': '🇮🇳'
            };
            const flag = flags[langName] || '🌐';
            optgroup.label = flag + ' ' + lang;
            
            grouped[lang].sort(function(a, b) {
                return a.name.localeCompare(b.name);
            });
            
            grouped[lang].forEach(function(voice) {
                const option = document.createElement('option');
                option.value = voice.name;
                const isLocal = voice.localService ? '🔵' : '☁️';
                option.textContent = voice.name + ' ' + isLocal;
                if (selectedVoice && selectedVoice.name === voice.name) {
                    option.selected = true;
                }
                optgroup.appendChild(option);
            });
            
            selectElement.appendChild(optgroup);
        });
    }

    // ==========================================
    // 8. SPEAK TEXT
    // ==========================================
    function speakText(text, button, stopButton, speedControl, speedDisplay, voiceSelect) {
        if (!window.speechSynthesis) {
            alert('Your browser does not support speech synthesis. Please try Chrome, Edge, or Safari.');
            return;
        }

        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        text = cleanText(text);
        wordOffsets = getWordOffsets(text);
        lastHighlightedIndex = -1;

        utterance = new SpeechSynthesisUtterance(text);
        
        // Handle voice selection
        const voiceValue = voiceSelect.value;
        let voiceToUse = null;
        
        if (voiceValue.startsWith('preset:')) {
            // Use preset
            const preset = voiceValue.replace('preset:', '');
            voiceToUse = findVoiceByPreference(availableVoices, preset);
            if (voiceToUse) {
                preferredVoiceName = voiceToUse.name;
            }
        } else if (voiceValue) {
            // Use specific voice
            voiceToUse = availableVoices.find(function(v) {
                return v.name === voiceValue;
            });
            if (voiceToUse) {
                preferredVoiceName = voiceToUse.name;
            }
        }
        
        // If no voice found, use default selection
        if (!voiceToUse && selectedVoice) {
            voiceToUse = selectedVoice;
        }
        
        if (voiceToUse) {
            utterance.voice = voiceToUse;
            console.log('Using voice:', voiceToUse.name, voiceToUse.lang);
        }
        
        const speed = parseFloat(speedControl.value) || 0.8;
        utterance.rate = speed;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onboundary = function(event) {
            if (event.name === 'word') {
                const charIndex = event.charIndex;
                let bestMatch = -1;
                let minDiff = Infinity;
                
                for (let i = 0; i < wordOffsets.length; i++) {
                    const diff = Math.abs(wordOffsets[i].start - charIndex);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestMatch = i;
                    }
                }
                
                if (bestMatch >= 0 && bestMatch !== lastHighlightedIndex) {
                    lastHighlightedIndex = bestMatch;
                    highlightWord(bestMatch);
                }
            }
        };

        utterance.onstart = function() {
            isReading = true;
            button.style.display = 'none';
            stopButton.style.display = 'inline-block';
            speedControl.disabled = true;
            voiceSelect.disabled = true;
        };

        utterance.onend = function() {
            isReading = false;
            button.style.display = 'inline-block';
            stopButton.style.display = 'none';
            speedControl.disabled = false;
            voiceSelect.disabled = false;
            highlightWord(-1);
            lastHighlightedIndex = -1;
        };

        utterance.onerror = function() {
            isReading = false;
            button.style.display = 'inline-block';
            stopButton.style.display = 'none';
            speedControl.disabled = false;
            voiceSelect.disabled = false;
            highlightWord(-1);
            lastHighlightedIndex = -1;
        };

        window.speechSynthesis.speak(utterance);
    }

    // ==========================================
    // 9. STOP READING
    // ==========================================
    function stopReading(button, stopButton, speedControl, voiceSelect) {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        isReading = false;
        button.style.display = 'inline-block';
        stopButton.style.display = 'none';
        speedControl.disabled = false;
        voiceSelect.disabled = false;
        highlightWord(-1);
        lastHighlightedIndex = -1;
    }

    // ==========================================
    // 10. CREATE UI CONTROLS
    // ==========================================
    function createControls(content) {
        const main = document.querySelector('main');
        if (!main) return null;

        const container = document.createElement('div');
        container.style.margin = '1rem 0 1.5rem 0';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '0.75rem';
        container.style.flexWrap = 'wrap';
        container.style.padding = '0.75rem 1rem';
        container.style.backgroundColor = '#f8f9fa';
        container.style.borderRadius = '8px';
        container.style.border = '1px solid #dee2e6';
        container.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        container.style.width = '100%';
        container.style.boxSizing = 'border-box';

        // Listen Button
        const listenBtn = document.createElement('button');
        listenBtn.textContent = '🔊 Listen';
        listenBtn.style.padding = '0.5rem 1.25rem';
        listenBtn.style.backgroundColor = '#1e6bb8';
        listenBtn.style.color = '#ffffff';
        listenBtn.style.border = 'none';
        listenBtn.style.borderRadius = '4px';
        listenBtn.style.cursor = 'pointer';
        listenBtn.style.fontSize = '1rem';
        listenBtn.style.fontWeight = '600';
        listenBtn.style.transition = 'background-color 0.2s';
        listenBtn.style.whiteSpace = 'nowrap';

        listenBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#155a9e';
        });
        listenBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#1e6bb8';
        });

        // Stop Button
        const stopBtn = document.createElement('button');
        stopBtn.textContent = '⏹ Stop';
        stopBtn.style.padding = '0.5rem 1.25rem';
        stopBtn.style.backgroundColor = '#dc3545';
        stopBtn.style.color = '#ffffff';
        stopBtn.style.border = 'none';
        stopBtn.style.borderRadius = '4px';
        stopBtn.style.cursor = 'pointer';
        stopBtn.style.fontSize = '1rem';
        stopBtn.style.fontWeight = '600';
        stopBtn.style.display = 'none';
        stopBtn.style.transition = 'background-color 0.2s';
        stopBtn.style.whiteSpace = 'nowrap';

        stopBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#b02a37';
        });
        stopBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#dc3545';
        });

        // Speed Label
        const speedLabel = document.createElement('span');
        speedLabel.textContent = 'Speed:';
        speedLabel.style.fontSize = '0.9rem';
        speedLabel.style.color = '#495057';
        speedLabel.style.whiteSpace = 'nowrap';

        // Speed Slider
        const speedControl = document.createElement('input');
        speedControl.type = 'range';
        speedControl.min = '0.5';
        speedControl.max = '1.5';
        speedControl.step = '0.05';
        speedControl.value = '0.8';
        speedControl.style.width = '120px';
        speedControl.style.cursor = 'pointer';
        speedControl.style.accentColor = '#1e6bb8';
        speedControl.style.display = 'inline-block';

        // Speed Display
        const speedDisplay = document.createElement('span');
        speedDisplay.textContent = '0.8x';
        speedDisplay.style.fontSize = '0.85rem';
        speedDisplay.style.color = '#495057';
        speedDisplay.style.minWidth = '40px';
        speedDisplay.style.textAlign = 'center';

        // Voice Selector
        const voiceSelect = document.createElement('select');
        voiceSelect.style.padding = '0.3rem 0.5rem';
        voiceSelect.style.borderRadius = '4px';
        voiceSelect.style.border = '1px solid #ced4da';
        voiceSelect.style.fontSize = '0.85rem';
        voiceSelect.style.backgroundColor = '#ffffff';
        voiceSelect.style.cursor = 'pointer';
        voiceSelect.style.maxWidth = '280px';
        voiceSelect.style.display = 'inline-block';
        voiceSelect.style.minHeight = '2rem';
        
        // Add loading option
        const loadingOption = document.createElement('option');
        loadingOption.value = '';
        loadingOption.textContent = '⏳ Loading voices...';
        voiceSelect.appendChild(loadingOption);

        // Update speed display
        speedControl.addEventListener('input', function() {
            speedDisplay.textContent = parseFloat(this.value).toFixed(2) + 'x';
        });

        // Connect buttons
        listenBtn.addEventListener('click', function() {
            speakText(content, listenBtn, stopBtn, speedControl, speedDisplay, voiceSelect);
        });

        stopBtn.addEventListener('click', function() {
            stopReading(listenBtn, stopBtn, speedControl, voiceSelect);
        });

        // Assemble
        container.appendChild(listenBtn);
        container.appendChild(stopBtn);
        container.appendChild(speedLabel);
        container.appendChild(speedControl);
        container.appendChild(speedDisplay);
        container.appendChild(voiceSelect);

        // Load voices
        loadVoices().then(function(voices) {
            availableVoices = voices;
            
            // Auto-select best voice (try UK first, then US, etc.)
            selectedVoice = findVoiceByPreference(voices, 'uk');
            if (!selectedVoice) {
                selectedVoice = findVoiceByPreference(voices, 'us');
            }
            
            populateVoiceSelector(voiceSelect);
            
            // Select the voice in dropdown
            if (selectedVoice) {
                voiceSelect.value = selectedVoice.name;
                console.log('Selected voice:', selectedVoice.name, selectedVoice.lang);
            } else {
                voiceSelect.value = '';
                console.log('No English voice found, using default');
            }
            
            console.log('Total voices loaded:', voices.length);
        }).catch(function(error) {
            console.error('Error loading voices:', error);
            voiceSelect.innerHTML = '';
            const errorOption = document.createElement('option');
            errorOption.value = '';
            errorOption.textContent = '❌ No voices available';
            voiceSelect.appendChild(errorOption);
        });

        return container;
    }

    // ==========================================
    // 11. INITIALIZE
    // ==========================================
    function initReadAloud() {
        console.log('Read Aloud initializing...');
        
        const content = getContentText();
        if (!content || content.length < 10) {
            console.log('Content too short or not found');
            return;
        }

        const main = document.querySelector('main');
        if (!main) {
            console.log('No <main> element found');
            return;
        }

        const controls = createControls(content);
        if (!controls) {
            console.log('Failed to create controls');
            return;
        }

        const firstHeading = main.querySelector('h1, h2, h3');
        if (firstHeading) {
            firstHeading.parentNode.insertBefore(controls, firstHeading.nextSibling);
        } else {
            main.insertBefore(controls, main.firstChild);
        }
        
        console.log('Read Aloud initialized successfully');
    }

    // ==========================================
    // 12. RUN ON PAGE LOAD
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(initReadAloud, 100);
        });
    } else {
        setTimeout(initReadAloud, 100);
    }

})();
