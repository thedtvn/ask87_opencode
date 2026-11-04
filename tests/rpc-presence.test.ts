import assert from "node:assert/strict";
import { test } from "node:test";
import { Ask87Presence, parsePresence } from "../src/rpc.js";
import { createPresenceReporter, deduplicateSessionIDs } from "../src/presence.js";

test("tab order is preserved instead of alphabetically sorting session IDs", () => {
  assert.deepEqual(deduplicateSessionIDs(["z-first", "a-second", "z-first", "m-third"]), ["z-first", "a-second", "m-third"]);
});

test("RPC exports a stable runtime contract and validates presence", () => {
  assert.equal(Ask87Presence.id, "ask87");
  assert.ok(Ask87Presence.methods.sync);
  assert.deepEqual(parsePresence({ clientID: "ui", sequence: 1, sessionIDs: [] }), { clientID: "ui", sequence: 1, sessionIDs: [] });
  assert.throws(() => parsePresence({ clientID: "ui", sessionIDs: [] }));
  assert.throws(() => parsePresence({ clientID: "ui", sequence: -1, sessionIDs: [] }));
});

test("initial zero-tab presence remains connected and UI cleanup explicitly closes it", async () => {
  const snapshots: unknown[] = [];
  const locations: unknown[] = [];
  const location = { directory: "/example/project" };
  const client = { rpc: () => ({ sync: async (input: unknown, options: { location: unknown }) => {
    snapshots.push(input); locations.push(options.location); return { ok: true };
  } }) };
  const reporter = createPresenceReporter({ client: client as never, location, getSessionIDs: () => [], clientID: "ui" });
  try {
    await reporter.sync(true);
    assert.ok(snapshots.length > 0);
    const first = parsePresence(snapshots[0]);
    assert.equal(first.closed, undefined);
    assert.deepEqual(first.sessionIDs, []);
  } finally { await reporter.stop(); }
  const last = parsePresence(snapshots.at(-1));
  assert.equal(last.closed, true);
  assert.deepEqual(last.sessionIDs, []);
  assert.ok(last.sequence > parsePresence(snapshots[0]).sequence);
  assert.equal(locations.length, snapshots.length);
  for (const scope of locations) assert.deepEqual(scope, location);
});
