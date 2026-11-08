import assert from "node:assert/strict";
import { test } from "node:test";
import { collectClientSessions, type ClientData } from "../src/client-snapshot.js";

test("client snapshots aggregate remote descendants without any custom server plugin", () => {
  const records = [{ id: "root", outcome: "succeeded" }, { id: "child", parentID: "root", time: { busy: 123 } }];
  const data: ClientData = { session: {
    list: () => records, get: (id) => records.find((item) => item.id === id), root: () => "root", family: () => ["child"],
    status: (id) => id === "child" ? "running" : "idle",
    permission: { list: (id) => id === "child" ? [{ id: "permission" }] : [] }, form: { list: () => [] },
  } };
  const started = new Map<string, number>();
  const snapshots = collectClientSessions("opencode", data, ["root"], started);
  assert.equal(snapshots[0]?.open, true); assert.equal(snapshots[1]?.open, false);
  assert.equal(snapshots[1]?.parentID, "opencode\nroot"); assert.equal(snapshots[1]?.state, "running");
  assert.deepEqual(snapshots[1]?.permissionIDs, ["permission"]); assert.equal(snapshots[1]?.startedAt, 123);
});
