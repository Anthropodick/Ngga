/* =========================================================
   KONFIGURASI APP — EDIT DI SINI AJA
   Tinggal tambah/ubah user di array `users` di bawah.
   ========================================================= */
window.APP_CONFIG = {
  // ---------- USER & PASSWORD ----------
  users: [
    { username: 'admin', password: 'admin123', role: 'Admin' },
    { username: 'user',  password: 'user123',  role: 'User'  }
  ],

  // ---------- SESSION ----------
  sessionKey: 'app_session_v1',
  sessionHours: 24,          // berapa jam login bertahan

  // ---------- CREDIT ----------
  defaultCredits: 1,         // credit awal waktu pertama daftar
  weeklyDays: 7              // jeda claim mingguan (hari)
};

/* =========================================================
   HELPER AUTH — jangan perlu diubah
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

  function login(username, password, remember) {
    const u = CFG.users.find(
      (x) => x.username === username && x.password === password
    );
    if (!u) return { ok: false };

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

  // Redirect ke login.html kalau belum login
  function requireLogin() {
    const s = getUser();
    if (!s) { location.replace('login.html'); return null; }
    return s;
  }

  // Kalau sudah login, redirect ke index.html (dipakai di login.html)
  function redirectIfLoggedIn() {
    const s = getUser();
    if (s) { location.replace('index.html'); return true; }
    return false;
  }

  return { getUser, login, logout, requireLogin, redirectIfLoggedIn };
})();

/* =========================================================
   HELPER CREDIT — per user, disimpan di localStorage
   ========================================================= */
window.Credit = (function () {
  const CFG = window.APP_CONFIG;

  function keyFor(user) {
    return 'app_credit_' + user;
  }

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

  return { load, save, init, claim, getRemainingMs };
})();
