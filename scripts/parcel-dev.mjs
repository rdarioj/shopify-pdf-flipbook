import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const parcelBin = path.join(root, "node_modules", "parcel", "lib", "bin.js");

// Fuera de OneDrive: evita ENOENT al borrar temporales de Parcel en Windows.
const localRoot = path.join(
  process.env.LOCALAPPDATA || os.tmpdir(),
  "shopify-pdf-flipbook-parcel"
);
const cacheDir = path.join(localRoot, "cache");
const tmpDir = path.join(localRoot, "tmp");

function resetDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
  } catch {
    // ignore
  }
  fs.mkdirSync(dir, { recursive: true });
}

resetDir(tmpDir);
fs.mkdirSync(cacheDir, { recursive: true });

const entries = process.argv.slice(2);
if (!entries.length) {
  console.error("Uso: node scripts/parcel-dev.mjs src/catalogs.html [más entradas…] [--open ruta]");
  process.exit(1);
}

const env = {
  ...process.env,
  PARCEL_CACHE_DIR: cacheDir,
  TMP: tmpDir,
  TEMP: tmpDir,
  TMPDIR: tmpDir,
};

// En Windows reduce carreras con archivos .f temporales del bundler.
if (process.platform === "win32") {
  env.PARCEL_WORKER_BACKEND = env.PARCEL_WORKER_BACKEND || "process";
}

console.log(`[parcel-dev] cache: ${cacheDir}`);
console.log(`[parcel-dev] tmp:   ${tmpDir}`);

const child = spawn(process.execPath, [parcelBin, ...entries], {
  cwd: root,
  env,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code) => process.exit(code ?? 1));
