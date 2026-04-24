import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { SettingsSection } from "./settings-section";

export function TeamSection({
  growersCount,
  techLeadsCount,
  showTechLeads,
  saving,
  onManageGrowers,
  onManageTechLeads,
}: {
  growersCount: number;
  techLeadsCount: number;
  showTechLeads: boolean;
  saving: boolean;
  onManageGrowers: () => void;
  onManageTechLeads: () => void;
}) {
  return (
    <SettingsSection
      id="team"
      title="Equipo"
      description="Define quién puede operar o revisar esta configuración."
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-background/70 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Growers</p>
              <p className="text-xs text-muted-foreground">
                Personas que pueden apoyar con la operación del agente.
              </p>
            </div>
            <Badge variant="outline">{growersCount}</Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onManageGrowers}
            disabled={saving}
            className="mt-3 w-full justify-start"
          >
            <PlusIcon className="mr-1.5 h-4 w-4" />
            Gestionar growers
          </Button>
        </div>
        {showTechLeads && (
          <div className="rounded-xl border bg-background/70 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Tech leads</p>
                <p className="text-xs text-muted-foreground">
                  Personas que pueden revisar y ajustar toda la configuración.
                </p>
              </div>
              <Badge variant="outline">{techLeadsCount}</Badge>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onManageTechLeads}
              disabled={saving}
              className="mt-3 w-full justify-start"
            >
              <PlusIcon className="mr-1.5 h-4 w-4" />
              Gestionar tech leads
            </Button>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
