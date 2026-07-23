// Read Aloud with Word Highlighting using Web Speech API
(function() {
    'use strict';

    let utterance = null;
    let isReading = false;
    let currentWordIndex = 0;
    let wordOffsets = [];
    let textNodes = [];
    let originalText = '';

    // Get the main content of the page (exclude comments, footers, etc.)
    function getContentText() {
        const main = document.querySelector('main');
        if (!main) return '';
        
        // Clone the main content to avoid modifying the live DOM
        const clone = main.cloneNode(true);
        
        // Remove elements we don't want to read (comments, footers, etc.)
        const excludeSelectors = [
            '#comments-section',
            '.post-navigation',
            'footer',
            '.excerpt'
        ];
        excludeSelectors.forEach(selector => {
            const elements = clone.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });
        
        // Get text content and clean it up
        let text = clone.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    // Split text into words with their start positions
    function getWordOffsets(text) {
        const words = text.split(/\s+/);
        let offset = 0;
        const offsets = [];
        words.forEach(word => {
            offsets.push({ word, start: offset, end: offset + word.length });
            offset += word.length + 1; // +1 for space
        });
        return offsets;
    }

    // Highlight the current word
    function highlightWord(index) {
        // Remove all existing highlights
        document.querySelectorAll('.read-aloud-highlight').forEach(el => {
            const textNode = el.firstChild;
            const parent = el.parentNode;
            parent.replaceChild(textNode, el);
            parent.normalize();
        });

        if (index < 0 || index >= wordOffsets.length) return;

        const targetWord = wordOffsets[index];
        if (!targetWord) return;

        // Find the text node containing this word
        const walker = document.createTreeWalker(
            document.querySelector('main'),
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip nodes inside excluded elements
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

        let currentOffset = 0;
        let node = walker.nextNode();
        while (node) {
            const text = node.textContent;
            const nextOffset = currentOffset + text.length;
            
            // Check if the target word is in this text node
            if (targetWord.start >= currentOffset && targetWord.start < nextOffset) {
                const startInNode = targetWord.start - currentOffset;
                const endInNode = targetWord.end - currentOffset;
                
                // Split the text node and wrap the target word
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
                span.style.transition = 'background-color 0.3s';
                span.appendChild(wordNode);
                
                parent.insertBefore(before, node);
                parent.insertBefore(span, node);
                parent.insertBefore(after, node);
                parent.removeChild(node);
                break;
            }
            
            currentOffset = nextOffset;
            node = walker.nextNode();
        }
    }

    // Speak the text
    function speakText(text, button, stopButton) {
        if (!window.speechSynthesis) {
            alert('Your browser does not support speech synthesis. Please try Chrome, Edge, or Safari.');
            return;
        }

        // Cancel any ongoing speech
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        // Get word offsets for highlighting
        wordOffsets = getWordOffsets(text);
        currentWordIndex = 0;

        // Create utterance
        utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        // Handle word boundaries for highlighting
        utterance.onboundary = function(event) {
            if (event.name === 'word') {
                // Find the word index based on character position
                const charIndex = event.charIndex;
                for (let i = 0; i < wordOffsets.length; i++) {
                    if (wordOffsets[i].start <= charIndex && wordOffsets[i].end >= charIndex) {
                        currentWordIndex = i;
                        highlightWord(i);
                        break;
                    }
                }
            }
        };

        utterance.onstart = function() {
            isReading = true;
            button.style.display = 'none';
            stopButton.style.display = 'inline-block';
        };

        utterance.onend = function() {
            isReading = false;
            button.style.display = 'inline-block';
            stopButton.style.display = 'none';
            // Remove highlights
            highlightWord(-1);
        };

        utterance.onerror = function(event) {
            console.error('Speech error:', event);
            isReading = false;
            button.style.display = 'inline-block';
            stopButton.style.display = 'none';
            highlightWord(-1);
        };

        // Speak
        window.speechSynthesis.speak(utterance);
    }

    // Stop reading
    function stopReading(button, stopButton) {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        isReading = false;
        button.style.display = 'inline-block';
        stopButton.style.display = 'none';
        highlightWord(-1);
    }

    // Initialize the read-aloud button
    function initReadAloud() {
        const content = getContentText();
        if (!content || content.length < 10) return;

        // Find the main heading or article header
        const main = document.querySelector('main');
        if (!main) return;

        // Create button container
        const container = document.createElement('div');
        container.style.margin = '1rem 0 1.5rem 0';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '0.5rem';
        container.style.flexWrap = 'wrap';

        // Create Listen button
        const listenBtn = document.createElement('button');
        listenBtn.textContent = '🔊 Listen';
        listenBtn.style.padding = '0.5rem 1rem';
        listenBtn.style.backgroundColor = 'var(--brand, #1e6bb8)';
        listenBtn.style.color = '#fff';
        listenBtn.style.border = 'none';
        listenBtn.style.borderRadius = '4px';
        listenBtn.style.cursor = 'pointer';
        listenBtn.style.fontSize = '1rem';
        listenBtn.style.fontWeight = '600';
        listenBtn.style.transition = 'background-color 0.2s';

        listenBtn.onmouseover = function() {
            this.style.backgroundColor = 'var(--link-hover, #0d3b66)';
        };
        listenBtn.onmouseout = function() {
            this.style.backgroundColor = 'var(--brand, #1e6bb8)';
        };

        // Create Stop button (hidden initially)
        const stopBtn = document.createElement('button');
        stopBtn.textContent = '⏹ Stop';
        stopBtn.style.padding = '0.5rem 1rem';
        stopBtn.style.backgroundColor = '#dc3545';
        stopBtn.style.color = '#fff';
        stopBtn.style.border = 'none';
        stopBtn.style.borderRadius = '4px';
        stopBtn.style.cursor = 'pointer';
        stopBtn.style.fontSize = '1rem';
        stopBtn.style.fontWeight = '600';
        stopBtn.style.display = 'none';
        stopBtn.style.transition = 'background-color 0.2s';

        stopBtn.onmouseover = function() {
            this.style.backgroundColor = '#b02a37';
        };
        stopBtn.onmouseout = function() {
            this.style.backgroundColor = '#dc3545';
        };

        // Add event listeners
        listenBtn.addEventListener('click', function() {
            speakText(content, listenBtn, stopBtn);
        });

        stopBtn.addEventListener('click', function() {
            stopReading(listenBtn, stopBtn);
        });

        // Append buttons
        container.appendChild(listenBtn);
        container.appendChild(stopBtn);

        // Insert at the top of main content (after the first heading)
        const firstHeading = main.querySelector('h1, h2');
        if (firstHeading) {
            firstHeading.parentNode.insertBefore(container, firstHeading.nextSibling);
        } else {
            main.insertBefore(container, main.firstChild);
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReadAloud);
    } else {
        initReadAloud();
    }

})();
