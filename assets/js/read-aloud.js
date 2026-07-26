// Read Aloud with Word Highlighting using Web Speech API
(function() {
    'use strict';

    let utterance = null;
    let isReading = false;
    let wordOffsets = [];
    let lastHighlightedIndex = -1;

    // ==========================================
    // 1. GET CONTENT FROM PAGE
    // ==========================================
    function getContentText() {
        const main = document.querySelector('main');
        if (!main) return '';
        
        const clone = main.cloneNode(true);
        
        // Remove unwanted sections
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
        // Remove emojis
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
        
        // Remove special symbols
        text = text.replace(/[™®©†‡°§¶•·…′″‽¿¡]/g, '');
        
        // Keep only basic punctuation and letters
        text = text.replace(/[^\w\s.,!?;:'"()\-]/g, ' ');
        
        // Normalize spaces
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
                offset += word.length + 1; // +1 for space
            }
        });
        
        return offsets;
    }

    // ==========================================
    // 4. HIGHLIGHT CURRENT WORD
    // ==========================================
    function highlightWord(index) {
        // Remove all existing highlights
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

        // Walk through text nodes in main content
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
            
            // Check if target word falls within this text node
            if (targetWord.start >= currentOffset && targetWord.start < nextOffset) {
                const startInNode = targetWord.start - currentOffset;
                const endInNode = Math.min(targetWord.end - currentOffset, text.length);
                
                if (startInNode < text.length && endInNode > startInNode) {
                    const parent = node.parentNode;
                    
                    // Split text into three parts: before, word, after
                    const before = document.createTextNode(text.substring(0, startInNode));
                    const wordNode = document.createTextNode(text.substring(startInNode, endInNode));
                    const after = document.createTextNode(text.substring(endInNode));
                    
                    // Create highlighted span
                    const span = document.createElement('span');
                    span.className = 'read-aloud-highlight';
                    span.style.backgroundColor = '#ffeb3b';
                    span.style.color = '#000';
                    span.style.padding = '0 2px';
                    span.style.borderRadius = '2px';
                    span.style.boxShadow = '0 0 0 2px #f57c00';
                    span.style.transition = 'background-color 0.1s';
                    span.appendChild(wordNode);
                    
                    // Insert before removing original node
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
    // 5. SPEAK TEXT
    // ==========================================
    function speakText(text, button, stopButton, speedControl, speedDisplay) {
        // Check browser support
        if (!window.speechSynthesis) {
            alert('Your browser does not support speech synthesis. Please try Chrome, Edge, or Safari.');
            return;
        }

        // Cancel any ongoing speech
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        // Clean the text
        text = cleanText(text);
        
        // Get word positions
        wordOffsets = getWordOffsets(text);
        lastHighlightedIndex = -1;

        // Create utterance
        utterance = new SpeechSynthesisUtterance(text);
        
        // Set speed from slider
        const speed = parseFloat(speedControl.value) || 0.8;
        utterance.rate = speed;
        utterance.pitch = 1;
        utterance.volume = 1;

        // Handle word boundary events
        utterance.onboundary = function(event) {
            if (event.name === 'word') {
                const charIndex = event.charIndex;
                
                // Find the closest word match
                let bestMatch = -1;
                let minDiff = Infinity;
                
                for (let i = 0; i < wordOffsets.length; i++) {
                    const diff = Math.abs(wordOffsets[i].start - charIndex);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestMatch = i;
                    }
                }
                
                // Only update if different from last highlight
                if (bestMatch >= 0 && bestMatch !== lastHighlightedIndex) {
                    lastHighlightedIndex = bestMatch;
                    highlightWord(bestMatch);
                }
            }
        };

        // Handle start event
        utterance.onstart = function() {
            isReading = true;
            button.style.display = 'none';
            stopButton.style.display = 'inline-block';
            speedControl.disabled = true;
        };

        // Handle end event
        utterance.onend = function() {
            isReading = false;
            button.style.display = 'inline-block';
            stopButton.style.display = 'none';
            speedControl.disabled = false;
            highlightWord(-1);
            lastHighlightedIndex = -1;
        };

        // Handle error event
        utterance.onerror = function() {
            isReading = false;
            button.style.display = 'inline-block';
            stopButton.style.display = 'none';
            speedControl.disabled = false;
            highlightWord(-1);
            lastHighlightedIndex = -1;
        };

        // Start speaking
        window.speechSynthesis.speak(utterance);
    }

    // ==========================================
    // 6. STOP READING
    // ==========================================
    function stopReading(button, stopButton, speedControl) {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        isReading = false;
        button.style.display = 'inline-block';
        stopButton.style.display = 'none';
        speedControl.disabled = false;
        highlightWord(-1);
        lastHighlightedIndex = -1;
    }

    // ==========================================
    // 7. CREATE UI CONTROLS
    // ==========================================
    function createControls(content) {
        const main = document.querySelector('main');
        if (!main) return null;

        // Container
        const container = document.createElement('div');
        container.style.margin = '1rem 0 1.5rem 0';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '0.5rem';
        container.style.flexWrap = 'wrap';
        container.style.padding = '0.75rem 1rem';
        container.style.backgroundColor = '#f8f9fa';
        container.style.borderRadius = '8px';
        container.style.border = '1px solid #dee2e6';
        container.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';

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
        speedLabel.style.marginLeft = '0.5rem';

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

        // Speed Display
        const speedDisplay = document.createElement('span');
        speedDisplay.textContent = '0.8x';
        speedDisplay.style.fontSize = '0.85rem';
        speedDisplay.style.color = '#495057';
        speedDisplay.style.minWidth = '40px';
        speedDisplay.style.textAlign = 'center';

        // Update speed display when slider changes
        speedControl.addEventListener('input', function() {
            speedDisplay.textContent = parseFloat(this.value).toFixed(2) + 'x';
        });

        // Connect buttons to functionality
        listenBtn.addEventListener('click', function() {
            speakText(content, listenBtn, stopBtn, speedControl, speedDisplay);
        });

        stopBtn.addEventListener('click', function() {
            stopReading(listenBtn, stopBtn, speedControl);
        });

        // Assemble all controls
        container.appendChild(listenBtn);
        container.appendChild(stopBtn);
        container.appendChild(speedLabel);
        container.appendChild(speedControl);
        container.appendChild(speedDisplay);

        return container;
    }

    // ==========================================
    // 8. INITIALIZE
    // ==========================================
    function initReadAloud() {
        // Get content
        const content = getContentText();
        
        // Check if content is valid
        if (!content || content.length < 10) {
            return;
        }

        // Find main element
        const main = document.querySelector('main');
        if (!main) {
            return;
        }

        // Create controls
        const controls = createControls(content);
        if (!controls) {
            return;
        }

        // Insert controls after first heading or at top of main
        const firstHeading = main.querySelector('h1, h2, h3');
        if (firstHeading) {
            firstHeading.parentNode.insertBefore(controls, firstHeading.nextSibling);
        } else {
            main.insertBefore(controls, main.firstChild);
        }
    }

    // ==========================================
    // 9. RUN ON PAGE LOAD
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReadAloud);
    } else {
        // DOM already loaded
        initReadAloud();
    }

})();
