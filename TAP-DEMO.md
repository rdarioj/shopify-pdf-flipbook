# Demo TAP Distribuciones — carrito → WhatsApp

Ver también **[CATALOGS.md](./CATALOGS.md)** (selector multi-catálogo; RC congelado en `index.html`).

## Probar en local

```powershell
cd shopify-pdf-flipbook
npm install
npm run dev:catalogs
```

Desde el listado → **TAP** → **Abrir**. O directo (con `npm run dev:catalogs` corriendo):

`http://localhost:1234/viewer.html?catalog=tap-secos`

**Importante:** `dev:catalogs` levanta `catalogs.html`, `viewer.html` e `index.html` a la vez. Si solo abrís una entrada, los links a `viewer.html` muestran el listado otra vez.

### Flujo de prueba

1. Andá a **pág. 26** (aceitunas) o **27** (salsas) o **29** (rocíos).
2. Tocá un producto → ingresá cantidad → **Agregar**.
3. Barra inferior: **Ver pedido** → **Enviar pedido por WhatsApp**.
4. Verificá que el mensaje tenga nombre + COD + presentación + cantidad.

### Ajustar zonas clicables

Abrí con editor: `http://localhost:1234/?editor=1`

- Dibujá rectángulos sobre productos.
- Acción: **cart → pedido WhatsApp**.
- Exportá JSON → reemplazá `src/config/hotspots-tap.json`.

Hotspots demo precargados en páginas **26, 27, 29** (coords aproximadas; refiná con el editor).

## Número de WhatsApp TAP

En `src/tap-demo.html`, completá:

```js
whatsappPhone: "5493XXXXXXXXX",  // sin + ni espacios
```

Si queda vacío, WhatsApp abre para elegir contacto (sirve para demo en desktop).

## Deploy (Vercel u otro)

```powershell
npm run build:tap
```

Salida en `dist-tap/` (incluye PDF en `catalogos/` vía `public/`).

Subí `dist-tap` como sitio estático o proyecto Vercel apuntando a `dist-tap`.

## Mensaje que recibe el mayorista (ejemplo)

```
Hola TAP, quiero pedir:

Aceitunas Verdes Rellenas c/Morrón
COD. 10.805 - 80/150gr
Cant: 450

Salsa Golf Natura
COD. 8.50100002 - Display X20U X125CC
Cant: 2

Gracias.
```

## Pitch al mandar la demo

> Armamos una prueba con su catálogo secos: el comercio mira el PDF en el celular, toca productos, arma el pedido y se lo manda por WhatsApp con los códigos — igual que la listita que ya les escriben, pero sin tipear a mano.
