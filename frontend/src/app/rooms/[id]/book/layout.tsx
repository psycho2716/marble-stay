import { RoleGuard } from "@/components/RoleGuard";

export default function GuestRoomBookLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard allowedRoles={["guest"]}>{children}</RoleGuard>;
}
