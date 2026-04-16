import { ActualityLayoutClient } from "./actuality-layout-client";

export default function ActualityRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ActualityLayoutClient>{children}</ActualityLayoutClient>;
}
