import { RoleGuard } from "@/components/RoleGuard";

export default function GuestBookingsLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard allowedRoles={["guest"]}>{children}</RoleGuard>;
}
