// assets/js/plebvox-loader.js
// Lightweight loader that only loads PlebVox when markers are present
(function() {
    'use strict';

    let loaded = false;

    function loadPlebVox() {
        // Prevent multiple loads
        if (loaded) return;
        
        // Wait for DOM to be ready
        const main = document.querySelector('main');
        if (!main) {
            // If main doesn't exist yet, wait for it
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', loadPlebVox);
            }
            return;
        }

        // Check for PlebVox markers (handles images, HTML comments, etc.)
        const html = main.innerHTML;
        const hasStart = html.indexOf('<!-- PLEBVOX:START -->') !== -1;
        
        if (!hasStart) {
            // No markers found - exit silently
            return;
        }

        // Markers found - load the main script
        loaded = true;
        const script = document.createElement('script');
        script.src = '/assets/js/plebvox.js';
        script.async = true;
        script.defer = true;
        
        script.onload = function() {
            console.log('PlebVox: Loaded successfully');
        };
        
        script.onerror = function() {
            console.error('PlebVox: Failed to load');
            loaded = false; // Allow retry
        };
        
        document.head.appendChild(script);
    }

    // Wait for DOM to be ready before checking
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPlebVox);
    } else {
        // DOM already loaded
        loadPlebVox();
    }

})();
