// Read Aloud with Word Highlighting using Web Speech API
(function() {
    'use strict';

    let utterance = null;
    let isReading = false;
    let wordOffsets = [];

    // Get the main content of the page
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
            elements.forEach(function(el) { el.remove(); });
        });
        
        let text = clone.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    // Split text into words with positions
    function getWordOffsets(text) {
        const words = text.split(/\s+/);
        let offset = 0;
        const offsets = [];
        words.forEach(function(word) {
            offsets.push({ word: word, start: offset, end: offset + word.length });
            offset += word.length + 1;
        });
        return offsets;
    }

    // Highlight current word
    function highlightWord(index) {
        document.querySelectorAll('.read-aloud-highlight').forEach(function(el) {
            const textNode = el.firstChild;
            const parent = el.parentNode;
            parent.replaceChild(textNode, el);
            parent.normalize();
        });

        if (index < 0 || index >= wordOffsets.length) return;

        const targetWord = wordOffsets[index];
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

        let currentOffset = 0;
        let node = walker.nextNode();
        while (node) {
            const text = node.textContent;
            const nextOffset = currentOffset + text.length;
            
            if (targetWord.start >= currentOffset && targetWord.start < nextOffset) {
                const startInNode = targetWord.start - currentOffset;
                const endInNode = targetWord.end - currentOffset;
                
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

    // Speak text
    function speakText(text, button, stopButton) {
        if (!window.speechSynthesis) {
            alert('Your browser does not support speech synthesis. Please try Chrome, Edge, or Safari.');
            return;
        }

        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        wordOffsets = getWordOffsets(text);

        utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;

        utterance.onboundary = function(event) {
            if (event.name === 'word') {
                const charIndex = event.charIndex;
                for (var i = 0; i < wordOffsets.length; i++) {
                    if (wordOffsets[i].start <= charIndex && wordOffsets[i].end >= charIndex) {
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
            highlightWord(-1);
        };

        utterance.onerror = function() {
            isReading = false;
            button.style.display = 'inline-block';
            stopButton.style.display = 'none';
            highlightWord(-1);
        };

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

    // Initialize
    function initReadAloud() {
        const content = getContentText();
        if (!content || content.length < 10) return;

        const main = document.querySelector('main');
        if (!main) return;

        const container = document.createElement('div');
        container.style.margin = '1rem 0 1.5rem 0';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '0.5rem';
        container.style.flexWrap = 'wrap';

        const listenBtn = document.createElement('button');
        listenBtn.textContent = '🔊 Listen';
        listenBtn.style.padding = '0.5rem 1rem';
        listenBtn.style.backgroundColor = '#1e6bb8';
        listenBtn.style.color = '#fff';
        listenBtn.style.border = 'none';
        listenBtn.style.borderRadius = '4px';
        listenBtn.style.cursor = 'pointer';
        listenBtn.style.fontSize = '1rem';
        listenBtn.style.fontWeight = '600';

        listenBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#0d3b66';
        });
        listenBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#1e6bb8';
        });

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

        stopBtn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#b02a37';
        });
        stopBtn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#dc3545';
        });

        listenBtn.addEventListener('click', function() {
            speakText(content, listenBtn, stopBtn);
        });

        stopBtn.addEventListener('click', function() {
            stopReading(listenBtn, stopBtn);
        });

        container.appendChild(listenBtn);
        container.appendChild(stopBtn);

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
