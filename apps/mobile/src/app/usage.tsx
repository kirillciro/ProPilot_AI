import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import type { UsageSummary } from "@propilot/shared";
import { getUsage, updateMe } from "@/lib/api";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/lib/auth";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

const eur = (v: number) => `€${v.toFixed(v < 1 ? 4 : 2)}`;
const num = (v: number) => v.toLocaleString("en-US");
const usd = (v: number) => `$${v.toFixed(v < 1 ? 3 : 2)}`;

export default function UsageScreen() {
  const { setUser } = useAuth();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [budgetText, setBudgetText] = useState("");
  const [block, setBlock] = useState(true);
  const [saving, setSaving] = useState(false);

  const apply = useCallback((data: UsageSummary) => {
    setUsage(data);
    setBudgetText(String(data.budgetEur));
    setBlock(data.blockWhenOverBudget);
    setError(null);
  }, []);

  const load = useCallback(
    () =>
      getUsage()
        .then(apply)
        .catch((err: unknown) =>
          setError(err instanceof Error ? err.message : "Could not load usage"),
        ),
    [apply],
  );

  useEffect(() => {
    getUsage()
      .then(apply)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load usage"),
      );
  }, [apply]);

  async function save() {
    const value = Number(budgetText.replace(",", "."));
    if (!Number.isFinite(value) || value < 0) {
      Alert.alert("Invalid budget", "Enter a number like 10 or 25.50.");
      return;
    }
    setSaving(true);
    try {
      setUser(
        await updateMe({ monthlyBudgetEur: value, blockWhenOverBudget: block }),
      );
      await load();
    } catch (err) {
      Alert.alert(
        "Error",
        err instanceof Error ? err.message : "Could not save",
      );
    } finally {
      setSaving(false);
    }
  }

  if (error && !usage)
    return (
      <Screen title="Usage & Billing" back>
        <Text style={styles.status}>{error}</Text>
      </Screen>
    );
  if (!usage)
    return (
      <Screen title="Usage & Billing" back>
        <ActivityIndicator style={styles.status} />
      </Screen>
    );

  const ratio =
    usage.budgetEur > 0
      ? usage.spentEur / usage.budgetEur
      : usage.spentEur > 0
        ? 1
        : 0;
  const barColor =
    ratio >= 1 ? "#dc2626" : ratio >= 0.8 ? "#f59e0b" : "#16a34a";
  const freeRatio =
    usage.freeDailyLimit > 0
      ? usage.freeRequestsToday / usage.freeDailyLimit
      : 0;
  const maxDaily = Math.max(...usage.daily.map((d) => d.costEur), 0.0001);
  const brave = usage.braveSearch;
  const braveRatio = brave.creditUsd > 0 ? brave.spentUsd / brave.creditUsd : 1;
  const searchesLeft = Math.floor(
    brave.remainingUsd / brave.costPerSearchUsd + 1e-9,
  );

  return (
    <Screen title="Usage & Billing" back>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
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
      >
        <View style={styles.card}>
          <Text style={styles.label}>Spent in {usage.month}</Text>
          <Text style={styles.big}>{eur(usage.spentEur)}</Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(ratio, 1) * 100}%`,
                  backgroundColor: barColor,
                },
              ]}
            />
          </View>
          <Text style={styles.muted}>
            of {eur(usage.budgetEur)} monthly budget
            {ratio >= 1 ? " — limit reached" : ""}
          </Text>
        </View>

        <View style={styles.stats}>
          <Stat label="Input tokens" value={num(usage.inputTokens)} />
          <Stat label="Output tokens" value={num(usage.outputTokens)} />
          <Stat label="Requests" value={num(usage.requests)} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Free models today</Text>
          <Text style={styles.value}>
            {usage.freeRequestsToday} / {usage.freeDailyLimit} requests
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(freeRatio, 1) * 100}%`,
                  backgroundColor: colors.primary,
                },
              ]}
            />
          </View>
        </View>

        <Text style={styles.section}>Image search (Brave)</Text>
        <View style={styles.card}>
          {brave.enabled ? (
            <>
              <Text style={styles.label}>
                Free credit used in {usage.month}
              </Text>
              <Text style={styles.big}>{usd(brave.spentUsd)}</Text>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${Math.min(braveRatio, 1) * 100}%`,
                      backgroundColor:
                        braveRatio >= 1
                          ? "#dc2626"
                          : braveRatio >= 0.8
                            ? "#f59e0b"
                            : "#16a34a",
                    },
                  ]}
                />
              </View>
              <Text style={styles.muted}>
                of {usd(brave.creditUsd)} free credit ·{" "}
                {usd(brave.remainingUsd)} left (about {num(searchesLeft)}{" "}
                searches)
              </Text>
              <Text style={styles.muted}>
                {num(brave.searches)} searches · {usd(brave.costPerSearchUsd)}{" "}
                each
                {braveRatio >= 1
                  ? " — credit used up, using free image sources only"
                  : ""}
              </Text>
            </>
          ) : (
            <Text style={styles.muted}>
              Not configured. Image search uses free sources only.
            </Text>
          )}
        </View>

        <Text style={styles.section}>By model</Text>
        <View style={styles.card}>
          {usage.byModel.length === 0 ? (
            <Text style={styles.muted}>No usage yet this month.</Text>
          ) : null}
          {usage.byModel.map((m) => (
            <View key={m.modelId} style={styles.line}>
              <View style={styles.flex}>
                <Text style={styles.value} numberOfLines={1}>
                  {m.modelId}
                </Text>
                <Text style={styles.muted}>
                  {num(m.requests)} req · {num(m.inputTokens)} in ·{" "}
                  {num(m.outputTokens)} out
                </Text>
              </View>
              <Text style={styles.value}>{eur(m.costEur)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Daily spend</Text>
        <View style={styles.card}>
          {usage.daily.length === 0 ? (
            <Text style={styles.muted}>No usage yet this month.</Text>
          ) : null}
          {usage.daily.slice(-14).map((d) => (
            <View key={d.date} style={styles.daily}>
              <Text style={styles.dayLabel}>{d.date.slice(5)}</Text>
              <View style={styles.dayTrack}>
                <View
                  style={[
                    styles.dayFill,
                    { width: `${(d.costEur / maxDaily) * 100}%` },
                  ]}
                />
              </View>
              <Text style={styles.dayCost}>{eur(d.costEur)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Spending protection</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Monthly budget (EUR)</Text>
          <TextInput
            style={styles.input}
            value={budgetText}
            onChangeText={setBudgetText}
            keyboardType="decimal-pad"
          />
          <View style={styles.line}>
            <Text style={[styles.value, styles.flex]}>
              Block paid requests when over budget
            </Text>
            <Switch value={block} onValueChange={setBlock} />
          </View>
          <Pressable
            onPress={save}
            disabled={saving}
            style={[styles.button, saving && styles.disabled]}
          >
            <Text style={styles.buttonText}>{saving ? "Saving…" : "Save"}</Text>
          </Pressable>
        </View>

        <Text style={styles.footnote}>
          Costs are reported by OpenRouter per request and converted to euros at
          a fixed rate, so they are estimates. Free models are not billed. Image
          search spend is estimated from searches made through this server;
          check the Brave dashboard for the exact figure.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    status: { textAlign: "center", color: c.textMuted, marginTop: 40 },
    content: { padding: 16, gap: 12 },
    card: { backgroundColor: c.surface, borderRadius: 14, padding: 16, gap: 8 },
    label: { color: c.textMuted, fontSize: 13 },
    big: { fontSize: 34, fontWeight: "700", color: c.text },
    value: { fontSize: 15, color: c.text },
    muted: { fontSize: 13, color: c.textMuted },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.borderSoft,
      overflow: "hidden",
    },
    fill: { height: 8, borderRadius: 4 },
    stats: { flexDirection: "row", gap: 10 },
    stat: {
      flex: 1,
      backgroundColor: c.surface,
      borderRadius: 14,
      padding: 12,
      gap: 2,
    },
    statValue: { fontSize: 18, fontWeight: "700", color: c.text },
    section: { fontSize: 18, fontWeight: "700", marginTop: 8, color: c.text },
    line: { flexDirection: "row", alignItems: "center", gap: 12 },
    daily: { flexDirection: "row", alignItems: "center", gap: 8 },
    dayLabel: { width: 44, color: c.textMuted, fontSize: 12 },
    dayTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.borderSoft,
    },
    dayFill: { height: 6, borderRadius: 3, backgroundColor: c.primary },
    dayCost: {
      width: 72,
      textAlign: "right",
      fontSize: 12,
      color: c.textSoft,
    },
    input: {
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.inputBg,
    },
    button: {
      backgroundColor: c.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: "center",
    },
    disabled: { opacity: 0.5 },
    buttonText: { color: c.onPrimary, fontWeight: "600", fontSize: 16 },
    footnote: {
      color: c.textFaint,
      fontSize: 12,
      textAlign: "center",
      marginTop: 4,
    },
  });
