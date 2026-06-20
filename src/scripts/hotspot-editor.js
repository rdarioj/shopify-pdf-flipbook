import {
  getHotspotsData,
  getHotspotsForPage,
  replaceHotspotsData,
  resetHotspotsToBundled,
  setHotspotsForPage,
} from "./hotspots-data.js";
import { parseHotspotsCsv } from "./hotspots-csv-import.js";
import { getFlipbookRuntime } from "./flipbook-runtime.js";
import {
  buildHotspotsFromPreset,
  buildHotspotsFromCatalogPage,
  buildAllCatalogHotspots,
  listGridPresetIds,
  getCatalogPageLayout,
} from "./hotspots-grid-presets.js";

let editorActive = false;
let rerenderSpread = async () => {};
let panelEl = null;
let pendingNorm = null;
let lastVisiblePages = [];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function normalizeRect(ax, ay, bx, by) {
  const x = clamp01(Math.min(ax, bx));
  const y = clamp01(Math.min(ay, by));
  const w = clamp01(Math.max(ax, bx)) - x;
  const h = clamp01(Math.max(ay, by)) - y;
  return { x, y, w, h };
}

function createPanel() {
  if (panelEl) return panelEl;
  panelEl = document.createElement("aside");
  panelEl.id = "hotspot-editor-panel";
  panelEl.className = "hotspot-editor-panel";
  panelEl.hidden = true;
  panelEl.innerHTML = `
    <div class="hep-header">
      <strong>Editor de zonas</strong>
      <p class="hep-hint">Arrastrá sobre una página para dibujar un rectángulo. Luego completá variant ID y guardá.</p>
    </div>
    <div class="hep-actions">
      <label class="hep-btn hep-btn--ghost">
        Importar JSON
        <input type="file" id="hepImport" accept="application/json,.json" hidden />
      </label>
      <label class="hep-btn hep-btn--ghost">
        Importar CSV
        <input type="file" id="hepImportCsv" accept=".csv,text/csv" hidden />
      </label>
      <button type="button" class="hep-btn" id="hepExport">Exportar JSON</button>
      <button type="button" class="hep-btn hep-btn--ghost" id="hepReset">Reset plantilla</button>
    </div>
    <div class="hep-grid-block">
      <div class="hep-grid-title">Rejilla masiva (8 productos)</div>
      <label class="hep-grid-field">Página
        <input type="number" id="hepGridPage" min="1" value="2" />
      </label>
      <label class="hep-grid-field">Plantilla
        <select id="hepGridPreset"></select>
      </label>
      <div class="hep-grid-actions">
        <button type="button" class="hep-btn hep-btn--primary" id="hepGridGen">Generar página actual</button>
        <button type="button" class="hep-btn hep-btn--primary" id="hepCatalogAll">Catálogo abril (11 pág.)</button>
        <button type="button" class="hep-btn hep-btn--ghost" id="hepGridTpl">CSV solo enlaces</button>
      </div>
      <p class="hep-grid-hint">Creá las 8 áreas de una vez; después importá un CSV con <code>page,slot,variant_id</code> o <code>href</code> (PDP / carrito).</p>
    </div>
    <p class="hep-csv-hint">CSV coords: <code>page,x,y,w,h,variant_id</code>. CSV plantilla: <code>page,slot,preset,variant_id,href,label</code>.</p>
    <div class="hep-form" id="hepForm" hidden>
      <div class="hep-form-title">Nueva zona <span id="hepPageLabel"></span></div>
      <label>Variant ID <input type="text" id="hepVariant" placeholder="48793685197077" autocomplete="off" /></label>
      <label>Cantidad <input type="number" id="hepQty" min="1" value="1" /></label>
      <label>Etiqueta <input type="text" id="hepLabel" placeholder="Nombre visible / tooltip" autocomplete="off" /></label>
      <label>Acción
        <select id="hepAction">
          <option value="add">add → carrito Shopify</option>
          <option value="buy">buy → carrito Shopify</option>
          <option value="cart">cart → pedido WhatsApp</option>
        </select>
      </label>
      <label>URL custom (opcional, ignora variant)
        <input type="url" id="hepHref" placeholder="https://…" autocomplete="off" />
      </label>
      <div class="hep-form-buttons">
        <button type="button" class="hep-btn hep-btn--primary" id="hepSave">Guardar zona</button>
        <button type="button" class="hep-btn hep-btn--ghost" id="hepCancel">Cancelar</button>
      </div>
    </div>
    <div class="hep-list-wrap">
      <div class="hep-list-title">Zonas en páginas visibles</div>
      <ul class="hep-list" id="hepList"></ul>
    </div>
  `;
  document.body.appendChild(panelEl);

  const presetSel = panelEl.querySelector("#hepGridPreset");
  for (const id of listGridPresetIds()) {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = id === "catalog-8" ? "8 productos (2+2+4)" : id;
    presetSel.appendChild(opt);
  }

  panelEl.querySelector("#hepGridGen").addEventListener("click", () => {
    const page = Number(panelEl.querySelector("#hepGridPage").value) || lastVisiblePages[0] || 1;
    const presetId = presetSel.value || "catalog-8";
    const existing = getHotspotsForPage(page);
    const cat = getCatalogPageLayout(page);
    const label = cat ? `${cat.productCount} zonas (${cat.note})` : `plantilla ${presetId}`;
    if (existing.length && !confirm(`La página ${page} ya tiene ${existing.length} zona(s). ¿Reemplazar por ${label}?`)) {
      return;
    }
    const rows = buildHotspotsFromCatalogPage(page);
    setHotspotsForPage(page, rows.length ? rows : buildHotspotsFromPreset(presetId, page));
    pendingNorm = null;
    hideForm();
    rerenderSpread();
    alert(`Listo: ${getHotspotsForPage(page).length} zonas en la página ${page}. Importá el CSV de enlaces o exportá JSON.`);
  });

  panelEl.querySelector("#hepCatalogAll").addEventListener("click", () => {
    if (
      !confirm(
        "¿Generar zonas para las páginas 2–11 del catálogo abril según el análisis del PDF? (La portada queda sin zonas.)"
      )
    ) {
      return;
    }
    replaceHotspotsData(buildAllCatalogHotspots());
    pendingNorm = null;
    hideForm();
    rerenderSpread();
    alert("Catálogo cargado. Revisá con hotspotDebug: true. Luego importá el CSV con variant_id o href por slot.");
  });

  panelEl.querySelector("#hepGridTpl").addEventListener("click", () => {
    const page = Number(panelEl.querySelector("#hepGridPage").value) || lastVisiblePages[0] || 2;
    const cat = getCatalogPageLayout(page);
    const presetId = cat?.preset || presetSel.value || "catalog-8";
    const n = cat?.productCount || 8;
    const lines = ["page,slot,preset,variant_id,href,label,action,quantity"];
    for (let s = 1; s <= n; s++) {
      lines.push(`${page},${s},${presetId},,,Producto ${s},add,1`);
    }
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `hotspots-links-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  panelEl.querySelector("#hepExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(getHotspotsData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hotspots.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  panelEl.querySelector("#hepReset").addEventListener("click", () => {
    if (!confirm("¿Volver a las zonas del archivo hotspots.json del proyecto?")) return;
    resetHotspotsToBundled();
    pendingNorm = null;
    hideForm();
    rerenderSpread();
  });

  panelEl.querySelector("#hepImport").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object") throw new Error("JSON inválido");
        replaceHotspotsData(parsed);
        pendingNorm = null;
        hideForm();
        rerenderSpread();
      } catch (err) {
        alert("No se pudo importar: " + err.message);
      }
      e.target.value = "";
    };
    reader.readAsText(f);
  });

  panelEl.querySelector("#hepImportCsv").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const isSlotCsv = /^[^\n]*\bslot\b/i.test(String(reader.result).split(/\r?\n/)[0] || "");
      const result = parseHotspotsCsv(String(reader.result), {
        merge: isSlotCsv,
        existingData: isSlotCsv ? getHotspotsData() : undefined,
      });
      if (!result.ok) {
        alert("CSV: " + result.message);
        e.target.value = "";
        return;
      }
      replaceHotspotsData(result.data);
      pendingNorm = null;
      hideForm();
      rerenderSpread();
      if (result.warnings) {
        alert("CSV importado. Avisos:\n" + result.warnings);
      }
      e.target.value = "";
    };
    reader.readAsText(f, "UTF-8");
  });

  panelEl.querySelector("#hepSave").addEventListener("click", () => {
    if (!pendingNorm) return;
    const hrefRaw = panelEl.querySelector("#hepHref").value.trim();
    const variantRaw = panelEl.querySelector("#hepVariant").value.trim();
    const action = panelEl.querySelector("#hepAction").value || "add";
    if (!hrefRaw && !variantRaw && action !== "cart") {
      alert("Completá Variant ID o una URL custom.");
      return;
    }
    const row = {
      ...pendingNorm.rect,
      action,
      quantity: Number(panelEl.querySelector("#hepQty").value) || 1,
      label: panelEl.querySelector("#hepLabel").value.trim() || (variantRaw ? `Variant ${variantRaw}` : "Producto"),
    };
    if (variantRaw) row.variantId = variantRaw;
    if (hrefRaw) row.href = hrefRaw;

    const list = getHotspotsForPage(pendingNorm.page);
    list.push(row);
    setHotspotsForPage(pendingNorm.page, list);
    pendingNorm = null;
    hideForm();
    rerenderSpread();
  });

  panelEl.querySelector("#hepCancel").addEventListener("click", () => {
    pendingNorm = null;
    hideForm();
    rerenderSpread();
  });

  return panelEl;
}

function hideForm() {
  const form = panelEl?.querySelector("#hepForm");
  if (form) form.hidden = true;
}

function showForm(pageNum, rect) {
  const form = panelEl?.querySelector("#hepForm");
  if (!form) return;
  form.hidden = false;
  panelEl.querySelector("#hepPageLabel").textContent = `(pág. ${pageNum})`;
  panelEl.querySelector("#hepVariant").value = "";
  panelEl.querySelector("#hepQty").value = "1";
  panelEl.querySelector("#hepLabel").value = "";
  panelEl.querySelector("#hepAction").value = "add";
  panelEl.querySelector("#hepHref").value = "";
  pendingNorm = { page: pageNum, rect };
}

function refreshList(visiblePages) {
  const ul = panelEl?.querySelector("#hepList");
  if (!ul) return;
  ul.innerHTML = "";
  if (!visiblePages.length) {
    const li = document.createElement("li");
    li.className = "hep-list-empty";
    li.textContent = "Cargá un PDF para ver páginas.";
    ul.appendChild(li);
    return;
  }
  for (const p of visiblePages) {
    const rows = getHotspotsForPage(p);
    if (!rows.length) {
      const li = document.createElement("li");
      li.className = "hep-list-empty";
      li.textContent = `p.${p}: sin zonas`;
      ul.appendChild(li);
      continue;
    }
    rows.forEach((row, idx) => {
      const li = document.createElement("li");
      li.className = "hep-list-item";
      const t = document.createElement("span");
      const slotTag = row.slot != null ? `#${row.slot} ` : "";
      t.textContent = `p.${p} · ${slotTag}${row.label || row.variantId || row.href || "sin enlace"}`;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "hep-btn hep-btn--small";
      del.textContent = "✕";
      del.title = "Eliminar";
      del.addEventListener("click", () => {
        const next = getHotspotsForPage(p).filter((_, i) => i !== idx);
        setHotspotsForPage(p, next);
        rerenderSpread();
      });
      li.appendChild(t);
      li.appendChild(del);
      ul.appendChild(li);
    });
  }
}

function bindSurface(surface, pageNum) {
  let drawing = false;
  let sx = 0;
  let sy = 0;
  let band = null;

  const normFromEvent = (ev) => {
    const r = surface.getBoundingClientRect();
    const nx = (ev.clientX - r.left) / r.width;
    const ny = (ev.clientY - r.top) / r.height;
    return { nx: clamp01(nx), ny: clamp01(ny) };
  };

  surface.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    surface.setPointerCapture(ev.pointerId);
    const { nx, ny } = normFromEvent(ev);
    drawing = true;
    sx = nx;
    sy = ny;
    band = document.createElement("div");
    band.className = "hotspot-editor-band";
    surface.appendChild(band);
  });

  surface.addEventListener("pointermove", (ev) => {
    if (!drawing || !band) return;
    const { nx, ny } = normFromEvent(ev);
    const rect = normalizeRect(sx, sy, nx, ny);
    band.style.left = rect.x * 100 + "%";
    band.style.top = rect.y * 100 + "%";
    band.style.width = rect.w * 100 + "%";
    band.style.height = rect.h * 100 + "%";
  });

  const finish = (ev) => {
    if (!drawing) return;
    drawing = false;
    try {
      surface.releasePointerCapture(ev.pointerId);
    } catch (_) {}
    if (!band) return;
    const { nx, ny } = normFromEvent(ev);
    const rect = normalizeRect(sx, sy, nx, ny);
    band.remove();
    band = null;
    if (rect.w < 0.01 || rect.h < 0.01) return;
    showForm(pageNum, rect);
  };

  surface.addEventListener("pointerup", finish);
  surface.addEventListener("pointercancel", finish);
}

export function installHotspotEditor({ rerender }) {
  rerenderSpread = rerender;
  createPanel();

  const params = new URLSearchParams(location.search);
  if (params.get("editor") === "1") editorActive = true;

  const rt = getFlipbookRuntime();
  if (!rt.allowEditor) return;

  const right = document.querySelector("header.toolbar .right");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "editorToggle";
  btn.className = "toolbar-editor-toggle";
  btn.textContent = "Editor zonas";
  btn.title = "Dibujar rectángulos y exportar hotspots.json (añadí ?editor=1 al URL para abrir activado)";
  if (right) right.insertBefore(btn, right.firstChild);

  const sync = () => {
    btn.classList.toggle("is-active", editorActive);
    btn.textContent = editorActive ? "Editor ON" : "Editor zonas";
    if (panelEl) panelEl.hidden = !editorActive;
  };

  btn.addEventListener("click", () => {
    editorActive = !editorActive;
    if (!editorActive) {
      pendingNorm = null;
      hideForm();
    }
    sync();
    rerenderSpread();
  });

  sync();
}

export function isHotspotEditorActive() {
  return editorActive;
}

/** Llamar después de pintar cada spread (main.js). */
export function mountEditorSurfaces(flipbookEl, visiblePageNumbers) {
  flipbookEl?.querySelectorAll(".hotspot-editor-surface, .hotspot-editor-band").forEach((n) => n.remove());
  if (!editorActive || !flipbookEl) return;

  flipbookEl.querySelectorAll(".page-inner").forEach((inner) => {
    const pageNum = Number(inner.dataset.pageNumber);
    if (!pageNum) return;
    inner.querySelectorAll(".hotspot-editor-surface, .hotspot-editor-band").forEach((n) => n.remove());

    const surface = document.createElement("div");
    surface.className = "hotspot-editor-surface";
    inner.appendChild(surface);
    bindSurface(surface, pageNum);
  });

  lastVisiblePages = visiblePageNumbers.slice();
  const pageInput = panelEl?.querySelector("#hepGridPage");
  if (pageInput && lastVisiblePages.length) {
    pageInput.value = String(lastVisiblePages[0]);
  }
  refreshList(visiblePageNumbers);
}
