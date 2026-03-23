/** Admin API — hotel row with embedded owner profile(s). */
export type AdminHotelOwner = {
    full_name: string | null;
    email: string | null;
    role?: string | null;
};

export type AdminHotelRow = {
    id: string;
    name: string;
    description: string | null;
    address: string;
    latitude?: number | null;
    longitude?: number | null;
    contact_email: string;
    contact_phone: string | null;
    verification_status: string;
    business_permit_file: string | null;
    profile_image?: string | null;
    cover_image?: string | null;
    bio?: string | null;
    opening_hours?: Record<string, { open?: string; close?: string }> | null;
    check_in_time?: string | null;
    check_out_time?: string | null;
    currency?: string | null;
    permit_expires_at?: string | null;
    created_at: string;
    profiles?: AdminHotelOwner[] | AdminHotelOwner | null;
};

export type AdminUserRow = {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    hotel_id: string | null;
    created_at: string;
    address_line?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
    gender?: string | null;
    avatar_path?: string | null;
    hotel_name?: string | null;
    avatar_url?: string | null;
};
