"use client";

import { Wifi, Waves, Dumbbell, Car, UtensilsCrossed, Snowflake, CircleDot } from "lucide-react";
import {
    getCondensedOpeningHours,
    formatTime12h,
    type OpeningHoursRecord
} from "@/lib/openingHoursDisplay";
import { HotelProfileMap } from "./HotelProfileMap";

const AMENITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    wifi: Wifi,
    "high-speed wifi": Wifi,
    "high speed wifi": Wifi,
    pool: Waves,
    "infinity pool": Waves,
    "swimming pool": Waves,
    gym: Dumbbell,
    spa: Dumbbell,
    "gym & spa": Dumbbell,
    "gym and spa": Dumbbell,
    parking: Car,
    "valet parking": Car,
    dining: UtensilsCrossed,
    "fine dining": UtensilsCrossed,
    "climate control": Snowflake,
    ac: Snowflake,
    "air conditioning": Snowflake
};

function getAmenityIcon(name: string) {
    const key = name.toLowerCase().trim();
    for (const [k, Icon] of Object.entries(AMENITY_ICONS)) {
        if (key.includes(k) || k.includes(key)) return Icon;
    }
    return CircleDot;
}

type HotelProfileSidebarProps = {
    description: string | null;
    bio?: string | null;
    amenities: string[];
    check_in_time?: string | null;
    check_out_time?: string | null;
    opening_hours?: OpeningHoursRecord | null;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
};

export function HotelProfileSidebar({
    description,
    bio,
    amenities,
    check_in_time,
    check_out_time,
    opening_hours,
    address,
    latitude,
    longitude
}: HotelProfileSidebarProps) {
    const aboutText = [description, bio].filter(Boolean).join("\n\n") || null;
    const condensed = getCondensedOpeningHours(opening_hours);
    const frontDeskText =
        condensed?.type === "daily"
            ? condensed.open === "0:00" || condensed.open === "00:00"
                ? "24/7 Service"
                : `${formatTime12h(condensed.open)} – ${formatTime12h(condensed.close)}`
            : condensed
              ? "See weekly hours"
              : "24/7 Service";

    return (
        <aside className="space-y-8">
            <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Opening Hours
                </h2>
                <ul className="space-y-2 text-sm">
                    <li className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Check-in</span>
                        <span className="font-semibold text-foreground">
                            {check_in_time != null
                                ? `From ${formatTime12h(String(check_in_time).slice(0, 5))}`
                                : "—"}
                        </span>
                    </li>
                    <li className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Check-out</span>
                        <span className="font-semibold text-foreground">
                            {check_out_time != null
                                ? `Until ${formatTime12h(String(check_out_time).slice(0, 5))}`
                                : "—"}
                        </span>
                    </li>
                    <li className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Front Desk</span>
                        <span className="font-semibold text-foreground">{frontDeskText}</span>
                    </li>
                </ul>
            </section>

            {amenities.length > 0 && (
                <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Amenities
                    </h2>
                    <ul className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {amenities.map((name) => {
                            const Icon = getAmenityIcon(name);
                            return (
                                <li
                                    key={name}
                                    className="flex items-center gap-2 text-sm text-foreground"
                                >
                                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <span>{name}</span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <HotelProfileMap address={address} latitude={latitude} longitude={longitude} />

            {aboutText && (
                <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        About the Hotel
                    </h2>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {aboutText}
                    </div>
                </section>
            )}
        </aside>
    );
}
