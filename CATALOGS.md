# Catálogos múltiples — sin tocar Racket Central

## Regla de oro

| Entrada | Uso | Producción RC |
|---------|-----|----------------|
| **`index.html`** | Racket Central congelado | **Sí** — `npm run build` solo empaqueta esto |
| **`viewer.html?catalog=…`** | TAP y futuros clientes | No (hasta que decidas deploy aparte) |
| **`catalogs.html`** | Selector + ABM local | No |

**`index.html` no se modificó.** Mañana en RC: `npm run dev` → igual que Vercel actual.

---

## Desarrollo local

```powershell
cd shopify-pdf-flipbook

# Racket Central (congelado — mañana acá)
npm run dev

# Listado / ABM de catálogos
npm run dev:catalogs

# Visor multi-catálogo (abrí con ?catalog=tap-secos en el browser)
npm run dev:viewer
# → http://localhost:1234/viewer.html?catalog=tap-secos

# Atajo TAP (redirige a viewer)
npm run dev:tap
```

---

## Archivos nuevos

| Archivo | Rol |
|---------|-----|
| `src/config/catalogs.json` | Seed: RC + TAP |
| `src/catalogs.html` | Pantalla selector + ABM |
| `src/viewer.html` | Visor unificado `?catalog=id` |
| `src/scripts/catalog-registry.js` | Merge seed + localStorage |
| `src/scripts/catalogs-admin.js` | UI del ABM |
| `src/scripts/viewer-entry.js` | Bootstrap config → `main.js` |
| `src/tap-demo.html` | Redirige a `viewer.html?catalog=tap-secos` |

Hotspots siguen en:
- `hotspots.json` → RC (`hotspotsFile: "default"`)
- `hotspots-tap.json` → TAP (`hotspotsFile: "tap"`)

---

## ABM (localStorage)

En `catalogs.html` podés:

- **Abrir** / **Editor** por catálogo
- **+ Nuevo catálogo** (custom, guardado en localStorage)
- **Editar** — RC solo permite overrides locales (badge “Congelado”)
- **Eliminar** — solo custom (no RC)
- **Exportar local** / **Importar** / **Restaurar seed**

Clave localStorage: `flipbook-catalogs-v1`

Para persistir en repo más adelante: editá `catalogs.json` y commiteá.

---

## Rollback a “foja cero” RC

Si algo falla:

1. **Producción:** no deployes — Vercel sigue con el último `index.html` build.
2. **Local RC:** `npm run dev` abre solo `index.html` (sin catalogs/viewer).
3. **Borrar experimentos locales:** en `catalogs.html` → **Restaurar seed**, o en consola:
   ```js
   localStorage.removeItem('flipbook-catalogs-v1')
   ```
4. **Git:** los archivos nuevos no afectan `index.html`; revertí solo lo que quieras.

---

## Builds (cuando quieras deployar — no ahora)

| Comando | Salida | Qué publica |
|---------|--------|-------------|
| `npm run build` | `dist/` | **Solo RC** (igual que hoy) |
| `npm run build:tap` | `dist-tap/` | `viewer.html` + assets |
| `npm run build:catalogs` | `dist-all/` | `catalogs.html` + `viewer.html` |

**No corras build/deploy hasta validar RC mañana.**

---

## URLs útiles en local

- RC: `http://localhost:1234/` (index)
- RC editor: `http://localhost:1234/?editor=1`
- ABM: `http://localhost:1234/catalogs.html` (puerto según Parcel)
- TAP: `http://localhost:1234/viewer.html?catalog=tap-secos`
- TAP editor: `http://localhost:1234/viewer.html?catalog=tap-secos&editor=1`
