import bundled from "../config/hotspots.json" assert { type: "json" };
import bundledTap from "../config/hotspots-tap.json" assert { type: "json" };
import bundledRcTemplate from "../config/hotspots-rc-template.json" assert { type: "json" };

function getSeedBundle() {  const g = typeof window !== "undefined" && window.FLIPBOOK_CONFIG;
  const file = g?.hotspotsFile;
  if (file === "tap") return bundledTap;
  if (file === "rc-template") return bundledRcTemplate;
  return bundled;
}

function clonePages(src) {
  const o = {};
  for (const k of Object.keys(src)) {
    o[k] = (src[k] || []).map((row) => ({ ...row }));
  }
  return o;
}

let data = clonePages(getSeedBundle());

export function getHotspotsData() {
  return data;
}

export function getHotspotsForPage(pageNum) {
  return (data[String(pageNum)] || []).map((r) => ({ ...r }));
}

export function setHotspotsForPage(pageNum, rows) {
  data[String(pageNum)] = rows.map((r) => ({ ...r }));
}

export function replaceHotspotsData(next) {
  if (!next || typeof next !== "object") return;
  const o = {};
  for (const k of Object.keys(next)) {
    o[String(k)] = (next[k] || []).map((row) => ({ ...row }));
  }
  data = o;
}

export function resetHotspotsToBundled() {
  data = clonePages(getSeedBundle());
}
