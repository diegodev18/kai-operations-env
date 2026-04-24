import Link from "next/link";

export function AgentMissingFallback() {
  return (
    <p className="text-sm text-muted-foreground">
      Agente no especificado.{" "}
      <Link href="/" className="underline hover:text-foreground">
        Volver al inicio
      </Link>
    </p>
  );
}
