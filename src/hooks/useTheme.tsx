import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";

export type AppTheme = "default" | "clean";

const STORAGE_KEY = "app-theme";

/** Users that get the clean theme by default (until they choose otherwise). */
const CLEAN_BY_DEFAULT_EMAILS = ["korinpeer7711@gmail.com"];

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (t: AppTheme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "default",
  setTheme: () => {},
});

const applyTheme = (theme: AppTheme) => {
  document.documentElement.classList.toggle("theme-clean", theme === "clean");
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [theme, setThemeState] = useState<AppTheme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "clean" || stored === "default" ? stored : "default";
  });

  // Default the clean theme for specific users who never picked one.
  useEffect(() => {
    const email = user?.email?.toLowerCase();
    if (!email) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    if (CLEAN_BY_DEFAULT_EMAILS.includes(email)) setThemeState("clean");
  }, [user?.email]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = (t: AppTheme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
