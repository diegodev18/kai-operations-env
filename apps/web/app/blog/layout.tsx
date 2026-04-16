import { BlogLayoutClient } from "./blog-layout-client";

export default function BlogRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <BlogLayoutClient>{children}</BlogLayoutClient>;
}
