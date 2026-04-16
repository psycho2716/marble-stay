"use client";

import { useJsApiLoader, type Libraries } from "@react-google-maps/api";

const GOOGLE_MAPS_SCRIPT_ID = "marble-stay-google";
const GOOGLE_MAPS_LIBRARIES: Libraries = ["places"];

export function useMarbleGoogleMapsLoader() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const loader = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  return {
    apiKey,
    ...loader,
  };
}
