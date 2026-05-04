(function (global) {
  const LOGO_SVG = `
<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="4" y="4" width="6" height="24" rx="2" fill="#0f172a"/>
  <rect x="13" y="8" width="6" height="16" rx="2" fill="#0f172a"/>
  <rect x="22" y="6" width="6" height="20" rx="2" fill="#0f172a"/>
</svg>`;

  function getBase() {
    return document.body?.dataset?.base || "";
  }

  function p(path) {
    const b = getBase();
    const clean = path.replace(/^\//, "");
    return (b ? b + "/" : "") + clean;
  }

  function navLink(href, label, active) {
    const cls = active
      ? "border-b-2 border-foreground text-foreground"
      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground";
    return `<a href="${href}" class="px-1 py-4 text-sm font-medium transition ${cls}">${label}</a>`;
  }

  function brandHref(role) {
    if (role === "admin") return p("admin/verification.html");
    return p("index.html");
  }

  function logoBlock(href, role) {
    let suffix = "";
    if (role === "hotel") suffix = '<span class="text-primary font-bold"> · Hotel</span>';
    else if (role === "guest") suffix = '<span class="text-primary font-bold"> · Guest</span>';
    else if (role === "admin") suffix = '<span class="text-primary font-bold"> · Admin</span>';
    return `<a href="${href}" class="inline-flex items-center text-foreground">
      ${LOGO_SVG}
      <span class="ml-2 text-xl font-bold tracking-tight"><span class="text-primary">Marble Stay</span>${suffix}</span>
    </a>`;
  }

  const NOTIFICATIONS_EMPTY_SVG = `<svg class="h-8 w-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.75" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>`;

  function notificationsDropdown() {
    return `<div class="marble-notifications-dropdown relative">
      <button type="button" class="marble-notifications-dropdown-btn inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-expanded="false" aria-haspopup="dialog" aria-label="Open notifications">
        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
      </button>
      <div class="marble-notifications-dropdown-panel hidden absolute right-0 z-[60] mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-xl" role="dialog" aria-label="Notifications">
        <div class="border-b border-border px-4 py-3.5">
          <h2 class="text-sm font-bold text-foreground">Notifications</h2>
        </div>
        <div class="flex flex-col items-center px-6 py-10 text-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            ${NOTIFICATIONS_EMPTY_SVG}
          </div>
          <p class="mt-5 max-w-[16rem] text-sm leading-relaxed text-muted-foreground">
            No notifications yet. Booking updates and messages will appear here.
          </p>
        </div>
      </div>
    </div>`;
  }

  function chevron() {
    return `<svg class="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>`;
  }

  function userMenu(profileHref, email) {
    return `<div class="marble-user-dropdown relative">
      <button type="button" class="marble-user-dropdown-btn inline-flex items-center gap-2 rounded-full px-2 py-1.5 text-sm font-medium text-foreground transition hover:bg-muted">
        <span class="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-primary/10">
          <img src="https://loremflickr.com/64/64/people,portrait?lock=99001" alt="" width="32" height="32" class="h-8 w-8 object-cover" />
        </span>
        ${chevron()}
      </button>
      <div class="marble-user-dropdown-panel hidden absolute right-0 z-50 mt-1 w-60 rounded-md border border-border bg-card py-1 shadow-lg">
        <div class="px-3 py-2">
          <span class="block text-[11px] font-semibold tracking-wide text-muted-foreground">SIGNED IN AS</span>
          <span class="mt-1 block truncate text-sm font-semibold text-foreground">${email || ""}</span>
        </div>
        <hr class="border-border" />
        <a href="${profileHref}" class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted">Profile</a>
        <hr class="border-border" />
        <button type="button" data-marble-logout class="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-muted">Logout</button>
      </div>
    </div>`;
  }

  function wireDropdowns(root) {
    function closeNotificationPanels() {
      root.querySelectorAll(".marble-notifications-dropdown-panel").forEach((p) => p.classList.add("hidden"));
    }
    function closeUserPanels() {
      root.querySelectorAll(".marble-user-dropdown-panel").forEach((p) => p.classList.add("hidden"));
    }

    root.querySelectorAll(".marble-notifications-dropdown").forEach((wrap) => {
      const btn = wrap.querySelector(".marble-notifications-dropdown-btn");
      const panel = wrap.querySelector(".marble-notifications-dropdown-panel");
      if (!btn || !panel) return;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeUserPanels();
        panel.classList.toggle("hidden");
        btn.setAttribute("aria-expanded", panel.classList.contains("hidden") ? "false" : "true");
      });
      document.addEventListener("click", function closeNotifications(e) {
        if (!wrap.contains(e.target)) {
          panel.classList.add("hidden");
          btn.setAttribute("aria-expanded", "false");
        }
      });
    });

    root.querySelectorAll(".marble-user-dropdown").forEach((wrap) => {
      const btn = wrap.querySelector(".marble-user-dropdown-btn");
      const panel = wrap.querySelector(".marble-user-dropdown-panel");
      if (!btn || !panel) return;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeNotificationPanels();
        root.querySelectorAll(".marble-notifications-dropdown-btn").forEach((b) => b.setAttribute("aria-expanded", "false"));
        panel.classList.toggle("hidden");
      });
      document.addEventListener("click", function closeMenu(e) {
        if (!wrap.contains(e.target)) panel.classList.add("hidden");
      });
    });
    root.querySelectorAll("[data-marble-logout]").forEach((el) => {
      el.addEventListener("click", () => MarbleAuth.logout());
    });
  }

  /**
   * @param {{
   *   area: 'public'|'guest'|'hotel'|'admin'|'auto',
   *   active?: string,
   *   hideFooter?: boolean,
   *   isHotelSection?: boolean
   * }} opts
   */
  function mount(opts) {
    const headerEl = document.getElementById("marble-header");
    const footerEl = document.getElementById("marble-footer");
    const session = MarbleAuth.getSession();
    const active = opts.active || window.location.pathname;

    let area = opts.area;
    if (area === "auto") {
      if (session?.role === "admin") area = "public";
      else if (session?.role === "hotel")
        area = opts.isHotelSection ? "hotel" : "guest";
      else if (session?.role === "guest") area = "guest";
      else area = "public";
    }

    const email = session?.email || "";
    let headerHtml = "";

    if (area === "admin") {
      const links = [
        ["admin/verification.html", "Verification"],
        ["admin/users.html", "Users"],
        ["admin/hotels.html", "Hotels"]
      ];
      const nav = links
        .map(([href, label]) => {
          const full = p(href);
          const is =
            active.includes(href.replace(".html", "")) ||
            (label === "Verification" && active.includes("verification"));
          return `<a href="${full}" class="relative px-4 py-4 text-sm font-medium transition-colors ${
            is ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }">${label}</a>`;
        })
        .join("");
      headerHtml = `<header class="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur-sm">
        <div class="mx-auto flex h-14 max-w-6xl items-center px-4">
          <div class="flex min-w-0 flex-1 items-center">${logoBlock(brandHref("admin"), "admin")}</div>
          <nav class="hidden items-center gap-1 md:flex" aria-label="Admin">${nav}</nav>
          <div class="flex flex-1 justify-end">${userMenu(p("admin/verification.html"), email)}</div>
        </div>
      </header>`;
    } else if (area === "hotel" && session?.role === "hotel") {
      const profileHref = p("hotel/profile.html");
      headerHtml = `<header class="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
        <div class="mx-auto flex h-14 max-w-6xl items-center px-4">
          <div class="flex flex-1 items-center">${logoBlock(p("index.html"), "hotel")}</div>
          <div class="flex items-center gap-4">
            <nav class="flex items-center gap-8">
              ${navLink(p("hotel/dashboard.html"), "Dashboard", active.includes("dashboard"))}
              ${navLink(p("hotel/rooms.html"), "Rooms", active.includes("rooms"))}
              ${navLink(p("hotel/bookings.html"), "Bookings", active.includes("bookings"))}
            </nav>
            <div class="h-7 w-px bg-border"></div>
            <div class="flex items-center gap-2">${notificationsDropdown()}${userMenu(profileHref, email)}</div>
          </div>
        </div>
      </header>`;
    } else if (area === "guest" && session && (session.role === "guest" || session.role === "hotel")) {
      const profileHref =
        session.role === "hotel" ? p("hotel/profile.html") : p("profile.html");
      const isHome =
        active.endsWith("index.html") ||
        active.endsWith("/") ||
        /\/marble-stay-demo-frontend\/?$/.test(active);
      headerHtml = `<header class="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
        <div class="mx-auto flex h-14 max-w-6xl items-center px-4">
          <div class="flex flex-1 items-center">${logoBlock(p("index.html"), "guest")}</div>
          <div class="flex items-center gap-4">
            <nav class="flex items-center gap-8">
              ${navLink(p("index.html"), "Home", isHome)}
              ${navLink(p("recommendations.html"), "For you", active.includes("recommendations"))}
              ${navLink(p("bookings.html"), "My Bookings", active.includes("bookings"))}
            </nav>
            <div class="h-7 w-px bg-border"></div>
            <div class="flex items-center gap-2">${notificationsDropdown()}${userMenu(profileHref, email)}</div>
          </div>
        </div>
      </header>`;
    } else {
      const isHome =
        active.endsWith("index.html") ||
        active.endsWith("/") ||
        /\/marble-stay-demo-frontend\/?$/.test(active);
      headerHtml = `<header class="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur-sm">
        <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <div class="flex flex-1 items-center">${logoBlock(p("index.html"), "")}</div>
          <div class="flex items-center gap-4">
            <nav class="flex items-center gap-6">
              ${navLink(p("index.html"), "Home", isHome)}
              ${navLink(p("login.html"), "Login", active.includes("login"))}
            </nav>
            <a href="${p("accounts.html")}" class="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted">Demo accounts</a>
          </div>
        </div>
      </header>`;
    }

    if (headerEl) {
      headerEl.innerHTML = headerHtml;
      wireDropdowns(headerEl);
    }

    if (opts.hideFooter || !footerEl) return;

    footerEl.classList.add("mt-auto");

    if (area === "admin") {
      footerEl.innerHTML = `<footer class="border-t border-border bg-card py-6 text-center text-sm text-muted-foreground">
        <p>© ${new Date().getFullYear()} Marble Stay Admin</p>
      </footer>`;
      return;
    }

    footerEl.innerHTML = `<footer class="flex flex-col items-center gap-4 border-t border-border bg-card py-6">
      <div class="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-4 sm:flex-row sm:gap-10">
        ${logoBlock(p("index.html"), "")}
        <nav class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground" aria-label="Footer">
          <span class="cursor-default hover:text-foreground">Privacy</span>
          <span class="cursor-default hover:text-foreground">Terms</span>
          <span class="cursor-default hover:text-foreground">Support</span>
          <span class="cursor-default hover:text-foreground">Contact</span>
        </nav>
      </div>
      <p class="shrink-0 text-center text-sm text-muted-foreground">© ${new Date().getFullYear()} Marble Stay. All rights reserved.</p>
    </footer>`;
  }

  global.MarbleChrome = { mount, p, LOGO_SVG };
})(window);
