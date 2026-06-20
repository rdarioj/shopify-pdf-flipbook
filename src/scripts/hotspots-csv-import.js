/**
 * CSV → hotspots.json
 *
 * Modo A (coords): page, x, y, w, h + variant_id o href
 * Modo B (plantilla): page, slot [, preset] + variant_id o href — usa coords de catalog-8, etc.
 *
 * Delimitador: coma. Campos entre comillas admiten comas y comillas dobles escapadas "".
 */

import { mergeSlotRowsIntoData } from "./hotspots-grid-presets.js";

const HEADER_ALIASES = {
  page: ["page", "pagina", "page_number", "p", "num_page", "numpage"],
  slot: ["slot", "zona", "index", "pos", "position"],
  preset: ["preset", "plantilla", "template", "grid"],
  x: ["x"],
  y: ["y"],
  w: ["w", "width", "ancho"],
  h: ["h", "height", "alto"],
  variantId: ["variant_id", "variantid", "variant", "id_variante"],
  href: ["href", "url", "link", "pdp"],
  quantity: ["quantity", "qty", "cantidad"],
  label: ["label", "titulo", "name", "title", "nombre"],
  action: ["action", "accion"],
};

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}

/** Filas como array de celdas (strings). */
function splitCsvRows(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;
  const pushRow = () => {
    row.push(cell);
    cell = "";
    const nonEmpty = row.some((c) => String(c).trim() !== "");
    if (nonEmpty) rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }
    if (c === "\r") {
      i++;
      if (text[i] === "\n") i++;
      pushRow();
      continue;
    }
    if (c === "\n") {
      i++;
      pushRow();
      continue;
    }
    cell += c;
    i++;
  }
  row.push(cell);
  const nonEmpty = row.some((c) => String(c).trim() !== "");
  if (nonEmpty) rows.push(row);

  return rows;
}

function normalizeHeaderCell(h) {
  return String(h)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/** @returns {Record<string, number>} canonical → column index */
function resolveHeaderIndices(headerRow) {
  const norm = headerRow.map(normalizeHeaderCell);
  const idx = {};
  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    for (let j = 0; j < norm.length; j++) {
      if (aliases.includes(norm[j])) {
        idx[canonical] = j;
        break;
      }
    }
  }
  return idx;
}

function parseNum(str) {
  const t = String(str ?? "")
    .trim()
    .replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function cellAt(row, colIdx) {
  if (colIdx === undefined || colIdx < 0) return "";
  return row[colIdx] != null ? String(row[colIdx]) : "";
}

function parseHotspotsCsvSlotMode(raw, headerIdx, options = {}) {
  const missing = ["page", "slot"].filter((k) => headerIdx[k] === undefined);
  if (missing.length) {
    return {
      ok: false,
      message: `Modo plantilla: faltan columnas ${missing.join(", ")}. Cabecera: page,slot,preset,variant_id,href,label`,
    };
  }

  const slotRows = [];
  const errors = [];

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r];
    const line = r + 1;
    const pageN = Math.round(parseNum(cellAt(row, headerIdx.page)));
    const slotN = Math.round(parseNum(cellAt(row, headerIdx.slot)));

    if (!Number.isFinite(pageN) || pageN < 1) {
      errors.push(`Fila ${line}: page inválido`);
      continue;
    }
    if (!Number.isFinite(slotN) || slotN < 1) {
      errors.push(`Fila ${line}: slot inválido (1–8)`);
      continue;
    }

    const presetRaw =
      headerIdx.preset !== undefined ? cellAt(row, headerIdx.preset).trim() : "";
    const variantRaw =
      headerIdx.variantId !== undefined ? cellAt(row, headerIdx.variantId).trim() : "";
    const hrefRaw = headerIdx.href !== undefined ? cellAt(row, headerIdx.href).trim() : "";
    const labelRaw = headerIdx.label !== undefined ? cellAt(row, headerIdx.label).trim() : "";

    let quantity = 1;
    if (headerIdx.quantity !== undefined) {
      const q = parseNum(cellAt(row, headerIdx.quantity));
      if (q !== null && q >= 1) quantity = Math.floor(q);
    }

    let action = "add";
    if (headerIdx.action !== undefined) {
      const a = cellAt(row, headerIdx.action).trim().toLowerCase();
      if (a === "buy") action = "buy";
    }

    slotRows.push({
      page: pageN,
      slot: slotN,
      preset: presetRaw || "catalog-8",
      variantId: variantRaw || undefined,
      href: hrefRaw || undefined,
      label: labelRaw || undefined,
      action,
      quantity,
    });
  }

  if (!slotRows.length) {
    return {
      ok: false,
      message: "No quedó ninguna fila válida." + (errors.length ? "\n" + errors.join("\n") : ""),
    };
  }

  const base = options.merge && options.existingData ? options.existingData : {};
  const data = mergeSlotRowsIntoData(base, slotRows);

  let msg = "";
  if (errors.length) {
    msg = errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\n…y ${errors.length - 5} más.` : "");
  }

  return { ok: true, data, warnings: msg || undefined, mode: "slot" };
}

function parseHotspotsCsvCoordMode(raw, headerIdx) {
  const need = ["page", "x", "y", "w", "h"];
  const missing = need.filter((k) => headerIdx[k] === undefined);
  if (missing.length) {
    return {
      ok: false,
      message: `Faltan columnas en la cabecera: ${missing.join(", ")}. Usá page,x,y,w,h y variant_id o href.`,
    };
  }
  if (headerIdx.variantId === undefined && headerIdx.href === undefined) {
    return {
      ok: false,
      message: "Hace falta al menos una columna variant_id (o variant) o href (o url).",
    };
  }

  const byPage = {};
  const errors = [];

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r];
    const line = r + 1;

    const pageN = Math.round(parseNum(cellAt(row, headerIdx.page)));
    const x = parseNum(cellAt(row, headerIdx.x));
    const y = parseNum(cellAt(row, headerIdx.y));
    const w = parseNum(cellAt(row, headerIdx.w));
    const h = parseNum(cellAt(row, headerIdx.h));

    if (!Number.isFinite(pageN) || pageN < 1) {
      errors.push(`Fila ${line}: page inválido (${cellAt(row, headerIdx.page)})`);
      continue;
    }
    if (x === null || y === null || w === null || h === null) {
      errors.push(`Fila ${line}: x,y,w,h deben ser números (0–1).`);
      continue;
    }

    const variantRaw =
      headerIdx.variantId !== undefined ? cellAt(row, headerIdx.variantId).trim() : "";
    const hrefRaw = headerIdx.href !== undefined ? cellAt(row, headerIdx.href).trim() : "";

    if (!variantRaw && !hrefRaw) {
      errors.push(`Fila ${line}: indicá variant_id o href.`);
      continue;
    }

    let quantity = 1;
    if (headerIdx.quantity !== undefined) {
      const q = parseNum(cellAt(row, headerIdx.quantity));
      if (q !== null && q >= 1) quantity = Math.floor(q);
    }

    let action = "add";
    if (headerIdx.action !== undefined) {
      const a = cellAt(row, headerIdx.action).trim().toLowerCase();
      if (a === "buy") action = "buy";
      else if (a === "add" || a === "") action = "add";
      else if (a) errors.push(`Fila ${line}: action desconocida "${a}", se usa add.`);
    }

    const label =
      headerIdx.label !== undefined ? cellAt(row, headerIdx.label).trim() : "";

    const rec = {
      x: clamp01(x),
      y: clamp01(y),
      w: clamp01(w),
      h: clamp01(h),
      action,
      quantity,
      label: label || (variantRaw ? `Variant ${variantRaw}` : "Link"),
    };
    if (variantRaw) rec.variantId = variantRaw;
    if (hrefRaw) rec.href = hrefRaw;

    const key = String(pageN);
    if (!byPage[key]) byPage[key] = [];
    byPage[key].push(rec);
  }

  if (errors.length && Object.keys(byPage).length === 0) {
    return { ok: false, message: errors.slice(0, 8).join("\n") + (errors.length > 8 ? "\n…" : "") };
  }

  if (Object.keys(byPage).length === 0) {
    return { ok: false, message: "No quedó ninguna fila válida." + (errors.length ? "\n" + errors.join("\n") : "") };
  }

  let msg = "";
  if (errors.length) {
    msg = errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\n…y ${errors.length - 5} más.` : "");
  }

  return { ok: true, data: byPage, warnings: msg || undefined, mode: "coords" };
}

/**
 * @param {string} text
 * @param {{ merge?: boolean, existingData?: Record<string, object[]> }} [options]
 */
export function parseHotspotsCsv(text, options = {}) {
  const raw = splitCsvRows(String(text).replace(/^\uFEFF/, ""));
  if (!raw.length) {
    return { ok: false, message: "El CSV está vacío." };
  }

  const headerIdx = resolveHeaderIndices(raw[0]);
  if (headerIdx.slot !== undefined && headerIdx.x === undefined) {
    return parseHotspotsCsvSlotMode(raw, headerIdx, options);
  }
  return parseHotspotsCsvCoordMode(raw, headerIdx);
}
