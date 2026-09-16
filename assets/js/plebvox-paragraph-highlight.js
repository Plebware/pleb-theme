// PlebVox paragraph highlighting overlay.
// Keeps the existing speech engine but replaces word-by-word visual highlighting
// with a single highlighted paragraph at a time.
(function () {
    'use strict';

    const HIGHLIGHT_CLASS = 'plebvox-paragraph-highlight';
    const WORD_HIGHLIGHT_NAME = 'plebvox-current-word';
    let originalSpeak = null;
    let activeTimer = null;
    let activeParagraph = null;
    let activeUtterance = null;
    let activeSection = null;
    let boundarySeen = false;
    let fallbackIndex = 0;

    function clean(text) {
        let value = (text || '').replace(/\s+/g, ' ');
        try { value = value.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\u200D]/gu, ''); } catch (e) {}
        return value.trim();
    }

    function isWordChar(ch) {
        if (!ch) return false;
        try { return /[\p{L}\p{N}\p{M}_]/u.test(ch); } catch (e) { return /[A-Za-z0-9_]/.test(ch); }
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

    function clearParagraphHighlight() {
        if (activeTimer) {
            clearTimeout(activeTimer);
            activeTimer = null;
        }
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
            if (m.type === 'PLEBVOX:START') start = m.node;
            else if (m.type === 'PLEBVOX:END' && start) {
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
        return null;
    }

    function highlightForIndex(index) {
        const paragraph = findParagraph(index, activeSection);
        if (!paragraph || paragraph === activeParagraph) return;
        if (activeParagraph) activeParagraph.classList.remove(HIGHLIGHT_CLASS);
        activeParagraph = paragraph;
        activeParagraph.classList.add(HIGHLIGHT_CLASS);
    }

    function findSectionForUtterance(utterance, sectionList) {
        const speech = clean(utterance && utterance.text);
        if (!speech) return null;
        for (let i = 0; i < sectionList.length; i++) {
            if (sectionList[i].text === speech || speech.indexOf(sectionList[i].text) === 0) return sectionList[i];
        }
        return null;
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
            highlightForIndex(starts[fallbackIndex++]);
            const next = fallbackIndex < starts.length ? starts[fallbackIndex] : activeSection.text.length;
            const distance = Math.max(1, next - starts[Math.max(0, fallbackIndex - 1)]);
            const delay = Math.max(180, Math.min(950, Math.round(distance * 115 / 0.7 + 110)));
            activeTimer = setTimeout(tick, delay);
        }
        activeTimer = setTimeout(tick, 180);
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

        utterance.addEventListener('start', function () {
            boundarySeen = false;
            clearParagraphHighlight();
            activeUtterance = utterance;
            activeSection = findSectionForUtterance(utterance, sections());
            if (activeSection && activeSection.mapping.length) highlightForIndex(activeSection.mapping[0].start);
            setTimeout(function () {
                if (!boundarySeen && activeUtterance === utterance) startFallback(utterance);
            }, 900);
        });
        utterance.addEventListener('boundary', function (event) {
            if (typeof event.charIndex !== 'number' || event.charIndex < 0) return;
            boundarySeen = true;
            if (activeTimer) clearTimeout(activeTimer);
            highlightForIndex(event.charIndex);
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
        console.log('PlebVox paragraph highlighting enabled');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
