/** Fired when the user updates their navbar-visible avatar (guest or hotel). */
export const MARBLESTAY_NAV_AVATAR_REFRESH = "marblestay:nav-avatar-refresh";

export function dispatchNavAvatarRefresh(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(MARBLESTAY_NAV_AVATAR_REFRESH));
    }
}
