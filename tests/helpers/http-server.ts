import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loopbackRequest } from "./http-request";

const LOOPBACK = "127.0.0.1";
const START_TIMEOUT_MS = 20_000;

export interface DisposablePylonServer {
  baseUrl: string;
  stop(): Promise<void>;
}

async function canBind(port: number): Promise<boolean> {
  return new Promise((resolveBind) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolveBind(false));
    server.listen(port, LOOPBACK, () => {
      server.close(() => resolveBind(true));
    });
  });
}

async function freePortTriplet(): Promise<number> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const candidate = 20_000 + Math.floor(Math.random() * 20_000);
    if (
      (await canBind(candidate)) &&
      (await canBind(candidate + 1)) &&
      (await canBind(candidate + 2))
    ) {
      return candidate;
    }
  }
  throw new Error("Could not reserve three loopback ports for an isolated Pylon server.");
}

async function waitForHealth(baseUrl: string, child: ChildProcessWithoutNullStreams): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Disposable Pylon server exited before health check (code ${child.exitCode}).`);
    }
    try {
      const response = await loopbackRequest(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // Expected while the listener is starting.
    }
    await Bun.sleep(100);
  }
  throw new Error(`Disposable Pylon server did not become healthy within ${START_TIMEOUT_MS}ms.`);
}

async function stopChild(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const stopped = await Promise.race([
    new Promise<boolean>((resolveClose) => child.once("close", () => resolveClose(true))),
    Bun.sleep(2_000).then(() => false),
  ]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    const forcedClose = new Promise<void>((resolveClose) => child.once("close", () => resolveClose()));
    child.kill("SIGKILL");
    await Promise.race([forcedClose, Bun.sleep(2_000)]);
  }
}

export async function startDisposablePylonServer(): Promise<DisposablePylonServer> {
  if (typeof Bun === "undefined") {
    throw new Error("HTTP characterization tests require Bun and never target an external server.");
  }

  const repoRoot = resolve(import.meta.dir, "../..");
  const pylonBin = resolve(repoRoot, "node_modules/.bin/pylon");
  const stateDir = await mkdtemp(resolve(tmpdir(), "smolboard-http-test-"));
  const port = await freePortTriplet();
  const baseUrl = `http://${LOOPBACK}:${port}`;
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PYLON_IN_MEMORY: "1",
    PYLON_DB_PATH: resolve(stateDir, "dev.db"),
    PYLON_FILES_DIR: resolve(stateDir, "files"),
    PYLON_RATE_LIMIT_MAX: "10000",
    PYLON_FN_RATE_LIMIT_MAX: "10000",
    PYLON_PUBLIC_URL: baseUrl,
    // Explicit empty overrides prevent an untracked local env file from using
    // real transports during characterization tests.
    PYLON_EMAIL_PROVIDER: "",
    PYLON_EMAIL_API_KEY: "",
    PYLON_EMAIL_FROM: "",
    PYLON_FILES_PROVIDER: "",
    PYLON_STACK0_API_KEY: "",
    PYLON_STACK0_PROJECT_SLUG: "",
    DATABASE_URL: "",
    PYLON_DATABASE_URL: "",
    PYLON_DB_URL: "",
  };
  const child = spawn(pylonBin, ["dev", "--port", String(port), "--json"], {
    cwd: repoRoot,
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // Drain output so the child cannot block. Do not retain it: dev email output
  // can contain one-time verification codes.
  child.stdout.resume();
  child.stderr.resume();

  try {
    await waitForHealth(baseUrl, child);
  } catch (error) {
    await stopChild(child);
    throw error;
  }

  return {
    baseUrl,
    stop: () => stopChild(child),
  };
}
