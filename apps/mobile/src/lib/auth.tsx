import * as AppleAuthentication from "expo-apple-authentication";
import * as LocalAuthentication from "expo-local-authentication";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MeResponse, SessionResponse } from "@propilot/shared";
import * as api from "./api";
import {
  clearSession,
  getAccessToken,
  hasStoredSession,
  setOnSessionExpired,
  signOutRemote,
  storeSession,
} from "./session";

type Status = "loading" | "locked" | "signedOut" | "signedIn";

type AuthContextValue = {
  status: Status;
  user: MeResponse | null;
  setUser: (user: MeResponse) => void;
  /** Face ID / Touch ID (or device passcode) and then restore the session. Returns an error message or null. */
  unlock: () => Promise<string | null>;
  signInWithApple: () => Promise<void>;
  requestEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  /** Forget the stored session without a server call (used by "use another account"). */
  forgetDevice: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    setOnSessionExpired(() => {
      setUser(null);
      setStatus("signedOut");
    });
    hasStoredSession().then((has) => setStatus(has ? "locked" : "signedOut"));
  }, []);

  const finishLogin = useCallback(async (session: SessionResponse) => {
    await storeSession(session);
    setUser(await api.getMe());
    setStatus("signedIn");
  }, []);

  const unlock = useCallback(async () => {
    try {
      const [hasHardware, enrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (hasHardware && enrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Unlock ProPilot AI",
        });
        if (!result.success) return "Authentication was cancelled.";
      }
      const token = await getAccessToken();
      if (!token) {
        setStatus("signedOut");
        return null;
      }
      setUser(await api.getMe());
      setStatus("signedIn");
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not unlock.";
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
    } catch (err) {
      if ((err as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
      throw err;
    }
    if (!credential.identityToken)
      throw new Error("Apple did not return a token.");
    const fullName = [
      credential.fullName?.givenName,
      credential.fullName?.familyName,
    ]
      .filter(Boolean)
      .join(" ");
    await finishLogin(
      await api.loginWithApple(credential.identityToken, fullName || undefined),
    );
  }, [finishLogin]);

  const verifyEmailCode = useCallback(
    async (email: string, code: string) =>
      finishLogin(await api.verifyEmailCode(email, code)),
    [finishLogin],
  );

  const signOut = useCallback(async () => {
    await signOutRemote();
    setUser(null);
    setStatus("signedOut");
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.deleteMe();
    await clearSession();
    setUser(null);
    setStatus("signedOut");
  }, []);

  const forgetDevice = useCallback(async () => {
    await clearSession();
    setStatus("signedOut");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      setUser,
      unlock,
      signInWithApple,
      requestEmailCode: api.requestEmailCode,
      verifyEmailCode,
      signOut,
      deleteAccount,
      forgetDevice,
    }),
    [
      status,
      user,
      unlock,
      signInWithApple,
      verifyEmailCode,
      signOut,
      deleteAccount,
      forgetDevice,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
