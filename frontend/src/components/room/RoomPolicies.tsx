import {
    Clock,
    PawPrint,
    Ban,
    XCircle,
    Shield,
    Wifi,
    Waves,
    Dumbbell,
    Car,
    UtensilsCrossed,
    Snowflake,
    CircleDot
} from "lucide-react";

type PolicyItem = {
    label: string;
    value: string;
    icon: React.ReactNode;
};

type RoomPoliciesProps = {
    checkIn?: string | null;
    checkOut?: string | null;
    pets?: string | null;
    smoking?: string | null;
    cancellation?: string | null;
    customPolicies?: Array<{
        iconKey?: string | null;
        icon_key?: string | null;
        icon?: string | null;
        label?: string | null;
        value?: string | null;
    }> | null;
};

function formatTimeForDisplay(time: string | null | undefined): string {
    if (!time) return "";
    const str = String(time).trim();
    if (!str) return "";
    const [h, m] = str.split(":");
    const hour = parseInt(h ?? "0", 10);
    const min = parseInt(m ?? "0", 10);
    const am = hour < 12;
    const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${h12}:${min.toString().padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

const CUSTOM_POLICY_ICON_MAP: Record<string, React.ReactNode> = {
    shield: <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />,
    wifi: <Wifi className="h-4 w-4 shrink-0 text-muted-foreground" />,
    waves: <Waves className="h-4 w-4 shrink-0 text-muted-foreground" />,
    dumbbell: <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground" />,
    car: <Car className="h-4 w-4 shrink-0 text-muted-foreground" />,
    utensils_crossed: <UtensilsCrossed className="h-4 w-4 shrink-0 text-muted-foreground" />,
    snowflake: <Snowflake className="h-4 w-4 shrink-0 text-muted-foreground" />,
    circle_dot: <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground" />
};

/**
 * Room policies are system-defined (Pets, Smoking, Cancellation, Check-in/out).
 * Only policies that have hotel-provided content are shown.
 */
export function RoomPolicies({
    checkIn,
    checkOut,
    pets,
    smoking,
    cancellation,
    customPolicies
}: RoomPoliciesProps) {
    const policies: PolicyItem[] = [];

    const hasCheckInOut =
        (checkIn != null && String(checkIn).trim() !== "") ||
        (checkOut != null && String(checkOut).trim() !== "");
    if (hasCheckInOut) {
        const checkInStr = formatTimeForDisplay(checkIn) || "—";
        const checkOutStr = formatTimeForDisplay(checkOut) || "—";
        policies.push({
            label: "Check-in / Check-out",
            value: `Check-in: ${checkInStr}\nCheck-out: ${checkOutStr}`,
            icon: <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        });
    }

    if (pets != null && String(pets).trim() !== "") {
        policies.push({
            label: "Pets",
            value: String(pets).trim(),
            icon: <PawPrint className="h-4 w-4 shrink-0 text-muted-foreground" />
        });
    }
    if (smoking != null && String(smoking).trim() !== "") {
        policies.push({
            label: "Smoking",
            value: String(smoking).trim(),
            icon: <Ban className="h-4 w-4 shrink-0 text-muted-foreground" />
        });
    }
    if (cancellation != null && String(cancellation).trim() !== "") {
        policies.push({
            label: "Cancellation",
            value: String(cancellation).trim(),
            icon: <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />
        });
    }

    // Custom policies (hotel-provided label + text, but icon is system-controlled).
    if (Array.isArray(customPolicies)) {
        for (const p of customPolicies.slice(0, 10)) {
            if (!p) continue;
            const label = typeof p.label === "string" ? p.label.trim() : "";
            const value = typeof p.value === "string" ? p.value.trim() : "";
            const iconKeyRaw =
                typeof p.iconKey === "string"
                    ? p.iconKey
                    : typeof p.icon_key === "string"
                      ? p.icon_key
                      : typeof p.icon === "string"
                        ? p.icon
                        : "";
            const iconKey = String(iconKeyRaw || "").trim();
            if (!label || !value) continue;

            policies.push({
                label,
                value,
                icon: CUSTOM_POLICY_ICON_MAP[iconKey] ?? (
                    <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground" />
                )
            });
        }
    }

    if (policies.length === 0) return null;

    return (
        <section>
            <h2 className="mb-4 text-base font-semibold text-foreground">Room Policies</h2>
            <div className="grid gap-4 sm:grid-cols-2">
                {policies.map(({ label, value, icon }) => (
                    <div key={label} className="flex gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-white">
                            {icon}
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground">{label}</p>
                            <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">
                                {value}
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    );
}
