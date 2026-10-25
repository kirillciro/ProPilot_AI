import { useLocalSearchParams } from "expo-router";
import ChatScreen from "@/screens/ChatScreen";

export default function ChatRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Keyed so each conversation gets fresh state.
  return <ChatScreen key={id} id={id === "new" ? undefined : id} />;
}
