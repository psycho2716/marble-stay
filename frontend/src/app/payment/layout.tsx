import { RoleGuard } from "@/components/RoleGuard";

export default function GuestPaymentLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard allowedRoles={["guest"]}>{children}</RoleGuard>;
}
