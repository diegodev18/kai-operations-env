"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

export type Environment = "testing" | "production";

interface EnvironmentContextValue {
  environment: Environment;
  setEnvironment: (env: Environment) => void;
  allowedEnvironments: Environment[];
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<Environment>("testing");
  const allowedEnvironments: Environment[] = ["testing", "production"];

  return (
    <EnvironmentContext.Provider value={{ environment, setEnvironment, allowedEnvironments }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (!context) {
    throw new Error("useEnvironment must be used within EnvironmentProvider");
  }
  return context;
}