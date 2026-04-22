"use client";

import { useParams } from "next/navigation";
import { ChangelogVersionPage } from "../../components/changelog-version-page";

export default function ToolsVersionPage() {
  const params = useParams();
  const version = params.version as string;

  return <ChangelogVersionPage version={version} projectId="tools" />;
}
