// PlebVox paragraph highlighting overlay.
// Highlights the paragraph (or list item / heading) currently being spoken.
// Uses native speech boundary events when available, with an adaptive timing
// predictor so paragraph changes do not wait for a late Android boundary event.
(function () {
    'use strict';

    const HIGHLIGHT_CLASS = 'plebvox-paragraph-highlight';
    const WORD_HIGHLIGHT_NAME = 'plebvox-current-word';
    const DEFAULT_MS_PER_CHAR_AT_RATE_07 = 115;
    const MIN_PREDICT_DELAY = 120;
    const MAX_PREDICT_DELAY = 1800;
    const PREDICTOR_SMOOTHING = 0.35;

    let originalSpeak = null;
    let activeTimer = null;
    let activeParagraph = null;
    let activeUtterance = null;
    let activeSection = null;
    let boundarySeen = false;
    let fallbackIndex = 0;
    let lastBoundaryIndex = 0;
    let lastBoundaryTime = 0;
    let msPerChar = DEFAULT_MS_PER_CHAR_AT_RATE_07;
    let utteranceStartedAt = 0;

    function clean(text) {
        let value = (text || '').replace(/\s+/g, ' ');
        try {
            value = value.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, '');
        } catch (e) {}
        return value.trim();
    }

    function isWordChar(ch) {
        if (!ch) return false;
        try { return /[\p{L}\p{N}\p{M}_]/u.test(ch); }
        catch (e) { return /[A-Za-z0-9_]/.test(ch); }
    }

    function wordStarts(text) {
        const result = [];
        let inWord = false;
        for (let i = 0; i < text.length; i++) {
            const word = isWordChar(text[i]);
            if (word && !inWord) result.push(i);
            inWord = word;
        }
        return result;
    }

    function clearPredictionTimer() {
        if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = null;
        }
    }

    function clearParagraphHighlight() {
        clearPredictionTimer();
        document.querySelectorAll('.' + HIGHLIGHT_CLASS).forEach(function (el) {
            el.classList.remove(HIGHLIGHT_CLASS);
        });
        activeParagraph = null;
        activeSection = null;
        if (window.CSS && CSS.highlights) {
            try { CSS.highlights.delete(WORD_HIGHLIGHT_NAME); } catch (e) {}
        }
    }

    function paragraphsInSection(start, end) {
        const result = [];
        let node = start ? start.nextSibling : null;
        while (node && node !== end) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const candidates = node.matches('p, li, blockquote, h1, h2, h3, h4, h5, h6')
                    ? [node]
                    : Array.from(node.querySelectorAll('p, li, blockquote, h1, h2, h3, h4, h5, h6'));
                candidates.forEach(function (el) {
                    if (!el.closest('.plebvox-control') && clean(el.textContent)) result.push(el);
                });
            }
            node = node.nextSibling;
        }
        return result;
    }

    function sections() {
        const main = document.querySelector('main');
        if (!main) return [];
        const walker = document.createTreeWalker(main, NodeFilter.SHOW_COMMENT);
        const markers = [];
        let n = walker.nextNode();
        while (n) {
            const t = (n.textContent || '').trim();
            if (t === 'PLEBVOX:START' || t === 'PLEBVOX:END') markers.push({ node: n, type: t });
            n = walker.nextNode();
        }
        const result = [];
        let start = null;
        markers.forEach(function (m) {
            if (m.type === 'PLEBVOX:START') {
                start = m.node;
                return;
            }
            if (m.type === 'PLEBVOX:END' && start) {
                const paragraphs = paragraphsInSection(start, m.node);
                if (paragraphs.length) {
                    let text = '';
                    const mapping = [];
                    paragraphs.forEach(function (p) {
                        const value = clean(p.textContent);
                        if (!value) return;
                        if (text) text += ' ';
                        const begin = text.length;
                        text += value;
                        mapping.push({ element: p, start: begin, end: text.length });
                    });
                    result.push({ text: text, mapping: mapping });
                }
                start = null;
            }
        });
        return result;
    }

    function findParagraph(index, section) {
        if (!section) return null;
        for (let i = 0; i < section.mapping.length; i++) {
            const item = section.mapping[i];
            if (index >= item.start && index < item.end) return item.element;
        }
        // A boundary can land exactly on the separating space between speech units.
        // Treat that space as belonging to the following unit, so the visual change
        // happens immediately rather than waiting for the next word boundary.
        for (let i = 0; i < section.mapping.length - 1; i++) {
            if (index >= section.mapping[i].end && index < section.mapping[i + 1].start) {
                return section.mapping[i + 1].element;
            }
        }
        return null;
    }

    function paragraphForIndex(index) {
        return findParagraph(index, activeSection);
    }

    function highlightForIndex(index) {
        const paragraph = paragraphForIndex(index);
        if (!paragraph || paragraph === activeParagraph) return false;
        if (activeParagraph) activeParagraph.classList.remove(HIGHLIGHT_CLASS);
        activeParagraph = paragraph;
        activeParagraph.classList.add(HIGHLIGHT_CLASS);
        return true;
    }

    function findSectionForUtterance(utterance, sectionList) {
        const speech = clean(utterance && utterance.text);
        if (!speech) return null;
        for (let i = 0; i < sectionList.length; i++) {
            if (sectionList[i].text === speech || speech.indexOf(sectionList[i].text) === 0) return sectionList[i];
        }
        return null;
    }

    function rateAdjustedMsPerChar() {
        // PlebVox's normal rate is 0.7. Keep the predictor proportional to
        // speech rate while avoiding extreme values from unusual browser settings.
        const rate = Math.max(0.5, Math.min(2.0, window.plebvoxSpeechRate || 0.7));
        return DEFAULT_MS_PER_CHAR_AT_RATE_07 * (0.7 / rate);
    }

    function scheduleNextParagraphBoundary() {
        clearPredictionTimer();
        if (!activeUtterance || !activeSection || !activeParagraph) return;

        const current = activeParagraph;
        const item = activeSection.mapping.find(function (entry) {
            return entry.element === current;
        });
        if (!item) return;

        const nextItem = activeSection.mapping[activeSection.mapping.indexOf(item) + 1];
        if (!nextItem) return;

        const currentSpeechIndex = Math.max(item.start, Math.min(item.end, lastBoundaryIndex));
        const remainingChars = Math.max(1, item.end - currentSpeechIndex);
        const delay = Math.max(
            MIN_PREDICT_DELAY,
            Math.min(MAX_PREDICT_DELAY, Math.round(remainingChars * msPerChar))
        );

        activeTimer = setTimeout(function () {
            if (!activeUtterance || !activeSection || activeParagraph !== current) return;

            // Move at the predicted paragraph boundary. A later native boundary
            // can correct the position, but only if it is not stale. See the
            // monotonic guard in the boundary handler below.
            highlightForIndex(nextItem.start);
            lastBoundaryIndex = Math.max(lastBoundaryIndex, nextItem.start);
            scheduleNextParagraphBoundary();
        }, delay);
    }

    function updateTimingModel(charIndex) {
        const now = performance.now();
        if (lastBoundaryTime && charIndex > lastBoundaryIndex) {
            const chars = charIndex - lastBoundaryIndex;
            const elapsed = now - lastBoundaryTime;
            if (elapsed > 40 && elapsed < 5000) {
                const observed = elapsed / chars;
                if (observed >= 20 && observed <= 500) {
                    msPerChar = (msPerChar * (1 - PREDICTOR_SMOOTHING)) +
                        (observed * PREDICTOR_SMOOTHING);
                }
            }
        }
        lastBoundaryIndex = Math.max(lastBoundaryIndex, charIndex);
        lastBoundaryTime = now;
    }

    function startFallback(utterance) {
        if (boundarySeen || !utterance || !activeSection) return;
        const starts = wordStarts(activeSection.text);
        if (!starts.length) return;
        fallbackIndex = 0;
        highlightForIndex(starts[0]);

        function tick() {
            if (boundarySeen || activeUtterance !== utterance || !activeSection) return;
            if (fallbackIndex >= starts.length) return;
            const index = starts[fallbackIndex++];
            if (index >= lastBoundaryIndex) {
                highlightForIndex(index);
                lastBoundaryIndex = index;
            }
            const next = fallbackIndex < starts.length ? starts[fallbackIndex] : activeSection.text.length;
            const distance = Math.max(1, next - index);
            const delay = Math.max(
                MIN_PREDICT_DELAY,
                Math.min(MAX_PREDICT_DELAY, Math.round(distance * msPerChar))
            );
            activeTimer = setTimeout(tick, delay);
        }
        activeTimer = setTimeout(tick, MIN_PREDICT_DELAY);
    }

    function installStyle() {
        if (document.getElementById('plebvox-paragraph-highlight-style')) return;
        const style = document.createElement('style');
        style.id = 'plebvox-paragraph-highlight-style';
        style.textContent =
            '::highlight(' + WORD_HIGHLIGHT_NAME + '){background:transparent!important;color:inherit!important;text-shadow:none!important}' +
            '.plebvox-highlight{background:transparent!important;color:inherit!important;padding:0!important;border-radius:0!important;box-shadow:none!important}' +
            '.' + HIGHLIGHT_CLASS + '{background:#ffeb3b!important;color:#000!important;text-shadow:none!important;border-radius:3px;padding-left:3px;padding-right:3px;}';
        document.head.appendChild(style);
    }

    function attach(utterance) {
        activeUtterance = utterance;
        boundarySeen = false;
        clearParagraphHighlight();
        activeUtterance = utterance;
        const sectionList = sections();
        activeSection = findSectionForUtterance(utterance, sectionList);
        msPerChar = rateAdjustedMsPerChar();
        lastBoundaryIndex = 0;
        lastBoundaryTime = 0;
        utteranceStartedAt = 0;

        utterance.addEventListener('start', function () {
            boundarySeen = false;
            clearParagraphHighlight();
            activeUtterance = utterance;
            activeSection = findSectionForUtterance(utterance, sections());
            msPerChar = rateAdjustedMsPerChar();
            lastBoundaryIndex = 0;
            lastBoundaryTime = performance.now();
            utteranceStartedAt = lastBoundaryTime;
            if (activeSection && activeSection.mapping.length) {
                highlightForIndex(activeSection.mapping[0].start);
                scheduleNextParagraphBoundary();
            }
            setTimeout(function () {
                if (!boundarySeen && activeUtterance === utterance) startFallback(utterance);
            }, 700);
        });

        utterance.addEventListener('boundary', function (event) {
            if (typeof event.charIndex !== 'number' || event.charIndex < 0) return;

            // Android speech engines can deliver a boundary event after the
            // paragraph predictor has already moved the highlight forward.
            // Never let a late event move the highlight backwards again. The
            // browser's charIndex is the character position being spoken, but
            // the event itself is not guaranteed to arrive at that exact moment.
            if (event.charIndex < lastBoundaryIndex) return;

            boundarySeen = true;
            updateTimingModel(event.charIndex);
            highlightForIndex(event.charIndex);
            // Re-anchor only on a boundary that is at or ahead of our current
            // predicted position.
            scheduleNextParagraphBoundary();
        });

        utterance.addEventListener('end', function () {
            if (activeUtterance === utterance) {
                clearParagraphHighlight();
                activeUtterance = null;
            }
        });

        utterance.addEventListener('error', function () {
            if (activeUtterance === utterance) {
                clearParagraphHighlight();
                activeUtterance = null;
            }
        });
    }

    function install() {
        installStyle();
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance || originalSpeak) return;
        originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = function (utterance) {
            attach(utterance);
            return originalSpeak(utterance);
        };
        console.log('PlebVox adaptive paragraph highlighting enabled');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
