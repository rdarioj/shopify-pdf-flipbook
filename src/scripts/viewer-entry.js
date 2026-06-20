import { resolveCatalogForViewer } from "./catalog-registry.js";

const params = new URLSearchParams(window.location.search);
const catalogId = params.get("catalog");
const isEditor = params.get("editor") === "1";

function showBootError(message) {
  const loading = document.getElementById("catalogLoading");
  if (loading) {
    loading.classList.remove("is-hidden");
    loading.innerHTML = `<div class="catalog-loading__inner"><p>${message}</p><p><a href="./catalogs.html">← Back to catalogs</a></p></div>`;
  }
}

function prepareAuthChrome(requireAuth) {
  const gate = document.getElementById("rc-auth-gate");
  const app = document.getElementById("rc-flipbook-app");
  if (!requireAuth) {
    gate?.classList.add("hidden");
    if (app) app.style.display = "";
    return;
  }
  gate?.classList.remove("hidden");
  if (app) app.style.display = "none";
}

async function boot() {
  if (!catalogId) {
    showBootError("Missing <code>?catalog=</code> in the URL. Pick a catalog from the list.");
    return;
  }

  try {
    const config = resolveCatalogForViewer(catalogId);
    config.requireAuth = isEditor && config.editorRequireAuth;
    window.FLIPBOOK_CONFIG = config;

    document.title = config.catalogTitle || "Catalog";
    if (config.mode === "b2b-whatsapp") {
      document.body.classList.add("is-b2b");
    }

    const footer = document.querySelector("footer.footer small");
    if (footer && config.footerHint) {
      footer.innerHTML = `<span id="pdfName">Catalog</span> · ${config.footerHint}`;
    }

    const back = document.getElementById("backToCatalogs");
    if (back) back.hidden = false;

    window.__flipbookConfigReady = true;
    if (window.rcAuthReinit) {
      window.rcAuthReinit();
    } else {
      prepareAuthChrome(config.requireAuth);
    }
  } catch (err) {
    console.error(err);
    showBootError(err.message || "Could not load the catalog.");
  }
}

boot();
