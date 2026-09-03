/**
 * Chat Manager Pro — content script
 *
 * Injects a management panel into supported chat sites: search, sort, date
 * filter, multi-select and rate-limited bulk delete with an undo window.
 *
 * This file is site-agnostic. Every endpoint and conversation-link selector
 * lives in sites.js, which resolves one adapter per host.
 *
 * The data layer is deliberately two-tier:
 *   1. API mode  — the adapter reads the site's own endpoints. Gives real
 *                  timestamps, the full list, and fast deletes.
 *   2. DOM mode  — falls back to scraping sidebar links if the API shape
 *                  changes. Degraded (no timestamps) but not broken.
 */
(() => {
  'use strict';

  if (window.__cmpLoaded) return;
  window.__cmpLoaded = true;

  /* ------------------------------------------------------------------ *
   * Site adapter. Everything site-specific lives in sites.js; this file
   * is shared across every supported site and never names one directly.
   * ------------------------------------------------------------------ */
  const SITE = window.cmpSite;
  if (!SITE) return;   // not a site we support

  const PREFS_KEY = 'cmp.prefs';
  const SIGNAL_KEY = 'cmp.toggleSignal';
  const ACK_KEY = 'cmp.toggleAck';
  const PRIVACY_KEY = 'cmp.privacy';
  const PRIVACY_SIGNAL = 'cmp.privacySignal';
  const LOCK_KEY = 'cmp.lock';
  const LOCK_SIGNAL = 'cmp.lockSignal';
  const SITES_KEY = 'cmp.sites';
  const THEME_KEY = 'cmp.theme';
  const VISION_KEY = 'cmp.vision';
  const DEFAULTS = { sort: 'newest', filter: 'all' };
  const PRIVACY_DEFAULTS = {
    on: false,
    titles: true,
    messages: true,
    media: true,
    account: true,
    input: true,
    hover: true,
    strength: 'medium',
  };
  const LOCK_DEFAULTS = { record: null, locked: false };
  // Which sites the extension is allowed to act on. Absent means enabled.
  const SITES_DEFAULTS = { claude: true, chatgpt: true, gemini: true };
  const THEME_DEFAULTS = { font: 'system', size: 'medium', density: 'comfortable', accent: 'default' };
  // Only non-default choices have a class. An untouched install adds nothing
  // to the page, so the default look is genuinely the site's own.
  const VISION_DEFAULTS = { colorBlind: 'none' };
  // Exactly one simulation at a time — these are mutually exclusive by nature,
  // and stacking two colour matrices would show you something nobody sees.
  const COLOR_BLIND_MODES = ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];
  const THEME_CLASSES = {
    font: ['serif', 'mono'],
    size: ['small', 'large'],
    density: ['compact'],
    accent: ['blue', 'teal', 'violet', 'amber', 'rose', 'slate'],
  };
  const PAGE_SIZE = 100;      // conversations fetched per request
  const MAX_PAGES = 40;       // hard stop so a bad cursor can't loop forever
  const DELETE_GAP_MS = 350;  // spacing between deletes, avoids rate limiting
  const UNDO_MS = 10000;      // grace period before deletes actually fire

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /** Build an element. Text is always set via textContent — never innerHTML,
   *  because chat titles are untrusted user content. */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /* ------------------------------------------------------------------ *
   * Preferences — sort/filter persist. Selection deliberately does not:
   * restoring a stale selection into a destructive tool is a footgun.
   * ------------------------------------------------------------------ */
  const prefs = { ...DEFAULTS };
  const privacy = { ...PRIVACY_DEFAULTS };
  const lock = { ...LOCK_DEFAULTS };
  const siteEnabled = { ...SITES_DEFAULTS };
  const theme = { ...THEME_DEFAULTS };
  const vision = { ...VISION_DEFAULTS };

  /** Whether the extension should do anything at all on this site. */
  let active = false;
  const isEnabled = () => siteEnabled[SITE.id] !== false;

  function loadPrefs() {
    return new Promise((resolve) => {
      try {
        chrome.storage.local.get(
          [PREFS_KEY, PRIVACY_KEY, LOCK_KEY, SITES_KEY, THEME_KEY, VISION_KEY], (res) => {
          if (!chrome.runtime.lastError && res) {
            if (res[PREFS_KEY]) Object.assign(prefs, res[PREFS_KEY]);
            if (res[PRIVACY_KEY]) Object.assign(privacy, res[PRIVACY_KEY]);
            if (res[LOCK_KEY]) Object.assign(lock, res[LOCK_KEY]);
            if (res[SITES_KEY]) Object.assign(siteEnabled, res[SITES_KEY]);
            if (res[THEME_KEY]) Object.assign(theme, res[THEME_KEY]);
            if (res[VISION_KEY]) Object.assign(vision, res[VISION_KEY]);
          }
          resolve();
        });
      } catch {
        resolve();
      }
    });
  }

  function savePrefs() {
    try {
      chrome.storage.local.set({ [PREFS_KEY]: { sort: prefs.sort, filter: prefs.filter } });
    } catch { /* storage unavailable; preferences simply won't persist */ }
  }

  /**
   * Chat list readability. Like the blur, this only flips classes on <html> —
   * the selectors live in content.css and no page DOM is touched.
   */
  function applyTheme() {
    const c = document.documentElement.classList;
    Object.entries(THEME_CLASSES).forEach(([key, values]) => {
      values.forEach((v) => c.toggle(`cmp-${key}-${v}`, active && theme[key] === v));
    });
  }

  /**
   * Colour-blindness simulation. The matrices are the standard Brettel/Viénot
   * approximations used by browser dev tools. They are injected once, lazily,
   * because most sessions never turn a simulator on.
   */
  const CB_MATRIX = {
    protanopia: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
    deuteranopia: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
    tritanopia: '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
    achromatopsia: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0',
  };

  let filtersInjected = false;

  function ensureFilters() {
    if (filtersInjected || !root) return;
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'cmp-filters');
    svg.setAttribute('aria-hidden', 'true');
    Object.entries(CB_MATRIX).forEach(([name, values]) => {
      const filter = document.createElementNS(NS, 'filter');
      filter.setAttribute('id', `cmp-f-${name}`);
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const matrix = document.createElementNS(NS, 'feColorMatrix');
      matrix.setAttribute('type', 'matrix');
      matrix.setAttribute('values', values);
      filter.appendChild(matrix);
      svg.appendChild(filter);
    });
    root.appendChild(svg);
    filtersInjected = true;
  }

  function applyVision() {
    const c = document.documentElement.classList;
    const mode = active ? vision.colorBlind : 'none';
    if (mode !== 'none') ensureFilters();
    COLOR_BLIND_MODES.forEach((m) => c.toggle(`cmp-cb-${m}`, mode === m));
  }

  function savePrivacy() {
    try {
      chrome.storage.local.set({ [PRIVACY_KEY]: { ...privacy } });
    } catch { /* storage unavailable */ }
  }

  /**
   * Privacy blur. The script only flips classes on <html>; every selector
   * lives in the PRIVACY BLUR block of content.css. Nothing here touches the
   * page's own DOM, so React re-renders and lazily loaded messages are
   * covered for free.
   */
  function applyPrivacy() {
    const c = document.documentElement.classList;
    // Every blur rule requires cmp-privacy-on, so gating it here is enough
    // to switch the whole feature off on a disabled site.
    c.toggle('cmp-privacy-on', active && privacy.on);
    c.toggle('cmp-blur-titles', privacy.titles);
    c.toggle('cmp-blur-messages', privacy.messages);
    c.toggle('cmp-blur-media', privacy.media);
    c.toggle('cmp-blur-account', privacy.account);
    c.toggle('cmp-blur-input', privacy.input);
    c.toggle('cmp-reveal-hover', privacy.hover);
    ['light', 'medium', 'heavy'].forEach((s) => {
      c.toggle(`cmp-blur-${s}`, privacy.strength === s);
    });
    if (eyeBtn) {
      eyeBtn.textContent = privacy.on ? '\u{1F648}' : '\u{1F441}';
      eyeBtn.title = privacy.on ? 'Privacy blur on — click to turn off' : 'Blur chats for privacy';
      eyeBtn.setAttribute('aria-pressed', String(privacy.on));
      eyeBtn.classList.toggle('cmp-eye-active', privacy.on);
    }
  }

  function togglePrivacy() {
    privacy.on = !privacy.on;
    applyPrivacy();
    savePrivacy();
  }

  /* ---------------------------------------------------------------- *
   * Screen lock.
   *
   * Honest scope: this stops someone walking up to your unattended desk
   * from reading or using your chats. It is not protection against
   * someone with real access to the machine, who can disable the
   * extension. It is treated throughout as a deterrent, not a vault.
   *
   * The locked flag lives in storage, so locking one tab locks every
   * Claude tab, and a reload does not clear it.
   * ---------------------------------------------------------------- */
  let lockEl = null;

  function saveLock() {
    try {
      chrome.storage.local.set({ [LOCK_KEY]: { ...lock } });
    } catch { /* storage unavailable */ }
  }

  function applyLock() {
    // Never leave the screen locked with no password to unlock it.
    if (lock.locked && !lock.record) {
      lock.locked = false;
      saveLock();
    }
    document.documentElement.classList.toggle('cmp-locked', active && Boolean(lock.locked));
    if (active && lock.locked) showLockScreen();
    else if (lockEl) {
      lockEl.dispatchEvent(new CustomEvent('cmp-teardown'));
      lockEl.remove();
      lockEl = null;
    }
  }

  function requestLock() {
    if (!lock.record) {
      flash('Set a lock password in the extension popup first.');
      return;
    }
    lock.locked = true;
    applyLock();
    saveLock();
  }

  function showLockScreen() {
    if (!root || lockEl) return;

    lockEl = el('div', 'cmp-lock');
    const card = el('div', 'cmp-lock-card');
    card.appendChild(el('div', 'cmp-lock-icon', '\u{1F512}'));
    card.appendChild(el('div', 'cmp-lock-title', 'Screen locked'));
    card.appendChild(el('div', 'cmp-lock-sub', 'Enter your password to continue.'));

    const input = el('input', 'cmp-lock-input');
    input.type = 'password';
    input.placeholder = 'Password';
    input.autocomplete = 'off';
    card.appendChild(input);

    const btn = el('button', 'cmp-lock-btn', 'Unlock');
    btn.type = 'button';
    card.appendChild(btn);

    const error = el('div', 'cmp-lock-error', '');
    card.appendChild(error);

    async function attempt() {
      const value = input.value;
      if (!value) return;
      btn.disabled = true;
      error.textContent = '';

      if (!window.cmpCrypto) {
        error.textContent = 'Unlock unavailable — reload the page.';
        btn.disabled = false;
        return;
      }
      const ok = await window.cmpCrypto.verify(value, lock.record);

      // A deliberate pause on failure — slows guessing, costs nothing on success.
      if (!ok) await sleep(500);
      btn.disabled = false;

      if (ok) {
        lock.locked = false;
        applyLock();
        saveLock();
        return;
      }
      input.value = '';
      error.textContent = 'Incorrect password.';
      card.classList.add('cmp-shake');
      setTimeout(() => card.classList.remove('cmp-shake'), 320);
      input.focus();
    }

    btn.addEventListener('click', attempt);
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') attempt();
      ev.stopPropagation();
    });

    // Keep focus inside the lock. Pointer events on the page are already
    // disabled by CSS; this closes the keyboard route.
    const trap = (ev) => {
      if (lockEl && !lockEl.contains(ev.target)) input.focus();
    };
    document.addEventListener('focusin', trap, true);
    lockEl.addEventListener('cmp-teardown', () => {
      document.removeEventListener('focusin', trap, true);
    });

    lockEl.appendChild(card);
    root.appendChild(lockEl);
    setTimeout(() => input.focus(), 40);
  }

  /** Brief message in the panel, for things that need no confirmation. */
  function flash(message) {
    if (!root) return;
    const toast = el('div', 'cmp-toast', message);
    root.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  /* ------------------------------------------------------------------ *
   * Data layer
   * ------------------------------------------------------------------ */
  const state = {
    chats: [],            // { uuid, title, updated, created, hasDate }
    selected: new Set(),
    search: '',
    source: 'api',        // 'api' | 'dom'
    loading: false,
    busy: false,          // a delete run is in flight
    error: null,
    lastAnchor: null,     // for shift-click range select
    open: false,
  };

  /** Scrape whatever the sidebar has rendered. No timestamps available. */
  function fetchViaDom() {
    const panel = document.getElementById('cmp-root');
    const seen = new Set();
    const out = [];

    document.querySelectorAll(SITE.linkSelector).forEach((node, index) => {
      if (panel && panel.contains(node)) return;   // skip our own rows
      const title = (node.textContent || '').trim();
      if (!title) return;

      const href = (node.getAttribute && node.getAttribute('href')) || '';
      const match = href.match(SITE.hrefPattern);

      let uuid;
      let url = null;
      if (match) {
        uuid = match[1];
        url = href;
      } else if (SITE.allowSyntheticIds) {
        // Some sidebars render entries as buttons, not links. Without a real
        // id we can still list and search them — we just cannot link or delete.
        uuid = `dom:${index}:${title.slice(0, 60)}`;
      } else {
        return;
      }

      if (seen.has(uuid)) return;
      seen.add(uuid);
      out.push({
        uuid, title, url,
        summary: '', updated: null, created: null, hasDate: false,
      });
    });
    return out;
  }

  async function loadChats() {
    state.loading = true;
    state.error = null;
    render();

    if (SITE.domOnly) {
      // This site has no usable API; the sidebar is the only source.
      state.chats = fetchViaDom();
      state.source = 'dom';
      state.loading = false;
      pruneSelection();
      render();
      return;
    }

    try {
      state.chats = await SITE.list();
      state.source = 'api';
    } catch (firstErr) {
      let apiErr = firstErr;
      if (typeof SITE.resetAuth === 'function') {
        // Cached credentials (an org id, a bearer token) may simply be stale.
        // Clear them and try once more before falling back.
        SITE.resetAuth();
        try {
          state.chats = await SITE.list();
          state.source = 'api';
          apiErr = null;
        } catch (secondErr) {
          apiErr = secondErr;
        }
      }
      if (apiErr) {
        const scraped = fetchViaDom();
        if (scraped.length) {
          state.chats = scraped;
          state.source = 'dom';
        } else {
          state.chats = [];
          state.error = apiErr.message || 'Could not read your chat list.';
        }
      }
    }

    pruneSelection();
    state.loading = false;
    render();
  }

  /** Drop selections for chats that no longer exist. */
  function pruneSelection() {
    const live = new Set(state.chats.map((c) => c.uuid));
    [...state.selected].forEach((id) => { if (!live.has(id)) state.selected.delete(id); });
  }

  /* ------------------------------------------------------------------ *
   * Derived view: filter -> search -> sort
   * ------------------------------------------------------------------ */
  function inDateBucket(chat, bucket) {
    if (bucket === 'all') return true;
    if (!chat.hasDate) return true; // never hide a chat we can't date
    const days = (Date.now() - chat.updated) / 86400000;
    const sameDay = new Date(chat.updated).toDateString() === new Date().toDateString();
    switch (bucket) {
      case 'today': return sameDay;
      case 'week': return days <= 7;
      case 'month': return days <= 30;
      case 'older': return days > 30;
      default: return true;
    }
  }

  function visibleChats() {
    const q = state.search.trim().toLowerCase();
    let list = state.chats.filter((c) => inDateBucket(c, prefs.filter));

    if (q) {
      list = list.filter(
        (c) => c.title.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q)
      );
    }

    const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    const byTime = (a, b) => (b.updated || 0) - (a.updated || 0);

    switch (prefs.sort) {
      case 'oldest': list = [...list].sort((a, b) => -byTime(a, b)); break;
      case 'az': list = [...list].sort(byTitle); break;
      case 'za': list = [...list].sort((a, b) => -byTitle(a, b)); break;
      default: list = [...list].sort(byTime);
    }
    return list;
  }

  /* ------------------------------------------------------------------ *
   * UI construction
   * ------------------------------------------------------------------ */
  let root, panel, listEl, countEl, searchInput, deleteBtn, sourceBadge, fab;
  let sortSel, filterSel, eyeBtn;

  function buildUI() {
    root = el('div', 'cmp-root');
    root.id = 'cmp-root';

    // Floating launcher, so the panel is reachable without the toolbar popup.
    fab = el('button', 'cmp-fab');
    fab.type = 'button';
    fab.title = 'Chat Manager Pro';
    fab.setAttribute('aria-label', 'Open Chat Manager Pro');
    fab.textContent = '☑';
    fab.addEventListener('click', togglePanel);
    root.appendChild(fab);

    panel = el('aside', 'cmp-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Chat Manager Pro');

    /* header */
    const header = el('div', 'cmp-header');
    const titleWrap = el('div', 'cmp-title-wrap');
    titleWrap.appendChild(el('span', 'cmp-title', 'Chat Manager Pro'));
    titleWrap.appendChild(el('span', 'cmp-site', SITE.label));
    sourceBadge = el('span', 'cmp-badge', '');
    titleWrap.appendChild(sourceBadge);
    header.appendChild(titleWrap);

    const headerActions = el('div', 'cmp-header-actions');

    // Quick privacy toggle — the fast path. Granular options live in the popup.
    eyeBtn = el('button', 'cmp-icon-btn cmp-eye');
    eyeBtn.type = 'button';
    eyeBtn.addEventListener('click', togglePrivacy);
    headerActions.appendChild(eyeBtn);

    const lockBtn = el('button', 'cmp-icon-btn', '\u{1F512}');
    lockBtn.type = 'button';
    lockBtn.title = 'Lock the screen (Alt+Shift+L)';
    lockBtn.addEventListener('click', requestLock);
    headerActions.appendChild(lockBtn);

    const closeBtn = el('button', 'cmp-icon-btn', '✕');
    closeBtn.type = 'button';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', closePanel);
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);
    panel.appendChild(header);

    /* search */
    const searchRow = el('div', 'cmp-row cmp-search-row');
    const searchWrap = el('div', 'cmp-search');
    searchWrap.appendChild(el('span', 'cmp-search-icon', '🔍'));
    searchInput = el('input', 'cmp-search-input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Search chats…';
    searchInput.addEventListener('input', () => {
      state.search = searchInput.value;
      state.lastAnchor = null;
      renderList();
    });
    searchWrap.appendChild(searchInput);

    const clearBtn = el('button', 'cmp-clear', '✕');
    clearBtn.type = 'button';
    clearBtn.title = 'Clear search';
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      state.search = '';
      searchInput.focus();
      renderList();
    });
    searchWrap.appendChild(clearBtn);
    searchRow.appendChild(searchWrap);
    panel.appendChild(searchRow);

    /* sort + filter */
    const controls = el('div', 'cmp-row cmp-controls');

    sortSel = el('select', 'cmp-select');
    [['newest', 'Newest first'], ['oldest', 'Oldest first'], ['az', 'A–Z'], ['za', 'Z–A']]
      .forEach(([v, label]) => {
        const o = el('option', null, label);
        o.value = v;
        sortSel.appendChild(o);
      });
    sortSel.value = prefs.sort;
    sortSel.addEventListener('change', () => {
      prefs.sort = sortSel.value;
      state.lastAnchor = null;
      savePrefs();
      renderList();
    });
    controls.appendChild(labelled('Sort', sortSel));

    filterSel = el('select', 'cmp-select');
    [['all', 'All'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['older', 'Older']]
      .forEach(([v, label]) => {
        const o = el('option', null, label);
        o.value = v;
        filterSel.appendChild(o);
      });
    filterSel.value = prefs.filter;
    filterSel.addEventListener('change', () => {
      prefs.filter = filterSel.value;
      state.lastAnchor = null;
      savePrefs();
      renderList();
    });
    controls.appendChild(labelled('Filter', filterSel));
    panel.appendChild(controls);

    /* bulk selection row */
    const bulk = el('div', 'cmp-row cmp-bulk');
    const allBtn = el('button', 'cmp-btn cmp-btn-ghost', 'Select all');
    allBtn.type = 'button';
    allBtn.addEventListener('click', () => {
      visibleChats().forEach((c) => state.selected.add(c.uuid));
      renderList();
    });
    const noneBtn = el('button', 'cmp-btn cmp-btn-ghost', 'None');
    noneBtn.type = 'button';
    noneBtn.addEventListener('click', () => {
      state.selected.clear();
      renderList();
    });
    bulk.appendChild(allBtn);
    bulk.appendChild(noneBtn);
    countEl = el('span', 'cmp-count', '0 selected');
    bulk.appendChild(countEl);
    panel.appendChild(bulk);

    /* list */
    listEl = el('div', 'cmp-list');
    panel.appendChild(listEl);

    /* footer */
    const footer = el('div', 'cmp-footer');
    const refreshBtn = el('button', 'cmp-btn cmp-btn-ghost', 'Refresh');
    refreshBtn.type = 'button';
    refreshBtn.addEventListener('click', loadChats);
    footer.appendChild(refreshBtn);

    deleteBtn = el('button', 'cmp-btn cmp-btn-danger', 'Delete selected');
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', confirmDelete);
    footer.appendChild(deleteBtn);

    if (SITE.canDelete === false) {
      // Say so plainly instead of offering a button that would fail.
      deleteBtn.remove();
      footer.appendChild(el('span', 'cmp-footer-note', SITE.deleteNote || 'Delete is unavailable here.'));
    }
    panel.appendChild(footer);

    root.appendChild(panel);
    document.body.appendChild(root);
  }

  function labelled(text, control) {
    const wrap = el('label', 'cmp-field');
    wrap.appendChild(el('span', 'cmp-field-label', text));
    wrap.appendChild(control);
    return wrap;
  }

  /* ------------------------------------------------------------------ *
   * Rendering
   * ------------------------------------------------------------------ */
  function render() {
    if (!root) return;
    root.classList.toggle('cmp-open', state.open);
    sourceBadge.textContent = state.source === 'dom' ? 'limited mode' : '';
    sourceBadge.style.display = state.source === 'dom' ? '' : 'none';
    renderList();
  }

  function renderList() {
    if (!listEl) return;
    listEl.replaceChildren();

    if (state.loading) {
      listEl.appendChild(el('div', 'cmp-empty', 'Loading your chats…'));
      updateFooter(0);
      return;
    }

    if (state.error) {
      const box = el('div', 'cmp-empty');
      box.appendChild(el('div', 'cmp-empty-title', 'Could not read your chat list'));
      box.appendChild(el('div', null, state.error));
      box.appendChild(el('div', 'cmp-hint', 'Open claude.ai in this tab and press Refresh.'));
      listEl.appendChild(box);
      updateFooter(0);
      return;
    }

    const chats = visibleChats();

    if (state.source === 'dom') {
      listEl.appendChild(el(
        'div',
        'cmp-notice',
        'Showing only chats loaded in the sidebar. Date filtering is unavailable in this mode.'
      ));
    }

    if (!chats.length) {
      listEl.appendChild(el(
        'div',
        'cmp-empty',
        state.search ? `No chats match “${state.search}”.` : 'No chats found.'
      ));
      updateFooter(0);
      return;
    }

    chats.forEach((chat, index) => {
      const row = el('div', 'cmp-item');
      if (state.selected.has(chat.uuid)) row.classList.add('cmp-selected');

      const box = el('input', 'cmp-checkbox');
      box.type = 'checkbox';
      box.checked = state.selected.has(chat.uuid);
      box.addEventListener('click', (ev) => onToggle(ev, chat, index, chats));
      row.appendChild(box);

      const body = el('div', 'cmp-item-body');
      body.appendChild(el('div', 'cmp-item-title', chat.title));
      const meta = formatDate(chat.updated);
      if (meta) body.appendChild(el('div', 'cmp-item-meta', meta));
      row.appendChild(body);

      const href = chat.url
        || (SITE.conversationUrl ? SITE.conversationUrl(chat.uuid) : null);
      let open = null;
      if (href) {
        open = el('a', 'cmp-open-link', '↗');
        open.href = href;
        open.title = 'Open chat';
        open.addEventListener('click', (ev) => ev.stopPropagation());
        row.appendChild(open);
      }

      // Clicking anywhere on the row toggles, matching list conventions.
      row.addEventListener('click', (ev) => {
        if (ev.target === box || ev.target === open) return;
        onToggle(ev, chat, index, chats);
      });

      listEl.appendChild(row);
    });

    updateFooter(chats.length);
  }

  /** Checkbox toggle with shift-click range support. */
  function onToggle(ev, chat, index, chats) {
    if (ev.shiftKey && state.lastAnchor != null) {
      const [from, to] = [state.lastAnchor, index].sort((a, b) => a - b);
      const turningOn = !state.selected.has(chat.uuid);
      for (let i = from; i <= to; i += 1) {
        if (turningOn) state.selected.add(chats[i].uuid);
        else state.selected.delete(chats[i].uuid);
      }
    } else {
      if (state.selected.has(chat.uuid)) state.selected.delete(chat.uuid);
      else state.selected.add(chat.uuid);
      state.lastAnchor = index;
    }
    ev.preventDefault();
    renderList();
  }

  function updateFooter(visibleCount) {
    const n = state.selected.size;
    countEl.textContent = `${n} selected` + (visibleCount ? ` · ${visibleCount} shown` : '');
    if (SITE.canDelete === false) return;
    deleteBtn.textContent = n ? `Delete ${n}` : 'Delete selected';
    deleteBtn.disabled = n === 0 || state.busy;
    deleteBtn.classList.toggle('cmp-hidden', n === 0);
  }

  /* ------------------------------------------------------------------ *
   * Delete pipeline: confirm -> optional backup -> undo window -> run
   * ------------------------------------------------------------------ */
  function confirmDelete() {
    if (SITE.canDelete === false) return;
    const targets = state.chats.filter((c) => state.selected.has(c.uuid));
    if (!targets.length || state.busy) return;

    const overlay = el('div', 'cmp-modal-overlay');
    const modal = el('div', 'cmp-modal');

    modal.appendChild(el('div', 'cmp-modal-title', `Delete ${targets.length} chat${targets.length > 1 ? 's' : ''}?`));
    modal.appendChild(el('div', 'cmp-modal-sub', 'This permanently removes them from your account.'));

    // Show the actual titles — a bare count gives nothing to verify against.
    const listBox = el('div', 'cmp-modal-list');
    targets.forEach((c) => listBox.appendChild(el('div', 'cmp-modal-item', c.title)));
    modal.appendChild(listBox);

    const backupWrap = el('label', 'cmp-modal-check');
    const backup = el('input');
    backup.type = 'checkbox';
    backup.checked = true;
    backupWrap.appendChild(backup);
    backupWrap.appendChild(el('span', null, 'Download a JSON backup of the list first'));
    modal.appendChild(backupWrap);

    const actions = el('div', 'cmp-modal-actions');
    const cancel = el('button', 'cmp-btn cmp-btn-ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => overlay.remove());
    const confirm = el('button', 'cmp-btn cmp-btn-danger', 'Delete');
    confirm.type = 'button';
    confirm.addEventListener('click', () => {
      overlay.remove();
      if (backup.checked) exportBackup(targets);
      startUndoWindow(targets);
    });
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    modal.appendChild(actions);

    overlay.appendChild(modal);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
    root.appendChild(overlay);
    confirm.focus();
  }

  function exportBackup(targets) {
    const payload = {
      exported_at: new Date().toISOString(),
      count: targets.length,
      chats: targets.map((c) => ({
        uuid: c.uuid,
        title: c.title,
        updated_at: c.updated ? new Date(c.updated).toISOString() : null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = `chat-backup-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** Nothing is deleted until this countdown expires. */
  function startUndoWindow(targets) {
    let cancelled = false;
    let remaining = Math.ceil(UNDO_MS / 1000);

    const toast = el('div', 'cmp-toast');
    const text = el('span', null, '');
    const undo = el('button', 'cmp-btn cmp-btn-ghost', 'Undo');
    undo.type = 'button';
    undo.addEventListener('click', () => {
      cancelled = true;
      clearInterval(timer);
      toast.remove();
    });
    toast.appendChild(text);
    toast.appendChild(undo);
    root.appendChild(toast);

    const tick = () => {
      text.textContent = `Deleting ${targets.length} chat${targets.length > 1 ? 's' : ''} in ${remaining}s…`;
      if (remaining <= 0) {
        clearInterval(timer);
        toast.remove();
        if (!cancelled) runDelete(targets);
        return;
      }
      remaining -= 1;
    };
    const timer = setInterval(tick, 1000);
    tick();
  }

  async function runDelete(targets) {
    state.busy = true;
    let aborted = false;
    let done = 0;
    const failed = [];

    const toast = el('div', 'cmp-toast');
    const text = el('span', null, '');
    const stop = el('button', 'cmp-btn cmp-btn-ghost', 'Stop');
    stop.type = 'button';
    stop.addEventListener('click', () => { aborted = true; });
    toast.appendChild(text);
    toast.appendChild(stop);
    root.appendChild(toast);

    const progress = () => {
      text.textContent = `Deleting ${done + 1} of ${targets.length}…`;
    };
    progress();
    updateFooter(0);

    for (const chat of targets) {
      if (aborted) break;
      progress();
      try {
        await SITE.remove(chat.uuid);
        state.selected.delete(chat.uuid);
        state.chats = state.chats.filter((c) => c.uuid !== chat.uuid);
        done += 1;
        renderList();
      } catch (err) {
        if (err.retryAfter) {
          // Backed off rather than hammering — then retry this one chat once.
          await sleep(err.retryAfter * 1000);
          try {
            await SITE.remove(chat.uuid);
            state.selected.delete(chat.uuid);
            state.chats = state.chats.filter((c) => c.uuid !== chat.uuid);
            done += 1;
            renderList();
            continue;
          } catch (retryErr) {
            failed.push({ chat, reason: retryErr.message });
          }
        } else {
          failed.push({ chat, reason: err.message });
        }
      }
      await sleep(DELETE_GAP_MS);
    }

    toast.remove();
    state.busy = false;

    // If the open chat was deleted, get off the dead URL.
    const current = location.pathname.match(SITE.hrefPattern);
    if (current && targets.some((c) => c.uuid === current[1] && !failed.find((f) => f.chat.uuid === c.uuid))) {
      location.href = SITE.newChatUrl;
      return;
    }

    showResult(done, failed, aborted);
    renderList();
  }

  function showResult(done, failed, aborted) {
    const toast = el('div', 'cmp-toast cmp-toast-result');
    let msg = `${done} chat${done === 1 ? '' : 's'} deleted`;
    if (aborted) msg += ' (stopped)';
    if (failed.length) msg += ` · ${failed.length} failed`;
    toast.appendChild(el('span', null, msg));

    const dismiss = el('button', 'cmp-btn cmp-btn-ghost', 'OK');
    dismiss.type = 'button';
    dismiss.addEventListener('click', () => toast.remove());
    toast.appendChild(dismiss);
    root.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);

    if (failed.length) {
      console.warn('[Chat Manager Pro] failed deletions:', failed);
    }
  }

  /** Switch the extension on or off for this site, live. */
  function applyEnabled() {
    const next = isEnabled();
    if (next === active) return;
    active = next;

    whenBodyReady(() => {
      if (active) {
        if (!root) buildUI();
        root.style.display = '';
        applyPrivacy();
        applyTheme();
        applyVision();
        applyLock();
        render();
      } else {
        closePanel();
        if (root) root.style.display = 'none';
        applyPrivacy();   // clears the blur classes
        applyTheme();     // clears the appearance classes
        applyVision();    // clears the simulation classes
        applyLock();      // clears the lock class and overlay
      }
    });
  }

  /* ------------------------------------------------------------------ *
   * Panel open/close
   * ------------------------------------------------------------------ */
  function openPanel() {
    state.open = true;
    render();
    if (!state.chats.length && !state.loading) loadChats();
    setTimeout(() => searchInput && searchInput.focus(), 50);
  }

  function closePanel() {
    state.open = false;
    render();
  }

  function togglePanel() {
    if (state.open) closePanel();
    else openPanel();
  }

  /* ------------------------------------------------------------------ *
   * Wiring
   * ------------------------------------------------------------------ */
  // The popup toggles the panel through storage rather than tab messaging,
  // which keeps the extension at a single "storage" permission.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[SIGNAL_KEY] && changes[SIGNAL_KEY].newValue) {
        // Answer the popup either way. Without an acknowledgement a failure to
        // open is silent, which is indistinguishable from the extension not
        // being installed at all.
        if (active) togglePanel();
        try {
          chrome.storage.local.set({
            [ACK_KEY]: {
              ts: changes[SIGNAL_KEY].newValue,
              site: SITE.id,
              active,
              ready: Boolean(root),
            },
          });
        } catch { /* extension context gone */ }
      }
      if (changes[SITES_KEY] && changes[SITES_KEY].newValue) {
        Object.assign(siteEnabled, changes[SITES_KEY].newValue);
        applyEnabled();
      }
      if (changes[VISION_KEY] && changes[VISION_KEY].newValue) {
        Object.assign(vision, VISION_DEFAULTS, changes[VISION_KEY].newValue);
        applyVision();
      }
      if (changes[THEME_KEY] && changes[THEME_KEY].newValue) {
        // Appearance changed in the popup — including a reset.
        Object.assign(theme, THEME_DEFAULTS, changes[THEME_KEY].newValue);
        applyTheme();
      }
      // A disabled site ignores shortcuts; enabled tabs still act on them.
      if (changes[PRIVACY_SIGNAL] && active) togglePrivacy();
      if (changes[LOCK_SIGNAL] && active) requestLock();
      if (changes[LOCK_KEY] && changes[LOCK_KEY].newValue) {
        // Locking or unlocking one tab applies to every Claude tab.
        Object.assign(lock, changes[LOCK_KEY].newValue);
        applyLock();
      }
      if (changes[PRIVACY_KEY] && changes[PRIVACY_KEY].newValue) {
        // Privacy settings changed in the popup — mirror them immediately.
        Object.assign(privacy, changes[PRIVACY_KEY].newValue);
        applyPrivacy();
      }
      if (changes[PREFS_KEY] && changes[PREFS_KEY].newValue) {
        // Defaults changed in the popup — reflect them in an open panel.
        Object.assign(prefs, changes[PREFS_KEY].newValue);
        if (sortSel) sortSel.value = prefs.sort;
        if (filterSel) filterSel.value = prefs.filter;
        renderList();
      }
    });
  } catch { /* extension context unavailable */ }

  document.addEventListener('keydown', (ev) => {
    if (!active) return;
    if (ev.key === 'Escape' && lock.locked) return;
    if (ev.key === 'Escape' && state.open) {
      const overlay = root && root.querySelector('.cmp-modal-overlay');
      if (overlay) overlay.remove();
      else closePanel();
    }
  });

  /** The panel needs <body>; the blur only needs <html>, which always exists. */
  function whenBodyReady(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  loadPrefs().then(() => {
    active = isEnabled();
    if (!active) return;   // switched off for this site — do nothing at all

    // Blur first, and as early as possible. We run at document_start, so this
    // lands before the page paints its content — a privacy tool that flashes
    // the very thing it is meant to hide is worse than no privacy tool.
    applyPrivacy();
    applyTheme();
    // The locked class blurs the page from CSS alone, before any overlay
    // exists — so a reload while locked never exposes content.
    document.documentElement.classList.toggle('cmp-locked', Boolean(lock.locked));
    whenBodyReady(() => {
      buildUI();
      applyPrivacy();   // again, now that the eye button exists
      applyVision();    // needs #cmp-root to exist for the filter defs
      applyLock();
      render();
    });
  });
})();
