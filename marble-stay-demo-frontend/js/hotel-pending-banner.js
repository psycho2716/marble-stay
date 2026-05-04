(function (global) {
  /**
   * Demo permit submit: stored in sessionStorage so Dashboard / Rooms / Bookings match in one tab,
   * but cleared on full page reload (F5) so the pending banner shows again. Not persisted across tabs or after closing the browser.
   */
  const SESSION_KEY = "marble_stay_demo_permit_session_v2";
  const LEGACY_STORAGE_PREFIX = "marble_stay_demo_permit_submitted:";

  function navigationWasReload() {
    try {
      var entries = performance.getEntriesByType("navigation");
      var nav = entries && entries[0];
      return Boolean(nav && nav.type === "reload");
    } catch {
      return false;
    }
  }

  try {
    if (navigationWasReload()) {
      global.sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    /* ignore */
  }

  try {
    for (var i = global.localStorage.length - 1; i >= 0; i--) {
      var key = global.localStorage.key(i);
      if (key && key.indexOf(LEGACY_STORAGE_PREFIX) === 0) {
        global.localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }

  function readSubmittedMap() {
    try {
      var raw = global.sessionStorage.getItem(SESSION_KEY);
      if (!raw) return Object.create(null);
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : Object.create(null);
    } catch {
      return Object.create(null);
    }
  }

  function writeSubmittedMap(map) {
    try {
      global.sessionStorage.setItem(SESSION_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }

  const SHIELD_SVG_SKY =
    '<svg class="h-5 w-5 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>';

  function statusOf(hotel) {
    return global.MarbleData.verificationStatusOf(hotel);
  }

  function shouldShowNotice(hotel) {
    if (!hotel) return false;
    const s = statusOf(hotel);
    return s === "pending" || s === "rejected";
  }

  function hasSubmittedPermit(hotelId) {
    var map = readSubmittedMap();
    return map[hotelId] === true;
  }

  function markPermitSubmittedThisSession(hotelId) {
    var map = readSubmittedMap();
    map[hotelId] = true;
    writeSubmittedMap(map);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * @returns {{ st: string, isRejected: boolean, submitted: boolean, showForm: boolean, isPendingSubmitted: boolean }}
   */
  function getPermitState(hotel) {
    const st = statusOf(hotel);
    const isRejected = st === "rejected";
    const submitted = hasSubmittedPermit(hotel.id);
    const showForm = isRejected || (st === "pending" && !submitted);
    const isPendingSubmitted = st === "pending" && submitted;
    return { st, isRejected, submitted, showForm, isPendingSubmitted };
  }

  /**
   * Same card on dashboard, rooms, bookings, etc. after demo permit submit.
   */
  function verificationInProgressCardHtml() {
    return (
      '<section class="rounded-xl border border-border bg-card p-6 shadow-sm">' +
      '<div class="flex items-start gap-4">' +
      '<div class="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100">' +
      SHIELD_SVG_SKY +
      "</div>" +
      '<div class="min-w-0 flex-1">' +
      '<h2 class="text-base font-semibold text-foreground">Verification in Progress</h2>' +
      '<p class="mt-1 text-sm text-muted-foreground">' +
      "Your rooms are hidden from search until our team approves your documents. This usually takes 24–48 hours." +
      "</p>" +
      "</div></div></section>"
    );
  }

  function wireForm(container, hotel, formSelector, remount) {
    const form = container.querySelector(formSelector);
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    const input = form.querySelector('input[type="file"]');
    const msg = form.querySelector("[data-permit-msg]");

    function syncDisabled() {
      const has = input && input.files && input.files.length > 0;
      if (btn) btn.disabled = !has;
    }
    syncDisabled();
    input.addEventListener("change", function () {
      msg.classList.add("hidden");
      syncDisabled();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!input.files || !input.files[0]) return;
      markPermitSubmittedThisSession(hotel.id);
      remount();
    });
  }

  /**
   * @param {{ variant?: 'amber'|'dashboard', footnote?: boolean }} opts
   */
  function mount(container, hotel, opts) {
    opts = opts || {};
    const variant = opts.variant || "amber";
    const footnote =
      opts.footnote !== undefined ? opts.footnote : variant === "amber";

    if (!container) return;
    if (!hotel || !shouldShowNotice(hotel)) {
      container.innerHTML = "";
      return;
    }

    const { isRejected, showForm, isPendingSubmitted } = getPermitState(hotel);

    function remount() {
      mount(container, hotel, opts);
    }

    /* After permit submit: in-progress until reload (sessionStorage cleared on reload). */
    if (isPendingSubmitted && !isRejected) {
      const footHtml = footnote
        ? '<p class="mt-4 text-sm text-muted-foreground">You can add and manage rooms once your hotel is verified and your business permit has been approved.</p>'
        : "";
      container.innerHTML = verificationInProgressCardHtml() + footHtml;
      return;
    }

    if (variant === "dashboard") {
      const title = isRejected ? "Verification declined" : "Verification Required";

      let bodyText = "";
      if (isRejected) {
        bodyText =
          "Your verification was declined. Please submit an updated business/barangay permit below.";
      } else {
        bodyText =
          "Your hotel must be verified by an administrator before you can manage your accommodations and rooms, and before your hotel appears in listings for guests.";
      }

      const formBlock = showForm
        ? '<div id="verification-upload" class="mt-6 rounded-xl border border-slate-200/90 bg-slate-100/90 p-6">' +
          '<div class="mx-auto w-full max-w-3xl">' +
          '<h3 class="text-sm font-semibold text-foreground">Submit legal document (business/barangay permit)</h3>' +
          '<p class="mt-1 text-sm text-muted-foreground">Upload your business permit or barangay permit (PDF or image). This document is required for verification.</p>' +
          '<form id="marble-demo-permit-form-dashboard" class="mt-4 space-y-4">' +
          '<div><label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">File (pdf or image)</label>' +
          '<input type="file" name="permit" accept=".pdf,image/*" class="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border file:border-border file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted" /></div>' +
          '<p data-permit-msg class="hidden text-sm"></p>' +
          '<button type="submit" class="rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600 disabled:pointer-events-none disabled:opacity-50">Submit Document</button>' +
          "</form></div></div>"
        : "";

      container.innerHTML =
        '<section class="rounded-xl border border-border bg-card p-6 shadow-sm">' +
        '<div class="flex items-start gap-4">' +
        '<div class="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100">' +
        SHIELD_SVG_SKY +
        "</div>" +
        '<div class="min-w-0 flex-1">' +
        '<h2 class="text-base font-semibold text-foreground">' +
        escapeHtml(title) +
        "</h2>" +
        '<p class="mt-1 text-sm text-muted-foreground">' +
        escapeHtml(bodyText) +
        "</p>" +
        formBlock +
        "</div></div></section>";

      wireForm(container, hotel, "#marble-demo-permit-form-dashboard", remount);
      return;
    }

    /* amber — initial pending or rejected (not yet resubmitted) */
    const title = isRejected ? "Verification declined" : "Pending verification";

    let bodyText = "";
    if (isRejected) {
      bodyText =
        "Your verification was declined. Please submit an updated business/barangay permit using the form below and an admin will review again.";
    } else {
      bodyText =
        "Your hotel must be verified by an administrator before you can manage your accommodations and rooms, and before your hotel appears in room listings for guests. Please submit your business/barangay permit below.";
    }

    const formBlock = showForm
      ? '<div class="mt-4 rounded-lg border border-amber-200/90 bg-white p-6 shadow-sm">' +
        '<h3 class="text-sm font-semibold text-foreground">Submit legal document (business/barangay permit)</h3>' +
        '<p class="mt-1 text-sm text-muted-foreground">Upload your business permit or barangay permit (PDF or image). This document is required for verification.</p>' +
        '<form id="marble-demo-permit-form-amber" class="mt-4 space-y-3">' +
        '<div><label class="mb-1 block text-sm font-medium text-muted-foreground">File (PDF or image)</label>' +
        '<input type="file" name="permit" accept=".pdf,image/*" class="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-background file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted" /></div>' +
        '<p data-permit-msg class="hidden text-sm"></p>' +
        '<button type="submit" class="rounded-lg bg-slate-500 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50">Submit document</button>' +
        "</form></div>"
      : "";

    const footHtml = footnote
      ? '<p class="mt-4 text-sm text-muted-foreground">You can add and manage rooms once your hotel is verified and your business permit has been approved.</p>'
      : "";

    container.innerHTML =
      '<div class="rounded-xl border border-amber-200 bg-[#FFFBEB] p-6 text-amber-950 shadow-sm">' +
      '<h2 class="text-base font-semibold tracking-tight text-amber-950">' +
      escapeHtml(title) +
      "</h2>" +
      '<p class="mt-2 text-sm leading-relaxed text-amber-900/90">' +
      escapeHtml(bodyText) +
      "</p>" +
      formBlock +
      "</div>" +
      footHtml;

    wireForm(container, hotel, "#marble-demo-permit-form-amber", remount);
  }

  global.MarbleHotelPendingBanner = {
    mount,
    shouldShowNotice,
    hasSubmittedPermit,
    statusOf
  };
})(window);
