import { RoleGuard } from "@/components/RoleGuard";

export default function GuestRecommendationsLayout({ children }: { children: React.ReactNode }) {
    return <RoleGuard allowedRoles={["guest"]}>{children}</RoleGuard>;
}
