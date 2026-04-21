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
  | "pipelines"
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

export type PersonalityTone = "formal" | "casual" | "professional" | "friendly";

export type ResponseLength = "short" | "medium" | "long";

export type ConversationStyle = "interrogative" | "informative";

export type StageType = "OPPORTUNITIES" | "INTEREST" | "REQUIRES_ATTENTION" | "COMPLETED" | "CANCELLED";

export interface Stage {
  id: string;
  name: string;
  stageType: StageType | null;
  order: number;
  color: string;
  icon: string;
  description?: string;
  isClosedWon: boolean;
  isClosedLost: boolean;
  isDefault: boolean;
}

export interface Pipeline {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  stages: Stage[];
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
  tone: PersonalityTone;
  greetingMessage: string;
  responseLength: ResponseLength;
  requiredPhrases: string[];
  topicsToAvoid: string[];
  conversationStyle: ConversationStyle;
  brandValues: string[];
  policies: string;
  selected_tools: string[];
  /** Manual de flujos de herramientas (markdown en español); vacío si se omite el paso. */
  toolFlowsMarkdownEs: string;
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  chat_enabled: boolean;
  require_auth: boolean;
  /** Avanzado: alineado con properties (agent-configuration-editor). */
  ai_model: string;
  ai_temperature: number;
  response_wait_time: number;
  is_memory_enable: boolean;
  is_multi_message_response_enable: boolean;
  is_validator_agent_enable: boolean;
  mcp_max_retries: number;
  answer_not_support: string;
  flow_questions: AgentFlowQuestion[];
  flow_answers: Record<string, string>;
  pipelines: Pipeline[];
}

/** Modelos LLM disponibles en el constructor (misma lista que el editor de configuración). */
export const BUILDER_LLM_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
] as const;

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
  tone: "friendly",
  greetingMessage: "",
  responseLength: "medium",
  requiredPhrases: [],
  topicsToAvoid: [],
  conversationStyle: "informative",
  brandValues: [],
  policies: "",
  selected_tools: [],
  toolFlowsMarkdownEs: "",
  whatsapp_enabled: true,
  email_enabled: false,
  chat_enabled: false,
  require_auth: false,
  ai_model: "gemini-2.5-flash",
  ai_temperature: 0.05,
  response_wait_time: 3,
  is_memory_enable: false,
  is_multi_message_response_enable: true,
  is_validator_agent_enable: false,
  mcp_max_retries: 1,
  answer_not_support: "Hola súper! Cómo te llamas?",
  flow_questions: [],
  flow_answers: {},
  pipelines: [
    {
      id: "default",
      name: "Pipeline de Ventas",
      description: "Pipeline principal para gestionar leads de ventas",
      isDefault: true,
      stages: [
        {
          id: "default",
          name: "OPORTUNIDADES",
          stageType: "OPPORTUNITIES",
          order: 1,
          color: "#3B82F6",
          icon: "📥",
          description: "Lead recién llegado, primera interacción",
          isClosedWon: false,
          isClosedLost: false,
          isDefault: true,
        },
        {
          id: "",
          name: "INTERÉS",
          stageType: "INTEREST",
          order: 2,
          color: "#F59E0B",
          icon: "🔥",
          description: "Mostró intención clara de compra/servicio",
          isClosedWon: false,
          isClosedLost: false,
          isDefault: false,
        },
        {
          id: "",
          name: "REQUIERE ATENCIÓN",
          stageType: "REQUIRES_ATTENTION",
          order: 3,
          color: "#EF4444",
          icon: "👤",
          description: "Necesita intervención de un humano",
          isClosedWon: false,
          isClosedLost: false,
          isDefault: false,
        },
        {
          id: "",
          name: "COMPLETADO",
          stageType: "COMPLETED",
          order: 4,
          color: "#10B981",
          icon: "✅",
          description: "Cuando completa el flujo exitosamente",
          isClosedWon: true,
          isClosedLost: false,
          isDefault: false,
        },
        {
          id: "",
          name: "CANCELADO",
          stageType: "CANCELLED",
          order: 5,
          color: "#6B7280",
          icon: "❌",
          description: "Cuando se cancela o pierde el lead",
          isClosedWon: false,
          isClosedLost: true,
          isDefault: false,
        },
      ],
    },
  ],
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
    description:
      "Modelo IA, tiempos de respuesta, memoria, herramientas, validador, mensajes y acceso",
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
    id: "pipelines",
    title: "Pipelines",
    description: "Configura los estados y etapas de tu pipeline de ventas",
    icon: "📊",
    required: false,
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

export const STAGE_TYPES: { value: StageType; label: string; description: string }[] = [
  { value: "OPPORTUNITIES", label: "Oportunidades", description: "Lead recién llegado" },
  { value: "INTEREST", label: "Interés", description: "Mostró intención clara" },
  { value: "REQUIRES_ATTENTION", label: "Requiere Atención", description: "Necesita intervención humana" },
  { value: "COMPLETED", label: "Completado", description: "Cerrado exitosamente" },
  { value: "CANCELLED", label: "Cancelado", description: "Cancelado o perdido" },
];

export const STAGE_COLORS = [
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#EF4444", // red
  "#10B981", // green
  "#6B7280", // gray
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
  "#84CC16", // lime
];

export const STAGE_ICONS = ["📥", "🔥", "👤", "✅", "❌", "📅", "💰", "🤝", "💼", "🎯", "📞", "💬"];
