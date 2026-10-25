import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text } from "react-native";
import { PROFILES } from "@propilot/shared";
import { Screen } from "@/components/Screen";
import { useProfile } from "@/lib/profile";
import { useThemedStyles, type Colors } from "@/lib/theme";

export default function ProfilesScreen() {
  const { profile, setProfile } = useProfile();
  const styles = useThemedStyles(createStyles);
  return (
    <Screen title="Category" back>
      <FlatList
        data={PROFILES}
        keyExtractor={(p) => p.slug}
        ListHeaderComponent={
          <Text style={styles.note}>
            The category tunes how the assistant answers. Universal is for
            anything.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setProfile(item.slug);
              router.back();
            }}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <Text style={styles.name}>{item.label}</Text>
            {item.slug === profile ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        )}
      />
    </Screen>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    note: { color: c.textMuted, fontSize: 13, padding: 16 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderSoft,
    },
    pressed: { backgroundColor: c.muted },
    name: { fontSize: 16, color: c.text },
    check: { fontSize: 20, color: c.primary, fontWeight: "700" },
  });
