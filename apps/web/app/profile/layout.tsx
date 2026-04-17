import { ProfileLayoutClient } from "./profile-layout-client";

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ProfileLayoutClient>{children}</ProfileLayoutClient>;
}
