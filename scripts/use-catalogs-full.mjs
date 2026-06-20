import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const full = path.join(root, "src", "config", "catalogs.full.json");
const target = path.join(root, "src", "config", "catalogs.json");

fs.copyFileSync(full, target);
console.log("[dev:full] catalogs.json restaurado con TAP (desarrollo local)");
