(function (global) {
  /** Default key for the static demo; override with MARBLE_GOOGLE_MAPS_API_KEY if needed. Restrict by HTTP referrer in Google Cloud. */
  const DEFAULT_KEY = "AIzaSyCSlxtJWm8F_UaVhA3JzE261W6lminedSI";

  function getKey() {
    return (
      global.MARBLE_GOOGLE_MAPS_API_KEY ||
      global.__MARBLE_GOOGLE_MAPS_API_KEY__ ||
      DEFAULT_KEY
    ).trim();
  }

  let loadPromise = null;

  function loadScript() {
    const key = getKey();
    if (!key) return Promise.reject(new Error("No Google Maps API key"));
    if (global.google && global.google.maps) return Promise.resolve();
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.async = true;
      s.src =
        "https://maps.googleapis.com/maps/api/js?key=" +
        encodeURIComponent(key) +
        "&libraries=places";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Maps script failed"));
      document.head.appendChild(s);
    });
    return loadPromise;
  }

  /**
   * @param {HTMLElement} el
   * @param {{ lat: number, lng: number }} center
   */
  async function renderMap(el, center) {
    el.innerHTML = "";
    if (!getKey()) {
      el.innerHTML =
        '<p class="text-sm text-muted-foreground p-4">Map unavailable. Please try again later.</p>';
      return null;
    }
    try {
      await loadScript();
    } catch {
      el.innerHTML =
        '<p class="text-sm text-destructive p-4">Could not load Google Maps.</p>';
      return null;
    }
    const map = new google.maps.Map(el, {
      center,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false
    });
    new google.maps.Marker({ position: center, map });
    return { map };
  }

  global.MarbleMaps = { getKey, loadScript, renderMap };
})(window);
