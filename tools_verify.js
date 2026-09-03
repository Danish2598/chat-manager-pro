/**
 * Chat Manager Pro — read-only diagnostic.
 *
 * Paste into the DevTools console on an open, signed-in claude.ai or
 * chatgpt.com tab. It detects which site it is on.
 * It reports whether the endpoints and selectors the extension relies on
 * actually match this build of the site.
 *
 * SAFE: this only reads. It never deletes, modifies or sends anything.
 * The selector lists below mirror CFG in content.js and the PRIVACY BLUR
 * block in content.css — if you edit those, edit these to match.
 */
(async () => {
  const pass = (m, d) => console.log('%c PASS ', 'background:#2f7d55;color:#fff', m, d ?? '');
  const warn = (m, d) => console.log('%c WARN ', 'background:#8a6d1f;color:#fff', m, d ?? '');
  const fail = (m, d) => console.log('%c FAIL ', 'background:#a93831;color:#fff', m, d ?? '');
  const head = (m) => console.log(`\n%c${m}`, 'font-weight:bold;font-size:13px');

  const cookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };

  head('1. Extension loaded');
  if (window.__cmpLoaded) pass('content script is running');
  else fail('content script NOT running — reload the tab after installing');
  if (document.getElementById('cmp-root')) pass('panel container injected');
  else warn('panel container missing (expected if the script failed to load)');

  head('2. Site adapter');
  const SITE = window.cmpSite;
  if (!SITE) {
    fail('no adapter matched this host', location.hostname);
    console.log('   Supported hosts are claude.ai, chatgpt.com, chat.openai.com.');
  } else {
    pass('adapter resolved', `${SITE.label} (${SITE.id})`);
    if (SITE.canDelete === false) warn('this site does not support bulk delete', SITE.deleteNote);
    if (SITE.domOnly) warn('this site has no API — the sidebar is the only source');
  }

  head('3. Conversation list');
  if (!SITE) {
    fail('skipped — no adapter');
  } else if (SITE.domOnly) {
    const found = document.querySelectorAll(SITE.linkSelector).length;
    (found ? pass : fail)(`sidebar scrape matched ${found} element(s)`);
    if (!found) console.log(`   Fix linkSelector for ${SITE.id} in sites.js.`);
  } else {
    try {
      const list = await SITE.list();
      pass(`returned ${list.length} conversations`);
      const s = list[0];
      if (!s) {
        warn('list is empty — create a chat and re-run');
      } else {
        console.log('   sample record:', s);
        [['uuid', s.uuid], ['title', s.title]].forEach(([k, v]) =>
          v ? pass(`field "${k}" present`, v)
            : fail(`field "${k}" MISSING — fix normalise() in sites.js`));
        if (s.hasDate) pass('timestamps present — sorting and date filter work');
        else warn('no timestamp — sort-by-date and the date filter will not work');
      }
    } catch (e) {
      fail('list failed — the extension will fall back to DOM mode', e.message);
      console.log('   Fix the adapter for this site in sites.js.');
    }
  }

  head('4. Delete endpoint (shape only — nothing is deleted)');
  if (SITE) {
    console.log(`   ${SITE.label} deletions go through SITE.remove() in sites.js`);
    warn('cannot be verified read-only. Test it on ONE throwaway chat first.');
  }

  head('5. Blur selectors — how many elements each one matches here');
  const targets = {
    'chat titles':   ['a[href^="/chat/"]', 'a[href^="/cowork/"]', 'a[href^="/code/"]',
                      'a[href^="/project/"]', 'a[href^="/projects/"]',
                      'a[href^="/artifacts/"]', 'a[href^="/recents/"]',
                      'a[href^="/c/"]', 'a[href^="/g/"]',
                      'a[href^="/app/"]', '[data-test-id="conversation"]',
                      '.conversation-title', '.conversation'],
    'messages':      ['[data-testid="user-message"]', '[data-testid="assistant-message"]',
                      '[data-testid="chat-message"]', '.font-claude-message', 'main .prose',
                      '[data-message-author-role]', '[data-testid^="conversation-turn"]',
                      'main .markdown', 'message-content', '.model-response-text',
                      'user-query-content', '.query-text'],
    'media':         ['main img', 'main video', 'main canvas', '[data-testid="file-thumbnail"]'],
    'account':       ['[data-testid="user-menu-button"]', '[data-testid="account-menu"]',
                      'nav footer', 'aside footer', '[data-testid="profile-button"]',
                      '[data-testid="accounts-profile-button"]', '.user-name',
                      '[aria-label^="Google Account"]'],
    'message input': ['main [contenteditable="true"]', 'main .ProseMirror', 'main textarea',
                      '[data-testid="chat-input"]', 'fieldset [contenteditable="true"]',
                      '#prompt-textarea', '#composer-background [contenteditable="true"]',
                      'rich-textarea', '.ql-editor'],
  };

  for (const [label, sels] of Object.entries(targets)) {
    let total = 0;
    const hits = sels.map((s) => {
      let n = 0;
      try { n = document.querySelectorAll(s).length; } catch { n = -1; }
      total += Math.max(n, 0);
      return `${s} → ${n < 0 ? 'invalid' : n}`;
    });
    (total > 0 ? pass : fail)(`${label}: ${total} element(s) matched`);
    hits.forEach((h) => console.log('     ', h));
    if (total === 0) {
      console.log(`      %cNo match. Open the relevant view, re-run, and if still zero,`
        + ` add a working selector to the "${label}" list in content.css.`,
        'color:#a93831');
    }
  }

  head('6. Route census — every internal link on this page, by first path segment');
  console.log('   Any row with a count that is NOT covered by the "chat titles"');
  console.log('   selectors above is a surface whose titles will stay unblurred.');
  const census = {};
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    const parts = (a.getAttribute('href') || '').split('/');
    const seg = parts[1] || '(root)';
    const hasId = parts.length > 2 && parts[2].length > 0;
    const key = hasId ? `/${seg}/<id>` : `/${seg}`;
    census[key] = (census[key] || 0) + 1;
  });
  const rows = Object.entries(census).sort((a, b) => b[1] - a[1]);
  if (rows.length) console.table(Object.fromEntries(rows));
  else warn('no internal links found — is the sidebar collapsed?');

  head('Done');
  console.log('Re-run on each site and surface you use. Claude renders different');
  console.log('sidebars at /chat, /code and /cowork; ChatGPT uses /c and /g.');
})();
