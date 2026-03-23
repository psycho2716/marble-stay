"use client";

import {
    Wifi,
    Waves,
    Dumbbell,
    Car,
    UtensilsCrossed,
    Snowflake,
    Tv,
    Coffee,
    Wine,
    Droplets,
    CircleDot
} from "lucide-react";

const AMENITY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    wifi: Wifi,
    "high-speed wifi": Wifi,
    "high speed wifi": Wifi,
    "high-speed wi-fi": Wifi,
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
    "air conditioning": Snowflake,
    tv: Tv,
    "smart tv": Tv,
    nespresso: Coffee,
    "nespresso machine": Coffee,
    "mini bar": Wine,
    minibar: Wine,
    shower: Droplets,
    "rain shower": Droplets
};

function getAmenityIcon(name: string) {
    const key = name.toLowerCase().trim();
    for (const [k, Icon] of Object.entries(AMENITY_ICONS)) {
        if (key.includes(k) || k.includes(key)) return Icon;
    }
    return CircleDot;
}

type RoomAmenitiesProps = {
    amenities: string[];
};

export function RoomAmenities({ amenities }: RoomAmenitiesProps) {
    if (!amenities?.length) return null;

    return (
        <section>
            <h2 className="mb-3 text-base font-semibold text-foreground">Amenities</h2>
            <ul className="flex flex-wrap gap-2">
                {amenities.map((name) => {
                    const Icon = getAmenityIcon(name);
                    return (
                        <li key={name}>
                            <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-sm text-foreground">
                                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                                {name}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
