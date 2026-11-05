import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [sourceArg, stageArg, ...extra] = process.argv.slice(2);
if (!sourceArg || !stageArg || extra.length) {
  throw new Error('Usage: node scripts/package-native.mjs <source-directory> <new-staging-directory>');
}
const source = path.resolve(sourceArg);
const stage = path.resolve(stageArg);
const metadata = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
if (metadata.name !== 'attack-shark-x87' || metadata.version !== '0.1.0' || metadata.license !== 'MIT') {
  throw new Error('Unexpected upstream package name, version, or license');
}
if (!(await stat(path.join(source, 'LICENSE'))).isFile()) throw new Error('Missing upstream LICENSE');

// Fail rather than reuse a directory that might contain stale or unrelated files.
await mkdir(stage);
const fields = ['name', 'version', 'description', 'license', 'repository', 'keywords', 'main', 'types', 'engines'];
const manifest = Object.fromEntries(fields.filter((key) => metadata[key] !== undefined).map((key) => [key, metadata[key]]));
manifest.files = ['lib/ask87_ts/dist', 'lib/ask87_ts/native/ask87.node', 'lib/ask87_ts/native/native.d.ts', 'SOURCE.json'];
manifest.os = ['win32'];
manifest.cpu = ['x64'];
await writeFile(path.join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const copy = async (relative) => {
  const destination = path.join(stage, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(source, relative), destination, { recursive: true, filter: (entry) => !entry.endsWith('.map') });
};
await copy('lib/ask87_ts/dist');
await copy('lib/ask87_ts/native/ask87.node');
await copy('lib/ask87_ts/native/native.d.ts');
await copy('LICENSE');
try {
  await stat(path.join(source, 'README.md'));
  await copy('README.md');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const binary = await readFile(path.join(stage, 'lib/ask87_ts/native/ask87.node'));
await writeFile(path.join(stage, 'SOURCE.json'), `${JSON.stringify({
  repository: 'https://github.com/thedtvn/attack_shark_x87_rs',
  commit: '3d489cd0c71fb30e6f1729c213963c644e287fa1',
  napiTarget: 'win32-x64',
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
      // Accept only the clean GitHub runner account; reject local profile names and macOS/Linux home paths.
      const personal = /duong|\/Users\/|\/home\/(?!runner\b)|[A-Z]:[\\/]Users[\\/](?!runneradmin\b)/i;
      if (personal.test(contents)) throw new Error(`Personal path or name found in staged file: ${path.relative(stage, file)}`);
    }
  }
}
await scan(stage);
