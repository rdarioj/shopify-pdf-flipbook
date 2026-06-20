import {
  deleteCatalog,
  exportLocalCatalogs,
  getCatalogById,
  importLocalCatalogs,
  listCatalogs,
  resetLocalCatalogs,
  saveCatalog,
  viewerUrl,
} from "./catalog-registry.js";

const listEl = document.getElementById("catalogList");
const dialog = document.getElementById("catalogDialog");
const form = document.getElementById("catalogForm");
const dialogTitle = document.getElementById("dialogTitle");
let editingId = null;

function modeLabel(mode) {
  return mode === "b2b-whatsapp" ? "B2B · WhatsApp" : "Shopify";
}

function renderList() {
  const catalogs = listCatalogs();
  listEl.innerHTML = "";

  if (!catalogs.length) {
    listEl.innerHTML = '<p class="ca-empty">No catalogs yet. Restore the seed or create a new one.</p>';
    return;
  }

  for (const cat of catalogs) {
    const card = document.createElement("article");
    card.className = "ca-card";
    if (cat.frozen) card.classList.add("ca-card--frozen");

    const openUrl = viewerUrl(cat);
    const editorUrl = viewerUrl(cat, { editor: true });

    card.innerHTML = `
      <div class="ca-card__head">
        <h2>${escapeHtml(cat.title)}</h2>
        ${cat.frozen ? '<span class="ca-badge ca-badge--frozen">Frozen · RC</span>' : ""}
        ${cat.editorRequireAuth ? '<span class="ca-badge ca-badge--auth">Editor requires login</span>' : ""}
        <span class="ca-badge">${escapeHtml(modeLabel(cat.mode))}</span>
      </div>
      <dl class="ca-meta">
        <div><dt>ID</dt><dd><code>${escapeHtml(cat.id)}</code></dd></div>
        <div><dt>PDF</dt><dd><code>${escapeHtml(cat.pdfUrl || "—")}</code></dd></div>
        <div><dt>Entry</dt><dd><code>${escapeHtml(cat.entry || "viewer.html")}</code></dd></div>
        <div><dt>Hotspots</dt><dd><code>${escapeHtml(cat.hotspotsFile || "default")}</code></dd></div>
      </dl>
      ${cat.notes ? `<p class="ca-notes">${escapeHtml(cat.notes)}</p>` : ""}
      <div class="ca-card__actions">
        <a class="ca-btn ca-btn--primary" href="${openUrl}">Open</a>
        <a class="ca-btn" href="${editorUrl}">Editor</a>
        <button type="button" class="ca-btn" data-edit="${escapeHtml(cat.id)}">Edit</button>
        ${cat.frozen ? "" : `<button type="button" class="ca-btn ca-btn--danger" data-del="${escapeHtml(cat.id)}">Delete</button>`}
      </div>`;

    listEl.appendChild(card);
  }

  listEl.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openEdit(btn.dataset.edit));
  });
  listEl.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => onDelete(btn.dataset.del));
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openNew() {
  editingId = null;
  dialogTitle.textContent = "New catalog";
  form.reset();
  form.id.disabled = false;
  form.mode.value = "b2b-whatsapp";
  form.hotspotsFile.value = "default";
  dialog.showModal();
}

function openEdit(id) {
  const cat = getCatalogById(id);
  if (!cat) return;
  editingId = id;
  dialogTitle.textContent = cat.frozen ? "Edit (local overrides only)" : "Edit catalog";
  form.id.value = cat.id;
  form.id.disabled = true;
  form.title.value = cat.title || "";
  form.pdfUrl.value = cat.pdfUrl || "";
  form.mode.value = cat.mode || "shopify";
  form.hotspotsFile.value = cat.hotspotsFile || "default";
  form.storeOrigin.value = cat.storeOrigin || "";
  form.whatsappPhone.value = cat.whatsappPhone || "";
  form.whatsappBusinessName.value = cat.whatsappBusinessName || "";
  form.whatsappIntro.value = cat.whatsappIntro || "";
  form.footerHint.value = cat.footerHint || "";
  form.notes.value = cat.notes || "";
  dialog.showModal();
}

function onDelete(id) {
  if (!confirm(`Delete catalog "${id}"? (local only)`)) return;
  try {
    deleteCatalog(id);
    renderList();
  } catch (err) {
    alert(err.message);
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const row = {
    id: String(fd.get("id") || "").trim(),
    title: String(fd.get("title") || "").trim(),
    pdfUrl: String(fd.get("pdfUrl") || "").trim(),
    mode: fd.get("mode"),
    hotspotsFile: fd.get("hotspotsFile"),
    storeOrigin: String(fd.get("storeOrigin") || "").trim(),
    whatsappPhone: String(fd.get("whatsappPhone") || "").trim(),
    whatsappBusinessName: String(fd.get("whatsappBusinessName") || "").trim(),
    whatsappIntro: String(fd.get("whatsappIntro") || "").trim(),
    footerHint: String(fd.get("footerHint") || "").trim(),
    notes: String(fd.get("notes") || "").trim(),
    entry: "viewer.html",
    publishMode: true,
  };

  try {
    saveCatalog(row);
    dialog.close();
    renderList();
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById("btnCancel")?.addEventListener("click", () => dialog.close());
document.getElementById("btnNew")?.addEventListener("click", openNew);

document.getElementById("btnExport")?.addEventListener("click", () => {
  const blob = new Blob([exportLocalCatalogs()], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "flipbook-catalogs-local.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

document.getElementById("importFile")?.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importLocalCatalogs(String(reader.result));
      renderList();
      alert("Imported to localStorage.");
    } catch (err) {
      alert("Import error: " + err.message);
    }
    e.target.value = "";
  };
  reader.readAsText(f, "UTF-8");
});

document.getElementById("btnReset")?.addEventListener("click", () => {
  if (!confirm("Clear local overrides and restore seed (catalogs.json)?")) return;
  resetLocalCatalogs();
  renderList();
});

renderList();
