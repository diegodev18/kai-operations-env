"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { getProjectById, type ProjectId } from "../../../changelog-data";
import { Button } from "@/components/ui/button";
import { ArrowLeftIcon, HomeIcon } from "lucide-react";
import NewChangelogForm from "../../../components/new-changelog-form";

const PROJECT_IDS = new Set<Exclude<ProjectId, "atlas">>(["panel", "agents", "tools"]);

export default function EditChangelogEntryPage() {
  const params = useParams();
  const project = params.project as string;
  const entryId = params.entryId as string;

  if (!PROJECT_IDS.has(project as Exclude<ProjectId, "atlas">)) {
    return (
      <div className="min-h-screen bg-background p-8">
        <p className="text-muted-foreground">Proyecto no válido.</p>
        <Button className="mt-4" asChild>
          <Link href="/changelog">Volver</Link>
        </Button>
      </div>
    );
  }

  const projectId = project as Exclude<ProjectId, "atlas">;
  const meta = getProjectById(projectId);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/changelog/${projectId}`}>
              <ArrowLeftIcon className="size-4 mr-2" />
              Lista {meta?.name}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <HomeIcon className="size-4" />
            </Link>
          </Button>
        </div>
        <NewChangelogForm projectId={projectId} entryId={entryId} />
      </div>
    </div>
  );
}
