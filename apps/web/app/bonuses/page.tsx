"use client";

import { useState } from "react";
import { GiftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationsShell } from "@/components/operations/shell";
import { BonusesDashboard } from "@/components/bonuses";

export default function BonusesPage() {
  const [sendTipOpen, setSendTipOpen] = useState(false);

  return (
    <OperationsShell
      breadcrumb={[{ label: "Bonificaciones" }]}
      headerActions={
        <Button size="sm" onClick={() => setSendTipOpen(true)}>
          <GiftIcon className="mr-1.5 size-4" />
          Enviar propina
        </Button>
      }
    >
      <BonusesDashboard
        sendTipOpen={sendTipOpen}
        onSendTipOpenChange={setSendTipOpen}
      />
    </OperationsShell>
  );
}
