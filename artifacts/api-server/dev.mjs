import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const env = {
  ...process.env,
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: process.env.API_PORT ?? process.env.PORT ?? "8080",
};

const build = spawnSync(process.execPath, ["build.mjs"], {
  cwd: serverDir,
  env,
  stdio: "inherit",
});

if (build.error) {
  throw build.error;
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const server = spawn(
  process.execPath,
  ["--enable-source-maps", "dist/index.mjs"],
  {
    cwd: serverDir,
    env,
    stdio: "inherit",
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill(signal);
    }
  });
}

server.once("error", (error) => {
  console.error("Failed to start the API server:", error);
  process.exitCode = 1;
});

server.once("close", (code) => {
  process.exitCode = code ?? 0;
});
