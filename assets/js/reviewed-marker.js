/* PlebWare Human Verified Image marker
 * Replace recognised HTML comment markers with the shared reviewed image.
 * Supported markers: REVIEWED, HUMAN VERIFIED, HUMAN-VERIFIED,
 * HUMAN_VERIFIED, HUMAN VERIFIED IMAGE, HUMAN-VERIFIED-IMAGE,
 * HUMAN_VERIFIED_IMAGE.
 */
(function () {
  'use strict';

  const acceptedMarkers = new Set([
    'REVIEWED',
    'HUMAN VERIFIED',
    'HUMAN-VERIFIED',
    'HUMAN_VERIFIED',
    'HUMAN VERIFIED IMAGE',
    'HUMAN-VERIFIED-IMAGE',
    'HUMAN_VERIFIED_IMAGE'
  ]);

  function replaceReviewedMarkers() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_COMMENT
    );
    const markers = [];
    let node;

    while ((node = walker.nextNode())) {
      if (acceptedMarkers.has(node.nodeValue.trim().toUpperCase())) {
        markers.push(node);
      }
    }

    markers.forEach(function (marker) {
      const figure = document.createElement('figure');
      figure.className = 'human-verified-image';
      figure.style.textAlign = 'center';
      figure.style.margin = '1.25rem auto';

      const image = document.createElement('img');
      image.src = '/assets/images/polished-reviewed.webp';
      image.alt = 'Human Verified Image — PlebWare reviewed content';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.style.width = '30%';
      image.style.maxWidth = '100%';
      image.style.height = 'auto';
      image.style.display = 'inline-block';

      figure.appendChild(image);
      marker.parentNode.replaceChild(figure, marker);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceReviewedMarkers, { once: true });
  } else {
    replaceReviewedMarkers();
  }
})();
