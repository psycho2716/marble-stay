"use client";

import { MapPin } from "lucide-react";
import { GoogleMap, Marker } from "@react-google-maps/api";
import { useMarbleGoogleMapsLoader } from "@/lib/googleMapsLoader";

const MAP_CONTAINER_STYLE = {
    width: "100%",
    height: "100%",
    minHeight: "240px"
};

const MAP_OPTIONS: google.maps.MapOptions = {
    zoomControl: false,
    mapTypeControl: false,
    scaleControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    rotateControl: false,
    disableDefaultUI: true
};

type HotelProfileMapProps = {
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
};

function getGoogleMapsUrl(
    address: string | null | undefined,
    lat: number | null | undefined,
    lng: number | null | undefined
): string {
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        return `https://www.google.com/maps?q=${lat},${lng}`;
    }
    if (address?.trim()) {
        return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
    }
    return "https://www.google.com/maps";
}

export function HotelProfileMap({
    address,
    latitude,
    longitude
}: HotelProfileMapProps) {
    const { apiKey, isLoaded, loadError } = useMarbleGoogleMapsLoader();

    const hasCoords =
        latitude != null &&
        longitude != null &&
        Number.isFinite(latitude) &&
        Number.isFinite(longitude);
    const hasAddress = Boolean(address?.trim());

    if (!hasCoords && !hasAddress) {
        return null;
    }

    const center = hasCoords
        ? { lat: latitude as number, lng: longitude as number }
        : null;
    const mapsUrl = getGoogleMapsUrl(address, latitude, longitude);

    if (!apiKey) {
        return (
            <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                </h2>
                <div className="rounded-lg border border-border bg-card p-3">
                    {hasAddress && (
                        <p className="flex items-start gap-2 text-sm text-foreground">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>{address}</span>
                        </p>
                    )}
                    <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                    >
                        Open in Google Maps →
                    </a>
                </div>
            </section>
        );
    }

    if (loadError) {
        return (
            <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                </h2>
                <div className="rounded-lg border border-border bg-card p-3">
                    {hasAddress && (
                        <p className="flex items-start gap-2 text-sm text-foreground">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>{address}</span>
                        </p>
                    )}
                    <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                    >
                        Open in Google Maps →
                    </a>
                </div>
            </section>
        );
    }

    if (!hasCoords) {
        return (
            <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Location
                </h2>
                <div className="rounded-lg border border-border bg-card p-3">
                    <p className="flex items-start gap-2 text-sm text-foreground">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                        <span>{address}</span>
                    </p>
                    <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                    >
                        Open in Google Maps →
                    </a>
                </div>
            </section>
        );
    }

    return (
        <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Location
            </h2>
            <div className="overflow-hidden rounded-lg border border-border bg-muted">
                <div
                    className="relative w-full"
                    style={{ aspectRatio: "16/10" }}
                >
                    {!isLoaded ? (
                        <div
                            className="flex items-center justify-center bg-muted text-muted-foreground"
                            style={{ aspectRatio: "16/10" }}
                        >
                            <span className="text-sm">Loading map…</span>
                        </div>
                    ) : (
                        <GoogleMap
                            mapContainerStyle={MAP_CONTAINER_STYLE}
                            center={center!}
                            zoom={16}
                            options={MAP_OPTIONS}
                        >
                            <Marker position={center!} />
                        </GoogleMap>
                    )}
                </div>
                <div className="border-t border-border bg-card px-3 py-2">
                    {hasAddress && (
                        <p className="flex items-start gap-2 text-sm text-foreground">
                            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            <span>{address}</span>
                        </p>
                    )}
                    <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                    >
                        Open in Google Maps →
                    </a>
                </div>
            </div>
        </section>
    );
}
