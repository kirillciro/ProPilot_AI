import type { Annotation } from "@propilot/shared";
import { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { PickedImage } from "@/lib/images";
import { AnnotationLayer } from "./AnnotationLayer";

const COLORS = [
  "#ef4444",
  "#facc15",
  "#22c55e",
  "#3b82f6",
  "#ffffff",
  "#000000",
];

type Point = [number, number];

type Props = {
  image: PickedImage;
  initial: Annotation[];
  onCancel: () => void;
  onDone: (annotations: Annotation[]) => void;
};

export function ImageEditor({ image, initial, onCancel, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [items, setItems] = useState<Annotation[]>(initial);
  const [current, setCurrent] = useState<Point[] | null>(null);
  const [color, setColor] = useState(COLORS[0]!);
  const [tool, setTool] = useState<"pen" | "text">("pen");
  const [textAt, setTextAt] = useState<Point | null>(null);
  const [draft, setDraft] = useState("");

  const scale = area
    ? Math.min(area.w / image.width, area.h / image.height)
    : 0;
  const size = { width: image.width * scale, height: image.height * scale };

  const onLayout = (e: LayoutChangeEvent) =>
    setArea({
      w: e.nativeEvent.layout.width,
      h: e.nativeEvent.layout.height,
    });

  // Touch positions arrive in screen points; marks are kept as fractions of the photo.
  const norm = (x: number, y: number): Point => [
    Math.min(1, Math.max(0, x / size.width)),
    Math.min(1, Math.max(0, y / size.height)),
  ];

  function touchStart(x: number, y: number) {
    if (tool === "text") {
      setDraft("");
      setTextAt(norm(x, y));
    } else {
      setCurrent([norm(x, y)]);
    }
  }

  function touchMove(x: number, y: number) {
    setCurrent((c) => (c ? [...c, norm(x, y)] : c));
  }

  function touchEnd() {
    if (!current) return;
    setItems((i) => [
      ...i,
      { kind: "stroke", color, points: current.slice(0, 3000) },
    ]);
    setCurrent(null);
  }

  function addText() {
    const text = draft.trim();
    if (text && textAt) {
      setItems((i) => [
        ...i,
        { kind: "text", color, x: textAt[0], y: textAt[1], text },
      ]);
    }
    setTextAt(null);
    setDraft("");
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={[
          styles.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.bar}>
          <Pressable onPress={onCancel}>
            <Text style={styles.barText}>Cancel</Text>
          </Pressable>
          <View style={styles.barGroup}>
            <Pressable
              onPress={() => setItems((i) => i.slice(0, -1))}
              disabled={items.length === 0}
            >
              <Text style={[styles.barText, items.length === 0 && styles.dim]}>
                Undo
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setItems([])}
              disabled={items.length === 0}
            >
              <Text style={[styles.barText, items.length === 0 && styles.dim]}>
                Clear
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={() => onDone(items)}>
            <Text style={[styles.barText, styles.done]}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.area} onLayout={onLayout}>
          {area ? (
            <View style={size}>
              <Image
                source={{ uri: image.previewUri }}
                style={StyleSheet.absoluteFill}
              />
              <AnnotationLayer
                items={items}
                width={size.width}
                height={size.height}
                live={current ? { color, points: current } : null}
              />
              <View
                style={StyleSheet.absoluteFill}
                onTouchStart={(e) =>
                  touchStart(e.nativeEvent.locationX, e.nativeEvent.locationY)
                }
                onTouchMove={(e) =>
                  touchMove(e.nativeEvent.locationX, e.nativeEvent.locationY)
                }
                onTouchEnd={touchEnd}
                onTouchCancel={touchEnd}
              />
            </View>
          ) : null}
        </View>

        {textAt ? (
          <View style={styles.textRow}>
            <TextInput
              style={styles.textInput}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a label"
              placeholderTextColor="#9ca3af"
              autoFocus
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={addText}
            />
            <Pressable onPress={addText} style={styles.addButton}>
              <Text style={styles.barText}>Add</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.tools}>
          <View style={styles.modes}>
            {(["pen", "text"] as const).map((t) => (
              <Pressable
                key={t}
                onPress={() => {
                  setTool(t);
                  setTextAt(null);
                }}
                style={[styles.mode, tool === t && styles.modeActive]}
              >
                <Text style={styles.barText}>
                  {t === "pen" ? "Pen" : "Text"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.colors}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                accessibilityLabel={`Color ${c}`}
                style={[
                  styles.dot,
                  { backgroundColor: c },
                  color === c && styles.dotActive,
                ]}
              />
            ))}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111827" },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  barGroup: { flexDirection: "row", gap: 20 },
  barText: { color: "#fff", fontSize: 16, fontWeight: "500" },
  dim: { opacity: 0.35 },
  done: { color: "#60a5fa", fontWeight: "700" },
  area: { flex: 1, alignItems: "center", justifyContent: "center" },
  textRow: { flexDirection: "row", gap: 8, padding: 12 },
  textInput: {
    flex: 1,
    backgroundColor: "#1f2937",
    color: "#fff",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#1d4ed8",
  },
  tools: { gap: 12, padding: 16 },
  modes: { flexDirection: "row", justifyContent: "center", gap: 10 },
  mode: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: "#1f2937",
  },
  modeActive: { backgroundColor: "#1d4ed8" },
  colors: { flexDirection: "row", justifyContent: "center", gap: 14 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "#4b5563",
  },
  dotActive: { borderColor: "#fff", transform: [{ scale: 1.2 }] },
});
