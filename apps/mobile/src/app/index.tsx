import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PROFILES, type ConversationSummary } from "@propilot/shared";
import { HeaderMenu } from "@/components/HeaderMenu";
import { Screen } from "@/components/Screen";
import {
  deleteConversation,
  listConversations,
  patchConversation,
} from "@/lib/api";
import { useThemedStyles, type Colors } from "@/lib/theme";

const profileLabel = (slug: string) =>
  PROFILES.find((p) => p.slug === slug)?.label ?? slug;

function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { day: "numeric", month: "short" });
}

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(createStyles);
  const [showArchived, setShowArchived] = useState(false);
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      listConversations(showArchived)
        .then((list) => {
          setItems(list);
          setError(null);
        })
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Could not load chats"),
        ),
    [showArchived],
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function openMenu(c: ConversationSummary) {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: c.title,
        options: [
          "Rename",
          c.archived ? "Unarchive" : "Archive",
          "Delete",
          "Cancel",
        ],
        destructiveButtonIndex: 2,
        cancelButtonIndex: 3,
      },
      (index) => {
        if (index === 0) rename(c);
        else if (index === 1)
          void change(patchConversation(c.id, { archived: !c.archived }));
        else if (index === 2) confirmDelete(c);
      },
    );
  }

  function rename(c: ConversationSummary) {
    Alert.prompt(
      "Rename chat",
      undefined,
      (title) => {
        if (title?.trim()) void change(patchConversation(c.id, { title }));
      },
      "plain-text",
      c.title,
    );
  }

  function confirmDelete(c: ConversationSummary) {
    Alert.alert("Delete chat", "This permanently deletes the conversation.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void change(deleteConversation(c.id)),
      },
    ]);
  }

  async function change(action: Promise<unknown>) {
    try {
      await action;
      await load();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed");
    }
  }

  return (
    <Screen title="ProPilot AI" right={<HeaderMenu />}>
      <View style={styles.tabs}>
        {[false, true].map((archived) => (
          <Pressable
            key={String(archived)}
            onPress={() => {
              setItems(null);
              setShowArchived(archived);
            }}
            style={[styles.tab, showArchived === archived && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                showArchived === archived && styles.tabTextActive,
              ]}
            >
              {archived ? "Archived" : "Chats"}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={items ?? []}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 90 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {error ??
              (items === null
                ? "Loading…"
                : showArchived
                  ? "No archived chats."
                  : "No chats yet. Tap New chat to start.")}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push({ pathname: "/chat/[id]", params: { id: item.id } })
            }
            onLongPress={() => openMenu(item)}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rowBody}>
              <View style={styles.rowTop}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.time}>{when(item.updatedAt)}</Text>
              </View>
              <Text style={styles.preview} numberOfLines={2}>
                {item.preview || "No messages"}
              </Text>
              <Text style={styles.tag}>{profileLabel(item.profile)}</Text>
            </View>
            <Pressable onPress={() => openMenu(item)} hitSlop={10}>
              <Text style={styles.dots}>⋯</Text>
            </Pressable>
          </Pressable>
        )}
      />

      <Pressable
        onPress={() =>
          router.push({ pathname: "/chat/[id]", params: { id: "new" } })
        }
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
      >
        <Text style={styles.fabText}>+ New chat</Text>
      </Pressable>
    </Screen>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    tabs: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    tab: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: c.muted,
    },
    tabActive: { backgroundColor: c.primary },
    tabText: { color: c.textSoft, fontWeight: "500" },
    tabTextActive: { color: c.onPrimary },
    empty: {
      textAlign: "center",
      color: c.textMuted,
      marginTop: 60,
      paddingHorizontal: 24,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderSoft,
    },
    pressed: { backgroundColor: c.muted },
    rowBody: { flex: 1, gap: 3 },
    rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    title: { flex: 1, fontSize: 16, fontWeight: "600", color: c.text },
    time: { fontSize: 12, color: c.textFaint },
    preview: { fontSize: 14, color: c.textMuted },
    tag: { fontSize: 12, color: c.primarySoftText },
    dots: { fontSize: 24, color: c.textMuted, paddingHorizontal: 6 },
    fab: {
      position: "absolute",
      right: 16,
      backgroundColor: c.primary,
      borderRadius: 24,
      paddingHorizontal: 20,
      paddingVertical: 14,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    fabText: { color: c.onPrimary, fontWeight: "600", fontSize: 16 },
  });
