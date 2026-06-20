import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const catalogsJson = path.join(root, "src", "config", "catalogs.json");
const catalogsRc = path.join(root, "src", "config", "catalogs.rc.json");
const catalogsBackup = path.join(root, "src", "config", "catalogs.__build_backup__.json");

let restored = false;
function restoreCatalogs() {
  if (restored) return;
  restored = true;
  if (fs.existsSync(catalogsBackup)) {
    fs.copyFileSync(catalogsBackup, catalogsJson);
    fs.unlinkSync(catalogsBackup);
  }
}

process.on("exit", restoreCatalogs);
process.on("SIGINT", () => {
  restoreCatalogs();
  process.exit(130);
});

try {
  if (fs.existsSync(catalogsJson)) {
    fs.copyFileSync(catalogsJson, catalogsBackup);
  }
  fs.copyFileSync(catalogsRc, catalogsJson);
  console.log("[build:rc] catalogs.json → seed RC (sin TAP)");

  execSync("node scripts/ensure-catalog-pdf.mjs", { cwd: root, stdio: "inherit" });

  const dist = path.join(root, "dist");
  if (fs.existsSync(dist)) {
    fs.rmSync(dist, { recursive: true, force: true });
  }

  const parcelCmd =
    "npx parcel build src/catalogs.html src/viewer.html src/index.html --public-url ./ --dist-dir dist";
  execSync(parcelCmd, {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      PARCEL_CACHE_DIR: process.env.PARCEL_CACHE_DIR || path.join(root, ".parcel-cache"),
    },
  });

  execSync("node scripts/copy-public-rc.mjs dist", { cwd: root, stdio: "inherit" });

  console.log("[build:rc] Listo → dist/ (catalogs.html + viewer + index, solo RC)");
} catch (err) {
  restoreCatalogs();
  process.exit(err.status || 1);
}

restoreCatalogs();
