// ============================================
// SIMPLE CODE COPY - Works everywhere
// ============================================

(function() {
    'use strict';
    
    // Wait for the page to fully load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initCopyButtons);
    } else {
        initCopyButtons();
    }
    
    function initCopyButtons() {
        console.log('🔍 Looking for code blocks...');
        
        // Find ALL pre elements
        const allPres = document.querySelectorAll('pre');
        console.log(`📦 Found ${allPres.length} pre elements`);
        
        allPres.forEach((preElement, index) => {
            // Check if this pre contains a code element
            const codeElement = preElement.querySelector('code');
            if (!codeElement) {
                console.log(`⏭️ Pre #${index} has no code element, skipping`);
                return;
            }
            
            // Skip if already has a copy button
            if (preElement.querySelector('.copy-btn')) {
                console.log(`⏭️ Pre #${index} already has a copy button`);
                return;
            }
            
            console.log(`✅ Adding copy button to pre #${index}`);
            
            // Make sure pre is positioned relative
            preElement.style.position = 'relative';
            
            // Create the button
            const button = document.createElement('button');
            button.className = 'copy-btn';
            button.textContent = '📋 Copy';
            button.setAttribute('aria-label', 'Copy code to clipboard');
            
            // Add button to the pre element
            preElement.appendChild(button);
            
            // Add click handler
            button.addEventListener('click', function(e) {
                e.stopPropagation();
                copyCode(this, codeElement);
            });
        });
    }
    
    function copyCode(button, codeElement) {
        // Get the text content
        let textToCopy = codeElement.innerText;
        
        // Use Clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy)
                .then(() => {
                    showSuccess(button);
                })
                .catch(err => {
                    console.error('Clipboard API failed:', err);
                    // Fallback to textarea method
                    fallbackCopy(textToCopy, button);
                });
        } else {
            // Fallback for older browsers
            fallbackCopy(textToCopy, button);
        }
    }
    
    function fallbackCopy(text, button) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            const successful = document.execCommand('copy');
            if (successful) {
                showSuccess(button);
            } else {
                showError(button);
            }
        } catch (err) {
            console.error('Fallback copy failed:', err);
            showError(button);
        }
        
        document.body.removeChild(textarea);
    }
    
    function showSuccess(button) {
        const originalText = button.textContent;
        button.textContent = '✅ Copied!';
        button.style.backgroundColor = '#2da44e';
        button.style.color = '#ffffff';
        button.style.borderColor = '#2da44e';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.borderColor = '';
        }, 2000);
    }
    
    function showError(button) {
        const originalText = button.textContent;
        button.textContent = '❌ Error';
        button.style.backgroundColor = '#cf222e';
        button.style.color = '#ffffff';
        button.style.borderColor = '#cf222e';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.backgroundColor = '';
            button.style.color = '';
            button.style.borderColor = '';
        }, 2000);
    }
})();
