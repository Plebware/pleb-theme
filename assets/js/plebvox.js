// assets/js/plebvox-loader.js
(function() {
    'use strict';

    let loaded = false;

    function loadPlebVox() {
        if (loaded) return;
        
        const main = document.querySelector('main');
        if (!main) return;

        const html = main.innerHTML;
        const hasStart = html.indexOf('<!-- PLEBVOX:START -->') !== -1;
        
        if (!hasStart) {
            return;
        }

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
            loaded = false;
        };
        
        document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPlebVox);
    } else {
        loadPlebVox();
    }

})();
