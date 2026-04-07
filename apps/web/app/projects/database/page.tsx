"use client";

import Link from "next/link";
import { Copy, Pencil, Upload, ChevronRightIcon, GitCompare, FolderSearch } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SERVICES = [
  {
    id: "subir-datos",
    title: "Subir datos",
    description:
      "Sube documentos a una colección de Firestore: pega JSON, sube archivo .json, preview de colección, opciones merge y sobrescribir, progreso por lotes.",
    href: "/projects/database/subir-datos",
    icon: Upload,
    visual: (
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="flex flex-col gap-1">
          <div className="w-14 h-1.5 rounded bg-muted-foreground/20" />
          <div className="w-10 h-1.5 rounded bg-muted-foreground/20" />
        </div>
      </div>
    ),
  },
  {
    id: "duplicar-clonar",
    title: "Duplicar / clonar",
    description:
      "Duplica colecciones o documentos entre ambientes (testing/production). Clonación recursiva con selección de subcolecciones por checkbox.",
    href: "/projects/database/duplicar-clonar",
    icon: Copy,
    visual: (
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="flex gap-1">
          <div className="w-6 h-1.5 rounded bg-muted-foreground/20" />
          <div className="w-6 h-1.5 rounded bg-muted-foreground/20" />
        </div>
      </div>
    ),
  },
  {
    id: "actualizar-documento",
    title: "Actualizar documento",
    description:
      "Actualiza un documento por ruta: carga el actual, edita el JSON (Timestamp/GeoPoint en formato serializado) y aplica merge o reemplazo.",
    href: "/projects/database/actualizar-documento",
    icon: Pencil,
    visual: (
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="w-12 h-1.5 rounded bg-muted-foreground/20" />
      </div>
    ),
  },
  {
    id: "visor-comparador",
    title: "Visor y comparador de documentos",
    description:
      "Carga varios documentos por ruta y ambiente, compara diferencias (diff o tabla) y edita un documento desde la vista.",
    href: "/projects/database/visor-comparador",
    icon: GitCompare,
    visual: (
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="flex gap-1">
          <div className="w-8 h-1.5 rounded bg-muted-foreground/20" />
          <div className="w-6 h-1.5 rounded bg-muted-foreground/20" />
        </div>
      </div>
    ),
  },
  {
    id: "explorador-documentos",
    title: "Explorador de documentos",
    description:
      "Explora documentos y colecciones con vista JSON legible, herramientas de copia/exportación y navegación por subcolecciones.",
    href: "/projects/database/explorador-documentos",
    icon: FolderSearch,
    visual: (
      <div className="flex items-center gap-2 h-20 animate-card-visual">
        <div className="w-8 h-8 rounded bg-muted-foreground/20" />
        <div className="w-10 h-1.5 rounded bg-muted-foreground/20" />
      </div>
    ),
  },
] as const;

export default function DataBasePage() {
  return (
    <div className="p-6 overflow-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">Servicios</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Herramientas para gestionar datos en Firestore.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {SERVICES.map(({ id, title, description, href, icon: Icon, visual }) => (
          <Link key={id} href={href} className="block group">
            <Card className="h-full bg-card/80 hover:bg-card border-border/50 transition-colors overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="p-2 rounded-lg bg-muted/50 w-fit">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <CardTitle className="text-lg">{title}</CardTitle>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
                <CardDescription className="text-sm">{description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-end justify-end">{visual}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}