// assets/js/plebvox-loader.js
(function() {
    'use strict';

    let loaded = false;

    function loadPlebVox() {
        if (loaded) return;
        
        const main = document.querySelector('main');
        if (!main) return;

        if (main.innerHTML.indexOf('<!-- PLEBVOX:START -->') === -1) {
            return;
        }

        loaded = true;
        const script = document.createElement('script');
        script.src = '/assets/js/plebvox.js';
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPlebVox);
    } else {
        loadPlebVox();
    }

})();
