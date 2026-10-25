import { searchSessions } from "../app/utils/session-search";
import type { ChatSession } from "../app/store/chat";

const sessions = [
  { id: "a", topic: "Travel Plans", messages: [] },
  {
    id: "b",
    topic: "Notes",
    messages: [{ content: "A Chinese destination: 北京" }],
  },
  {
    id: "c",
    topic: "Pictures",
    messages: [
      {
        content: [
          {
            type: "image_url",
            image_url: { url: "https://image.test/hidden" },
          },
          { type: "text", text: "First caption" },
          { type: "text", text: "Second CAPTION" },
        ],
      },
    ],
  },
] as ChatSession[];

test("matches titles and message text, trims queries, and ignores case", () => {
  expect(searchSessions(sessions, " TRAVEL ").map((e) => e.session.id)).toEqual(
    ["a"],
  );
  expect(searchSessions(sessions, "北京").map((e) => e.session.id)).toEqual([
    "b",
  ]);
  expect(
    searchSessions(sessions, "second caption").map((e) => e.session.id),
  ).toEqual(["c"]);
  expect(searchSessions(sessions, "image.test")).toEqual([]);
});

test("retains actual session indices and restores the complete original order when cleared", () => {
  const result = searchSessions(sessions, "caption");
  expect(result).toEqual([{ session: sessions[2], index: 2 }]);
  expect(result[0].session).toBe(sessions[2]);
  expect(searchSessions(sessions, "   ").map((e) => e.index)).toEqual([
    0, 1, 2,
  ]);
  expect(searchSessions(sessions, "no result")).toEqual([]);
  expect(sessions.map((s) => s.id)).toEqual(["a", "b", "c"]);
});
