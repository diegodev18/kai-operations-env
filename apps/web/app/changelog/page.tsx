"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { changelogData, getAllVersions } from "./changelog-data";
import { Input } from "@/components/ui/input";

export default function ChangelogPage() {
  const [search, setSearch] = useState("");
  const versions = getAllVersions();

  const filteredVersions = useMemo(() => {
    if (!search.trim()) return versions;
    const query = search.toLowerCase();
    return versions.filter((version) => {
      const entry = changelogData[version];
      if (version.includes(query)) return true;
      if (entry.description.toLowerCase().includes(query)) return true;
      const allChanges = [
        ...(entry.changes.added || []),
        ...(entry.changes.changed || []),
        ...(entry.changes.fixed || []),
        ...(entry.changes.removed || []),
        ...(entry.changes.improved || []),
      ];
      return allChanges.some((c) => c.toLowerCase().includes(query));
    });
  }, [versions, search]);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-12">
          <h1 className="font-heading text-4xl font-bold tracking-tight text-foreground">
            Changelog
          </h1>
          <p className="mt-2 text-muted-foreground">
            A record of all changes, improvements, and new features.
          </p>
        </header>

        <div className="mb-8">
          <Input
            type="search"
            placeholder="Search versions or changes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Version
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">
                  Description
                </th>
                <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredVersions.map((version) => {
                const entry = changelogData[version];
                return (
                  <tr
                    key={version}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-4">
                      <Link
                        href={`/changelog/${version}`}
                        className="font-mono text-sm font-medium text-foreground hover:underline"
                      >
                        v{version}
                      </Link>
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground">
                      {new Date(entry.date).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-4 text-sm text-muted-foreground hidden md:table-cell">
                      {entry.description}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Link
                        href={`/changelog/${version}`}
                        className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredVersions.length === 0 && (
          <p className="mt-8 text-center text-muted-foreground">
            No versions found matching &quot;{search}&quot;.
          </p>
        )}
      </div>
    </div>
  );
}