/**
 * Títulos en español para cada campo (sin jerga técnica).
 * Se muestran como label en el formulario en lugar del nombre técnico.
 */
export const PROPERTY_TITLES: Record<string, Record<string, string>> = {
  agent: {
    isAuthEnable: "Usar mensajes distintos si el usuario está identificado",
    injectCommandsInPrompt: "Inyectar comandos en el prompt",
    isMemoryEnable: "Activar memoria del usuario entre conversaciones",
    isMultiMessageEnable: "Permitir varias respuestas en un solo mensaje",
    isMultiMessageResponseEnable: "Esperar unos segundos antes de responder (agrupar mensajes)",
    maxFunctionCalls: "Máximo de llamadas a herramientas por turno (1–8)",
    omitFirstEchoes: "Ignorar el primer mensaje de tipo eco (ej. WhatsApp)",
    isValidatorAgentEnable: "Activar agente validador",
    excludedNumbers: "Números de WhatsApp excluidos (uno por línea)",
  },
  ai: {
    model: "Modelo de Vertex AI",
    temperature: "Temperatura del LLM (0–1)",
    "thinking.budget": "Presupuesto de thinking (tokens)",
    "thinking.includeThoughts": "Incluir pensamientos (thinking) en la respuesta",
    "thinking.level": "Nivel de thinking del modelo",
  },
  answer: {
    notSupport: "Mensaje cuando el usuario envía algo no soportado (audio, video, etc.)",
  },
  response: {
    maxResponseLinesEnabled: "Limitar renglones de la respuesta",
    maxResponseLines: "Máximo de renglones a enviar",
    waitTime: "Segundos de espera antes de procesar",
  },
  time: {
    zone: "Zona horaria del agente",
  },
  prompt: {
    "auth.auth": "Texto extra cuando el usuario está identificado",
    "auth.unauth": "Texto extra cuando el usuario no está identificado",
    isMultiFunctionCallingEnable: "Permitir uso de herramientas por el agente",
    model: "Modelo de Vertex AI",
    temperature: "Temperatura del LLM (0–1)",
  },
  memory: {
    limit: "Cantidad máxima de recuerdos a cargar",
  },
  mcp: {
    maxRetries: "Máximo de reintentos si el validador marca la respuesta como inválida",
  },
};

/**
 * Descripciones de cada property para mostrar como label/helper en el formulario.
 * Fuente: MCP-KAI-AGENTS/docs/AGENT_PROPERTIES.md
 */
export const PROPERTY_DESCRIPTIONS: Record<
  string,
  Record<string, string>
> = {
  agent: {
    isAuthEnable:
      "Si está en true, se usan prompts distintos según si el usuario está autenticado o no. Las cadenas vienen del documento prompt (auth.auth y auth.unauth).",
    injectCommandsInPrompt:
      "Si está activado, se cargan los comandos del documento properties/commands y se inyectan en el system prompt: triggers e instrucción de usar la herramienta send_command para enviar los mensajes predefinidos.",
    isMemoryEnable:
      "Si está en true, se activa la memoria dinámica: se cargan datos previos del usuario desde Firestore y se inyectan en el system prompt. El límite de ítems se toma del documento memory (campo limit).",
    isMultiMessageEnable:
      "Si está en true, el modelo puede devolver varios mensajes en una sola respuesta (formato JSON array).",
    isMultiMessageResponseEnable:
      "Si está en true, se activa el debouncing: al llegar un mensaje se espera waitTime segundos antes de procesar; si en ese tiempo llega otro mensaje del mismo usuario, solo se responde al último.",
    maxFunctionCalls:
      "Número máximo de llamadas a herramientas por turno en el bucle MCP. Valor entre 1 y 8; por defecto 4. Limita cuántas veces puede usar herramientas el modelo en una misma respuesta.",
    omitFirstEchoes:
      "Si está en true, el primer mensaje de tipo echo del usuario no se procesa. Útil para no contar el primer eco de WhatsApp como mensaje real.",
    isValidatorAgentEnable:
      "Si está en true, se activa el agente validador. El backend usa además el documento mcp (campo maxRetries) para el máximo de reintentos si el validador marca la respuesta como inválida.",
    excludedNumbers:
      "Lista de números de WhatsApp (IDs) que quedan excluidos del agente: no se procesan sus mensajes ni se envía respuesta. Un número por línea.",
  },
  ai: {
    model:
      "Modelo de Vertex AI / Gemini usado para las respuestas del agente (p. ej. gemini-2.5-flash). Fuente de verdad para el runtime.",
    temperature:
      "Temperatura del LLM (0–1). Valores más altos dan respuestas más variadas; más bajos más deterministas. Fuente de verdad para el runtime.",
    "thinking.includeThoughts":
      "Si está en true, el modelo devuelve los pensamientos en la respuesta. Si está en false, no los devuelve (pero se puede usar level o budget para más razonamiento interno).",
    "thinking.level":
      "Nivel de thinking del modelo (minimal, low, medium, high). Puede usarse con includeThoughts en false para más razonamiento interno sin exponer pensamientos.",
    "thinking.budget":
      "Presupuesto en tokens: 0 = desactivado, -1 = automático, número positivo = tokens. Controla cuánto puede \"pensar\" el modelo internamente.",
  },
  answer: {
    notSupport:
      "Mensaje que se envía al usuario cuando manda un tipo de mensaje no soportado (por ejemplo audio, video). Se usa cuando message.type === unsupported.",
  },
  response: {
    maxResponseLinesEnabled:
      "Si está activado, la respuesta de texto al usuario se trunca a un máximo de líneas. Por defecto desactivado.",
    maxResponseLines:
      "Número máximo de renglones a enviar en cada mensaje. Solo aplica si el límite está activado. Si no se indica, se usa 50.",
    waitTime:
      "Segundos que se esperan antes de procesar el mensaje cuando está activo el debouncing. En ese intervalo se agrupan mensajes del mismo usuario.",
  },
  time: {
    zone: "Zona horaria (IANA) usada para formatear la fecha actual que se inyecta en el system prompt del LLM.",
  },
  prompt: {
    "auth.auth":
      "Texto que se inyecta en el system prompt cuando el usuario está autenticado. Solo se usa si isAuthEnable es true.",
    "auth.unauth":
      "Texto que se inyecta en el system prompt cuando el usuario no está autenticado. Solo se usa si isAuthEnable es true.",
    isMultiFunctionCallingEnable:
      "Si está en false, no se incluye en el system prompt la instrucción de FUNCTION CALLING (múltiples llamadas a herramientas). Útil para agentes que no usan tools.",
    model:
      "Modelo de Vertex AI / Gemini usado para las respuestas del agente (p. ej. gemini-2.5-flash).",
    temperature:
      "Temperatura del LLM (0–1). Valores más altos dan respuestas más variadas; más bajos más deterministas.",
  },
  memory: {
    limit:
      "Número máximo de ítems de memoria a cargar cuando isMemoryEnable es true.",
  },
  mcp: {
    maxRetries:
      "Solo se usa cuando el agente validador está activo. Número máximo de reintentos si el validador marca la respuesta del LLM como inválida (por defecto 1).",
  },
};
