// assets/js/code-copy.js

(function() {
    'use strict';

    // Function to create and add a copy button to each code block
    function addCopyButtons() {
        // Select all <pre> elements that contain <code> (common markdown output)
        const codeBlocks = document.querySelectorAll('pre:has(code)');

        codeBlocks.forEach((preElement) => {
            // Check if button already exists to avoid duplicates
            if (preElement.querySelector('.copy-code-btn')) {
                return;
            }

            // Create the copy button
            const button = document.createElement('button');
            button.className = 'copy-code-btn';
            button.setAttribute('aria-label', 'Copy code to clipboard');
            button.innerHTML = '📋 Copy';

            // Position the button absolutely within the pre element
            preElement.style.position = 'relative';
            preElement.appendChild(button);

            // Add click event listener
            button.addEventListener('click', handleCopyClick);
        });
    }

    // Handle the copy action
    function handleCopyClick(event) {
        const button = event.currentTarget;
        // Find the parent <pre> element and get the text from its <code> child
        const preElement = button.closest('pre');
        const codeElement = preElement.querySelector('code');
        
        if (!codeElement) return;

        // Get the text to copy. Using innerText preserves formatting.
        const textToCopy = codeElement.innerText;

        // Use the Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    // Success feedback
                    button.innerHTML = '✅ Copied!';
                    button.classList.add('copied');
                    setTimeout(() => {
                        button.innerHTML = '📋 Copy';
                        button.classList.remove('copied');
                    }, 2000);
                })
                .catch(err => {
                    console.error('Failed to copy: ', err);
                    button.innerHTML = '❌ Error';
                    setTimeout(() => {
                        button.innerHTML = '📋 Copy';
                    }, 2000);
                });
        } else {
            // Fallback for older browsers
            fallbackCopyText(textToCopy, button);
        }
    }

    // Fallback copy method using a temporary textarea
    function fallbackCopyText(text, button) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                button.innerHTML = '✅ Copied!';
                setTimeout(() => {
                    button.innerHTML = '📋 Copy';
                }, 2000);
            } else {
                button.innerHTML = '❌ Error';
                setTimeout(() => {
                    button.innerHTML = '📋 Copy';
                }, 2000);
            }
        } catch (err) {
            console.error('Fallback copy failed: ', err);
            button.innerHTML = '❌ Error';
            setTimeout(() => {
                button.innerHTML = '📋 Copy';
            }, 2000);
        }
        document.body.removeChild(textarea);
    }

    // Run when the DOM is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addCopyButtons);
    } else {
        // DOM is already ready
        addCopyButtons();
    }
})();
