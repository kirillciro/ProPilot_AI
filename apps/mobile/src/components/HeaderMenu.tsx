import { router } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/lib/auth";
import {
  useTheme,
  useThemedStyles,
  type Colors,
  type ThemeMode,
} from "@/lib/theme";

const MODES: { key: ThemeMode; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "light", label: "Light" },
  { key: "dark", label: "Dark" },
];

export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const { user, signOut, deleteAccount } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  function go(path: "/models" | "/usage" | "/profiles") {
    setOpen(false);
    router.push(path);
  }

  function confirmSignOut() {
    setOpen(false);
    Alert.alert("Sign out", "You will need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", onPress: () => void signOut() },
    ]);
  }

  function confirmDelete() {
    setOpen(false);
    Alert.alert(
      "Delete account",
      "This permanently deletes your account and usage history.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deleteAccount().catch((err: unknown) =>
              Alert.alert(
                "Error",
                err instanceof Error ? err.message : "Could not delete",
              ),
            ),
        },
      ],
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Menu"
      >
        <SymbolView
          name="ellipsis.circle"
          size={26}
          tintColor={colors.primary}
        />
      </Pressable>

      <Modal
        transparent
        visible={open}
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setOpen(false)}
        />
        <SafeAreaView
          edges={["top"]}
          style={styles.host}
          pointerEvents="box-none"
        >
          <View style={styles.menu}>
            {user?.email || user?.name ? (
              <Text style={styles.who} numberOfLines={1}>
                {user.name ?? user.email}
              </Text>
            ) : null}
            <Item label="Category" onPress={() => go("/profiles")} />
            <Item label="Models" onPress={() => go("/models")} />
            <Item label="Usage & Billing" onPress={() => go("/usage")} />
            <ThemeRow />
            <Item label="Sign out" onPress={confirmSignOut} />
            <Item label="Delete account" onPress={confirmDelete} danger />
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}

function ThemeRow() {
  const { mode, setMode, scheme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.themeRow}>
      <Text style={styles.itemText}>
        Theme{mode === "auto" ? ` · auto (${scheme})` : ""}
      </Text>
      <View style={styles.segments}>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            onPress={() => setMode(m.key)}
            style={[styles.segment, mode === m.key && styles.segmentActive]}
          >
            <Text
              style={[
                styles.segmentText,
                mode === m.key && styles.segmentTextActive,
              ]}
            >
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Item({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <Text style={[styles.itemText, danger && styles.danger]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    host: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      alignItems: "flex-end",
      paddingTop: 48,
      paddingRight: 12,
    },
    menu: {
      minWidth: 240,
      backgroundColor: c.menu,
      borderRadius: 14,
      paddingVertical: 6,
      shadowColor: "#000",
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    who: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      color: c.textMuted,
      fontSize: 13,
    },
    item: { paddingHorizontal: 16, paddingVertical: 13 },
    pressed: { backgroundColor: c.muted },
    itemText: { fontSize: 16, color: c.text },
    danger: { color: c.danger },
    themeRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    segments: {
      flexDirection: "row",
      backgroundColor: c.muted,
      borderRadius: 10,
      padding: 3,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 7,
      borderRadius: 8,
    },
    segmentActive: { backgroundColor: c.primary },
    segmentText: { fontSize: 14, color: c.textSoft, fontWeight: "500" },
    segmentTextActive: { color: c.onPrimary },
  });
