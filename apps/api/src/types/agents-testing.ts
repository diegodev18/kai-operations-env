/** Cuerpo del POST de simulación contra el entorno de testing de agentes. */
export interface AgentsTestingSimulateBody {
  agent?: unknown;
  config?: { AGENT_DOC_ID?: string };
  enableTools?: boolean;
  stream?: boolean;
  whatsappBody?: unknown;
}
