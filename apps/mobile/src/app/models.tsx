import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { ModelInfo } from "@propilot/shared";
import { Screen } from "@/components/Screen";
import { getModels } from "@/lib/api";
import { useModel } from "@/lib/model";
import { useThemedStyles, type Colors } from "@/lib/theme";

type Filter = "all" | "free" | "paid";
type Sort = "smartest" | "newest" | "cheapest";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "free", label: "Free" },
  { key: "paid", label: "Paid" },
];
const SORTS: { key: Sort; label: string }[] = [
  { key: "smartest", label: "Smartest" },
  { key: "newest", label: "Newest" },
  { key: "cheapest", label: "Cheapest" },
];

const price = (v: number) =>
  v === 0 ? "0" : v < 0.01 ? v.toFixed(4) : v.toFixed(2);

export default function ModelsScreen() {
  const { model, setModel } = useModel();
  const styles = useThemedStyles(createStyles);
  const [models, setModels] = useState<ModelInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("smartest");

  useEffect(() => {
    getModels()
      .then(setModels)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load models"),
      );
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (models ?? []).filter(
      (m) =>
        (filter === "all" || (filter === "free") === m.isFree) &&
        (!q ||
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q)),
    );
    const blended = (m: ModelInfo) =>
      m.promptPerMillion + m.completionPerMillion;
    return list.sort((a, b) =>
      sort === "newest"
        ? b.releasedAt.localeCompare(a.releasedAt)
        : sort === "cheapest"
          ? blended(a) - blended(b)
          : (b.intelligenceIndex ?? -1) - (a.intelligenceIndex ?? -1),
    );
  }, [models, query, filter, sort]);

  if (error)
    return (
      <Screen title="Models" back>
        <Text style={styles.status}>{error}</Text>
      </Screen>
    );
  if (!models)
    return (
      <Screen title="Models" back>
        <ActivityIndicator style={styles.status} />
      </Screen>
    );

  return (
    <Screen title="Models" back>
      <View style={styles.controls}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Search models"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        <Chips items={FILTERS} value={filter} onChange={setFilter} />
        <Chips items={SORTS} value={sort} onChange={setSort} />
        <Text style={styles.note}>
          Models that can analyse photos. Prices in USD per 1M tokens (input /
          output).
        </Text>
      </View>
      <FlatList
        data={visible}
        keyExtractor={(m) => m.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.status}>No models match.</Text>}
        renderItem={({ item }) => {
          const selected = item.id === model.id;
          return (
            <Pressable
              onPress={() => {
                setModel({ id: item.id, name: item.name });
                router.back();
              }}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.provider}
                  {item.reasoningEfforts.length ? " · reasoning" : ""}
                  {item.contextLength
                    ? ` · ${Math.round(item.contextLength / 1000)}k ctx`
                    : ""}
                </Text>
                <Text style={styles.meta}>
                  {item.isFree
                    ? "Free"
                    : `$${price(item.promptPerMillion)} / $${price(item.completionPerMillion)}`}
                </Text>
              </View>
              {selected ? <Text style={styles.check}>✓</Text> : null}
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

function Chips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.chips}>
      {items.map((i) => (
        <Pressable
          key={i.key}
          onPress={() => onChange(i.key)}
          style={[styles.chip, value === i.key && styles.chipActive]}
        >
          <Text
            style={[styles.chipText, value === i.key && styles.chipTextActive]}
          >
            {i.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    status: { textAlign: "center", color: c.textMuted, marginTop: 40 },
    controls: { padding: 12, gap: 10 },
    search: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.inputBg,
    },
    chips: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: c.muted,
    },
    chipActive: { backgroundColor: c.primary },
    chipText: { color: c.textSoft, fontWeight: "500" },
    chipTextActive: { color: c.onPrimary },
    note: { color: c.textFaint, fontSize: 12 },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.borderSoft,
      gap: 8,
    },
    pressed: { backgroundColor: c.muted },
    name: { fontSize: 16, fontWeight: "600", color: c.text },
    meta: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    check: { fontSize: 20, color: c.primary, fontWeight: "700" },
  });
