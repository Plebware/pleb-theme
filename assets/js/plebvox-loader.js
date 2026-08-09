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

        // Cache-bust the implementation so a previously cached PlebVox build
        // cannot remain active after a deployment.
        loaded = true;
        const script = document.createElement('script');
        script.src = '/assets/js/plebvox.js?v=20260809-2';
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
