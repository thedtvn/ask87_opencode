import { runtimeArchive, runtimeDigest } from "./generated/runtime-assets.js";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { homedir } from "node:os";
import path from "node:path";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";

/** Desktop's bundle evaluator has no module path. Extract its embedded, pinned runtime locally. */
let ready: Promise<string> | undefined;
export function materializeRuntime(): Promise<string> {
  return ready ??= (async () => {
    const archive = Buffer.from(runtimeArchive, "base64");
    if (createHash("sha256").update(archive).digest("hex") !== runtimeDigest) throw new Error("Keyboard runtime integrity failed");
    const root = path.join(homedir(), ".cache", "ask87-opencode", "runtime", runtimeDigest);
    const marker = path.join(root, "ready");
    try { if (await readFile(marker, "utf8") === runtimeDigest) return path.join(root, "dist", "broker.cjs"); } catch {}
    const temporary = `${root}-${process.pid}-${Math.random().toString(16).slice(2)}`;
    await mkdir(temporary, { recursive: true, mode: 0o700 });
    try {
      const files = JSON.parse(gunzipSync(archive).toString("utf8")) as Record<string, string>;
      for (const [name, data] of Object.entries(files)) {
        const file = path.resolve(temporary, name);
        if (!file.startsWith(temporary + path.sep)) throw new Error("Invalid keyboard runtime path");
        await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, Buffer.from(data, "base64"), { mode: 0o600 });
      }
      await writeFile(path.join(temporary, "ready"), runtimeDigest, { mode: 0o600 });
      await mkdir(path.dirname(root), { recursive: true, mode: 0o700 });
      try { await rename(temporary, root); } catch (error) {
        if (await readFile(marker, "utf8").catch(() => "") !== runtimeDigest) throw error;
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
    return path.join(root, "dist", "broker.cjs");
  })();
}
