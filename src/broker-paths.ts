import { homedir } from "node:os";
import { join } from "node:path";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export function getBrokerPaths() {
  const cacheDir = join(homedir(), ".cache", "ask87-opencode");
  const key = createHash("sha256").update(`${homedir()}:v2`).digest("hex").slice(0, 20);
  return { cacheDir, endpoint: process.platform === "win32" ? `\\\\.\\pipe\\ask87-${key}` : join(cacheDir, "broker-v2.sock"), stateFile: join(cacheDir, "broker-v2.json"), lock: join(cacheDir, "startup-v2.lock") };
}
export function proof(token: string, nonce: string, side: string): string { return createHmac("sha256", token).update(`${side}:${nonce}`).digest("hex"); }
export function equalProof(actual: unknown, expected: string): boolean {
  if (typeof actual !== "string" || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}
