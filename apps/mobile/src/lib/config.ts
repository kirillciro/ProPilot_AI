// Simulator reaches the host as localhost; a physical device needs the Mac's LAN IP via EXPO_PUBLIC_API_URL.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

export const DEFAULT_MODEL = { id: "openai/gpt-6-luna", name: "GPT-6 Luna" };

// Needs a paid Apple Developer account: add `usesAppleSignIn` + the expo-apple-authentication plugin in app.json first.
export const APPLE_SIGNIN_ENABLED =
  process.env.EXPO_PUBLIC_APPLE_SIGNIN === "1";
