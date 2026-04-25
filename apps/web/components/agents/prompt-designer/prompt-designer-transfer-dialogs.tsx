import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2Icon } from "lucide-react";
import { PromptDiffView } from "@/components/prompt";

export function PromptDesignerTransferDialogs({
  isPromoteDialogOpen,
  setIsPromoteDialogOpen,
  promoteIncludeAuth,
  setPromoteIncludeAuth,
  promoteIncludeUnauth,
  setPromoteIncludeUnauth,
  promoting,
  executePromote,
  isPushDialogOpen,
  setIsPushDialogOpen,
  pushConfirmText,
  setPushConfirmText,
  onPromoteConfirm,
  productionPromptText,
  savedPrompt,
  isPullDialogOpen,
  setIsPullDialogOpen,
  pullConfirmText,
  setPullConfirmText,
  pullingProductionBase,
  onPullConfirm,
  normalizeConfirmInput,
}: {
  isPromoteDialogOpen: boolean;
  setIsPromoteDialogOpen: (open: boolean) => void;
  promoteIncludeAuth: boolean;
  setPromoteIncludeAuth: (value: boolean) => void;
  promoteIncludeUnauth: boolean;
  setPromoteIncludeUnauth: (value: boolean) => void;
  promoting: boolean;
  executePromote: (args: { includeAuth: boolean; includeUnauth: boolean }) => void;
  isPushDialogOpen: boolean;
  setIsPushDialogOpen: (open: boolean) => void;
  pushConfirmText: string;
  setPushConfirmText: (value: string) => void;
  onPromoteConfirm: () => void;
  productionPromptText: string;
  savedPrompt: string;
  isPullDialogOpen: boolean;
  setIsPullDialogOpen: (open: boolean) => void;
  pullConfirmText: string;
  setPullConfirmText: (value: string) => void;
  pullingProductionBase: boolean;
  onPullConfirm: () => void;
  normalizeConfirmInput: (input: string) => string;
}) {
  return (
    <>
      <Dialog open={isPromoteDialogOpen} onOpenChange={setIsPromoteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Opciones de promoción</DialogTitle>
            <DialogDescription>
              Hay cambios en los prompts de autenticación. ¿Qué deseas promover?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="promote-auth"
                checked={promoteIncludeAuth}
                onCheckedChange={(c: boolean) => setPromoteIncludeAuth(c === true)}
              />
              <Label htmlFor="promote-auth">Prompt de usuarios autenticados</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="promote-unauth"
                checked={promoteIncludeUnauth}
                onCheckedChange={(c: boolean) => setPromoteIncludeUnauth(c === true)}
              />
              <Label htmlFor="promote-unauth">Prompt de usuarios no autenticados</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPromoteDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                executePromote({ includeAuth: promoteIncludeAuth, includeUnauth: promoteIncludeUnauth })
              }
              disabled={promoting}
            >
              {promoting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              Promover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPushDialogOpen}
        onOpenChange={(open) => {
          setIsPushDialogOpen(open);
          if (!open) setPushConfirmText("");
        }}
      >
        <DialogContent className="sm:max-w-none" style={{ width: "min(92vw, 980px)", maxWidth: "min(92vw, 980px)" }}>
          <DialogHeader>
            <DialogTitle>Subir cambios a producción</DialogTitle>
            <DialogDescription>
              Revisa el diff de testing a producción y escribe CONFIRMAR para continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[45vh] overflow-auto rounded border">
            <PromptDiffView oldText={productionPromptText} newText={savedPrompt} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="push-confirm">Confirmación</Label>
            <Input
              id="push-confirm"
              value={pushConfirmText}
              onChange={(event) => setPushConfirmText(event.target.value)}
              placeholder="CONFIRMAR"
              className="h-10"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPushDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onPromoteConfirm}
              disabled={normalizeConfirmInput(pushConfirmText) !== "confirmar" || promoting}
            >
              {promoting ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar y subir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPullDialogOpen}
        onOpenChange={(open) => {
          setIsPullDialogOpen(open);
          if (!open) setPullConfirmText("");
        }}
      >
        <DialogContent className="sm:max-w-none" style={{ width: "min(92vw, 980px)", maxWidth: "min(92vw, 980px)" }}>
          <DialogHeader>
            <DialogTitle>Bajar cambios desde producción</DialogTitle>
            <DialogDescription>
              Revisa el diff de producción a testing y escribe CONFIRMAR para continuar.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[45vh] overflow-auto rounded border">
            <PromptDiffView oldText={savedPrompt} newText={productionPromptText} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pull-confirm">Confirmación</Label>
            <Input
              id="pull-confirm"
              value={pullConfirmText}
              onChange={(event) => setPullConfirmText(event.target.value)}
              placeholder="CONFIRMAR"
              className="h-10"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPullDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={onPullConfirm}
              disabled={normalizeConfirmInput(pullConfirmText) !== "confirmar" || pullingProductionBase}
            >
              {pullingProductionBase ? <Loader2Icon className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar y bajar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
