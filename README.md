# Flipbook PDF + zonas activas → carrito (Shopify)

Herramienta local: subís un **PDF** y el visor usa **[StPageFlip](https://nodlik.github.io/StPageFlip/)** (`page-flip` en npm) para el **efecto de pasar página** en 3D (portada dura + spreads), con **zonas clicables** al **carrito** Shopify (permalink o Ajax).

No es un clon píxel a píxel de Heyzine (hosting y UI propios); es una alternativa **tuya**, integrable en tu dominio o en una página del theme.

## Cómo usar

```bash
cd shopify-pdf-flipbook
npm install
npm run dev
```

Abrí el URL que muestra Parcel, cargá un PDF y navegá con **⟵ ⟶**, fleclas del teclado o miniaturas. **Ctrl + rueda** (o Alt + rueda) hace zoom.

## Editor visual de zonas (tipo Heyzine, básico)

1. Tocá **«Editor zonas»** en la barra superior (o abrí la app con **`?editor=1`** en el URL para que arranque ya activado).
2. Cargá el PDF. Sobre cada página podés **arrastrar** un rectángulo: se abre el formulario en el panel derecho.
3. Completá **Variant ID** (o solo **URL custom**), cantidad, etiqueta y acción → **Guardar zona**.
4. **Exportar JSON** descarga `hotspots.json`. Copialo a `src/config/hotspots.json` antes de `npm run build` si querés que quede fijo en el bundle de producción.
5. **Importar JSON** carga un archivo previo. **Reset plantilla** vuelve al JSON que venía en el repo.

Con el editor encendido las zonas existentes se ven sombreadas y **no** disparan el carrito (para no interferir al dibujar). Apagá el editor para probar clics reales.

## Configuración Shopify (`src/index.html`)

Editá el bloque `window.FLIPBOOK_CONFIG`:

| Campo | Descripción |
|--------|-------------|
| `storeOrigin` | Origen HTTPS de la tienda, ej. `https://racketcentral.com` |
| `addMode` | `"permalink"` (por defecto): abre `https://tu-tienda.com/cart/VARIANT_ID:qty`. `"ajax"`: POST a `/cart/add.js` (solo si esta app se sirve **en el mismo dominio** que la tienda). |
| `navigate` | `"same"` redirige en la misma pestaña (flujo natural hacia el carrito). `"tab"` abre en pestaña nueva. |
| `hotspotDebug` | `true` pinta las zonas activas para alinear coordenadas. |
| `showDetectedProducts` | `true` muestra el panel opcional de productos detectados por texto en el PDF. |

## Catálogo abril (V3) — zonas por página automáticas

Analizamos `V3_CATALOGO_ABRIL_COMPRIMIDO.pdf` y generamos coords **por página** (cada una con su cantidad de productos):

| Pág. | Productos | Tipo |
|------|-----------|------|
| 1 | 0 | Portada (sin zonas) |
| 2, 3, 6, 7, 9 | 8 | 2+2+4 |
| 4, 8 | 10 | Rejilla densa |
| 5, 11 | 9 | Rejilla 9 |
| 10 | 12 | Rejilla 12 |

Archivos:

- `src/config/catalog-page-layouts.json` — coords detectadas por página
- `src/config/hotspots.json` — zonas listas (sin enlaces; agregá variant/href)

**En el editor:** **Catálogo abril (11 pág.)** carga todas las zonas de una vez. Luego **Importar CSV** con `page,slot,variant_id,href,label`.

Re-analizar otro PDF:

```bash
pip install pymupdf
python scripts/analyze-catalog-pdf.py "ruta/al/catalogo.pdf"
node scripts/generate-hotspots-from-catalog.mjs
```

## 8 productos por página (rejilla + CSV de enlaces)

Para páginas tipo catálogo NOX (2 filas grandes + 4 chicas):

1. **Editor zonas** → sección **«Rejilla masiva»** → número de **página** (ej. 2) → **Generar 8 zonas**.
2. Con `hotspotDebug: true` en `FLIPBOOK_CONFIG` revisá que los rectángulos coincidan; si no, ajustá `src/config/grid-presets.json` (coords 0–1).
3. **CSV solo enlaces** descarga una plantilla; completá `variant_id` y/o `href` (PDP o permalink de carrito).
4. **Importar CSV** con cabecera `page,slot,preset,variant_id,href,label` — se fusiona con las zonas ya generadas.

Ejemplo de fila (carrito por variant):

```csv
page,slot,preset,variant_id,href,label,action,quantity
2,1,catalog-8,48793685197077,,NOX AT10 Genius,add,1
```

Ejemplo (PDP):

```csv
2,2,catalog-8,,https://racketcentral.com/products/nox-at10-genius,NOX AT10,add,1
```

Plantilla de ejemplo en `src/config/hotspots-links-template.csv`.

## Zonas activas (`src/config/hotspots.json`)

Claves: número de **página** (1-based). Cada entrada:

- `x`, `y`, `w`, `h`: fracción del ancho/alto del **canvas** de esa página (0–1).
- `action`: `"add"` o `"buy"` (hoy ambos van al carrito con esa variante; podés extender).
- `variantId`: ID numérico de variante Shopify.
- `quantity`: opcional, default 1.
- `label`: tooltip / accesibilidad.
- `href`: opcional; si está definido, se usa esa URL tal cual (podés armar un permalink compuesto o query UTM).

Documentación de permalinks de carrito: [Checkout permalinks](https://help.shopify.com/en/manual/checkout-settings/permalinks).

## Build estático

```bash
npm run build
```

Salida en `dist/` — subible a Shopify **Files**, Vercel, Netlify, o embebido en una `page` del theme con `<iframe>`.

## Límites honestos

- **Paridad Heyzine**: sin WebGL propietario; hay sombras, doble página y animación ligera al cambiar spread, no curvatura 3D de papel.
- **CORS**: desde `localhost` o otro dominio, **`addMode: "permalink"`** es lo fiable; Ajax solo same-site.
- **Hotspots** no se infieren del PDF: hay que **mapear** coordenadas (con `hotspotDebug: true` es más fácil).

© Uso interno Racket Central / plantilla base.
