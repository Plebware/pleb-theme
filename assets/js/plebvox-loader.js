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

        // Cache-bust the implementation after every PlebVox deployment.
        loaded = true;
        const script = document.createElement('script');
        script.src = '/assets/js/plebvox.js?v=20260814-7';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            const paragraphScript = document.createElement('script');
            paragraphScript.src = '/assets/js/plebvox-paragraph-highlight.js?v=20260916-2';
            paragraphScript.async = true;
            paragraphScript.defer = true;
            document.head.appendChild(paragraphScript);
        };
        document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPlebVox);
    } else {
        loadPlebVox();
    }

})();
