import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ModelProvider } from "@/lib/model";
import { ProfileProvider } from "@/lib/profile";
import { ThemeProvider, useTheme } from "@/lib/theme";

function Routes() {
  const { status } = useAuth();
  const { colors, scheme } = useTheme();

  if (status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  const signedIn = status === "signedIn";
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="models" />
          <Stack.Screen name="usage" />
          <Stack.Screen name="profiles" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ModelProvider>
          <ProfileProvider>
            <Routes />
          </ProfileProvider>
        </ModelProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
