import seedData from "../config/catalogs.json" assert { type: "json" };

const STORAGE_KEY = "flipbook-catalogs-v1";

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function readStore() {
  if (typeof window === "undefined") return { custom: [], overrides: {}, deleted: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { custom: [], overrides: {}, deleted: [] };
    const parsed = JSON.parse(raw);
    return {
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
      overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
      deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
    };
  } catch {
    return { custom: [], overrides: {}, deleted: [] };
  }
}

function writeStore(store) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getSeedCatalogs() {
  return clone(seedData.catalogs || []);
}

export function catalogToFlipbookConfig(cat) {
  if (!cat) throw new Error("Catálogo no encontrado");
  return {
    catalogId: cat.id,
    storeOrigin: cat.storeOrigin || "https://example.com",
    mode: cat.mode === "b2b-whatsapp" ? "b2b-whatsapp" : "shopify",
    addMode: cat.addMode === "ajax" ? "ajax" : "permalink",
    showDetectedProducts: Boolean(cat.showDetectedProducts),
    hotspotDebug: Boolean(cat.hotspotDebug),
    navigate: cat.navigate === "same" ? "same" : "tab",
    publishMode: cat.publishMode !== false,
    defaultPdfUrl: cat.pdfUrl || "",
    catalogTitle: cat.title || cat.id,
    hotspotsFile: cat.hotspotsFile || "default",
    whatsappPhone: cat.whatsappPhone || "",
    whatsappBusinessName: cat.whatsappBusinessName || "",
    whatsappIntro: cat.whatsappIntro || "",
    footerHint: cat.footerHint || "",
    editorRequireAuth: cat.editorRequireAuth === true || cat.requireAuth === true,
    requireAuth: false,
    organization: cat.organization || "",
    singlePage: cat.singlePage === true,
  };
}

function mergeCatalog(base, override) {
  if (!override) return clone(base);
  return { ...clone(base), ...override, id: base.id };
}

export function listCatalogs() {
  const store = readStore();
  const deleted = new Set(store.deleted);
  const byId = new Map();

  for (const cat of getSeedCatalogs()) {
    if (deleted.has(cat.id)) continue;
    byId.set(cat.id, mergeCatalog(cat, store.overrides[cat.id]));
  }

  for (const cat of store.custom) {
    if (!cat?.id || deleted.has(cat.id)) continue;
    byId.set(cat.id, mergeCatalog(cat, store.overrides[cat.id]));
  }

  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title, "es"));
}

export function getCatalogById(id) {
  return listCatalogs().find((c) => c.id === id) || null;
}

export function resolveCatalogForViewer(id) {
  const cat = getCatalogById(id);
  if (!cat) throw new Error(`Catálogo "${id}" no existe`);
  return catalogToFlipbookConfig(cat);
}

export function viewerUrl(cat, { editor = false } = {}) {
  const entry = cat.entry === "index.html" ? "index.html" : "viewer.html";
  const params = new URLSearchParams();
  if (entry === "viewer.html") params.set("catalog", cat.id);
  if (editor) params.set("editor", "1");
  const qs = params.toString();
  return qs ? `${entry}?${qs}` : entry;
}

export function saveCatalog(catalog) {
  const id = String(catalog.id || "").trim();
  if (!id) throw new Error("El catálogo necesita un id (slug).");

  const store = readStore();
  const seed = getSeedCatalogs().find((c) => c.id === id);
  const isCustom = store.custom.some((c) => c.id === id);

  if (seed?.frozen && !isCustom) {
    store.overrides[id] = { ...store.overrides[id], ...catalog, id };
  } else if (isCustom || !seed) {
    const idx = store.custom.findIndex((c) => c.id === id);
    const row = { ...catalog, id, entry: catalog.entry || "viewer.html", frozen: false };
    if (idx >= 0) store.custom[idx] = row;
    else store.custom.push(row);
    delete store.overrides[id];
  } else {
    store.overrides[id] = { ...store.overrides[id], ...catalog, id };
  }

  const deletedIdx = store.deleted.indexOf(id);
  if (deletedIdx >= 0) store.deleted.splice(deletedIdx, 1);

  writeStore(store);
  return getCatalogById(id);
}

export function deleteCatalog(id) {
  const store = readStore();
  const seed = getSeedCatalogs().find((c) => c.id === id);

  if (seed?.frozen) {
    throw new Error("No se puede eliminar un catálogo congelado (RC).");
  }

  store.custom = store.custom.filter((c) => c.id !== id);
  delete store.overrides[id];
  if (seed && !store.deleted.includes(id)) store.deleted.push(id);
  writeStore(store);
}

export function resetLocalCatalogs() {
  if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
}

export function exportLocalCatalogs() {
  return JSON.stringify(readStore(), null, 2);
}

export function importLocalCatalogs(jsonText) {
  const parsed = JSON.parse(jsonText);
  writeStore({
    custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    overrides: parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
    deleted: Array.isArray(parsed.deleted) ? parsed.deleted : [],
  });
}
