// assets/js/plebvox-loader.js
(function() {
    'use strict';

    let loaded = false;

    function hidePlebVoxHighlighting() {
        if (document.getElementById('plebvox-highlight-disabled')) return;
        const style = document.createElement('style');
        style.id = 'plebvox-highlight-disabled';
        style.textContent =
            '::highlight(plebvox-current-word){background:transparent!important;color:inherit!important;text-shadow:none!important}' +
            '.plebvox-highlight,.plebvox-paragraph-highlight{background:transparent!important;color:inherit!important;text-shadow:none!important;box-shadow:none!important;padding:0!important;}';
        document.head.appendChild(style);
    }

    function loadPlebVox() {
        if (loaded) return;
        
        const main = document.querySelector('main');
        if (!main) return;

        if (main.innerHTML.indexOf('<!-- PLEBVOX:START -->') === -1) {
            return;
        }

        // PlebVox speech remains enabled. Visual highlighting is temporarily
        // disabled because Android speech boundary timing is unreliable.
        loaded = true;
        const script = document.createElement('script');
        script.src = '/assets/js/plebvox.js?v=20260917-3';
        script.async = true;
        script.defer = true;
        script.onload = function() {
            hidePlebVoxHighlighting();
        };
        document.head.appendChild(script);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadPlebVox);
    } else {
        loadPlebVox();
    }

})();
