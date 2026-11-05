import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const supported = new Set(['win32-x64', 'win32-arm64', 'linux-x64-gnu', 'linux-arm64-gnu', 'darwin-x64', 'darwin-arm64']);
const [sourceArg, stageArg, platform, ...extra] = process.argv.slice(2);
if (!sourceArg || !stageArg || !supported.has(platform) || extra.length) {
  throw new Error(`Usage: node scripts/package-native.mjs <source> <new-stage> <${[...supported].join('|')}>`);
}
const source = path.resolve(sourceArg);
const stage = path.resolve(stageArg);
const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
if (metadata.name !== 'attack-shark-x87' || metadata.version !== '0.1.0' || metadata.license !== 'MIT') {
  throw new Error('Unexpected upstream package name, version, or license');
}
if (!(await stat(path.join(source, 'LICENSE'))).isFile()) throw new Error('Missing upstream LICENSE');
await mkdir(stage); // Never reuse stale output.
const nativeDir = path.join(stage, 'native', platform);
await mkdir(nativeDir, { recursive: true });
const destination = path.join(nativeDir, 'ask87.node');
await copyFile(path.join(source, 'lib', 'ask87_ts', 'native', 'ask87.node'), destination);
const binary = await readFile(destination);
await writeFile(path.join(stage, `SOURCE-${platform}.json`), `${JSON.stringify({
  repository: 'https://github.com/thedtvn/attack_shark_x87_rs',
  commit: '3d489cd0c71fb30e6f1729c213963c644e287fa1',
  target: platform,
  version: metadata.version,
  binarySha256: createHash('sha256').update(binary).digest('hex'),
}, null, 2)}\n`);

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await scan(file);
    else if (!entry.isFile()) throw new Error('Unexpected non-file in staging directory');
    else {
      const bytes = await readFile(file);
      const contents = `${bytes.toString('latin1')}\n${bytes.toString('utf16le')}`;
      const blockedName = ['du', 'ong'].join('');
      const personal = new RegExp(`${blockedName}|/Users/(?!runner\\b)|/home/(?!runner\\b)|[A-Z]:[\\\\/]Users[\\\\/](?!runneradmin\\b)`, 'i');
      if (personal.test(contents)) throw new Error(`Personal path or name found in ${path.relative(stage, file)}`);
    }
  }
}
await scan(stage);
console.log(`Staged ${platform}`);
