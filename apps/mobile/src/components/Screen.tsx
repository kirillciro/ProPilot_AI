import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemedStyles, type Colors } from "@/lib/theme";

export const HEADER_HEIGHT = 48;

type Props = {
  title: string;
  back?: boolean;
  right?: ReactNode;
  bottomInset?: boolean;
  children: ReactNode;
};

// Every screen draws its own header inside the safe area, so nothing sits under the status bar or notch.
export function Screen({
  title,
  back,
  right,
  bottomInset = true,
  children,
}: Props) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.root}>
      <SafeAreaView edges={["top"]} style={styles.headerWrap}>
        <View style={styles.header}>
          <View style={styles.side}>
            {back ? (
              <Pressable onPress={() => router.back()} hitSlop={12}>
                <Text style={styles.back}>‹ Back</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <View style={[styles.side, styles.right]}>{right}</View>
        </View>
      </SafeAreaView>
      <SafeAreaView
        edges={bottomInset ? ["bottom", "left", "right"] : ["left", "right"]}
        style={styles.body}
      >
        {children}
      </SafeAreaView>
    </View>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    headerWrap: {
      backgroundColor: c.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    header: {
      height: HEADER_HEIGHT,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
    },
    side: { width: 80 },
    right: { alignItems: "flex-end" },
    title: {
      flex: 1,
      textAlign: "center",
      fontSize: 17,
      fontWeight: "600",
      color: c.text,
    },
    back: { color: c.primary, fontSize: 17 },
    body: { flex: 1 },
  });
