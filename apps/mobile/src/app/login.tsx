import * as AppleAuthentication from "expo-apple-authentication";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import { APPLE_SIGNIN_ENABLED } from "@/lib/config";
import { useThemedStyles, type Colors } from "@/lib/theme";

export default function LoginScreen() {
  const auth = useAuth();
  const styles = useThemedStyles(createStyles);
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Image
            source={require("../../assets/images/icon.png")}
            style={styles.logo}
          />
          <Text style={styles.title}>ProPilot AI</Text>
          <Text style={styles.subtitle}>Your AI co-pilot for the workshop</Text>
          {auth.status === "locked" ? <Unlock /> : <SignIn />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Unlock() {
  const { unlock, forgetDevice } = useAuth();
  const styles = useThemedStyles(createStyles);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  async function run() {
    setBusy(true);
    setError(await unlock());
    setBusy(false);
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.block}>
      {busy ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton
        label="Unlock with Face ID"
        onPress={run}
        disabled={busy}
      />
      <Pressable onPress={() => void forgetDevice()}>
        <Text style={styles.link}>Use another account</Text>
      </Pressable>
    </View>
  );
}

function SignIn() {
  const { signInWithApple, requestEmailCode, verifyEmailCode } = useAuth();
  const styles = useThemedStyles(createStyles);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!APPLE_SIGNIN_ENABLED) return;
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable);
  }, []);

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const sendCode = () =>
    guarded(async () => {
      await requestEmailCode(email.trim());
      setStep("code");
    });
  const verify = () =>
    guarded(() => verifyEmailCode(email.trim(), code.trim()));

  return (
    <View style={styles.block}>
      {appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={
            AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
          }
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={styles.apple}
          onPress={() => guarded(signInWithApple)}
        />
      ) : null}

      <Text style={styles.or}>
        {appleAvailable ? "or continue with email" : "Sign in with email"}
      </Text>

      {step === "email" ? (
        <>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
          <PrimaryButton
            label="Send code"
            onPress={sendCode}
            disabled={busy || !email.includes("@")}
          />
        </>
      ) : (
        <>
          <Text style={styles.hint}>
            Enter the 6-digit code sent to {email.trim()}
          </Text>
          <TextInput
            style={[styles.input, styles.code]}
            value={code}
            onChangeText={setCode}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            textContentType="oneTimeCode"
            autoFocus
          />
          <PrimaryButton
            label="Sign in"
            onPress={verify}
            disabled={busy || code.length !== 6}
          />
          <Pressable onPress={() => setStep("email")}>
            <Text style={styles.link}>Use a different email</Text>
          </Pressable>
        </>
      )}

      {busy ? <ActivityIndicator /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    safe: { flex: 1, backgroundColor: c.bg },
    content: { flexGrow: 1, justifyContent: "center", padding: 24, gap: 8 },
    logo: { width: 96, height: 96, borderRadius: 22, alignSelf: "center" },
    title: {
      fontSize: 30,
      fontWeight: "700",
      textAlign: "center",
      marginTop: 12,
      color: c.text,
    },
    subtitle: { color: c.textMuted, textAlign: "center", marginBottom: 24 },
    block: { gap: 12 },
    apple: { height: 48, width: "100%" },
    or: { textAlign: "center", color: c.textFaint, marginVertical: 4 },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 13,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.inputBg,
    },
    code: { textAlign: "center", fontSize: 24, letterSpacing: 8 },
    hint: { textAlign: "center", color: c.textSoft },
    button: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: c.onPrimary, fontWeight: "600", fontSize: 16 },
    link: { color: c.primary, textAlign: "center", paddingVertical: 6 },
    error: { color: c.danger, textAlign: "center" },
  });
