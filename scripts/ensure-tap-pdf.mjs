/**
 * Garantiza public/catalogos/tap-catalogo-secos.pdf para la demo TAP.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const destDir = path.join(root, "public", "catalogos");
const dest = path.join(destDir, "tap-catalogo-secos.pdf");
const TAP_PDF_URL =
  "https://tapdistribuciones.com.ar/wp-content/uploads/catalogos/catalogo-secos.pdf";

function log(msg) {
  console.log(`[ensure-tap-pdf] ${msg}`);
}

if (fs.existsSync(dest) && fs.statSync(dest).size > 100_000) {
  log(`OK (${Math.round(fs.statSync(dest).size / 1024 / 1024)} MB)`);
  process.exit(0);
}

log("Descargando catálogo TAP…");
const res = await fetch(TAP_PDF_URL);
if (!res.ok) {
  console.error(`[ensure-tap-pdf] HTTP ${res.status} — ${TAP_PDF_URL}`);
  process.exit(1);
}

const buf = Buffer.from(await res.arrayBuffer());
fs.mkdirSync(destDir, { recursive: true });
fs.writeFileSync(dest, buf);
log(`Guardado → ${dest} (${Math.round(buf.length / 1024 / 1024)} MB)`);
