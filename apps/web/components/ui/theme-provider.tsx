"use client";

import type { ReactNode } from "react";

type ThemeProviderProps = {
  children: ReactNode;
  attribute?: string;
  defaultTheme?: string;
  enableSystem?: boolean;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  return <>{children}</>;
}