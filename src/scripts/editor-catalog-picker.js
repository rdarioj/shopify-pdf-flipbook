const STORAGE_KEY = "rc_editor_catalog_v1";

export function resolveInitialEditorCatalog(library, defaultPdfUrl) {
  if (!library?.length) return null;
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const hit = library.find((e) => e.id === saved);
      if (hit) return hit;
    }
  } catch (_) {
    /* ignore */
  }
  if (defaultPdfUrl) {
    const match = library.find((e) => e.pdfUrl === defaultPdfUrl);
    if (match) return match;
  }
  return library[0];
}

export function installEditorCatalogPicker({ library, initialId, onSelect }) {
  if (!library?.length || !onSelect) return;

  const center = document.querySelector("header.toolbar .center");
  if (!center || document.getElementById("editorCatalogPicker")) return;

  const wrap = document.createElement("div");
  wrap.className = "toolbar-catalog-picker";
  wrap.id = "editorCatalogPicker";

  const lab = document.createElement("label");
  lab.className = "toolbar-catalog-picker__label";
  lab.htmlFor = "editorCatalogSelect";
  lab.textContent = "Catalog";

  const sel = document.createElement("select");
  sel.id = "editorCatalogSelect";
  sel.className = "toolbar-catalog-picker__select";
  sel.title = "Elegir PDF en el editor (no cambia el catálogo de producción)";

  library.forEach((entry) => {
    const opt = document.createElement("option");
    opt.value = entry.id;
    opt.textContent = entry.label;
    sel.appendChild(opt);
  });

  if (initialId) sel.value = initialId;

  wrap.appendChild(lab);
  wrap.appendChild(sel);
  center.insertBefore(wrap, center.firstChild);

  let busy = false;
  sel.addEventListener("change", async () => {
    if (busy) return;
    const entry = library.find((e) => e.id === sel.value);
    if (!entry) return;
    busy = true;
    sel.disabled = true;
    try {
      sessionStorage.setItem(STORAGE_KEY, entry.id);
      await onSelect(entry);
    } finally {
      sel.disabled = false;
      busy = false;
    }
  });
}
