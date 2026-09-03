/**
 * Chat Manager Pro — toolbar popup.
 *
 * Deliberately thin: the real UI is the in-page panel. This is a launcher and
 * a settings surface. Sort and filter deliberately live only in the panel —
 * duplicating them here meant a control whose effect you could not see. It talks to the content script through chrome.storage
 * rather than tab messaging, which is what lets the extension ship with
 * "storage" as its only permission.
 */
'use strict';

const PRIVACY_KEY = 'cmp.privacy';
const LOCK_KEY = 'cmp.lock';
const SITES_KEY = 'cmp.sites';
const THEME_KEY = 'cmp.theme';
const VISION_KEY = 'cmp.vision';
const SIGNAL_KEY = 'cmp.toggleSignal';
const LOCK_SIGNAL = 'cmp.lockSignal';

const SITES_DEFAULTS = { claude: true, chatgpt: true, gemini: true };
const THEME_DEFAULTS = { font: 'system', size: 'medium', density: 'comfortable', accent: 'default' };
const VISION_DEFAULTS = { colorBlind: 'none' };
const PRIVACY_DEFAULTS = {
  on: false, titles: true, messages: true, media: true,
  account: true, input: true, hover: true, strength: 'medium',
};

const $ = (id) => document.getElementById(id);

const openBtn = $('open');

// Privacy controls, keyed by the privacy setting each one drives.
const P = {
  on: $('p-on'),
  titles: $('p-titles'),
  messages: $('p-messages'),
  media: $('p-media'),
  account: $('p-account'),
  input: $('p-input'),
  hover: $('p-hover'),
  strength: $('p-strength'),
};
const optsBox = $('p-opts');

// Per-site switches. The content script reads this and goes fully inert on a
// site that is turned off.
const S = {
  claude: $('s-claude'),
  chatgpt: $('s-chatgpt'),
  gemini: $('s-gemini'),
};

function saveSites() {
  const sites = {};
  Object.entries(S).forEach(([id, node]) => { sites[id] = node.checked; });
  chrome.storage.local.set({ [SITES_KEY]: sites });
  refreshHome();
}

Object.values(S).forEach((node) => node.addEventListener('change', saveSites));

/* ---------- chat list appearance ---------- */
const T = {
  font: $('t-font'),
  size: $('t-size'),
  density: $('t-density'),
  accent: $('t-accent'),
};
const themeMsg = $('t-msg');

/** The popup wears the accent you chose, so the setting shows its own effect. */
function applyAccent(accent) {
  if (accent && accent !== 'default') document.body.dataset.accent = accent;
  else delete document.body.dataset.accent;
}

function saveTheme() {
  const value = {};
  Object.entries(T).forEach(([key, node]) => { value[key] = node.value; });
  chrome.storage.local.set({ [THEME_KEY]: value });
  applyAccent(value.accent);
  themeMsg.textContent = '';
  refreshHome();
}

Object.values(T).forEach((node) => node.addEventListener('change', saveTheme));

// Reset touches appearance only. A colour you dislike should never cost you
// your sort order, blur settings or screen-lock password.
$('t-reset').addEventListener('click', () => {
  Object.entries(T).forEach(([key, node]) => { node.value = THEME_DEFAULTS[key]; });
  applyAccent(THEME_DEFAULTS.accent);
  chrome.storage.local.set({ [THEME_KEY]: { ...THEME_DEFAULTS } }, () => {
    themeMsg.textContent = 'Appearance reset. Other settings untouched.';
  });
});

/* ---------- screen lock ---------- */
const lockUnset = $('lock-unset');
const lockReady = $('lock-ready');
const lockMsg = $('lock-msg');
const lockPw = $('lock-pw');
const lockPw2 = $('lock-pw2');

function showLockState(hasPassword) {
  lockUnset.hidden = hasPassword;
  lockReady.hidden = !hasPassword;
  if (typeof refreshHome === 'function') refreshHome();
}

function say(text, isError) {
  lockMsg.textContent = text;
  lockMsg.classList.toggle('msg-error', Boolean(isError));
}

$('lock-save').addEventListener('click', async () => {
  const a = lockPw.value;
  const b = lockPw2.value;
  if (a.length < 4) return say('Use at least 4 characters.', true);
  if (a !== b) return say('Passwords do not match.', true);

  // window.cmpCrypto stores a PBKDF2 derivation — never the password itself.
  const record = await window.cmpCrypto.create(a);
  chrome.storage.local.set({ [LOCK_KEY]: { record, locked: false } }, () => {
    lockPw.value = '';
    lockPw2.value = '';
    showLockState(true);
    say('Password set.');
  });
});

$('lock-remove').addEventListener('click', () => {
  chrome.storage.local.set({ [LOCK_KEY]: { record: null, locked: false } }, () => {
    showLockState(false);
    say('Password removed.');
  });
});

$('lock-now').addEventListener('click', () => {
  chrome.storage.local.set({ [LOCK_SIGNAL]: Date.now() }, () => window.close());
});

/* ---------- save ---------- */
function savePrivacy() {
  const privacy = {};
  Object.entries(P).forEach(([key, node]) => {
    privacy[key] = node.type === 'checkbox' ? node.checked : node.value;
  });
  chrome.storage.local.set({ [PRIVACY_KEY]: privacy });
  reflectEnabled();
  refreshHome();
}

/** Dim the sub-options when the master switch is off. */
function reflectEnabled() {
  optsBox.classList.toggle('disabled', !P.on.checked);
}

Object.values(P).forEach((node) => node.addEventListener('change', savePrivacy));

/* ---------- view router ---------- */
document.querySelectorAll('[data-goto]').forEach((el) =>
  el.addEventListener('click', () => { document.body.dataset.view = el.dataset.goto; }));
document.querySelectorAll('[data-back]').forEach((el) =>
  el.addEventListener('click', () => {
    document.body.dataset.view = 'home';
    refreshHome();
  }));

/* ---------- home summary ---------- */
// Each home row states its own current setting, so the drill-down never hides
// what is switched on.
const ST = {
  sites: $('st-sites'),
  privacy: $('st-privacy'),
  lock: $('st-lock'),
  appearance: $('st-appearance'),
};

function refreshHome() {
  const onSites = Object.values(S).filter((n) => n.checked).length;
  ST.sites.textContent = `${onSites} of ${Object.keys(S).length} active`;

  const targets = ['titles', 'messages', 'media', 'account', 'input']
    .filter((k) => P[k].checked).length;
  ST.privacy.textContent = P.on.checked
    ? `On · ${targets} of 5 targets · ${P.strength.value}`
    : 'Off';
  $('quick-blur-label').textContent = P.on.checked ? 'Blur on' : 'Blur';
  $('quick-blur').classList.toggle('quick-on', P.on.checked);

  ST.lock.textContent = $('lock-ready').hidden ? 'No password set' : 'Password set';
  $('quick-lock').disabled = $('lock-ready').hidden;

  const parts = [];
  if (T.accent.value !== 'default') parts.push(T.accent.selectedOptions[0].textContent);
  if (T.font.value !== 'system') parts.push(T.font.selectedOptions[0].textContent);
  if (T.size.value !== 'medium') parts.push(T.size.selectedOptions[0].textContent);
  if (T.density.value !== 'comfortable') parts.push(T.density.selectedOptions[0].textContent);
  ST.appearance.textContent = parts.length ? parts.join(' · ') : 'Default';
}

/* ---------- quick actions ---------- */
// The two things worth doing without drilling in.
$('quick-blur').addEventListener('click', () => {
  P.on.checked = !P.on.checked;
  savePrivacy();
});
$('quick-lock').addEventListener('click', () => {
  chrome.storage.local.set({ [LOCK_SIGNAL]: Date.now() }, () => window.close());
});

/* ---------- colour blindness ---------- */
// One radio group, so the browser guarantees a single active simulation even
// if this script never runs. The handler only adds what radios cannot do on
// their own: clicking the active one turns it back off.
const CB = [...document.querySelectorAll('[data-cb]')];
const cbState = $('st-vision');
let cbCurrent = 'none';

function showVision(mode) {
  cbCurrent = mode;
  CB.forEach((node) => { node.checked = node.value === mode; });
  const on = CB.find((n) => n.checked);
  cbState.textContent = on
    ? on.closest('.row').querySelector('.row-title').textContent
    : 'Off';
}

CB.forEach((node) => node.addEventListener('click', () => {
  const mode = cbCurrent === node.value ? 'none' : node.value;
  showVision(mode);
  chrome.storage.local.set({ [VISION_KEY]: { colorBlind: mode } });
}));

/* ---------- launch ---------- */
// Writing a changing value fires storage.onChanged in the content script,
// which toggles the panel. The timestamp guarantees the value always differs.
openBtn.addEventListener('click', () => {
  chrome.storage.local.set({ [SIGNAL_KEY]: Date.now() }, () => window.close());
});

/* ---------- load ---------- */
chrome.storage.local.get([PRIVACY_KEY, LOCK_KEY, SITES_KEY, THEME_KEY, VISION_KEY], (res) => {
  showLockState(Boolean(res && res[LOCK_KEY] && res[LOCK_KEY].record));

  const sites = { ...SITES_DEFAULTS, ...(res && res[SITES_KEY]) };
  Object.entries(S).forEach(([id, node]) => { node.checked = sites[id] !== false; });

  const t = { ...THEME_DEFAULTS, ...(res && res[THEME_KEY]) };
  Object.entries(T).forEach(([key, node]) => { node.value = t[key]; });
  applyAccent(t.accent);

  const v = { ...VISION_DEFAULTS, ...(res && res[VISION_KEY]) };
  showVision(v.colorBlind);
  const privacy = { ...PRIVACY_DEFAULTS, ...(res && res[PRIVACY_KEY]) };
  Object.entries(P).forEach(([key, node]) => {
    if (node.type === 'checkbox') node.checked = Boolean(privacy[key]);
    else node.value = privacy[key];
  });
  reflectEnabled();
  refreshHome();
});
