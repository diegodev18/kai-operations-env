"use client";

import { useParams } from "next/navigation";
import { ChangelogVersionPage } from "../../components/changelog-version-page";

export default function AtlasVersionPage() {
  const params = useParams();
  const version = params.version as string;

  return <ChangelogVersionPage version={version} projectId="atlas" />;
}