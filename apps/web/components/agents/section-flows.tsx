"use client";

import { useCallback } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FORM_SECTIONS } from "@/consts/form-builder/constants";
import type {
  AgentFlowQuestion,
  FormBuilderState,
  FormSectionId,
} from "@/types";
import { FlowQuestionField } from "@/components/agents/flow-question-components";

interface SectionFlowsProps {
  state: FormBuilderState;
  onChange: (updates: Partial<FormBuilderState>) => void;
  isSaving: boolean;
  coreComplete: boolean;
  firstCoreIncomplete: FormSectionId | null;
  onGoToSection: (id: FormSectionId) => void;
  flowQuestionsLoading: boolean;
  flowQuestionsError: string | null;
  onRetryFlowQuestions: () => void;
  onRegenerateFlowQuestions: () => void;
}

function sectionTitle(id: FormSectionId): string {
  return FORM_SECTIONS.find((s) => s.id === id)?.title ?? id;
}

export function SectionFlows({
  state,
  onChange,
  isSaving,
  coreComplete,
  firstCoreIncomplete,
  onGoToSection,
  flowQuestionsLoading,
  flowQuestionsError,
  onRetryFlowQuestions,
  onRegenerateFlowQuestions,
}: SectionFlowsProps) {
  const setAnswer = useCallback(
    (field: string, value: string) => {
      onChange({
        flow_answers: { ...state.flow_answers, [field]: value },
      });
    },
    [onChange, state.flow_answers],
  );

  if (!coreComplete) {
    return (
      <div className="space-y-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Para generar preguntas sobre cómo trabajará tu asistente, completa
          primero los pasos anteriores.
        </p>
        {firstCoreIncomplete ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onGoToSection(firstCoreIncomplete)}
          >
            Ir a {sectionTitle(firstCoreIncomplete)}
          </Button>
        ) : null}
      </div>
    );
  }

  if (flowQuestionsLoading && state.flow_questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
        <Loader2Icon className="size-8 animate-spin" />
        <p>Preparando preguntas adaptadas a tu negocio…</p>
      </div>
    );
  }

  if (flowQuestionsError && state.flow_questions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-sm text-destructive">
          {flowQuestionsError}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRetryFlowQuestions}
        >
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Son unas preguntas cortas, en lenguaje sencillo, pensadas para tu tipo
        de negocio. Tus respuestas ayudan a elegir las mejores funciones para el
        asistente.
      </p>

      {state.flow_questions.map((q: AgentFlowQuestion) => (
        <div key={q.field}>
          <label className="text-sm font-medium">
            {q.label}
            {q.required !== false ? (
              <span className="text-destructive ml-1">*</span>
            ) : null}
          </label>
          <FlowQuestionField
            q={q}
            value={state.flow_answers[q.field] ?? ""}
            onChange={(v) => setAnswer(q.field, v)}
            disabled={isSaving || flowQuestionsLoading}
          />
        </div>
      ))}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRegenerateFlowQuestions}
          disabled={isSaving || flowQuestionsLoading}
        >
          {flowQuestionsLoading ? (
            <>
              <Loader2Icon className="mr-2 size-4 animate-spin" />
              Generando…
            </>
          ) : (
            "Generar otras preguntas"
          )}
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Si cambias de idea, puedes regenerar; se borrarán las respuestas
          actuales y obtendrás un nuevo cuestionario.
        </p>
      </div>
    </div>
  );
}
