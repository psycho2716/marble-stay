import { RoleGuard } from "@/components/RoleGuard";

export default function HotelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleGuard allowedRoles={["hotel"]}>{children}</RoleGuard>;
}
