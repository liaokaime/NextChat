import { createMessage, useChatStore } from "../app/store/chat";
import Locale from "../app/locales";

beforeEach(() => {
  useChatStore.getState().clearSessions();
});

afterEach(() => {
  useChatStore.getState().clearSessions();
});

function setupHistory() {
  const session = useChatStore.getState().currentSession();
  session.topic = "Exploring ideas";
  session.messages = [
    createMessage({ role: "user", content: "First question" }),
    createMessage({ role: "assistant", content: "Branching answer" }),
    createMessage({ role: "user", content: "Later question" }),
    createMessage({ role: "assistant", content: "Later answer" }),
  ];
  return session;
}

test("forks through the chosen answer and sends only its history", async () => {
  const session = setupHistory();
  session.mask.context = [];
  session.mask.modelConfig.enableInjectSystemPrompts = false;
  session.mask.modelConfig.historyMessageCount = 10;
  session.mask.modelConfig.max_tokens = 4000;
  session.memoryPrompt = "Contains information from the later answer";
  session.lastSummarizeIndex = 4;

  const fork = useChatStore.getState().forkSession(session.messages[1].id)!;

  expect(useChatStore.getState().currentSession()).toBe(fork);
  expect(useChatStore.getState().sessions).toHaveLength(2);
  expect(fork.id).not.toBe(session.id);
  expect(fork.topic).toBe(Locale.Chat.Fork.Topic(session.topic));
  expect(fork.messages.map((message) => message.content)).toEqual([
    "First question",
    "Branching answer",
  ]);
  expect(
    fork.messages.every(
      (message) =>
        !session.messages.some((original) => original.id === message.id),
    ),
  ).toBe(true);
  expect(fork.memoryPrompt).toBe("");
  expect(fork.lastSummarizeIndex).toBe(0);
  expect(await useChatStore.getState().getMessagesWithMemory()).toEqual(
    fork.messages,
  );
  expect(session.messages).toHaveLength(4);
  expect(session.memoryPrompt).toContain("later answer");
});

test("deep copies multimodal messages and mask context", () => {
  const session = setupHistory();
  session.messages[0].content = [
    { type: "text", text: "Original question" },
    {
      type: "image_url",
      image_url: { url: "https://example.com/original.png" },
    },
  ];
  session.mask.context = [
    createMessage({ role: "system", content: "Original context" }),
  ];
  const fork = useChatStore.getState().forkSession(session.messages[1].id)!;

  const content = fork.messages[0].content;
  if (typeof content === "string")
    throw new Error("Expected multimodal content");
  const image = content.find((part) => part.type === "image_url")!;
  image.image_url!.url = "https://example.com/changed.png";
  fork.mask.context[0].content = "Changed context";
  fork.mask.modelConfig.model = "different-model";

  expect(session.messages[0].content[1]).toEqual({
    type: "image_url",
    image_url: { url: "https://example.com/original.png" },
  });
  expect(session.mask.context[0].content).toBe("Original context");
  expect(session.mask.modelConfig.model).not.toBe("different-model");
});

test.each([
  [undefined, undefined],
  [0, 0],
  [1, 1],
  [2, undefined],
  [4, undefined],
])(
  "handles clearContextIndex %s at a historical fork",
  async (original, expected) => {
    const session = setupHistory();
    session.clearContextIndex = original;
    const fork = useChatStore.getState().forkSession(session.messages[1].id)!;
    expect(fork.clearContextIndex).toBe(expected);
  },
);

test("does not create a session when the chosen message is missing", () => {
  const session = setupHistory();
  expect(
    useChatStore.getState().forkSession("missing-message"),
  ).toBeUndefined();
  expect(useChatStore.getState().sessions).toEqual([session]);
  expect(useChatStore.getState().currentSession()).toBe(session);
});

test("keeps the full-copy command and stops copied streaming flags", () => {
  const session = setupHistory();
  session.messages[3].streaming = true;
  const fork = useChatStore.getState().forkSession()!;
  expect(fork.topic).toBe(session.topic);
  expect(fork.messages.map((message) => message.content)).toEqual(
    session.messages.map((message) => message.content),
  );
  expect(fork.messages[3].streaming).toBe(false);
  expect(session.messages[3].streaming).toBe(true);
});

test("can still copy an empty conversation", () => {
  const original = useChatStore.getState().currentSession();
  const fork = useChatStore.getState().forkSession()!;
  expect(fork.messages).toEqual([]);
  expect(fork.id).not.toBe(original.id);
});
