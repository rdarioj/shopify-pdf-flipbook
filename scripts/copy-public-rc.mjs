import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const publicDir = path.join(root, "public");
const distDir = path.join(root, process.argv[2] || "dist");

const SKIP_DIRS = new Set(["catalogos"]);
const SKIP_FILE_RE = /tap/i;

if (!fs.existsSync(distDir)) {
  console.warn("[copy-public-rc] dist/ no existe, omitiendo");
  process.exit(0);
}
if (!fs.existsSync(publicDir)) {
  console.warn("[copy-public-rc] public/ no existe, omitiendo");
  process.exit(0);
}

function shouldSkip(name, isDir) {
  if (isDir && SKIP_DIRS.has(name)) return true;
  if (!isDir && SKIP_FILE_RE.test(name)) return true;
  return false;
}

function copyRecursive(src, dest, rel = "") {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (shouldSkip(path.basename(src), true)) {
      console.log(`[copy-public-rc] omitido dir ${rel || path.basename(src)}/`);
      return;
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name), path.join(rel, name));
    }
    return;
  }
  if (shouldSkip(path.basename(src), false)) {
    console.log(`[copy-public-rc] omitido ${rel || path.basename(src)}`);
    return;
  }
  fs.copyFileSync(src, dest);
}

for (const name of fs.readdirSync(publicDir)) {
  copyRecursive(path.join(publicDir, name), path.join(distDir, name), name);
}

console.log("[copy-public-rc] Assets RC copiados a dist/ (sin TAP)");
