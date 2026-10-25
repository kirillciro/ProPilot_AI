import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { saveToPhotos } from "@/lib/imageFiles";

type Props = {
  uri: string;
  onClose: () => void;
  /** Resolves once the caller has taken over, so the viewer can stay busy until then. */
  onEdit: (uri: string) => Promise<void>;
};

export function ImageViewer({ uri, onClose, onEdit }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [busy, setBusy] = useState<"save" | "edit" | null>(null);
  const [saved, setSaved] = useState(false);

  async function run(kind: "save" | "edit") {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === "save") {
        await saveToPhotos(uri);
        setSaved(true);
      } else {
        await onEdit(uri);
      }
    } catch (err) {
      Alert.alert(
        kind === "save" ? "Could not save" : "Could not open the editor",
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        {/* iOS pinch-zooms the scroll view's single child. */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          minimumZoomScale={1}
          maximumZoomScale={5}
          bouncesZoom
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={{ uri }}
            style={{ width, height }}
            contentFit="contain"
          />
        </ScrollView>

        <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={10}>
            <Text style={styles.text}>Close</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable onPress={() => run("save")} hitSlop={10}>
              {busy === "save" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.text}>{saved ? "Saved" : "Save"}</Text>
              )}
            </Pressable>
            <Pressable onPress={() => run("edit")} hitSlop={10}>
              {busy === "edit" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={[styles.text, styles.edit]}>Edit</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: "#000" },
  content: { flexGrow: 1, justifyContent: "center" },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  actions: { flexDirection: "row", gap: 24 },
  text: { color: "#fff", fontSize: 16, fontWeight: "500" },
  edit: { color: "#60a5fa", fontWeight: "700" },
});
