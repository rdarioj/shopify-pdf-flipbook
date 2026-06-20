/**
 * Garantiza public/catalogo-abril.pdf antes del build.
 * - Si ya existe → OK
 * - Si CATALOG_PDF_URL está definida (Vercel) → descarga
 * - Si CATALOG_PDF_PATH o Downloads tiene el PDF → copia
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)), "..");
const destDir = path.join(root, "public");
const dest = path.join(destDir, "catalogo-abril.pdf");
const destTemplate = path.join(destDir, "catalogo-rc-template.pdf");

function log(msg) {
  console.log(`[ensure-catalog-pdf] ${msg}`);
}

if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
  log(`OK abril (${Math.round(fs.statSync(dest).size / 1024 / 1024)} MB)`);
} else {
  // fall through to download/copy logic below for abril only
}

const templateCandidates = [
  process.env.CATALOG_TEMPLATE_PDF_PATH?.trim(),
  path.join(process.env.USERPROFILE || "", "Downloads", "CATALOGO-RC-TEMPLATE.pdf"),
  path.join(process.env.HOME || "", "Downloads", "CATALOGO-RC-TEMPLATE.pdf"),
].filter(Boolean);

if (!fs.existsSync(destTemplate) || fs.statSync(destTemplate).size < 1000) {
  for (const src of templateCandidates) {
    if (src && fs.existsSync(src)) {
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, destTemplate);
      log(`Template copiado desde ${src}`);
      break;
    }
  }
}

if (fs.existsSync(destTemplate) && fs.statSync(destTemplate).size > 1000) {
  log(`OK template (${Math.round(fs.statSync(destTemplate).size / 1024)} KB)`);
}

if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
  process.exit(0);
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(dest, buf);
  log(`Descargado → ${dest} (${Math.round(buf.length / 1024 / 1024)} MB)`);
}

const url = process.env.CATALOG_PDF_URL?.trim();
if (url) {
  try {
    await download(url);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

const candidates = [
  process.env.CATALOG_PDF_PATH?.trim(),
  path.join(process.env.USERPROFILE || "", "Downloads", "V3_CATALOGO_ABRIL_COMPRIMIDO.pdf"),
  path.join(process.env.HOME || "", "Downloads", "V3_CATALOGO_ABRIL_COMPRIMIDO.pdf"),
].filter(Boolean);

for (const src of candidates) {
  if (src && fs.existsSync(src)) {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
    log(`Copiado desde ${src}`);
    process.exit(0);
  }
}

if (process.env.VERCEL === "1") {
  if (!fs.existsSync(destTemplate)) {
    console.warn("[ensure-catalog-pdf] Sin catalogo-rc-template.pdf en Vercel (opcional para el editor).");
  }
  console.error(
    "[ensure-catalog-pdf] Falta el PDF en Vercel. Subí el archivo a Shopify Files (o similar) y definí CATALOG_PDF_URL en el proyecto Vercel, o incluí public/catalogo-abril.pdf en el deploy."
  );
  process.exit(1);
}

log("Sin PDF local (modo dev: cargá manualmente o copiá a public/catalogo-abril.pdf)");
process.exit(0);
