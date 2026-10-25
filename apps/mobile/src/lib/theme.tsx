import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Appearance, AppState } from "react-native";

export type ThemeMode = "auto" | "light" | "dark";

const light = {
  bg: "#ffffff",
  surface: "#f9fafb",
  muted: "#f3f4f6",
  inputBg: "#ffffff",
  menu: "#ffffff",
  border: "#d1d5db",
  borderSoft: "#e5e7eb",
  text: "#111827",
  textSoft: "#374151",
  textMuted: "#6b7280",
  textFaint: "#9ca3af",
  primary: "#1d4ed8",
  onPrimary: "#ffffff",
  primarySoft: "#eff6ff",
  primarySoftText: "#1d4ed8",
  danger: "#dc2626",
};

export type Colors = Record<keyof typeof light, string>;

const dark: Colors = {
  bg: "#0e1116",
  surface: "#171b22",
  muted: "#222730",
  inputBg: "#171b22",
  menu: "#1f242d",
  border: "#343b47",
  borderSoft: "#262c36",
  text: "#f3f4f6",
  textSoft: "#d1d5db",
  textMuted: "#9ca3af",
  textFaint: "#6b7280",
  primary: "#3b82f6",
  onPrimary: "#ffffff",
  primarySoft: "#172554",
  primarySoftText: "#93c5fd",
  danger: "#f87171",
};

// "Auto" follows the clock because the phone's own appearance setting is not what's wanted here.
const DAY_STARTS = 7;
const DAY_ENDS = 19;
const isDaytime = (d: Date) =>
  d.getHours() >= DAY_STARTS && d.getHours() < DAY_ENDS;

const STORAGE_KEY = "theme-mode";

type ThemeValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  scheme: "light" | "dark";
  colors: Colors;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((v) => {
        if (v === "auto" || v === "light" || v === "dark") setModeState(v);
      })
      .catch(() => undefined);
  }, []);

  // Re-check the time every minute and when the app returns to the foreground.
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 60_000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setNow(new Date());
    });
    return () => {
      clearInterval(tick);
      sub.remove();
    };
  }, []);

  const scheme: "light" | "dark" =
    mode === "auto" ? (isDaytime(now) ? "light" : "dark") : mode;

  // Makes native pieces (alerts, action sheets, keyboard) match the chosen theme.
  useEffect(() => {
    Appearance.setColorScheme(scheme);
  }, [scheme]);

  const value = useMemo<ThemeValue>(
    () => ({
      mode,
      setMode: (next) => {
        setModeState(next);
        void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => undefined);
      },
      scheme,
      colors: scheme === "dark" ? dark : light,
    }),
    [mode, scheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Builds a StyleSheet from the current palette; pass a module-level factory. */
export function useThemedStyles<T>(create: (colors: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => create(colors), [create, colors]);
}
