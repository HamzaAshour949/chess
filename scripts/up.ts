/**
 * One command for local development:  bun run up
 *
 *  1. Installs dependencies (instant when bun.lock is already satisfied).
 *  2. On the first run, creates .env from .env.example with a fresh JWT_SECRET.
 *  3. Checks that the API and site ports are free, and names what holds them.
 *  4. Starts the project-local MongoDB replica set, unless MONGODB_URI points
 *     at another server.
 *  5. Seeds the database if it is empty. Existing data is never touched.
 *  6. Runs the API and the Vite dev server, and says where to go once both
 *     answer.
 *
 * Ctrl+C stops everything this command started, MongoDB included. A MongoDB
 * that was already running is left running.
 *
 * Options:  --open   open the site in the browser once it is ready
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const BUN = process.execPath;
/** Fixed in frontend/vite.config.js, with strictPort. */
const WEB_PORT = 3000;
const OPEN_BROWSER = Bun.argv.includes('--open');

const paint = (code: number) => (text: string) =>
  process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
const bold = paint(1);
const dim = paint(2);
const red = paint(31);
const green = paint(32);
const cyan = paint(36);

const step = (message: string) => console.log(`${cyan('›')} ${message}`);

function fail(message: string): never {
  console.error(`\n${red('✗')} ${message}\n`);
  process.exit(1);
}

/**
 * Run a command from the repo root; throws on a non-zero exit. `quiet`
 * captures the output and shows it only if the command fails.
 */
async function run(cmd: string[], { quiet = false } = {}): Promise<string> {
  const proc = Bun.spawn(cmd, {
    cwd: ROOT,
    stdout: quiet ? 'pipe' : 'inherit',
    stderr: quiet ? 'pipe' : 'inherit',
  });
  const [output, errors] = quiet
    ? await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    : ['', ''];
  const code = await proc.exited;
  if (code !== 0) {
    process.stderr.write(output + errors);
    throw new Error(`\`${path.basename(cmd[0] ?? '')} ${cmd.slice(1).join(' ')}\` failed`);
  }
  return output;
}

function readEnvFile(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2] ?? '';
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    values[match[1]!] = value;
  }
  return values;
}

function ensureEnvFile(): Record<string, string> {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) {
    const example = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
    const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(48))).toString('hex');
    fs.writeFileSync(envPath, example.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`), {
      mode: 0o600,
    });
    step('Created .env from .env.example, with a fresh JWT_SECRET');
  }
  return readEnvFile(envPath);
}

/** What is listening on `port`, or null when it is free. */
async function portOwner(port: number): Promise<string | null> {
  const lsof = Bun.which('lsof');
  if (lsof) {
    const proc = Bun.spawn([lsof, '-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpc'], {
      stdout: 'pipe',
      stderr: 'ignore',
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    if (!out.trim()) return null;
    const pid = /^p(\d+)/m.exec(out)?.[1];
    const name = /^c(.+)$/m.exec(out)?.[1];
    return `${name ?? 'another process'}${pid ? ` (pid ${pid})` : ''}`;
  }
  try {
    const socket = await Bun.connect({ hostname: 'localhost', port, socket: { data() {} } });
    socket.end();
    return 'another process';
  } catch {
    return null;
  }
}

/** The project-local MongoDB from scripts/mongo-dev.sh, as opposed to Atlas or Docker elsewhere. */
function isLocalMongo(uri: string): boolean {
  return /^mongodb:\/\/(?:127\.0\.0\.1|localhost)(?::27017)?(?:[/?]|$)/.test(uri);
}

/** The host part of a connection string, without credentials. */
function mongoHost(uri: string): string {
  return uri.replace(/^mongodb(\+srv)?:\/\/(?:[^@/]*@)?/, '').split(/[/?]/)[0] ?? uri;
}

/** Set once this command starts MongoDB, so it only stops what it started. */
let startedMongo = false;

async function stopMongo(): Promise<void> {
  if (!startedMongo) return;
  startedMongo = false;
  await run(['./scripts/mongo-dev.sh', 'stop'], { quiet: true }).catch(() => undefined);
  console.log(dim('MongoDB stopped.'));
}

async function waitUntilUp(url: string, isRunning: () => boolean, timeoutMs = 60_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && isRunning()) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      // Not listening yet.
    }
    await Bun.sleep(300);
  }
  return false;
}

// ------------------------------------------------------------------- main

const startedAt = Date.now();
let servers: ChildProcess | null = null;
let stopping = false;

/**
 * Signal every process the dev servers started (`bun run`, Vite, the API).
 * They run in their own process group, so this reaches all of them however
 * this command is stopped: Ctrl+C, a closed terminal, or a tool's SIGTERM
 * sent to this process alone. `bun run --parallel` does not forward that
 * last one, which would otherwise leave both servers running.
 */
function signalServers(signal: NodeJS.Signals | 0): boolean {
  if (!servers?.pid) return false;
  try {
    process.kill(-servers.pid, signal);
    return true;
  } catch {
    return false; // The group is gone.
  }
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
  process.on(signal, () => {
    if (stopping) {
      signalServers('SIGKILL'); // A second Ctrl+C: stop waiting.
      return;
    }
    stopping = true;
    if (!servers) {
      // Still setting up: undo what was started, then leave.
      void stopMongo().then(() => process.exit(130));
      return;
    }
    console.log(dim('\nStopping…'));
    signalServers('SIGINT');
  });
}

console.log(`\n${bold('Chess Hub')} ${dim('— starting everything for local development')}\n`);

step('Installing dependencies');
try {
  await run([BUN, 'install'], { quiet: true });
} catch {
  fail('bun install failed (see above).');
}

const fileEnv = ensureEnvFile();
const apiPort = Number(fileEnv.PORT || 8080);
const mongoUri = fileEnv.MONGODB_URI ?? '';
if (!Number.isInteger(apiPort) || apiPort <= 0) fail(`PORT in .env is not a port number: "${fileEnv.PORT}".`);
if (apiPort === WEB_PORT) fail(`PORT in .env must not be ${WEB_PORT}: the site's dev server uses it.`);
if (!mongoUri) fail('MONGODB_URI is missing from .env.');

/** Whether what answers on `port` is this app's API (another terminal, an editor's preview). */
async function isChessHubApi(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(1500) });
    const body = (await res.json()) as { status?: unknown; runtime?: unknown };
    return typeof body.status === 'string' && typeof body.runtime === 'string';
  } catch {
    return false;
  }
}

for (const [port, what] of [
  [apiPort, 'the API'],
  [WEB_PORT, 'the site'],
] as const) {
  const owner = await portOwner(port);
  if (!owner) continue;
  if (await isChessHubApi(apiPort)) {
    // The goal of `up` is already met; say where rather than report an error.
    console.log(
      `\n${green('✓')} ${bold('Chess Hub is already running:')} ${cyan(`http://localhost:${WEB_PORT}`)}\n` +
        `  It was started elsewhere — ${owner}, perhaps in another terminal or an\n` +
        `  editor's preview. Stop it there to run it from here instead.\n`,
    );
    process.exit(0);
  }
  fail(`Port ${port} (${what}) is already in use by ${owner}.\n  Stop that process and try again.`);
}

if (isLocalMongo(mongoUri)) {
  const status = (await run(['./scripts/mongo-dev.sh', 'status'], { quiet: true })).trim();
  if (status.startsWith('up')) {
    step('MongoDB is already running');
  } else {
    step('Starting MongoDB');
    try {
      await run(['./scripts/mongo-dev.sh', 'start'], { quiet: true });
    } catch {
      fail('MongoDB could not be started (see above).');
    }
    startedMongo = true;
  }
} else {
  step(`Using MongoDB at ${mongoHost(mongoUri)}`);
}

step('Checking the database');
try {
  await run([BUN, 'run', '--cwd', 'server', 'db:seed', '--if-empty']);
} catch {
  await stopMongo();
  fail('Seeding the database failed (see above).');
}

step('Starting the API and the site\n');
const apiOrigin = `http://localhost:${apiPort}`;
const siteUrl = `http://localhost:${WEB_PORT}`;
const devServers = spawn(BUN, ['run', 'dev'], {
  cwd: ROOT,
  detached: true, // its own process group; see signalServers()
  stdio: ['ignore', 'inherit', 'inherit'],
  // PORT comes from .env even when the calling shell or tool sets its own, so
  // the API never lands on the site's port; Vite proxies to the same origin.
  env: { ...process.env, PORT: String(apiPort), VITE_API_ORIGIN: apiOrigin },
});
servers = devServers;
const serversExited = new Promise<number>((resolve) => {
  devServers.once('exit', (code) => resolve(code ?? 1));
});

const running = () => devServers.exitCode === null && devServers.signalCode === null && !stopping;
const [apiUp, siteUp] = await Promise.all([
  waitUntilUp(`${apiOrigin}/api/health`, running),
  waitUntilUp(siteUrl, running),
]);

if (apiUp && siteUp) {
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  // The demo accounts created by server/src/db/seed.ts.
  console.log(`
${green('✓')} ${bold('Chess Hub is running')} ${dim(`(ready in ${seconds}s)`)}

  ${bold('Site')}      ${cyan(siteUrl)}
  ${bold('Admin')}     ${cyan(`${siteUrl}/admin/login`)}   ${dim('admin / Admin!2026Chess')}
  ${bold('Players')}   ${dim('magnus / ChessHub!2026   hikaru / ChessHub!2026')}
  ${bold('API')}       ${apiOrigin}

  ${dim('Press Ctrl+C to stop everything.')}
`);
  if (OPEN_BROWSER) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    if (Bun.which(opener)) Bun.spawn([opener, siteUrl], { stdout: 'ignore', stderr: 'ignore' });
  }
} else if (running()) {
  console.log(`\n${red('!')} The servers are taking unusually long to answer; see the output above.\n`);
}

const exitCode = await serversExited;
// `bun run` has exited; make sure nothing it started outlives it.
if (signalServers(0)) {
  if (!stopping) signalServers('SIGINT');
  const deadline = Date.now() + 5000;
  while (signalServers(0) && Date.now() < deadline) await Bun.sleep(100);
  signalServers('SIGKILL');
}
await stopMongo();
process.exit(stopping ? 0 : exitCode);
