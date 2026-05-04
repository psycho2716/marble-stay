(function (global) {
  const SESSION_KEY = "marble_stay_session";
  const REGISTRY_KEY = "marble_stay_accounts";
  const GUEST_PREFS_KEY = "marble_stay_guest_prefs";
  const GUEST_PROFILE_KEY = "marble_stay_guest_profile";

  function getBase() {
    return document.body?.dataset?.base || "";
  }

  function p(path) {
    const b = getBase();
    const clean = path.replace(/^\//, "");
    return (b ? b + "/" : "") + clean;
  }

  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(s) {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  }

  function logout() {
    setSession(null);
    window.location.href = p("index.html");
  }

  function getRegistry() {
    try {
      const raw = localStorage.getItem(REGISTRY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveRegistry(list) {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  }

  async function ensureSeededUsers(appData) {
    const reg = getRegistry();
    const seed = appData.seedUsers || [];
    const have = new Set(reg.map((u) => u.email.toLowerCase()));
    let changed = false;
    const next = reg.slice();
    for (let i = 0; i < seed.length; i++) {
      const u = seed[i];
      const em = u.email.toLowerCase();
      if (!have.has(em)) {
        next.push({ ...u });
        have.add(em);
        changed = true;
      }
    }
    if (changed) saveRegistry(next);
  }

  function findUser(email, password) {
    const e = email.trim().toLowerCase();
    return getRegistry().find(
      (u) => u.email.toLowerCase() === e && u.password === password
    );
  }

  function login(email, password) {
    const u = findUser(email, password);
    if (!u) return { ok: false, error: "Invalid credentials" };
    setSession({
      userId: u.id,
      email: u.email,
      role: u.role,
      fullName: u.fullName,
      hotelId: u.hotelId || null,
      onboardingComplete: Boolean(u.onboardingComplete)
    });
    return { ok: true };
  }

  function requireGuest(redirectToLogin) {
    const s = getSession();
    if (!s) {
      window.location.href = p(redirectToLogin || "login.html");
      return null;
    }
    if (s.role !== "guest") {
      window.location.href = p("index.html");
      return null;
    }
    return s;
  }

  function requireHotel() {
    const s = getSession();
    if (!s || s.role !== "hotel") {
      window.location.href = p("login.html");
      return null;
    }
    return s;
  }

  function requireAdmin() {
    const s = getSession();
    if (!s || s.role !== "admin") {
      window.location.href = p("login.html");
      return null;
    }
    return s;
  }

  function completeOnboardingForSession() {
    const s = getSession();
    if (!s) return;
    const reg = getRegistry().map((u) =>
      u.id === s.userId ? { ...u, onboardingComplete: true } : u
    );
    saveRegistry(reg);
    setSession({ ...s, onboardingComplete: true });
  }

  function getGuestProfile() {
    try {
      const raw = localStorage.getItem(GUEST_PROFILE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function setGuestProfile(obj) {
    localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify(obj));
  }

  /** Sync name (and optional password) on the signed-in registry user for demo persistence. */
  function updateRegistryUser(partial) {
    const s = getSession();
    if (!s) return;
    const reg = getRegistry().map((u) => (u.id === s.userId ? { ...u, ...partial } : u));
    saveRegistry(reg);
    if (partial.fullName != null) setSession({ ...s, fullName: partial.fullName });
  }

  global.MarbleAuth = {
    SESSION_KEY,
    getSession,
    setSession,
    logout,
    getRegistry,
    ensureSeededUsers,
    login,
    requireGuest,
    requireHotel,
    requireAdmin,
    completeOnboardingForSession,
    path: p,
    getGuestPrefs: () => {
      try {
        const r = localStorage.getItem(GUEST_PREFS_KEY);
        return r ? JSON.parse(r) : null;
      } catch {
        return null;
      }
    },
    setGuestPrefs: (obj) => localStorage.setItem(GUEST_PREFS_KEY, JSON.stringify(obj)),
    getGuestProfile,
    setGuestProfile,
    updateRegistryUser
  };
})(window);
