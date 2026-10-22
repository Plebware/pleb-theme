/* PlebWare verification image markers.
 * REVIEWED markers indicate general human-reviewed content.
 * VOXED indicates a PlebVox article fully listened to and approved
 * by a human moderator.
 */
(function () {
  'use strict';

  const reviewedMarkers = new Set([
    'REVIEWED',
    'HUMAN VERIFIED',
    'HUMAN-VERIFIED',
    'HUMAN_VERIFIED',
    'HUMAN VERIFIED IMAGE',
    'HUMAN-VERIFIED-IMAGE',
    'HUMAN_VERIFIED_IMAGE'
  ]);

  function normaliseMarker(value) {
    // The established VOXED spelling uses extra hyphens inside the comment:
    // <!---VOXED--->. Remove surrounding hyphens before matching.
    return value.trim().toUpperCase().replace(/^-+|-+$/g, '').trim();
  }

  function replaceReviewedMarkers() {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_COMMENT
    );
    const markers = [];
    let node;

    while ((node = walker.nextNode())) {
      const markerName = normaliseMarker(node.nodeValue);
      if (reviewedMarkers.has(markerName) || markerName === 'VOXED') {
        markers.push({ node: node, type: markerName === 'VOXED' ? 'voxed' : 'reviewed' });
      }
    }

    markers.forEach(function (entry) {
      const figure = document.createElement('figure');
      figure.className = entry.type === 'voxed'
        ? 'plebvox-verified-image'
        : 'human-verified-image';
      figure.style.textAlign = 'center';
      figure.style.margin = '1.25rem auto';

      const image = document.createElement('img');
      image.src = entry.type === 'voxed'
        ? '/assets/images/plebvox-verified.webp'
        : '/assets/images/polished-reviewed.webp';
      image.alt = entry.type === 'voxed'
        ? 'PlebVox Human Verified — fully listened to and approved by a human moderator'
        : 'Human Verified Image — PlebWare reviewed content';
      image.loading = 'lazy';
      image.decoding = 'async';
      image.style.width = '60%';
      image.style.maxWidth = '100%';
      image.style.height = 'auto';
      image.style.display = 'inline-block';

      figure.appendChild(image);
      entry.node.parentNode.replaceChild(figure, entry.node);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceReviewedMarkers, { once: true });
  } else {
    replaceReviewedMarkers();
  }
})();
