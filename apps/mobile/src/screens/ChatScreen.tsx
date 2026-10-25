import type { Annotation } from "@propilot/shared";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AnnotationLayer } from "@/components/AnnotationLayer";
import { HeaderMenu } from "@/components/HeaderMenu";
import { ImageEditor } from "@/components/ImageEditor";
import { ImageViewer } from "@/components/ImageViewer";
import { HEADER_HEIGHT, Screen } from "@/components/Screen";
import { getConversation, streamChat, type Usage } from "@/lib/api";
import { copyText } from "@/lib/clipboard";
import { toLocalFile } from "@/lib/imageFiles";
import {
  pickFromLibrary,
  processImage,
  takePhoto,
  type PickedImage,
} from "@/lib/images";
import { useModel } from "@/lib/model";
import { useProfile } from "@/lib/profile";
import { useTheme, useThemedStyles, type Colors } from "@/lib/theme";

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  images?: string[];
  // Local-only preview of marks the server draws onto the photo.
  annotations?: Annotation[];
  aspect?: number;
};

type Attached = PickedImage & { annotations: Annotation[] };

export default function ChatScreen({ id }: { id?: string }) {
  const { model } = useModel();
  const { profile, label: profileLabel, setProfile } = useProfile();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [conversationId, setConversationId] = useState(id);
  const [title, setTitle] = useState("New chat");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [image, setImage] = useState<Attached | null>(null);
  const [editing, setEditing] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastUsage, setLastUsage] = useState<Usage | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  useEffect(() => {
    if (!id) return;
    getConversation(id)
      .then((c) => {
        setTitle(c.title);
        setProfile(c.profile);
        setMessages(
          c.messages.map((m) => ({
            id: m.id,
            role: m.role,
            text: m.content,
            images: m.images,
          })),
        );
      })
      .catch((err: unknown) =>
        setLoadError(
          err instanceof Error ? err.message : "Could not load the chat",
        ),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardWillShow", () =>
      setKeyboardUp(true),
    );
    const hide = Keyboard.addListener("keyboardWillHide", () =>
      setKeyboardUp(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  async function send() {
    const text = input.trim();
    if ((!text && !image) || busy) return;

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
      images: image ? [image.previewUri] : undefined,
      annotations: image?.annotations,
      aspect: image ? image.width / image.height : undefined,
    };
    const replyId = `a-${Date.now()}`;
    setMessages((m) => [
      ...m,
      userMsg,
      { id: replyId, role: "assistant", text: "" },
    ]);
    setInput("");
    setCopyId(null);
    const attached = image;
    setImage(null);
    setBusy(true);

    try {
      await streamChat(
        {
          model: model.id,
          conversationId,
          profile,
          text:
            text ||
            (attached?.annotations.length
              ? "Identify the part I marked and tell me what it does."
              : "Identify this part and tell me what it does."),
          imageUrls: attached ? [attached.dataUrl] : [],
          annotations: attached?.annotations,
        },
        {
          onDelta: (delta) =>
            setMessages((m) =>
              m.map((x) =>
                x.id === replyId ? { ...x, text: x.text + delta } : x,
              ),
            ),
          onImages: (urls) =>
            setMessages((m) =>
              m.map((x) =>
                x.id === replyId
                  ? { ...x, images: [...(x.images ?? []), ...urls] }
                  : x,
              ),
            ),
          onUsage: setLastUsage,
          onConversation: (c) => {
            setConversationId(c.id);
            setTitle(c.title);
          },
        },
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setMessages((m) =>
        m.map((x) =>
          x.id === replyId ? { ...x, text: `Error: ${message}` } : x,
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    if (!(await copyText(text))) {
      setCopyId(null);
      return;
    }
    setCopied(true);
    setTimeout(() => {
      setCopyId(null);
      setCopied(false);
    }, 900);
  }

  async function editFromViewer(url: string) {
    const picked = await processImage(await toLocalFile(url));
    setImage({ ...picked, annotations: [] });
    setViewing(null);
    // iOS drops a modal presented while another is still dismissing.
    setTimeout(() => setEditing(true), 400);
  }

  async function attach(source: "camera" | "library") {
    const picked =
      source === "camera" ? await takePhoto() : await pickFromLibrary();
    if (picked) setImage({ ...picked, annotations: [] });
  }

  return (
    <Screen title={title} back right={<HeaderMenu />} bottomInset={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top + HEADER_HEIGHT}
      >
        <View style={styles.pills}>
          <Pressable
            onPress={() => router.push("/models")}
            style={styles.pill}
            accessibilityLabel="Change model"
          >
            <Text style={styles.pillText} numberOfLines={1}>
              Model: {model.name} ›
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/profiles")}
            style={styles.pill}
            accessibilityLabel="Change category"
          >
            <Text style={styles.pillText} numberOfLines={1}>
              Category: {profileLabel} ›
            </Text>
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          style={styles.flex}
          contentContainerStyle={styles.list}
          data={messages}
          keyExtractor={(m) => m.id}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          ListEmptyComponent={
            <Text style={styles.empty}>
              {loadError ?? "Snap a photo or ask a question to get started."}
            </Text>
          }
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            const showCopy = copyId === item.id;
            const gallery = (item.images?.length ?? 0) > 1;
            return (
              <Pressable
                onPress={() =>
                  item.text && setCopyId(showCopy ? null : item.id)
                }
                style={[
                  styles.bubble,
                  isUser ? styles.user : styles.assistant,
                  showCopy && styles.raised,
                ]}
              >
                {item.images?.length ? (
                  <View style={styles.gallery}>
                    {item.images.map((uri) => (
                      <Pressable key={uri} onPress={() => setViewing(uri)}>
                        {item.annotations?.length && item.aspect ? (
                          <View
                            style={{ width: 200, height: 200 / item.aspect }}
                          >
                            <Image
                              source={{ uri }}
                              style={StyleSheet.absoluteFill}
                            />
                            <AnnotationLayer
                              items={item.annotations}
                              width={200}
                              height={200 / item.aspect}
                            />
                          </View>
                        ) : (
                          <Image
                            source={{ uri }}
                            style={gallery ? styles.thumbGrid : styles.photo}
                          />
                        )}
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {item.text ? (
                  <Text style={isUser ? styles.userText : styles.assistantText}>
                    {item.text}
                  </Text>
                ) : item.images?.length ? null : (
                  <ActivityIndicator />
                )}
                {showCopy ? (
                  <View style={styles.copyWrap} pointerEvents="box-none">
                    <Pressable
                      onPress={() => copy(item.text)}
                      style={styles.copyPill}
                    >
                      <Text style={styles.copyText}>
                        {copied ? "Copied" : "Copy"}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />

        {lastUsage ? (
          <Text style={styles.usage}>
            {lastUsage.prompt_tokens ?? 0} in /{" "}
            {lastUsage.completion_tokens ?? 0} out
            {lastUsage.cost != null ? ` · $${lastUsage.cost.toFixed(6)}` : ""}
          </Text>
        ) : null}

        {image ? (
          <View style={styles.pending}>
            <View
              style={{
                width: (56 * image.width) / image.height,
                height: 56,
              }}
            >
              <Image
                source={{ uri: image.previewUri }}
                style={styles.thumbFill}
              />
              <AnnotationLayer
                items={image.annotations}
                width={(56 * image.width) / image.height}
                height={56}
              />
            </View>
            <Pressable onPress={() => setEditing(true)}>
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => setImage(null)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
        ) : null}

        <View
          style={[
            styles.composer,
            { paddingBottom: keyboardUp ? 10 : Math.max(insets.bottom, 10) },
          ]}
        >
          <Pressable onPress={() => attach("camera")} style={styles.iconButton}>
            <Text style={styles.iconText}>Cam</Text>
          </Pressable>
          <Pressable
            onPress={() => attach("library")}
            style={styles.iconButton}
          >
            <Text style={styles.iconText}>Pic</Text>
          </Pressable>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask anything or attach a photo"
            placeholderTextColor={colors.textFaint}
            multiline
          />
          <Pressable
            onPress={send}
            disabled={busy}
            style={[styles.send, busy && styles.sendDisabled]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
      {editing && image ? (
        <ImageEditor
          image={image}
          initial={image.annotations}
          onCancel={() => setEditing(false)}
          onDone={(annotations) => {
            setImage({ ...image, annotations });
            setEditing(false);
          }}
        />
      ) : null}
      {viewing ? (
        <ImageViewer
          uri={viewing}
          onClose={() => setViewing(null)}
          onEdit={editFromViewer}
        />
      ) : null}
    </Screen>
  );
}

const createStyles = (c: Colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    pills: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingTop: 8,
    },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: c.primarySoft,
      maxWidth: "100%",
    },
    pillText: { color: c.primarySoftText, fontSize: 13, fontWeight: "500" },
    list: { padding: 16, gap: 10, flexGrow: 1 },
    empty: { textAlign: "center", color: c.textMuted, marginTop: 80 },
    bubble: { maxWidth: "85%", borderRadius: 14, padding: 10, gap: 8 },
    user: { alignSelf: "flex-end", backgroundColor: c.primary },
    assistant: { alignSelf: "flex-start", backgroundColor: c.muted },
    userText: { color: "#fff", fontSize: 16 },
    assistantText: { color: c.text, fontSize: 16 },
    photo: { width: 200, height: 200, borderRadius: 10 },
    gallery: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    thumbGrid: { width: 120, height: 120, borderRadius: 8 },
    raised: { zIndex: 10 },
    copyWrap: {
      position: "absolute",
      top: -16,
      left: 0,
      right: 0,
      alignItems: "center",
    },
    copyPill: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: c.text,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
    },
    copyText: { color: c.bg, fontSize: 13, fontWeight: "600" },
    usage: {
      textAlign: "center",
      color: c.textFaint,
      fontSize: 12,
      paddingBottom: 4,
    },
    pending: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      paddingBottom: 6,
    },
    thumbFill: { width: "100%", height: "100%", borderRadius: 4 },
    remove: { color: c.danger },
    edit: { color: c.primary, fontWeight: "600" },
    composer: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 8,
      padding: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    iconButton: {
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: c.borderSoft,
    },
    iconText: { fontWeight: "600", color: c.textSoft },
    input: {
      flex: 1,
      maxHeight: 120,
      minHeight: 40,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 16,
      color: c.text,
      backgroundColor: c.inputBg,
    },
    send: {
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: c.primary,
    },
    sendDisabled: { opacity: 0.5 },
    sendText: { color: "#fff", fontWeight: "600" },
  });
