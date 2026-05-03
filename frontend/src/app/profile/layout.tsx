import { RoleGuard } from "@/components/RoleGuard";

export default function GuestProfileLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard allowedRoles={["guest"]}>{children}</RoleGuard>;
}
