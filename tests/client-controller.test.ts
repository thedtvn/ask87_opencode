import assert from "node:assert/strict";
import { test } from "node:test";
import { ClientController } from "../src/client-controller.js";
import type { ClientSession } from "../src/client-state.js";
const session = (id: string, state: ClientSession["state"], startedAt?: number): ClientSession => ({ id, state, open: true, permissionIDs: [], questionIDs: [], ...(startedAt !== undefined ? { startedAt } : {}) });
test("SSH and local task snapshots share local keyboard in first-start order", async () => {
  let stopped = 0;
  const controller = new ClientController({ renderer: { start: () => {}, setIndicators: () => {}, stop: async () => { stopped++; } } });
  controller.sync("gui", [session("ssh-first", "running", 100), session("idle", "idle"), session("local-second", "running", 200)]);
  assert.equal(controller.bank.slotOf("ssh-first"), 0); assert.equal(controller.bank.slotOf("local-second"), 1); assert.equal(controller.bank.slotOf("idle"), undefined);
  controller.sync("gui", [session("ssh-first", "done", 100), session("local-second", "running", 200)]);
  assert.equal(controller.bank.snapshot()[0]?.color, "green");
  controller.sync("tui", [session("ssh-first", "done", 100)]);
  controller.sync("gui", [session("local-second", "running", 200)]);
  assert.equal(controller.bank.slotOf("ssh-first"), 0);
  controller.release("tui"); assert.equal(controller.bank.slotOf("local-second"), 0);
  controller.release("gui"); await controller.stop(); assert.ok(stopped > 0);
});
