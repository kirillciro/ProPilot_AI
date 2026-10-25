import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_MODEL } from "./config";

export type SelectedModel = { id: string; name: string };

const MODEL_KEY = "propilot.model";

type ModelContextValue = {
  model: SelectedModel;
  setModel: (model: SelectedModel) => void;
};

const ModelContext = createContext<ModelContextValue | null>(null);

export function ModelProvider({ children }: { children: ReactNode }) {
  const [model, setModelState] = useState<SelectedModel>(DEFAULT_MODEL);

  useEffect(() => {
    SecureStore.getItemAsync(MODEL_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<SelectedModel>;
        if (parsed.id && parsed.name)
          setModelState({ id: parsed.id, name: parsed.name });
      })
      .catch(() => {});
  }, []);

  const setModel = useCallback((next: SelectedModel) => {
    setModelState(next);
    SecureStore.setItemAsync(MODEL_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const value = useMemo(() => ({ model, setModel }), [model, setModel]);
  return (
    <ModelContext.Provider value={value}>{children}</ModelContext.Provider>
  );
}

export function useModel() {
  const ctx = useContext(ModelContext);
  if (!ctx) throw new Error("useModel must be used inside ModelProvider");
  return ctx;
}
