(function (global) {
  const CURRENCY_SYMBOLS = {
    PHP: "₱",
    USD: "$",
    EUR: "€",
    GBP: "£",
    JPY: "¥",
    KRW: "₩",
    SGD: "S$",
    AUD: "A$"
  };

  function formatNumberCompact(value) {
    if (value == null || value === "") return "0";
    const n =
      typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return "0";
    return new Intl.NumberFormat("en-PH").format(Math.round(n));
  }

  function formatCurrency(value, currencyCode) {
    const code = (currencyCode || "PHP").toUpperCase();
    const sym = CURRENCY_SYMBOLS[code] || code + " ";
    const n =
      typeof value === "number"
        ? value
        : Number(String(value ?? "").replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return sym + "0";
    return sym + formatNumberCompact(n);
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /**
   * Guest hotel detail URL: query + hash with same id (hash is a fallback if ?id= is lost in navigation).
   */
  function hotelDetailHref(hotelId) {
    const raw = String(hotelId || "").trim();
    if (!raw) return "hotel-detail.html";
    const enc = encodeURIComponent(raw);
    return "hotel-detail.html?id=" + enc + "#id=" + enc;
  }

  /**
   * Hotel detail: ?id= or ?hotelId= uuid, or hash #uuid / #id=uuid.
   */
  function getHotelDetailId() {
    const fromQuery = getQueryParam("id") || getQueryParam("hotelId");
    if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();
    const raw = (window.location.hash || "").replace(/^#/, "").trim();
    if (!raw) return null;
    if (raw.toLowerCase().startsWith("id=")) {
      const v = raw.slice(3).split("&")[0];
      return decodeURIComponent(v).trim() || null;
    }
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ) {
      return raw;
    }
    return null;
  }

  /**
   * Guest room detail URL: query + hash with same id (fallback if ?id= is lost in navigation).
   */
  function roomDetailHref(roomId) {
    const raw = String(roomId || "").trim();
    if (!raw) return "room-detail.html";
    const enc = encodeURIComponent(raw);
    return "room-detail.html?id=" + enc + "#id=" + enc;
  }

  /**
   * Room detail: ?id= or ?roomId= uuid, or hash #uuid / #id=uuid.
   */
  function getRoomDetailId() {
    const fromQuery = getQueryParam("id") || getQueryParam("roomId");
    if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();
    const raw = (window.location.hash || "").replace(/^#/, "").trim();
    if (!raw) return null;
    if (raw.toLowerCase().startsWith("id=")) {
      const v = raw.slice(3).split("&")[0];
      return decodeURIComponent(v).trim() || null;
    }
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ) {
      return raw;
    }
    return null;
  }

  /**
   * Guest booking detail: ?id= or ?bookingId=, or hash #id= / #bookingId= / raw uuid.
   */
  function getBookingDetailId() {
    const fromQuery = getQueryParam("id") || getQueryParam("bookingId");
    if (fromQuery && String(fromQuery).trim()) return String(fromQuery).trim();
    const raw = (window.location.hash || "").replace(/^#/, "").trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower.startsWith("id=")) {
      const v = raw.slice(3).split("&")[0];
      return decodeURIComponent(v).trim() || null;
    }
    if (lower.startsWith("bookingid=")) {
      const v = raw.slice(10).split("&")[0];
      return decodeURIComponent(v).trim() || null;
    }
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ) {
      return raw;
    }
    return null;
  }

  function bookingDetailHref(bookingId) {
    const raw = String(bookingId || "").trim();
    if (!raw) return "booking-detail.html";
    const enc = encodeURIComponent(raw);
    return "booking-detail.html?id=" + enc + "#id=" + enc;
  }

  global.MarbleUtils = {
    formatCurrency,
    getQueryParam,
    getHotelDetailId,
    hotelDetailHref,
    getRoomDetailId,
    roomDetailHref,
    getBookingDetailId,
    bookingDetailHref
  };
})(typeof window !== "undefined" ? window : globalThis);
