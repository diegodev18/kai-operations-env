export type PersonalityTrait =
  | "friendly"
  | "professional"
  | "humorous"
  | "empathetic"
  | "direct"
  | "close"
  | "patient"
  | "proactive"
  | "technical";

export type EmojiPreference = "never" | "moderate" | "always";

export type FormSectionId =
  | "templates"
  | "business"
  | "tools"
  | "personality"
  | "advanced"
  | "flows"
  | "review";

export interface FormSection {
  id: FormSectionId;
  title: string;
  description: string;
  icon: string;
  required: boolean;
}

export interface FormQuestion {
  id: string;
  field: string;
  label: string;
  type: "text" | "textarea" | "select" | "toggle" | "radio";
  placeholder?: string;
  required?: boolean;
  dependsOn?: {
    field: string;
    hasValue?: boolean;
  };
  suggestions?: string[];
  aiSuggestion?: boolean;
}

export interface ToolCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface PersonalityPreset {
  id: string;
  label: string;
  description: string;
  agent_personality: string;
  use_emojis: EmojiPreference;
  traits: PersonalityTrait[];
  icon: string;
}

export interface AgentTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  suggestedTools: string[];
  presetPersonality: {
    use_emojis: EmojiPreference;
    traits: PersonalityTrait[];
  };
  prefill: Record<string, string>;
  industry?: string;
  agent_description?: string;
}

/** Pregunta dinámica del paso Flujos (alineada con el API). */
export type AgentFlowQuestion = {
  field: string;
  label: string;
  type: "text" | "textarea" | "select";
  placeholder?: string;
  options?: string[];
  /** Respuestas ejemplo para text/textarea: chips en la UI. */
  suggestions?: string[];
  /** Con `suggestions`: una opción o varias. */
  suggestion_mode?: "single" | "multi";
  required?: boolean;
};

/** Ejemplos rápidos en el paso Herramientas (chips). */
export const TOOLS_STEP_ACTION_EXAMPLES = [
  "Agendar citas o reservas",
  "Tomar pedidos o cotizaciones",
  "Registrar clientes o leads",
  "Cobros o enlaces de pago",
  "Enviar catálogo o disponibilidad",
  "Soporte o seguimiento de tickets",
] as const;

export const TOOLS_STEP_COMMERCE_EXAMPLES = [
  "Venta online y envíos",
  "Solo tienda física / mostrador",
  "Mixto: online y local",
  "Servicios sin inventario físico",
  "Reservas o citas como foco principal",
  "Solo informar; aún no vendemos",
] as const;

export const TOOLS_STEP_INTEGRATION_EXAMPLES = [
  "Google Sheets",
  "Google Calendar / agenda",
  "Shopify u otra tienda online",
  "CRM (HubSpot, Pipedrive, etc.)",
  "WhatsApp Business / catálogo",
  "Ninguna integración aún",
] as const;

/** Serializa selección del paso Herramientas para el API de recomendación. */
export function composeToolsContextStrings(state: {
  tools_hint_actions_selected: string[];
  tools_hint_actions_other: string;
  tools_hint_commerce_selected: string;
  tools_hint_commerce_other: string;
  tools_hint_integrations_selected: string[];
  tools_hint_integrations_other: string;
}): {
  tools_context_data_actions: string;
  tools_context_commerce_reservations: string;
  tools_context_integrations: string;
} {
  const actions = [
    ...state.tools_hint_actions_selected,
    state.tools_hint_actions_other.trim() &&
      `Otro: ${state.tools_hint_actions_other.trim()}`,
  ]
    .filter(Boolean)
    .join("; ");
  const commerce = [
    state.tools_hint_commerce_selected.trim(),
    state.tools_hint_commerce_other.trim() &&
      `Detalle: ${state.tools_hint_commerce_other.trim()}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const integrations = [
    ...state.tools_hint_integrations_selected,
    state.tools_hint_integrations_other.trim() &&
      `Otro: ${state.tools_hint_integrations_other.trim()}`,
  ]
    .filter(Boolean)
    .join("; ");
  return {
    tools_context_data_actions: actions,
    tools_context_commerce_reservations: commerce,
    tools_context_integrations: integrations,
  };
}

export interface FormBuilderState {
  business_name: string;
  owner_name: string;
  industry: string;
  custom_industry: string;
  description: string;
  target_audience: string;
  agent_description: string;
  escalation_rules: string;
  country: string;
  business_timezone: string;
  agent_name: string;
  agent_personality: string;
  response_language: string;
  use_emojis: EmojiPreference;
  country_accent: string;
  agent_signature: string;
  personality_traits: PersonalityTrait[];
  selected_tools: string[];
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  chat_enabled: boolean;
  business_hours: string;
  require_auth: boolean;
  /** Preguntas generadas por IA en el paso Flujos. */
  flow_questions: AgentFlowQuestion[];
  /** Respuestas del usuario (field → texto). */
  flow_answers: Record<string, string>;
  /** Paso Herramientas: acciones con datos (selección múltiple + otro). */
  tools_hint_actions_selected: string[];
  tools_hint_actions_other: string;
  /** Paso Herramientas: venta / inventario / reservas (una opción + detalle). */
  tools_hint_commerce_selected: string;
  tools_hint_commerce_other: string;
  /** Paso Herramientas: integraciones (múltiple + otro). */
  tools_hint_integrations_selected: string[];
  tools_hint_integrations_other: string;
}

export const DEFAULT_FORM_STATE: FormBuilderState = {
  business_name: "",
  owner_name: "",
  industry: "",
  custom_industry: "",
  description: "",
  target_audience: "",
  agent_description: "",
  escalation_rules: "",
  country: "",
  business_timezone: "",
  agent_name: "",
  agent_personality: "",
  response_language: "Spanish",
  use_emojis: "moderate",
  country_accent: "",
  agent_signature: "",
  personality_traits: [],
  selected_tools: [],
  whatsapp_enabled: true,
  email_enabled: false,
  chat_enabled: false,
  business_hours: "",
  require_auth: false,
  flow_questions: [],
  flow_answers: {},
  tools_hint_actions_selected: [],
  tools_hint_actions_other: "",
  tools_hint_commerce_selected: "",
  tools_hint_commerce_other: "",
  tools_hint_integrations_selected: [],
  tools_hint_integrations_other: "",
};

export const FORM_SECTIONS: FormSection[] = [
  {
    id: "templates",
    title: "Plantillas",
    description: "Elige una plantilla para comenzar rápido",
    icon: "🚀",
    required: false,
  },
  {
    id: "business",
    title: "Negocio",
    description: "Nombre, industria y detalles de tu negocio y clientes",
    icon: "🏢",
    required: true,
  },
  {
    id: "personality",
    title: "Personalidad",
    description: "Define cómo se comporta tu agente",
    icon: "🎭",
    required: true,
  },
  {
    id: "advanced",
    title: "Avanzado",
    description: "Horarios, autenticación y preferencias operativas",
    icon: "⚙️",
    required: false,
  },
  {
    id: "flows",
    title: "Flujos",
    description:
      "Preguntas breves sobre lo que tu asistente debe hacer en la práctica (generadas para tu caso)",
    icon: "🔀",
    required: true,
  },
  {
    id: "tools",
    title: "Herramientas",
    description:
      "La IA elige herramientas según tu negocio y tus respuestas de Flujos; puedes regenerar",
    icon: "🔧",
    required: true,
  },
  {
    id: "review",
    title: "Revisión",
    description: "Revisa y crea tu agente",
    icon: "✅",
    required: true,
  },
];

export const INDUSTRIES = [
  "Retail / Tienda de ropa",
  "Retail / Electrónica",
  "Retail / Geral",
  "Restaurantes / Comida y bebida",
  "Servicios / Consultoría",
  "Servicios / Belleza y estética",
  "Servicios / Fitness y gym",
  "Servicios / Limpieza",
  "Servicios / Reparaciones",
  "Tecnología / Software",
  "Tecnología / Hardware",
  "Tecnología / TI y soporte",
  "Salud / Clínica médica",
  "Salud / Odontología",
  "Salud / Fisioterapia",
  "Salud / Veterinaria",
  "Educación / Escuela",
  "Educación / Tutoría",
  "Educación / Cursos online",
  "Finanzas / Contabilidad",
  "Finanzas / Asesoría",
  "Inmobiliaria",
  "Logística / Transporte",
  "Otro",
];

export const PERSONALITY_TRAITS: { id: PersonalityTrait; label: string; emoji: string; description: string }[] = [
  { id: "friendly", label: "Amigable", emoji: "😄", description: "Cercano y cálido con los usuarios" },
  { id: "professional", label: "Profesional", emoji: "💼", description: "Formal y especializado" },
  { id: "humorous", label: "Con humor", emoji: "😄", description: "Ligero y divertido" },
  { id: "empathetic", label: "Empático", emoji: "🤝", description: "Comprensivo y paciente" },
  { id: "direct", label: "Directo", emoji: "🎯", description: "Claro y sin rodeos" },
  { id: "close", label: "Cercano", emoji: "👋", description: "Personal y familiar" },
  { id: "patient", label: "Paciente", emoji: "⏰", description: "Tolerante y detallista" },
  { id: "proactive", label: "Proactivo", emoji: "💡", description: "Toma la iniciativa" },
  { id: "technical", label: "Técnico", emoji: "🔧", description: "Preciso y especializado" },
];

export const PERSONALITY_PRESETS: PersonalityPreset[] = [
  {
    id: "sales",
    label: "Asistente de Ventas",
    description: "Amigable, persuasivo y orientado a cerrar ventas",
    agent_personality: "Soy un asesor de ventas amigable y profesional. Mi objetivo es ayudar a los clientes a encontrar los productos perfectos para sus necesidades. Soy proactivo en ofrecer sugerencias y siempre busco superar las expectativas.",
    use_emojis: "moderate",
    traits: ["friendly", "proactive", "close"],
    icon: "🛒",
  },
  {
    id: "support",
    label: "Soporte Técnico",
    description: "Empático, paciente y orientado a resolver problemas",
    agent_personality: "Soy un agente de soporte técnico paciente y empático. Mi prioridad es entender el problema del cliente y guiarlo hacia la mejor solución. Soy detallista y me aseguro de que el cliente quede completamente satisfecho.",
    use_emojis: "never",
    traits: ["empathetic", "patient", "technical"],
    icon: "📞",
  },
  {
    id: "admin",
    label: "Asistente Admin",
    description: "Directo, eficiente y orientado a tareas",
    agent_personality: "Soy un asistente administrativo eficiente y directo. Mi objetivo es ayudar con tareas como agendar citas, gestionar información y coordinar actividades. Soy organizado y preciso en mi trabajo.",
    use_emojis: "never",
    traits: ["direct", "professional", "proactive"],
    icon: "💼",
  },
  {
    id: "concierge",
    label: "Concierge",
    description: "Cálido, servicial y orientado a la experiencia del cliente",
    agent_personality: "Soy un conserje cálido y servicial. Mi misión es hacer que la experiencia del cliente sea excepcional. Soy muy amigable, anticipo necesidades y siempre estoy dispuesto a ayudar de manera personalizada.",
    use_emojis: "always",
    traits: ["friendly", "close", "empathetic"],
    icon: "🏨",
  },
];

export const TOOL_CATEGORIES: ToolCategory[] = [
  { id: "crm", label: "CRM", icon: "📊", color: "blue" },
  { id: "email", label: "Email", icon: "📧", color: "green" },
  { id: "data", label: "Datos", icon: "💾", color: "purple" },
  { id: "voice", label: "Voz", icon: "📞", color: "orange" },
  { id: "api", label: "API", icon: "🔗", color: "red" },
  { id: "calendar", label: "Calendario", icon: "📅", color: "yellow" },
  { id: "files", label: "Archivos", icon: "📁", color: "cyan" },
  { id: "analytics", label: "Analytics", icon: "📈", color: "pink" },
  { id: "messaging", label: "Mensajería", icon: "💬", color: "emerald" },
  { id: "payment", label: "Pagos", icon: "💳", color: "amber" },
];

export const TOOL_SUGGESTIONS_BY_INDUSTRY: Record<string, string[]> = {
  "Retail": ["Google Sheets", "HubSpot", "Shopify", "WhatsApp Business", "Instagram"],
  "Restaurantes": ["Google Sheets", "WhatsApp Business", "Instagram", "Delivery apps"],
  "Servicios": ["Google Calendar", "Google Meet", "HubSpot", "WhatsApp Business", "Email"],
  "Tecnología": ["GitHub", "Jira", "Slack", "Google Sheets", "Email"],
  "Salud": ["Google Sheets", "Google Calendar", "WhatsApp Business", "Email", "HIPAA tools"],
  "Educación": ["Google Classroom", "Zoom", "Google Forms", "YouTube", "Google Sheets"],
  "Finanzas": ["QuickBooks", "Xero", "Google Sheets", "Email", "Stripe"],
  "Inmobiliaria": ["Google Sheets", "HubSpot", "WhatsApp Business", "Email", "Calendar"],
};

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: "sales",
    label: "Asistente de Ventas",
    description: "Configuración completa para ventas, con gestión de clientes y seguimiento",
    icon: "🛒",
    suggestedTools: ["Google Sheets", "HubSpot", "WhatsApp Business"],
    presetPersonality: { use_emojis: "moderate", traits: ["friendly", "proactive"] },
    prefill: {
      agent_description: "Soy un asesor de ventas amigable y profesional que ayuda a los clientes a encontrar los productos perfectos para sus necesidades.",
    },
    industry: "Retail",
  },
  {
    id: "support",
    label: "Soporte Técnico",
    description: "Ayuda a clientes con problemas técnicos y escalamiento inteligente",
    icon: "📞",
    suggestedTools: ["Google Sheets", "Google Calendar", "WhatsApp Business", "Knowledge Base"],
    presetPersonality: { use_emojis: "never", traits: ["empathetic", "patient"] },
    prefill: {
      agent_description: "Soy un agente de soporte técnico paciente y empático. Mi prioridad es entender el problema del cliente y guiarlo hacia la mejor solución.",
    },
    industry: "Servicios",
  },
  {
    id: "admin",
    label: "Asistente Administrativo",
    description: "Gestión de citas, agenda y tareas administrativas",
    icon: "💼",
    suggestedTools: ["Google Calendar", "Google Sheets", "Google Meet", "Email"],
    presetPersonality: { use_emojis: "never", traits: ["direct", "professional"] },
    prefill: {
      agent_description: "Soy un asistente administrativo eficiente y directo. Mi objetivo es ayudar con tareas como agendar citas y gestionar información.",
    },
    industry: "Servicios",
  },
  {
    id: "concierge",
    label: "Concierge / Recepción",
    description: "Atención al cliente cálida y personalizada",
    icon: "🏨",
    suggestedTools: ["WhatsApp Business", "Google Calendar", "Google Sheets", "Email"],
    presetPersonality: { use_emojis: "always", traits: ["friendly", "close", "empathetic"] },
    prefill: {
      agent_description: "Soy un conserje cálido y servicial. Mi misión es hacer que la experiencia del cliente sea excepcional.",
    },
    industry: "Servicios",
  },
  {
    id: "appointment",
    label: "Gestión de Citas",
    description: "Especialista en agendar y confirmar citas",
    icon: "📅",
    suggestedTools: ["Google Calendar", "Google Sheets", "WhatsApp Business", "Email"],
    presetPersonality: { use_emojis: "moderate", traits: ["professional", "proactive"] },
    prefill: {
      agent_description: "Soy un asistente de gestión de citas. Mi trabajo es ayudar a los clientes a encontrar horarios disponibles y confirmar sus citas.",
    },
    industry: "Servicios",
  },
  {
    id: "restaurant",
    label: "Asistente de Restaurante",
    description: "Atención a clientes, reservas y pedidos",
    icon: "🍽️",
    suggestedTools: ["Google Sheets", "WhatsApp Business", "Instagram", "Delivery apps"],
    presetPersonality: { use_emojis: "always", traits: ["friendly", "close"] },
    prefill: {
      agent_description: "Soy el asistente de este restaurante. Estoy aquí para ayudarte con reservas, pedidos y cualquier duda sobre nuestro menú.",
    },
    industry: "Restaurantes",
  },
];

export const COUNTRIES = [
  { code: "MX", name: "México", timezone: "America/Mexico_City" },
  { code: "CO", name: "Colombia", timezone: "America/Bogota" },
  { code: "AR", name: "Argentina", timezone: "America/Argentina/Buenos_Aires" },
  { code: "CL", name: "Chile", timezone: "America/Santiago" },
  { code: "PE", name: "Perú", timezone: "America/Lima" },
  { code: "US", name: "Estados Unidos", timezone: "America/New_York" },
  { code: "ES", name: "España", timezone: "Europe/Madrid" },
  { code: "GB", name: "Reino Unido", timezone: "Europe/London" },
];

export const LANGUAGES = [
  { code: "Spanish", name: "Español" },
  { code: "English", name: "Inglés" },
  { code: "Portuguese", name: "Portugués" },
  { code: "French", name: "Francés" },
  { code: "German", name: "Alemán" },
];

export const ACCENTS = [
  "Español de México",
  "Español de España",
  "Español de Colombia",
  "Español de Argentina",
  "Español de Chile",
  "Español de Perú",
  "Español de Estados Unidos",
  "Inglés americano",
  "Inglés británico",
];

export const BUSINESS_HOURS_PRESETS = [
  "Lunes a viernes 9am-6pm",
  "Lunes a viernes 8am-5pm",
  "Lunes a viernes 10am-7pm",
  "Lunes a sábado 9am-6pm",
  "24/7",
  "Solo horario laboral",
  "Personalizado",
];
