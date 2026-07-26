// Read Aloud with Timed Highlighting (Improved)
(function() {
    'use strict';

    let isReading = false;
    let highlightTimer = null;
    let words = [];
    let currentWordIndex = 0;
    const SPEECH_RATE = 0.9; // Matches the utterance rate
    const AVG_WORD_DURATION = 180; // Milliseconds per word (adjust as needed)

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
        // Remove all existing highlights
        clearHighlights();

        if (index < 0 || index >= words.length) return;

        const targetWord = words[index];
        if (!targetWord) return;

        // Find the text node containing this word
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

        highlightWord(index);
        currentWordIndex = index;

        // Calculate timing based on speech rate
        const wordDuration = AVG_WORD_DURATION / SPEECH_RATE;

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

    function speakText(text, button) {
        if (!window.speechSynthesis) {
            alert('Your browser does not support speech synthesis. Please try Chrome, Edge, or Safari.');
            return;
        }

        if (isReading) {
            window.speechSynthesis.cancel();
            stopHighlighting();
            isReading = false;
            button.textContent = '🔊 Listen';
            return;
        }

        // Cancel any ongoing speech
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }

        words = getWords(text);
        currentWordIndex = 0;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = SPEECH_RATE;
        utterance.pitch = 1;
        utterance.volume = 1;

        // Use onboundary as a backup, but timer handles the main highlighting
        utterance.onboundary = function(event) {
            if (event.name === 'word') {
                // Optional: Use this to correct the timer if it drifts
                // We keep it for compatibility
            }
        };

        utterance.onstart = function() {
            isReading = true;
            button.textContent = '⏹ Stop';
            startHighlighting();
        };

        utterance.onend = function() {
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

    function initReadAloud() {
        const content = getContentText();
        if (!content || content.length < 20) {
            console.warn('Read Aloud: Content too short');
            return;
        }

        const main = document.querySelector('main');
        if (!main) return;

        const container = document.createElement('div');
        container.style.margin = '1rem 0 1.5rem 0';

        const btn = document.createElement('button');
        btn.textContent = '🔊 Listen';
        btn.style.padding = '0.5rem 1rem';
        btn.style.backgroundColor = '#1e6bb8';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '1rem';
        btn.style.fontWeight = '600';

        btn.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#0d3b66';
        });
        btn.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#1e6bb8';
        });

        btn.addEventListener('click', function() {
            speakText(content, btn);
        });

        container.appendChild(btn);

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
