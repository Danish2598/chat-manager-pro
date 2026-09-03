/**
 * Chat Manager Pro — site adapters.
 *
 * Everything site-specific lives here. The panel, search, sort, filter,
 * selection, delete pipeline, blur and lock in content.js are site-agnostic and
 * talk only to the interface below.
 *
 * Adding a site means adding one object to SITES — nothing else changes.
 *
 * Each adapter provides:
 *   id, label        identity
 *   host             RegExp matched against location.hostname
 *   newChatUrl       where to go after deleting the conversation you are in
 *   linkSelector     CSS for conversation links, used by the DOM fallback
 *   hrefPattern      extracts a conversation id from a link href
 *   list()           -> [{ uuid, title, summary, updated, created, hasDate }]
 *   remove(uuid)     -> deletes one conversation, throws on failure
 *   resetAuth()      optional; clears cached credentials before one retry
 *
 * A thrown error with `.retryAfter` (seconds) tells the caller it was rate
 * limited and should back off rather than give up.
 */
(() => {
  'use strict';
  if (window.cmpSite !== undefined) return;

  const PAGE_SIZE = 100;
  const MAX_PAGES = 40;

  /** Timestamps arrive as ISO strings or epoch numbers depending on the site. */
  function toMs(value) {
    if (value == null) return null;
    if (typeof value === 'number') {
      // Values below ~1e12 are seconds, not milliseconds.
      return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  async function getJson(url, init) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...init,
      headers: { accept: 'application/json', ...(init && init.headers) },
    });
    if (res.status === 429) {
      const err = new Error('rate limited');
      err.retryAfter = Number(res.headers.get('retry-after')) || 5;
      throw err;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    return res.json();
  }

  function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ================================================================ *
   * Claude — claude.ai
   * Cookie-authenticated REST. Conversations appear on several route
   * prefixes (/chat, /cowork, /code) depending on which surface you are in.
   * ================================================================ */
  const CLAUDE = {
    id: 'claude',
    label: 'Claude',
    host: /(^|\.)claude\.ai$/i,
    newChatUrl: '/new',
    linkSelector: 'a[href^="/chat/"], a[href^="/cowork/"], a[href^="/code/"]',
    hrefPattern: /^\/(?:chat|cowork|code)\/([A-Za-z0-9_-]{8,})/i,

    _org: null,

    resetAuth() { this._org = null; },

    async org() {
      if (this._org) return this._org;
      const cookie = readCookie('lastActiveOrg');
      if (cookie) { this._org = cookie; return cookie; }

      const body = await getJson('/api/organizations');
      const list = Array.isArray(body) ? body : body?.data;
      const found = Array.isArray(list) && list.find((o) => o && o.uuid);
      if (!found) throw new Error('no organization found');
      this._org = found.uuid;
      return this._org;
    },

    normalise(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const uuid = raw.uuid || raw.id;
      if (!uuid) return null;
      const updated = toMs(raw.updated_at ?? raw.updatedAt ?? raw.created_at ?? raw.createdAt);
      return {
        uuid,
        title: String(raw.name || raw.title || '').trim() || 'Untitled chat',
        summary: String(raw.summary || '').trim(),
        updated,
        created: toMs(raw.created_at ?? raw.createdAt),
        hasDate: updated != null,
      };
    },

    async list() {
      const org = await this.org();
      const base = `/api/organizations/${org}/chat_conversations`;
      const seen = new Set();
      const out = [];

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const body = await getJson(`${base}?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`);
        const list = Array.isArray(body) ? body : body?.data;
        if (!Array.isArray(list)) throw new Error('unexpected list shape');

        const batch = list.map((r) => this.normalise(r))
          .filter((c) => c && !seen.has(c.uuid));
        batch.forEach((c) => seen.add(c.uuid));
        out.push(...batch);

        // Stop on a short page, or when paging is ignored and we re-read.
        if (list.length < PAGE_SIZE || batch.length === 0) break;
      }
      return out;
    },

    async remove(uuid) {
      const org = await this.org();
      const res = await fetch(`/api/organizations/${org}/chat_conversations/${uuid}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
      });
      if (res.status === 429) {
        const err = new Error('rate limited');
        err.retryAfter = Number(res.headers.get('retry-after')) || 5;
        throw err;
      }
      // 404 means it is already gone, which is the outcome we wanted.
      if (!res.ok && res.status !== 404) throw new Error(`delete failed (${res.status})`);
      return true;
    },
  };

  /* ================================================================ *
   * ChatGPT — chatgpt.com (and the legacy chat.openai.com)
   * Needs a bearer token from the session endpoint; the cookie alone is
   * not enough. Deletion is a PATCH that clears the visible flag, which
   * is what the site's own delete button does.
   * ================================================================ */
  const CHATGPT = {
    id: 'chatgpt',
    label: 'ChatGPT',
    host: /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i,
    newChatUrl: '/',
    linkSelector: 'a[href^="/c/"], a[href^="/g/"]',
    hrefPattern: /^\/(?:c|g)\/([A-Za-z0-9_-]{8,})/i,

    _token: null,

    resetAuth() { this._token = null; },

    async token() {
      if (this._token) return this._token;
      const session = await getJson('/api/auth/session');
      const token = session && session.accessToken;
      if (!token) throw new Error('not signed in (no access token)');
      this._token = token;
      return token;
    },

    async auth() {
      return { authorization: `Bearer ${await this.token()}` };
    },

    normalise(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const uuid = raw.id || raw.conversation_id || raw.uuid;
      if (!uuid) return null;
      const updated = toMs(raw.update_time ?? raw.updated_at ?? raw.create_time);
      return {
        uuid,
        title: String(raw.title || '').trim() || 'New chat',
        summary: '',
        updated,
        created: toMs(raw.create_time ?? raw.created_at),
        hasDate: updated != null,
      };
    },

    async list() {
      const headers = await this.auth();
      const seen = new Set();
      const out = [];

      for (let page = 0; page < MAX_PAGES; page += 1) {
        const url = `/backend-api/conversations?offset=${page * PAGE_SIZE}`
          + `&limit=${PAGE_SIZE}&order=updated`;
        const body = await getJson(url, { headers });
        const list = body && (body.items || body.data || body.conversations);
        if (!Array.isArray(list)) throw new Error('unexpected list shape');

        const batch = list.map((r) => this.normalise(r))
          .filter((c) => c && !seen.has(c.uuid));
        batch.forEach((c) => seen.add(c.uuid));
        out.push(...batch);

        if (list.length < PAGE_SIZE || batch.length === 0) break;
        if (typeof body.total === 'number' && out.length >= body.total) break;
      }
      return out;
    },

    async remove(uuid) {
      const headers = await this.auth();
      const res = await fetch(`/backend-api/conversation/${uuid}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { ...headers, accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ is_visible: false }),
      });
      if (res.status === 429) {
        const err = new Error('rate limited');
        err.retryAfter = Number(res.headers.get('retry-after')) || 5;
        throw err;
      }
      if (!res.ok && res.status !== 404) throw new Error(`delete failed (${res.status})`);
      return true;
    },
  };

  const SITES = [CLAUDE, CHATGPT];
  window.cmpSites = SITES;
  window.cmpSite = SITES.find((s) => s.host.test(location.hostname)) || null;
})();
