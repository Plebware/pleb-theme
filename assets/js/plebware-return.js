(function () {
  'use strict';

  var returnLink = document.getElementById('plebware-return-link');
  if (!returnLink) return;

  var dialog = document.getElementById('plebware-return-dialog');
  var closeButton = dialog ? dialog.querySelector('.plebware-dialog-close') : null;
  var storageKey = 'plebware.article-return-stack.v2';
  var restoreKey = 'plebware.article-return-restore.v1';
  var sourceParameter = 'pleb_from';
  var scrollParameter = 'pleb_scroll';
  var anchorParameter = 'pleb_anchor';
  var firstVisitMessage = "You haven't viewed any other PlebWare articles in this tab yet. Try Search or All Articles to continue exploring.";

  function internalUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin) return null;
      url.searchParams.delete(sourceParameter);
      url.searchParams.delete(scrollParameter);
      url.searchParams.delete(anchorParameter);
      return url.href;
    } catch (error) {
      return null;
    }
  }

  function pageIdentity(value) {
    try {
      var url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin) return null;
      url.searchParams.delete(sourceParameter);
      url.searchParams.delete(scrollParameter);
      url.searchParams.delete(anchorParameter);
      url.hash = '';
      return url.href;
    } catch (error) {
      return null;
    }
  }

  function readStack() {
    try {
      var value = JSON.parse(window.sessionStorage.getItem(storageKey) || '[]');
      return Array.isArray(value) ? value.filter(function (item) {
        return item && typeof item.href === 'string' && internalUrl(item.href);
      }).map(function (item) {
        return {
          href: internalUrl(item.href),
          title: typeof item.title === 'string' ? item.title : 'Previous PlebWare page',
          scrollY: Number.isFinite(item.scrollY) && item.scrollY >= 0 ? item.scrollY : null,
          anchorId: typeof item.anchorId === 'string' ? item.anchorId : ''
        };
      }) : [];
    } catch (error) {
      return [];
    }
  }

  function writeStack(stack) {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(stack.slice(-30)));
    } catch (error) {
      // If browser storage is unavailable, the article remains readable.
    }
  }

  function currentAnchorId() {
    var headings = document.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
    var readingLine = window.scrollY + 120;
    var chosen = '';
    headings.forEach(function (heading) {
      if (heading.getBoundingClientRect().top + window.scrollY <= readingLine) {
        chosen = heading.id;
      }
    });
    if (chosen) return chosen;

    var identified = document.querySelectorAll('[id]');
    identified.forEach(function (element) {
      if (element.getBoundingClientRect().top + window.scrollY <= readingLine) {
        chosen = element.id;
      }
    });
    return chosen;
  }

  function saveRestoreTarget(item) {
    try {
      window.sessionStorage.setItem(restoreKey, JSON.stringify({
        href: item.href,
        scrollY: item.scrollY,
        anchorId: item.anchorId || '',
        savedAt: Date.now()
      }));
    } catch (error) {
      // URL fragments remain a useful fallback when storage is unavailable.
    }
  }

  function restoreReadingPosition() {
    var pending;
    try {
      pending = JSON.parse(window.sessionStorage.getItem(restoreKey) || 'null');
    } catch (error) {
      pending = null;
    }
    if (!pending || typeof pending.href !== 'string') return;
    if (Date.now() - (pending.savedAt || 0) > 60000) {
      try { window.sessionStorage.removeItem(restoreKey); } catch (error) {}
      return;
    }
    if (pageIdentity(pending.href) !== pageIdentity(window.location.href)) return;

    try { window.sessionStorage.removeItem(restoreKey); } catch (error) {}

    function applyPosition() {
      if (Number.isFinite(pending.scrollY) && pending.scrollY >= 0) {
        window.scrollTo(0, pending.scrollY);
        return;
      }
      if (pending.anchorId) {
        var target = document.getElementById(pending.anchorId);
        if (target) target.scrollIntoView();
      }
    }

    // Repeat briefly because fonts and images can change layout after parsing.
    window.requestAnimationFrame(function () {
      applyPosition();
      window.setTimeout(applyPosition, 180);
      window.setTimeout(applyPosition, 650);
    });
  }

  var pageUrl = new URL(window.location.href);
  var incomingSource = internalUrl(pageUrl.searchParams.get(sourceParameter) || '');
  var incomingScrollValue = pageUrl.searchParams.get(scrollParameter);
  var incomingScroll = incomingScrollValue !== null && incomingScrollValue !== '' &&
    Number.isFinite(Number(incomingScrollValue)) && Number(incomingScrollValue) >= 0
      ? Number(incomingScrollValue) : null;
  var incomingAnchor = pageUrl.searchParams.get(anchorParameter) || '';

  if (pageUrl.searchParams.has(sourceParameter) ||
      pageUrl.searchParams.has(scrollParameter) ||
      pageUrl.searchParams.has(anchorParameter)) {
    pageUrl.searchParams.delete(sourceParameter);
    pageUrl.searchParams.delete(scrollParameter);
    pageUrl.searchParams.delete(anchorParameter);
    window.history.replaceState(window.history.state, '', pageUrl.pathname + pageUrl.search + pageUrl.hash);
  }

  var currentUrl = internalUrl(window.location.href);
  var stack = readStack();

  // A directly opened tab starts clean, but a validated internal source link
  // can safely provide the page and reading position that opened this page.
  if (window.history.length <= 1) stack = [];

  while (stack.length && stack[stack.length - 1].href === currentUrl) {
    stack.pop();
  }

  if (incomingSource && incomingSource !== currentUrl) {
    var last = stack[stack.length - 1];
    if (!last || last.href !== incomingSource) {
      stack.push({
        href: incomingSource,
        title: 'Previous PlebWare page',
        scrollY: incomingScroll,
        anchorId: incomingAnchor
      });
    } else {
      last.scrollY = incomingScroll;
      last.anchorId = incomingAnchor;
    }
  }
  writeStack(stack);

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor || anchor === returnLink || anchor.hasAttribute('download')) return;
    if (event.button !== 0) return;

    var destination = internalUrl(anchor.href);
    if (!destination || pageIdentity(destination) === pageIdentity(currentUrl)) return;

    // Save the actual reading position and a nearby heading as a resilient
    // fallback. Carry the state in the link so intentional new-tab navigation
    // can restore it without depending solely on sessionStorage sharing.
    var destinationUrl;
    try {
      destinationUrl = new URL(anchor.href, window.location.href);
      if (destinationUrl.origin !== window.location.origin) return;
      destinationUrl.searchParams.set(sourceParameter, currentUrl);
      destinationUrl.searchParams.set(scrollParameter, String(Math.max(0, Math.round(window.scrollY))));
      var anchorId = currentAnchorId();
      if (anchorId) destinationUrl.searchParams.set(anchorParameter, anchorId);
      else destinationUrl.searchParams.delete(anchorParameter);
      anchor.href = destinationUrl.href;
    } catch (error) {
      // Leave unusual or invalid links untouched.
    }
  }, true);

  returnLink.addEventListener('click', function (event) {
    event.preventDefault();
    var nextStack = readStack();

    while (nextStack.length && nextStack[nextStack.length - 1].href === currentUrl) {
      nextStack.pop();
    }

    if (nextStack.length) {
      var previousPage = nextStack.pop();
      writeStack(nextStack);
      saveRestoreTarget(previousPage);
      window.location.assign(previousPage.href);
      return;
    }

    if (dialog && typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      window.alert(firstVisitMessage);
      window.location.assign('/all-posts/');
    }
  });

  if (closeButton && dialog) {
    closeButton.addEventListener('click', function () {
      dialog.close();
    });
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  if (document.readyState === 'complete') {
    restoreReadingPosition();
  } else {
    window.addEventListener('load', restoreReadingPosition, { once: true });
  }
}());