"use client";

import { useCallback, useMemo, useState } from "react";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const ROMBLON_CENTER = { lat: 12.58, lng: 122.27 };

export type LocationPoint = { lat: number; lng: number } | null;

type MapLocationPickerProps = {
  value: LocationPoint;
  onChange: (point: LocationPoint) => void;
  height?: string;
};

const mapContainerStyle = { width: "100%", height: "100%" };

export function MapLocationPicker({ value, onChange, height = "280px" }: MapLocationPickerProps) {
  const [, setMap] = useState<google.maps.Map | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded, loadError } = useJsApiLoader({
    id: "marble-stay-google",
    googleMapsApiKey: apiKey,
    libraries: ["places"],
  });

  const center = useMemo(() => value ?? ROMBLON_CENTER, [value]);
  const onMapLoad = useCallback((map: google.maps.Map) => setMap(map), []);
  const onMapClick = useCallback(
    (e: google.maps.MapMouseEvent) => {
      const lat = e.latLng?.lat();
      const lng = e.latLng?.lng();
      if (lat != null && lng != null) onChange({ lat, lng });
    },
    [onChange]
  );

  if (loadError) {
    return (
      <div
        className="w-full rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-red-700 text-sm px-4"
        style={{ height }}
      >
        Failed to load Google Maps. Check that NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set and Maps JavaScript API is enabled.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div
        className="w-full rounded-lg border border-slate-200 bg-slate-100 flex items-center justify-center text-slate-500 text-sm"
        style={{ height }}
      >
        Loading map…
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div
        className="w-full rounded-lg border border-amber-200 bg-amber-50 flex items-center justify-center text-amber-800 text-sm px-4"
        style={{ height }}
      >
        Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local to show the map.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-600">
        Click on the map to set your hotel&apos;s exact location. You can drag the map to move.
      </p>
      <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height }}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={center}
          zoom={value ? 15 : 11}
          onClick={onMapClick}
          onLoad={onMapLoad}
          options={{
            scrollwheel: true,
            streetViewControl: false,
            mapTypeControl: true,
            fullscreenControl: true,
            zoomControl: true,
          }}
        >
          {value && <Marker position={{ lat: value.lat, lng: value.lng }} />}
        </GoogleMap>
      </div>
      {value && (
        <p className="text-xs text-slate-500">
          Selected: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}
