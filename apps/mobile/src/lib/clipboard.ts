import { requireOptionalNativeModule } from "expo";
import { Share } from "react-native";

// Expo Go lacks the clipboard native module; the share sheet has a Copy action as fallback.
export async function copyText(text: string): Promise<boolean> {
  // Checked first because Metro logs an error when the package fails to load, even inside try/catch.
  if (requireOptionalNativeModule("ExpoClipboard")) {
    const { setStringAsync } = await import("expo-clipboard");
    await setStringAsync(text);
    return true;
  }
  await Share.share({ message: text });
  return false;
}
