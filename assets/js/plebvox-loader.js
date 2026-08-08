// assets/js/plebvox-loader.js
(function() {
    'use strict';

    // Check if the page has PlebVox markers
    function hasPlebVoxMarkers() {
        const main = document.querySelector('main');
        if (!main) return false;
        return main.innerHTML.indexOf('<!-- PLEBVOX:START -->') !== -1;
    }

    // Only load PlebVox if markers exist
    if (hasPlebVoxMarkers()) {
        const script = document.createElement('script');
        script.src = '/assets/js/plebvox.js';
        script.async = true;
        document.head.appendChild(script);
    }
})();
