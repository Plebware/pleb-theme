console.log('🔊 Read Aloud: Script loaded');

(function() {
    'use strict';
    console.log('🔊 Read Aloud: IIFE started');

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
        excludeSelectors.forEach(selector => {
            const elements = clone.querySelectorAll(selector);
            elements.forEach(el => el.remove());
        });
        let text = clone.textContent || '';
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    function initReadAloud() {
        console.log('🔊 Read Aloud: initReadAloud called');
        const content = getContentText();
        console.log('🔊 Read Aloud: Content length:', content.length);
        if (!content || content.length < 10) {
            console.warn('⚠️ Read Aloud: No content found or content too short');
            return;
        }
        const main = document.querySelector('main');
        if (!main) {
            console.warn('⚠️ Read Aloud: No <main> tag found');
            return;
        }
        console.log('✅ Read Aloud: Main tag found, creating button...');
        const container = document.createElement('div');
        container.style.margin = '1rem 0 1.5rem 0';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '0.5rem';
        container.style.flexWrap = 'wrap';
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
        listenBtn.onmouseover = function() {
            this.style.backgroundColor = 'var(--link-hover, #0d3b66)';
        };
        listenBtn.onmouseout = function() {
            this.style.backgroundColor = 'var(--brand, #1e6bb8)';
        };
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
        stopBtn.onmouseover = function() {
            this.style.backgroundColor = '#b02a37';
        };
        stopBtn.onmouseout = function() {
            this.style.backgroundColor = '#dc3545';
        };
        listenBtn.addEventListener('click', function() {
            alert('Listen button clicked!');
        });
        stopBtn.addEventListener('click', function() {
            this.style.display = 'none';
            listenBtn.style.display = 'inline-block';
        });
        container.appendChild(listenBtn);
        container.appendChild(stopBtn);
        const firstHeading = main.querySelector('h1, h2');
        if (firstHeading) {
            firstHeading.parentNode.insertBefore(container, firstHeading.nextSibling);
        } else {
            main.insertBefore(container, main.firstChild);
        }
        console.log('✅ Read Aloud: Button added successfully');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initReadAloud);
    } else {
        initReadAloud();
    }
})();
