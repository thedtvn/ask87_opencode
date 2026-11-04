import { Rpc } from "@opencode/plugin/rpc";

export const Ask87Presence = Rpc.define({
  id: "ask87",
  events: {},
  methods: {
    sync: {
      input: {
        type: "object",
        properties: {
          clientID: { type: "string", minLength: 1, maxLength: 200 },
          sequence: { type: "integer", minimum: 0 },
          closed: { type: "boolean" },
          sessionIDs: { type: "array", maxItems: 500, items: { type: "string", minLength: 1 } },
        },
        required: ["clientID", "sequence", "sessionIDs"],
        additionalProperties: false,
      },
      output: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    },
  },
});

export interface PresenceSnapshot { clientID: string; sequence: number; sessionIDs: string[]; closed?: boolean; }
export function parsePresence(input: unknown): PresenceSnapshot {
  if (!input || typeof input !== "object") throw new TypeError("Invalid tab presence");
  const value = input as Record<string, unknown>;
  if (typeof value.clientID !== "string" || value.clientID.length < 1 || value.clientID.length > 200
    || typeof value.sequence !== "number" || !Number.isSafeInteger(value.sequence) || value.sequence < 0
    || (value.closed !== undefined && typeof value.closed !== "boolean")
    || !Array.isArray(value.sessionIDs) || value.sessionIDs.length > 500
    || !value.sessionIDs.every((id) => typeof id === "string" && id.length > 0)) {
    throw new TypeError("Invalid tab presence");
  }
  return { clientID: value.clientID, sequence: value.sequence, sessionIDs: [...new Set(value.sessionIDs as string[])],
    ...(typeof value.closed === "boolean" ? { closed: value.closed } : {}) };
}
