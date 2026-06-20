import SHOPIFY_CONFIG from "../config/shopify-config.js";

export function getFlipbookRuntime() {
  const g = typeof window !== "undefined" && window.FLIPBOOK_CONFIG ? window.FLIPBOOK_CONFIG : {};
  const raw = g.storeOrigin || (SHOPIFY_CONFIG.store?.startsWith("http") ? SHOPIFY_CONFIG.store : `https://${SHOPIFY_CONFIG.store}`);
  const storeOrigin = String(raw).replace(/\/$/, "");
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const editorFromUrl = params.get("editor") === "1";
  const defaultPdfUrl = g.defaultPdfUrl ? String(g.defaultPdfUrl) : "";
  const publishMode =
    Boolean(defaultPdfUrl) && g.publishMode !== false && !editorFromUrl;

  const mode = g.mode === "b2b-whatsapp" ? "b2b-whatsapp" : "shopify";
  const editorPdfLibrary = Array.isArray(g.editorPdfLibrary)
    ? g.editorPdfLibrary.map((entry) => ({
        id: String(entry.id || ""),
        label: String(entry.label || entry.id || "Catalog"),
        pdfUrl: String(entry.pdfUrl || ""),
        hotspotsFile: entry.hotspotsFile ? String(entry.hotspotsFile) : "default",
        catalogTitle: entry.catalogTitle ? String(entry.catalogTitle) : "",
      })).filter((e) => e.id && e.pdfUrl)
    : [];

  return {
    storeOrigin,
    mode,
    addMode: g.addMode === "ajax" ? "ajax" : "permalink",
    showDetectedProducts: Boolean(g.showDetectedProducts),
    hotspotDebug: Boolean(g.hotspotDebug),
    navigate: g.navigate === "tab" ? "tab" : "same",
    publishMode,
    allowEditor: editorFromUrl || g.allowEditor === true,
    defaultPdfUrl,
    catalogTitle: g.catalogTitle ? String(g.catalogTitle) : "Interactive Catalog",
    catalogId: g.catalogId ? String(g.catalogId) : "",
    hotspotsFile: g.hotspotsFile ? String(g.hotspotsFile) : "default",
    whatsappPhone: g.whatsappPhone ? String(g.whatsappPhone) : "",
    whatsappBusinessName: g.whatsappBusinessName ? String(g.whatsappBusinessName) : "",
    whatsappIntro: g.whatsappIntro ? String(g.whatsappIntro) : "",
    editorPdfLibrary,
    editorRequireAuth: g.editorRequireAuth === true,
    requireAuth: editorFromUrl && g.editorRequireAuth === true,
    organization: g.organization ? String(g.organization) : "",
    singlePage: g.singlePage === true,
  };
}
