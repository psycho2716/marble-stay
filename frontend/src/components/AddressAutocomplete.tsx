"use client";

import { useEffect, useRef, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

type AddressAutocompleteProps = {
  value: string;
  onChange: (address: string) => void;
  onPlaceSelect?: (address: string, lat: number, lng: number) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
};

export function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Romblon, Romblon",
  className = "",
  required = false,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  const onChangeRef = useRef(onChange);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  onChangeRef.current = onChange;
  onPlaceSelectRef.current = onPlaceSelect;

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded } = useJsApiLoader({
    id: "marble-stay-google",
    googleMapsApiKey: apiKey,
    libraries: ["places"],
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !isLoaded || !apiKey || !inputRef.current) return;

    const input = inputRef.current;
    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ["address"],
      fields: ["formatted_address", "geometry"],
    });

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const address = place.formatted_address ?? "";
      if (address) {
        onChangeRef.current(address);
        const location = place.geometry?.location;
        if (location && onPlaceSelectRef.current) {
          const lat = location.lat();
          const lng = location.lng();
          onPlaceSelectRef.current(address, lat, lng);
        }
      }
    });

    return () => {
      if (listener) google.maps.event.removeListener(listener);
    };
  }, [mounted, isLoaded, apiKey]);

  return (
    <input
      ref={inputRef}
      type="text"
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}
