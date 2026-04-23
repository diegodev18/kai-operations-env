import type {
  AgentCommercialStatus,
  AgentServerStatus,
} from "@/types";

export const COMMERCIAL_STATUS_OPTIONS: Array<{
  value: AgentCommercialStatus;
  labelEs: string;
}> = [
  { value: "building", labelEs: "Construyendo" },
  { value: "internal_test", labelEs: "Prueba interna" },
  { value: "client_test", labelEs: "Prueba con cliente" },
  { value: "iterating", labelEs: "Iterando" },
  { value: "delivered", labelEs: "Entregado" },
];

export const SERVER_STATUS_OPTIONS: Array<{
  value: AgentServerStatus;
  labelEs: string;
}> = [
  { value: "active", labelEs: "Activo" },
  { value: "disabled", labelEs: "Desactivado" },
  { value: "no_connected_number", labelEs: "Sin número conectado" },
];

export const COMMERCIAL_STATUS_LABELS_ES: Record<AgentCommercialStatus, string> =
  Object.fromEntries(
    COMMERCIAL_STATUS_OPTIONS.map((item) => [item.value, item.labelEs]),
  ) as Record<AgentCommercialStatus, string>;

export const SERVER_STATUS_LABELS_ES: Record<AgentServerStatus, string> =
  Object.fromEntries(
    SERVER_STATUS_OPTIONS.map((item) => [item.value, item.labelEs]),
  ) as Record<AgentServerStatus, string>;
