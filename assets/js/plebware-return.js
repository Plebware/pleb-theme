(function () {
  'use strict';

  var returnLink = document.getElementById('plebware-return-link');
  if (!returnLink) return;

  var dialog = document.getElementById('plebware-return-dialog');
  var closeButton = dialog ? dialog.querySelector('.plebware-dialog-close') : null;
  var storageKey = 'plebware.article-return-stack.v1';
  var sourceParameter = 'pleb_from';
  var firstVisitMessage = "You haven't viewed any other PlebWare articles in this tab yet. Try Search or All Articles to continue exploring.";

  function internalUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin) return null;
      url.searchParams.delete(sourceParameter);
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

  var pageUrl = new URL(window.location.href);
  var incomingSource = internalUrl(pageUrl.searchParams.get(sourceParameter) || '');
  if (pageUrl.searchParams.has(sourceParameter)) {
    pageUrl.searchParams.delete(sourceParameter);
    window.history.replaceState(window.history.state, '', pageUrl.pathname + pageUrl.search + pageUrl.hash);
  }

  var currentUrl = internalUrl(window.location.href);
  var stack = readStack();

  // A directly opened tab starts clean, but a validated internal source link
  // can safely provide the article that opened this page, including new tabs.
  if (window.history.length <= 1) stack = [];

  while (stack.length && stack[stack.length - 1].href === currentUrl) {
    stack.pop();
  }

  if (incomingSource && incomingSource !== currentUrl) {
    var last = stack[stack.length - 1];
    if (!last || last.href !== incomingSource) {
      stack.push({ href: incomingSource, title: 'Previous PlebWare article' });
    }
  }
  writeStack(stack);

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor || anchor === returnLink || anchor.hasAttribute('download')) return;
    if (event.button !== 0) return;

    var destination = internalUrl(anchor.href);
    if (!destination || destination === currentUrl) return;

    // Carry the source article in the link itself. This works for same-tab
    // navigation, target=_blank, and Ctrl/Cmd-click without sharing tab storage.
    try {
      var destinationUrl = new URL(anchor.href, window.location.href);
      if (destinationUrl.origin !== window.location.origin) return;
      destinationUrl.searchParams.set(sourceParameter, currentUrl);
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
      var previousArticle = nextStack.pop();
      writeStack(nextStack);
      window.location.assign(previousArticle.href);
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
}());
