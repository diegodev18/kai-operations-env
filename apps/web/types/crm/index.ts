export type CrmCompanyStatus =
  | "prospecto"
  | "domiciliado"
  | "tramites"
  | "negociando"
  | "perdido";

export type CrmOpportunityStage =
  | "prospecto"
  | "cotizacion_enviada"
  | "negociando"
  | "esperando_firma"
  | "construyendo"
  | "activo"
  | "esperando_domicilio"
  | "perdido";

export interface CrmCompany {
  id: string;
  name: string;
  industry: string;
  status: CrmCompanyStatus;
  mrr?: number;
  country?: string;
  description?: string;
  targetAudience?: string;
  agentDescription?: string;
  escalationRules?: string;
  businessTimezone?: string;
  brandValues?: string[];
  policies?: string;
  ownerName?: string;
  growerName?: string;
  notes?: string;
  createdAt: string | null;
  updatedAt: string | null;
  createdByEmail: string;
  createdByUserId: string;
}

export interface CrmOpportunity {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  contactName?: string;
  contactPhone?: string;
  stage: CrmOpportunityStage;
  mrr?: number;
  implementerName?: string;
  featuresToImplement?: string[];
  agentId?: string;
  notes?: string;
  createdAt: string | null;
  updatedAt: string | null;
  createdByEmail: string;
  createdByUserId: string;
}

export interface CrmCompanyDetail extends CrmCompany {
  opportunities: CrmOpportunity[];
}

export type CrmCompanyInput = Omit<
  CrmCompany,
  "id" | "createdAt" | "updatedAt" | "createdByEmail" | "createdByUserId"
>;

export type CrmOpportunityInput = Omit<
  CrmOpportunity,
  "id" | "createdAt" | "updatedAt" | "createdByEmail" | "createdByUserId"
>;

export const CRM_COMPANY_STATUS_LABELS: Record<CrmCompanyStatus, string> = {
  prospecto: "Prospecto",
  domiciliado: "Domiciliado",
  tramites: "Trámites",
  negociando: "Negociando",
  perdido: "Perdido",
};

export const CRM_OPPORTUNITY_STAGE_LABELS: Record<CrmOpportunityStage, string> = {
  prospecto: "Prospecto",
  cotizacion_enviada: "Cotización enviada",
  negociando: "Negociando",
  esperando_firma: "Esperando firma",
  construyendo: "Construyendo",
  activo: "Activo",
  esperando_domicilio: "Esperando domicilio",
  perdido: "Perdido",
};

export const CRM_COMPANY_STATUS_COLORS: Record<CrmCompanyStatus, string> = {
  prospecto: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  domiciliado: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  tramites: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  negociando: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  perdido: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};

export const CRM_OPPORTUNITY_STAGE_COLORS: Record<CrmOpportunityStage, string> = {
  prospecto: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  cotizacion_enviada: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  negociando: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  esperando_firma: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  construyendo: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  activo: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  esperando_domicilio: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  perdido: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
};
