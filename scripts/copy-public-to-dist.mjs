import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const publicDir = path.join(root, "public");
const distDir = path.join(root, process.argv[2] || "dist");

if (!fs.existsSync(distDir)) {
  console.warn("[copy-public] dist/ no existe, omitiendo");
  process.exit(0);
}
if (!fs.existsSync(publicDir)) {
  console.warn("[copy-public] public/ no existe, omitiendo");
  process.exit(0);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.copyFileSync(src, dest);
}

for (const name of fs.readdirSync(publicDir)) {
  copyRecursive(path.join(publicDir, name), path.join(distDir, name));
}

console.log("[copy-public] Archivos estáticos copiados a dist/");
