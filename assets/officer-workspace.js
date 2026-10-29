// Presentation and keyboard behavior only. Data and authorization stay in officer-docs.js/auth.js.
(function () {
  'use strict';
  var folderToggle = document.getElementById('folderToggle');
  var folderPanel = document.querySelector('.docSide');
  var mobile = window.matchMedia('(max-width:899px)');
  function setFolders(open) {
    folderPanel.classList.toggle('folders-open', open);
    folderToggle.setAttribute('aria-expanded', String(open));
    folderToggle.textContent = open ? '분류 접기' : '분류 펼치기';
  }
  folderToggle.addEventListener('click', function () {
    setFolders(folderToggle.getAttribute('aria-expanded') !== 'true');
  });
  document.getElementById('folderTree').addEventListener('click', function (event) {
    if (!mobile.matches || !event.target.closest('[data-f]')) return;
    setFolders(false);
    folderToggle.focus({ preventScroll: true });
  });
  document.getElementById('folderTree').addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    var buttons = Array.from(this.querySelectorAll('button[data-f]'));
    var position = buttons.indexOf(document.activeElement);
    if (position < 0) return;
    event.preventDefault();
    buttons[(position + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length].focus();
  });
  folderPanel.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && mobile.matches) {
      setFolders(false); folderToggle.focus();
    }
  });
  mobile.addEventListener('change', function () {
    if (mobile.matches && folderPanel.contains(document.activeElement)) folderToggle.focus();
    setFolders(false);
  });
  document.getElementById('toBasket').addEventListener('click', function () {
    var tab = document.querySelector('[data-tab="basket"]');
    tab.click(); tab.focus({ preventScroll: true });
  });
  document.getElementById('basketDrop').addEventListener('keydown', function (event) {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.click(); }
  });
  document.getElementById('meetingList').addEventListener('keydown', function (event) {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.row[data-id]')) {
      event.preventDefault(); event.target.click();
    }
  });

  // Keep keyboard focus inside the topmost viewer, including when its contents change.
  var layers = [document.getElementById('detailOverlay'), document.getElementById('docOv')];
  var content = document.getElementById('content');
  var header = document.querySelector('header.bar');
  var topLayer = null;
  var openers = new Map();
  function dialog(layer) { return layer.id === 'detailOverlay' ? document.getElementById('detailModal') : layer; }
  function focusable(layer) {
    return Array.from(dialog(layer).querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),iframe,[tabindex="0"]'))
      .filter(function (el) { return el.getClientRects().length && !el.closest('[inert]'); });
  }
  function syncDialogs() {
    var opened = layers.filter(function (layer) { return layer.classList.contains('on'); });
    opened.forEach(function (layer) { if (!openers.has(layer)) openers.set(layer, document.activeElement); });
    var next = opened[opened.length - 1] || null;
    content.inert = !!next;
    header.inert = !!next;
    layers.forEach(function (layer) { layer.inert = !!next && layer !== next; });
    if (next) document.body.style.overflow = 'hidden';
    if (topLayer !== next) {
      var previous = topLayer;
      topLayer = next;
      var restore = previous && !opened.includes(previous) ? openers.get(previous) : null;
      if (restore && restore.isConnected && (!next || next.contains(restore))) restore.focus({ preventScroll: true });
      else if (next) (focusable(next)[0] || dialog(next)).focus({ preventScroll: true });
    } else if (next && !next.contains(document.activeElement)) {
      (focusable(next)[0] || dialog(next)).focus({ preventScroll: true });
    }
    layers.forEach(function (layer) { if (!opened.includes(layer)) openers.delete(layer); });
  }
  layers.forEach(function (layer) {
    new MutationObserver(syncDialogs).observe(layer, { attributes: true, attributeFilter: ['class'], childList: true, subtree: true });
  });
  document.addEventListener('keydown', function (event) {
    if (!topLayer || event.key !== 'Tab') return;
    var elements = focusable(topLayer), first = elements[0], last = elements[elements.length - 1];
    if (!first) { event.preventDefault(); dialog(topLayer).focus(); return; }
    if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }, true);
})();
