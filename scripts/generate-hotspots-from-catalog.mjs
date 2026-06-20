/**
 * Genera src/config/hotspots.json desde catalog-page-layouts.json
 * node scripts/generate-hotspots-from-catalog.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutsPath = path.join(root, "src/config/catalog-page-layouts.json");
const outPath = path.join(root, "src/config/hotspots.json");

const layouts = JSON.parse(fs.readFileSync(layoutsPath, "utf8"));
layouts.pages["1"] = {
  preset: "cover",
  productCount: 0,
  note: "Portada (sin zonas de producto)",
  slots: [],
};

const hotspots = {};
for (const [pageKey, info] of Object.entries(layouts.pages)) {
  const pageNum = Number(pageKey);
  if (pageNum === 1 || !info.slots?.length) continue;
  hotspots[pageKey] = info.slots.map((slot, i) => ({
    slot: i + 1,
    preset: info.preset,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    action: "add",
    quantity: 1,
    label: slot.label || `Pág. ${pageKey} · producto ${i + 1}`,
  }));
}

fs.writeFileSync(layoutsPath, JSON.stringify(layouts, null, 2) + "\n", "utf8");
fs.writeFileSync(outPath, JSON.stringify(hotspots, null, 2) + "\n", "utf8");
console.log("hotspots.json:", Object.keys(hotspots).length, "paginas producto");
let total = 0;
for (const k of Object.keys(hotspots)) total += hotspots[k].length;
console.log("total zonas:", total);
