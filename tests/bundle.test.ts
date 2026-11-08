import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("package exposes no custom OpenCode server part or RPC", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.exports["."], undefined);
  assert.equal(pkg.exports["./rpc"], undefined);
  assert.ok(pkg.exports["./tui"]);
  assert.ok(pkg.exports["./gui-experimental"]);
});
