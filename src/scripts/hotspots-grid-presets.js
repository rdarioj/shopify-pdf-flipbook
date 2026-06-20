/**
 * Plantillas de rejilla (coords normalizadas 0–1).
 * Ajustá en src/config/grid-presets.json si tu PDF no coincide con el catálogo RC.
 */

import presetJson from "../config/grid-presets.json" assert { type: "json" };
import catalogLayouts from "../config/catalog-page-layouts.json" assert { type: "json" };

/** @typedef {{ x: number, y: number, w: number, h: number, label?: string }} GridSlot */

/**
 * @param {string} presetId
 * @returns {{ id: string, label: string, slots: GridSlot[] } | null}
 */
export function getGridPreset(presetId) {
  const p = presetJson[presetId];
  if (!p || !Array.isArray(p.slots)) return null;
  return { id: presetId, label: p.label || presetId, slots: p.slots };
}

export function listGridPresetIds() {
  return Object.keys(presetJson);
}

/** @returns {{ pdf: string, pages: Record<string, { preset: string, productCount: number, note: string, slots: GridSlot[] }> }} */
export function getCatalogLayouts() {
  return catalogLayouts;
}

export function getCatalogPageLayout(pageNum) {
  return catalogLayouts.pages?.[String(pageNum)] || null;
}

export function listCatalogPages() {
  return Object.keys(catalogLayouts.pages || {})
    .map(Number)
    .filter((n) => n >= 1)
    .sort((a, b) => a - b);
}

/**
 * Zonas de una página según análisis del PDF (coords propias por página).
 * @param {number} pageNum
 * @param {{ skipCover?: boolean }} [opts]
 */
export function buildHotspotsFromCatalogPage(pageNum, opts = {}) {
  const info = getCatalogPageLayout(pageNum);
  if (!info?.slots?.length) return [];
  if (opts.skipCover && pageNum === 1) return [];

  return info.slots.map((slot, i) => {
    const n = i + 1;
    return {
      slot: n,
      preset: info.preset,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      action: "add",
      quantity: 1,
      label: slot.label || `Pág. ${pageNum} · producto ${n}`,
    };
  });
}

/** Todas las páginas del catálogo abril (sin portada). */
export function buildAllCatalogHotspots() {
  const data = {};
  for (const pageNum of listCatalogPages()) {
    if (pageNum === 1) continue;
    const rows = buildHotspotsFromCatalogPage(pageNum);
    if (rows.length) data[String(pageNum)] = rows;
  }
  return data;
}

/**
 * @param {string} presetId
 * @param {number} pageNum - 1-based (solo para etiquetas por defecto)
 * @returns {object[]}
 */
export function buildHotspotsFromPreset(presetId, pageNum = 1) {
  const preset = getGridPreset(presetId);
  if (!preset) throw new Error(`Plantilla desconocida: ${presetId}`);

  return preset.slots.map((slot, i) => {
    const n = i + 1;
    return {
      slot: n,
      preset: presetId,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      action: "add",
      quantity: 1,
      label: slot.label || `Pág. ${pageNum} · producto ${n}`,
    };
  });
}

/**
 * Aplica filas CSV (page, slot, variant_id/href, …) sobre datos existentes o coords de plantilla.
 * @param {Record<string, object[]>} baseData
 * @param {Array<{ page: number, slot: number, preset?: string, variantId?: string, href?: string, label?: string, action?: string, quantity?: number }>} rows
 */
export function mergeSlotRowsIntoData(baseData, rows) {
  const data = {};
  for (const k of Object.keys(baseData)) {
    data[k] = (baseData[k] || []).map((r) => ({ ...r }));
  }

  for (const row of rows) {
    const key = String(row.page);
    const slotIdx = row.slot - 1;
    if (slotIdx < 0) continue;

    const presetId = row.preset || "catalog-8";
    if (!data[key] || !data[key].length) {
      const fromCatalog = buildHotspotsFromCatalogPage(row.page);
      data[key] = fromCatalog.length ? fromCatalog : buildHotspotsFromPreset(presetId, row.page);
    } else while (data[key].length < row.slot) {
      const cat = getCatalogPageLayout(row.page);
      const def = cat?.slots?.[data[key].length] || getGridPreset(presetId)?.slots[data[key].length];
      if (!def) break;
      data[key].push({
        slot: data[key].length + 1,
        preset: presetId,
        x: def.x,
        y: def.y,
        w: def.w,
        h: def.h,
        action: "add",
        quantity: 1,
        label: def.label || `Producto ${data[key].length + 1}`,
      });
    }

    const target = data[key][slotIdx];
    if (!target) {
      const cat = getCatalogPageLayout(row.page);
      const def = cat?.slots?.[slotIdx] || getGridPreset(presetId)?.slots[slotIdx];
      if (!def) continue;
      data[key][slotIdx] = {
        slot: row.slot,
        preset: presetId,
        x: def.x,
        y: def.y,
        w: def.w,
        h: def.h,
        action: "add",
        quantity: 1,
        label: row.label || def.label || `Producto ${row.slot}`,
      };
    }

    const h = data[key][slotIdx];
    h.slot = row.slot;
    h.preset = presetId;
    if (row.label) h.label = row.label;
    if (row.action) h.action = row.action;
    if (row.quantity != null) h.quantity = row.quantity;
    if (row.variantId) h.variantId = row.variantId;
    else delete h.variantId;
    if (row.href) h.href = row.href;
    else delete h.href;
  }

  return data;
}
