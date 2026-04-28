/**
 * Títulos en español para cada campo (sin jerga técnica).
 * Se muestran como label en el formulario en lugar del nombre técnico.
 */
export const PROPERTY_TITLES: Record<string, Record<string, string>> = {
  agent: {
    isAuthEnable: "Usar mensajes distintos si el usuario está identificado",
    injectCommandsInPrompt: "Permitir respuestas rápidas configuradas",
    isMemoryEnable: "Activar memoria del usuario entre conversaciones",
    isMultiMessageEnable: "Permitir varias respuestas en un solo mensaje",
    isMultiMessageResponseEnable: "Esperar unos segundos antes de responder (agrupar mensajes)",
    maxFunctionCalls: "Máximo de acciones que puede hacer por respuesta (1–8)",
    omitFirstEchoes: "Ignorar el primer mensaje enviado por el negocio",
    isValidatorAgentEnable: "Revisar la respuesta antes de enviarla",
    excludedNumbers: "Números de WhatsApp excluidos (uno por línea)",
  },
  limitation: {
    userLimitation: "Solo responder a números de la lista permitida",
    allowedUsers: "Números permitidos (uno por línea)",
  },
  ai: {
    model: "Modelo de IA",
    temperature: "Creatividad de las respuestas (0–1)",
    "thinking.budget": "Tiempo de razonamiento interno",
    "thinking.includeThoughts": "Mostrar razonamiento interno",
    "thinking.level": "Nivel de razonamiento",
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
    echoesWaitMinutes: "Tiempo de pausa tras detectar atención manual (minutos)",
  },
  prompt: {
    "auth.auth": "Texto extra cuando el usuario está identificado",
    "auth.unauth": "Texto extra cuando el usuario no está identificado",
    isMultiFunctionCallingEnable: "Permitir uso de herramientas por el agente",
    model: "Modelo de IA",
    temperature: "Creatividad de las respuestas (0–1)",
  },
  memory: {
    limit: "Cantidad máxima de recuerdos a cargar",
  },
  mcp: {
    maxRetries: "Máximo de intentos si una respuesta no pasa la revisión",
    toolsMcpEndpoint: "Ambiente donde se ejecutan las herramientas",
  },
};

/**
 * Descripciones de cada property para mostrar como label/helper en el formulario.
 * Fuente: MCP-KAI-AGENTS/docs/AGENT_PROPERTIES.md
 */
export const PROPERTY_DESCRIPTIONS: Record<string, Record<string, string>> = {
  agent: {
    isAuthEnable:
      "Actívalo si quieres que el agente use un mensaje distinto para personas identificadas y no identificadas.",
    injectCommandsInPrompt:
      "Actívalo si el agente debe poder usar respuestas rápidas o mensajes ya configurados para ciertos casos.",
    isMemoryEnable:
      "Actívalo para que el agente recuerde información útil de conversaciones anteriores con la misma persona.",
    isMultiMessageEnable:
      "Permite que el agente divida una respuesta larga en varios mensajes más naturales.",
    isMultiMessageResponseEnable:
      "Hace que el agente espere un momento antes de responder para juntar varios mensajes seguidos del usuario.",
    maxFunctionCalls:
      "Limita cuántas acciones puede intentar el agente antes de enviar una respuesta. Útil para evitar respuestas lentas o demasiado complejas.",
    omitFirstEchoes:
      "Evita que el agente responda a un primer mensaje que en realidad fue enviado desde el negocio.",
    isValidatorAgentEnable:
      "Activa una revisión automática para mejorar la calidad de la respuesta antes de enviarla al usuario.",
    excludedNumbers:
      "Agrega aquí los números que el agente debe ignorar. Un número por línea.",
  },
  limitation: {
    userLimitation:
      "Actívalo si el agente solo debe responder a una lista específica de números.",
    allowedUsers:
      "Escribe los números que sí pueden hablar con el agente. Un número por línea.",
  },
  ai: {
    model:
      "Elige qué modelo de IA usará el agente para responder.",
    temperature:
      "Valores bajos hacen respuestas más consistentes; valores altos hacen respuestas más variadas.",
    "thinking.includeThoughts":
      "Muestra información adicional sobre cómo la IA llegó a su respuesta. Normalmente se deja apagado.",
    "thinking.level":
      "Define cuánto debe razonar la IA antes de responder. Niveles altos pueden tardar más.",
    "thinking.budget":
      "Controla cuánto espacio se le da a la IA para razonar antes de responder. Déjalo en automático si no necesitas ajustarlo.",
  },
  answer: {
    notSupport:
      "Mensaje que se envía cuando el usuario manda algo que el agente no puede atender, como ciertos audios, videos o archivos.",
  },
  response: {
    maxResponseLinesEnabled:
      "Actívalo si quieres evitar que el agente envíe respuestas demasiado largas.",
    maxResponseLines:
      "Cantidad máxima de líneas que puede tener una respuesta cuando el límite está activo.",
    waitTime:
      "Tiempo que el agente espera antes de responder para juntar mensajes seguidos de la misma persona.",
  },
  time: {
    zone: "Zona horaria que usará el agente para entender fechas, horarios y mensajes relacionados con tiempo.",
    echoesWaitMinutes:
      "Tiempo que el agente espera antes de volver a responder cuando detecta que una persona del equipo ya atendió la conversación.",
  },
  prompt: {
    "auth.auth":
      "Mensaje adicional que el agente usa cuando la persona ya está identificada.",
    "auth.unauth":
      "Mensaje adicional que el agente usa cuando la persona todavía no está identificada.",
    isMultiFunctionCallingEnable:
      "Actívalo si el agente necesita usar herramientas para completar tareas, consultar información o hacer acciones.",
    model:
      "Elige qué modelo de IA usará el agente para responder.",
    temperature:
      "Valores bajos hacen respuestas más consistentes; valores altos hacen respuestas más variadas.",
  },
  memory: {
    limit:
      "Cantidad máxima de recuerdos que el agente puede usar al responder.",
  },
  mcp: {
    maxRetries:
      "Solo se usa cuando la revisión automática está activa. Define cuántas veces puede intentar mejorar una respuesta antes de enviarla.",
    toolsMcpEndpoint:
      "Elige si las herramientas del agente deben trabajar con el ambiente habitual, con pruebas o con producción.",
  },
};
