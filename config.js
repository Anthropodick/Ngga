/* =========================================================
   KONFIGURASI APP — EDIT DI SINI AJA
   Tinggal tambah/ubah user di array `users` di bawah.
   ========================================================= */
window.APP_CONFIG = {
  // ---------- USER & PASSWORD ----------
  users: [
    {
      username: 'admin',
      password: 'admin123',
      role: 'Admin',
      banned: false,
      bannedReason: ''
    },
    {
      username: 'user',
      password: 'user123',
      role: 'User',
      banned: false,
      bannedReason: ''
    },
    // CONTOH USER BANNED — untuk testing UI banned
    {
      username: 'banned',
      password: 'banned123',
      role: 'User',
      banned: true,
      bannedReason: 'Too many device'
    }
  ],

  // ---------- SESSION ----------
  sessionKey: 'app_session_v1',
  sessionHours: 24,

  // ---------- CREDIT ----------
  defaultCredits: 1,
  weeklyDays: 7,

  // ---------- ADMIN CUSTOM CREDIT ----------
  adminCustomCredit: {
    enabled: true,
    maxAmount: 999,
    minAmount: 0,
    presets: [5, 10, 25, 50, 100],
    allowDirectSet: true,
    allowReset: true
  }
};

/* =========================================================
   HELPER AUTH
   ========================================================= */
window.Auth = (function () {
  const CFG = window.APP_CONFIG;
  const KEY = CFG.sessionKey;

  function getUser() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.user || !s.exp) return null;
      if (Date.now() > s.exp) { localStorage.removeItem(KEY); return null; }
      return s;
    } catch { return null; }
  }

  function findUser(username) {
    return CFG.users.find(function(x){ return x.username === username; }) || null;
  }

  function login(username, password, remember) {
    const u = CFG.users.find(
      (x) => x.username === username && x.password === password
    );
    if (!u) return { ok: false };

    // Cek status banned SEBELUM kasih session
    if (u.banned) {
      return {
        ok: false,
        banned: true,
        user: u.username,
        reason: u.bannedReason || 'No reason provided'
      };
    }

    const hours = remember ? CFG.sessionHours * 7 : CFG.sessionHours;
    const session = {
      user: u.username,
      role: u.role,
      exp: Date.now() + hours * 3600 * 1000
    };
    try { localStorage.setItem(KEY, JSON.stringify(session)); } catch {}
    return { ok: true, user: u };
  }

  function logout() {
    try { localStorage.removeItem(KEY); } catch {}
  }

  function requireLogin() {
    const s = getUser();
    if (!s) { location.replace('login.html'); return null; }
    return s;
  }

  function redirectIfLoggedIn() {
    const s = getUser();
    if (s) { location.replace('index.html'); return true; }
    return false;
  }

  function isAdmin() {
    const s = getUser();
    return !!(s && s.role === 'Admin');
  }

  return { getUser, findUser, login, logout, requireLogin, redirectIfLoggedIn, isAdmin };
})();

/* =========================================================
   HELPER CREDIT
   ========================================================= */
window.Credit = (function () {
  const CFG = window.APP_CONFIG;

  function keyFor(user) { return 'app_credit_' + user; }

  function load(user) {
    try {
      const raw = localStorage.getItem(keyFor(user));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function save(user, state) {
    try { localStorage.setItem(keyFor(user), JSON.stringify(state)); } catch {}
  }

  function init(user) {
    let s = load(user);
    if (!s) {
      s = {
        credits: CFG.defaultCredits,
        lastClaim: 0,
        history: [
          { type: 'welcome', amount: CFG.defaultCredits, at: Date.now() }
        ]
      };
      save(user, s);
    }
    return s;
  }

  function getRemainingMs(user) {
    const s = init(user);
    const gap = CFG.weeklyDays * 24 * 3600 * 1000;
    const remaining = gap - (Date.now() - s.lastClaim);
    return Math.max(0, remaining);
  }

  function claim(user) {
    const s = init(user);
    const remaining = getRemainingMs(user);
    if (s.credits > 0 && remaining > 0) {
      return { ok: false, remaining };
    }
    s.credits += 1;
    s.lastClaim = Date.now();
    s.history.unshift({ type: 'weekly', amount: 1, at: Date.now() });
    if (s.history.length > 20) s.history.length = 20;
    save(user, s);
    return { ok: true, state: s };
  }

  function setCredits(user, amount, actor) {
    const cfg = CFG.adminCustomCredit;
    if (!cfg || !cfg.enabled) return { ok: false, error: 'disabled' };
    amount = parseInt(amount, 10);
    if (isNaN(amount)) return { ok: false, error: 'invalid' };
    if (amount < cfg.minAmount) return { ok: false, error: 'too_low' };
    if (amount > cfg.maxAmount) return { ok: false, error: 'too_high' };

    const s = init(user);
    const diff = amount - s.credits;
    s.credits = amount;
    s.history.unshift({
      type: 'admin', amount: diff, at: Date.now(),
      by: actor || 'admin', note: 'Set by admin'
    });
    if (s.history.length > 20) s.history.length = 20;
    save(user, s);
    return { ok: true, state: s, diff };
  }

  function addCredits(user, amount, actor) {
    const cfg = CFG.adminCustomCredit;
    if (!cfg || !cfg.enabled) return { ok: false, error: 'disabled' };
    amount = parseInt(amount, 10);
    if (isNaN(amount) || amount <= 0) return { ok: false, error: 'invalid' };

    const s = init(user);
    const newTotal = s.credits + amount;
    if (newTotal > cfg.maxAmount) return { ok: false, error: 'too_high' };
    s.credits = newTotal;
    s.history.unshift({
      type: 'admin', amount: amount, at: Date.now(),
      by: actor || 'admin', note: 'Added by admin'
    });
    if (s.history.length > 20) s.history.length = 20;
    save(user, s);
    return { ok: true, state: s, added: amount };
  }

  function resetCredits(user, actor) {
    const cfg = CFG.adminCustomCredit;
    if (!cfg || !cfg.enabled || !cfg.allowReset) return { ok: false, error: 'disabled' };
    const s = init(user);
    const diff = CFG.defaultCredits - s.credits;
    s.credits = CFG.defaultCredits;
    s.history.unshift({
      type: 'admin', amount: diff, at: Date.now(),
      by: actor || 'admin', note: 'Reset by admin'
    });
    if (s.history.length > 20) s.history.length = 20;
    save(user, s);
    return { ok: true, state: s };
  }

  function isAdminCreditEnabled() {
    return !!(CFG.adminCustomCredit && CFG.adminCustomCredit.enabled);
  }

  return {
    load, save, init, claim, getRemainingMs,
    setCredits, addCredits, resetCredits, isAdminCreditEnabled
  };
})();
