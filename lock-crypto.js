/**
 * Chat Manager Pro — password hashing for the screen lock.
 *
 * Shared by the popup (which sets the password) and the content script (which
 * verifies it). Loaded into the same isolated world by both, so there is one
 * implementation rather than two copies.
 *
 * The password itself is never stored. We keep a PBKDF2-SHA256 derivation and
 * a random per-password salt, and compare derivations.
 */
(() => {
  'use strict';
  if (window.cmpCrypto) return;

  const ITERATIONS = 150000;
  const encoder = new TextEncoder();

  const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));

  function fromB64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function derive(password, salt, iterations) {
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256
    );
    return toB64(new Uint8Array(bits));
  }

  window.cmpCrypto = {
    /** Build a storable record for a new password. */
    async create(password) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      return {
        salt: toB64(salt),
        hash: await derive(password, salt, ITERATIONS),
        iterations: ITERATIONS,
      };
    },

    /** Check a candidate password against a stored record. */
    async verify(password, record) {
      if (!record || !record.salt || !record.hash) return false;
      const candidate = await derive(
        password, fromB64(record.salt), record.iterations || ITERATIONS
      );
      // Length-independent compare, so timing does not leak the hash.
      if (candidate.length !== record.hash.length) return false;
      let diff = 0;
      for (let i = 0; i < candidate.length; i += 1) {
        diff |= candidate.charCodeAt(i) ^ record.hash.charCodeAt(i);
      }
      return diff === 0;
    },
  };
})();
