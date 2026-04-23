"use client";

import type { FormBuilderState, PersonalityTrait } from "@/types";
import { cn } from "@/lib/utils";
import { StringListInput } from "@/components/shared";

interface SectionPersonalityProps {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
}

export function SectionPersonality({ state, onChange }: SectionPersonalityProps) {
  return (
    <div className="space-y-6">
      <div>
        <label className="text-sm font-medium">
          Nombre del agente <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={state.agent_name}
          onChange={(e) => onChange({ agent_name: e.target.value })}
          placeholder="Ej: Asistente de Tienda Moda"
          data-testid="form-builder-agent-name"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Personalidad <span className="text-destructive">*</span>
        </label>
        <textarea
          value={state.agent_personality}
          onChange={(e) => onChange({ agent_personality: e.target.value })}
          placeholder="Describe cómo quieres que se comporte tu agente. Ej: Soy un asesor amigable y profesional que ayuda a los clientes a encontrar los productos perfectos..."
          rows={4}
          data-testid="form-builder-agent-personality"
          className="mt-1 flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Rasgos de personalidad</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            { id: "friendly", label: "Amigable", emoji: "😄" },
            { id: "professional", label: "Profesional", emoji: "💼" },
            { id: "humorous", label: "Con humor", emoji: "😄" },
            { id: "empathetic", label: "Empático", emoji: "🤝" },
            { id: "direct", label: "Directo", emoji: "🎯" },
            { id: "close", label: "Cercano", emoji: "👋" },
            { id: "patient", label: "Paciente", emoji: "⏰" },
            { id: "proactive", label: "Proactivo", emoji: "💡" },
            { id: "technical", label: "Técnico", emoji: "🔧" },
          ].map((trait) => (
            <button
              key={trait.id}
              type="button"
              onClick={() => {
                const newTraits = state.personality_traits.includes(
                  trait.id as PersonalityTrait,
                )
                  ? state.personality_traits.filter((t) => t !== trait.id)
                  : [...state.personality_traits, trait.id as PersonalityTrait];
                onChange({ personality_traits: newTraits });
              }}
              className={cn(
                "flex items-center gap-1 rounded-full border px-3 py-1 text-sm transition-colors",
                state.personality_traits.includes(trait.id as PersonalityTrait)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              <span>{trait.emoji}</span>
              <span>{trait.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">
          Idioma <span className="text-destructive">*</span>
        </label>
        <select
          value={state.response_language}
          onChange={(e) => onChange({ response_language: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="Spanish">Español</option>
          <option value="English">Inglés</option>
          <option value="Portuguese">Portugués</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">
          Uso de emojis <span className="text-destructive">*</span>
        </label>
        <div className="mt-2 flex gap-2">
          {(["never", "moderate", "always"] as const).map((pref) => (
            <button
              key={pref}
              type="button"
              onClick={() => onChange({ use_emojis: pref })}
              className={cn(
                "flex-1 rounded-lg border py-2 text-sm transition-colors",
                state.use_emojis === pref
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted",
              )}
            >
              {pref === "never"
                ? "Nunca"
                : pref === "moderate"
                  ? "Moderados"
                  : "Siempre"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium">Acento / Dialecto</label>
        <select
          value={state.country_accent}
          onChange={(e) => onChange({ country_accent: e.target.value })}
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Selecciona un acento</option>
          <option value="Español de México">Español de México</option>
          <option value="Español de España">Español de España</option>
          <option value="Español de Colombia">Español de Colombia</option>
          <option value="Español de Argentina">Español de Argentina</option>
          <option value="Español de Chile">Español de Chile</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Firma / Despedida</label>
        <input
          type="text"
          value={state.agent_signature}
          onChange={(e) => onChange({ agent_signature: e.target.value })}
          placeholder="Ej: ¡Saludos! Que tengas un excelente día."
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">
          Tono de voz <span className="text-destructive">*</span>
        </label>
        <select
          value={state.tone}
          onChange={(e) =>
            onChange({
              tone: e.target.value as
                | "formal"
                | "casual"
                | "professional"
                | "friendly",
            })
          }
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="friendly">Amigable</option>
          <option value="professional">Profesional</option>
          <option value="formal">Formal</option>
          <option value="casual">Casual</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Mensaje de saludo</label>
        <input
          type="text"
          value={state.greetingMessage}
          onChange={(e) => onChange({ greetingMessage: e.target.value })}
          placeholder="Ej: ¡Hola! Bienvenido a nuestra tienda. ¿En qué puedo ayudarte?"
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Longitud de respuestas</label>
        <select
          value={state.responseLength}
          onChange={(e) =>
            onChange({
              responseLength: e.target.value as "short" | "medium" | "long",
            })
          }
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="short">Cortas</option>
          <option value="medium">Medias</option>
          <option value="long">Largas</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium">Frases obligatorias</label>
        <StringListInput
          value={state.requiredPhrases}
          onChange={(v) => onChange({ requiredPhrases: v })}
          placeholder="Ej: ¡Con mucho gusto!"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Temas a evitar</label>
        <StringListInput
          value={state.topicsToAvoid}
          onChange={(v) => onChange({ topicsToAvoid: v })}
          placeholder="Ej: política"
        />
      </div>

      <div>
        <label className="text-sm font-medium">Estilo conversacional</label>
        <select
          value={state.conversationStyle}
          onChange={(e) =>
            onChange({
              conversationStyle: e.target.value as
                | "interrogative"
                | "informative",
            })
          }
          className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="informative">
            Informativo (da respuestas directas)
          </option>
          <option value="interrogative">
            Interrogativo (hace preguntas para entender mejor)
          </option>
        </select>
      </div>
    </div>
  );
}
