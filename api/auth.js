// api/auth.js
// Vercel Serverless Function — handles login, logout, session check.
// Runtime: Node.js (default). No dependencies.

const crypto = require('crypto');

const COOKIE_NAME = 'session';

// Fallback secret — WAJIB diganti lewat env var di production!
// Vercel → Project Settings → Environment Variables → SESSION_SECRET
const FALLBACK_SECRET =
  'insecure-dev-fallback-' + (process.env.VERCEL_URL || 'local');

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload, secret) {
  const data = b64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');
  return data + '.' + sig;
}

function verify(token, secret) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64url');

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header).split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

function setCookie(res, name, val, maxAgeSec) {
  const parts = [
    `${name}=${encodeURIComponent(val)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (maxAgeSec != null) parts.push(`Max-Age=${maxAgeSec}`);
  // Secure hanya kalau di production (biar tetap bisa dites di http localhost)
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function timingEq(a, b) {
  a = String(a);
  b = String(b);
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

module.exports = async (req, res) => {
  const USER = process.env.ADMIN_USER || 'admin';
  const PASS = process.env.ADMIN_PASS || 'admin123';
  const SECRET = process.env.SESSION_SECRET || FALLBACK_SECRET;

  res.setHeader('Cache-Control', 'no-store');

  // ---------- GET /api/auth → current session ----------
  if (req.method === 'GET') {
    const cookies = parseCookies(req.headers.cookie);
    const session = verify(cookies[COOKIE_NAME], SECRET);
    if (!session) return res.status(401).json({ ok: false });
    return res.status(200).json({ ok: true, user: session.user });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  // ---------- Parse body ----------
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};
  const { action } = body;

  // ---------- POST action=logout ----------
  if (action === 'logout') {
    setCookie(res, COOKIE_NAME, '', 0);
    return res.status(200).json({ ok: true });
  }

  // ---------- POST action=login ----------
  if (action === 'login') {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const remember = !!body.remember;

    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'missing_fields' });
    }

    const okUser = timingEq(username, USER);
    const okPass = timingEq(password, PASS);

    if (!okUser || !okPass) {
      // delay kecil untuk memperlambat brute force
      await new Promise((r) => setTimeout(r, 350));
      return res.status(401).json({ ok: false, error: 'invalid_credentials' });
    }

    const maxAgeSec = remember ? 7 * 24 * 3600 : 24 * 3600;
    const token = sign(
      { user: username, exp: Date.now() + maxAgeSec * 1000 },
      SECRET
    );
    setCookie(res, COOKIE_NAME, token, maxAgeSec);
    return res.status(200).json({ ok: true, user: username });
  }

  return res.status(400).json({ ok: false, error: 'unknown_action' });
};
