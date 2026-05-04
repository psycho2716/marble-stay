(function (global) {
  let cache = null;

  async function loadData() {
    if (cache) return cache;
    const base = document.body?.dataset?.base || "";
    const path = `${base ? base + "/" : ""}data/listings.json`.replace(/\/+/g, "/");
    const res = await fetch(path);
    if (!res.ok) throw new Error("Failed to load listings");
    cache = await res.json();
    return cache;
  }

  function hotelById(data, id) {
    return data.hotels.find((h) => h.id === id) || null;
  }

  function roomsForHotel(data, hotelId) {
    return data.rooms.filter((r) => r.hotelId === hotelId);
  }

  function roomById(data, id) {
    return data.rooms.find((r) => r.id === id) || null;
  }

  function getExtraBookings() {
    try {
      const raw = localStorage.getItem("marble_stay_bookings_local");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function allBookings(data) {
    return (data.bookings || []).concat(getExtraBookings());
  }

  function bookingsForUser(data, userId) {
    const u = String(userId ?? "").trim();
    return allBookings(data).filter((b) => String(b.userId ?? "").trim() === u);
  }

  function normalizeBookingId(id) {
    return String(id ?? "")
      .trim()
      .toLowerCase();
  }

  function bookingById(data, id) {
    const want = normalizeBookingId(id);
    if (!want) return null;
    return (
      allBookings(data).find((b) => normalizeBookingId(b.id) === want) || null
    );
  }

  function verificationStatusOf(hotel) {
    try {
      const o = JSON.parse(localStorage.getItem("marble_stay_hotel_verification") || "{}");
      const override = o[hotel.id];
      return override || hotel.verificationStatus;
    } catch {
      return hotel.verificationStatus;
    }
  }

  function verifiedHotels(data) {
    return data.hotels.filter((h) => verificationStatusOf(h) === "verified");
  }

  function topRatedHotels(data, limit) {
    const v = verifiedHotels(data)
      .map((h) => {
        const s = hotelRatingSummary(data, h.id);
        return { hotel: h, average: s.average, count: s.count };
      })
      .filter((x) => x.count > 0 && x.average != null)
      .sort((a, b) => (b.average || 0) - (a.average || 0));
    return v.slice(0, limit || 8).map((x) => x.hotel);
  }

  const DEMO_ROOM_REVIEWS_KEY = "marble_stay_demo_room_reviews";

  function getDemoRoomReviews() {
    try {
      const raw = localStorage.getItem(DEMO_ROOM_REVIEWS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  /**
   * Persist a guest review in localStorage (demo only; merges with listings.json roomReviews).
   */
  function appendDemoRoomReview(entry) {
    const list = getDemoRoomReviews();
    list.push(entry);
    localStorage.setItem(DEMO_ROOM_REVIEWS_KEY, JSON.stringify(list));
  }

  function roomReviewsForRoom(data, roomId) {
    const fromJson = (data.roomReviews || []).filter((r) => r.roomId === roomId);
    const fromDemo = getDemoRoomReviews().filter((r) => r.roomId === roomId);
    return fromJson.concat(fromDemo);
  }

  function roomRatingSummary(data, roomId) {
    const list = roomReviewsForRoom(data, roomId);
    if (!list.length) return { average: null, count: 0 };
    const sum = list.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
    return { average: sum / list.length, count: list.length };
  }

  /**
   * All room-level reviews for rooms at this hotel (JSON + demo localStorage), merged.
   */
  function hotelRatingSummary(data, hotelId) {
    const rooms = roomsForHotel(data, hotelId);
    const ratings = [];
    for (let i = 0; i < rooms.length; i++) {
      const list = roomReviewsForRoom(data, rooms[i].id);
      for (let j = 0; j < list.length; j++) {
        const n = Number(list[j].rating);
        if (Number.isFinite(n)) ratings.push(n);
      }
    }
    if (!ratings.length) return { average: null, count: 0 };
    const sum = ratings.reduce((a, b) => a + b, 0);
    return { average: sum / ratings.length, count: ratings.length };
  }

  function paymentMethodForHotel(data, hotelId) {
    const list = data.paymentMethods || [];
    return list.find((p) => p.hotelId === hotelId) || null;
  }

  global.MarbleData = {
    loadData,
    hotelById,
    roomsForHotel,
    roomById,
    bookingsForUser,
    bookingById,
    allBookings,
    getExtraBookings,
    verificationStatusOf,
    verifiedHotels,
    topRatedHotels,
    roomReviewsForRoom,
    roomRatingSummary,
    hotelRatingSummary,
    paymentMethodForHotel,
    appendDemoRoomReview,
    getDemoRoomReviews
  };
})(window);
