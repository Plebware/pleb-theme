(function () {
  'use strict';

  var returnLink = document.getElementById('plebware-return-link');
  if (!returnLink) return;

  var dialog = document.getElementById('plebware-return-dialog');
  var closeButton = dialog ? dialog.querySelector('.plebware-dialog-close') : null;
  var storageKey = 'plebware.article-return-stack.v1';
  var firstVisitMessage = "You haven't viewed any other PlebWare articles in this tab yet. Try Search or All Articles to continue exploring.";

  function internalUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin) return null;
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

  var currentUrl = internalUrl(window.location.href);
  var stack = readStack();

  // A new/direct tab has no earlier page in its own history. This also
  // prevents a browser-created tab from reusing a copied opener-tab stack.
  if (window.history.length <= 1) stack = [];

  // Avoid returning to this same article after a reload or browser Back.
  while (stack.length && stack[stack.length - 1].href === currentUrl) {
    stack.pop();
  }
  writeStack(stack);

  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
    if (!anchor || anchor === returnLink || anchor.hasAttribute('download')) return;
    if (anchor.target && anchor.target.toLowerCase() === '_blank') return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var destination = internalUrl(anchor.href);
    if (!destination || destination === currentUrl) return;

    var nextStack = readStack();
    var last = nextStack[nextStack.length - 1];
    if (!last || last.href !== currentUrl) {
      var heading = document.querySelector('article h1');
      nextStack.push({
        href: currentUrl,
        title: heading ? heading.textContent.trim() : document.title
      });
    }
    writeStack(nextStack);
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
