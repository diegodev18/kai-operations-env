"use client";

import { useParams } from "next/navigation";
import { ChangelogVersionPage } from "../../components/changelog-version-page";

export default function PanelVersionPage() {
  const params = useParams();
  const version = params.version as string;

  return <ChangelogVersionPage version={version} projectId="panel" />;
}
