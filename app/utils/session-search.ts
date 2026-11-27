import type { ChatSession } from "../store/chat";
import { isTranslationSession } from "../translation/types";

// Visible search positions are not session indices in the store.
export function searchSessions(sessions: ChatSession[], search: string) {
  const query = search.trim().toLowerCase();
  return sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => !isTranslationSession(session))
    .filter(
      ({ session }) =>
        !query ||
        session.topic.toLowerCase().includes(query) ||
        session.messages.some((message) => {
          const text =
            typeof message.content === "string"
              ? message.content
              : message.content
                  .map((part) => (part.type === "text" ? part.text : ""))
                  .join("\n");
          return text.toLowerCase().includes(query);
        }),
    );
}
