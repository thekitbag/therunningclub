/**
 * Boots the production server for the Playwright suite.
 *
 * Playwright drives the real `next start` output rather than the dev server, so
 * the browser journeys exercise the same bundle, the same security headers and
 * the same startup configuration checks that a deployment would.
 */
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

function loadEnvFile(path) {
  const env = {};
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch {
    return env;
  }
  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 0) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const fileEnv = loadEnvFile(resolve(root, '.env.e2e'));

const child = spawn('node_modules/.bin/next', ['start', '--port', process.env.PORT ?? '3100'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...fileEnv,
    NODE_ENV: 'production',
    PORT: process.env.PORT ?? '3100',
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
process.on('SIGTERM', () => child.kill('SIGTERM'));
process.on('SIGINT', () => child.kill('SIGINT'));
