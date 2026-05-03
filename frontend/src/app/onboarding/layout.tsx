import { RoleGuard } from "@/components/RoleGuard";

export default function GuestOnboardingLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard allowedRoles={["guest"]}>{children}</RoleGuard>;
}
