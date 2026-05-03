import { supabaseAdmin } from "../config/supabaseClient";

const BUCKET = "hotel-assets";
const TTL_SEC = 3600;

/** True when the value is already an absolute http(s) URL (e.g. demo seed data). */
export function isAbsoluteHttpUrl(value: string | null | undefined): boolean {
    const v = value?.trim();
    return Boolean(v && /^https?:\/\//i.test(v));
}

/**
 * Returns a browser-loadable URL for a hotel-assets path or passes through http(s) URLs.
 */
export async function resolveHotelAssetUrl(
    pathOrUrl: string | null | undefined
): Promise<string | null> {
    const p = pathOrUrl?.trim();
    if (!p) return null;
    if (isAbsoluteHttpUrl(p)) return p;
    const { data } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(p, TTL_SEC);
    return data?.signedUrl ?? null;
}
