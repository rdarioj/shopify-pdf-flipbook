/**
 * Parcel 2 no copia/sirve public/ en dev. Este middleware expone public/ en la raíz
 * (p. ej. /catalogos/tap-catalogo-secos.pdf, /catalogo-abril.pdf).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(fileURLToPath(new URL(".", import.meta.url)));
const publicDir = path.join(root, "public");

const MIME = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".json": "application/json",
};

export default function proxy(app) {
  app.use((req, res, next) => {
    const rel = decodeURIComponent(String(req.path || req.url || "").split("?")[0]).replace(
      /^\/+/,
      ""
    );
    if (!rel) return next();

    const filePath = path.normalize(path.join(publicDir, rel));
    if (!filePath.startsWith(publicDir)) return next();

    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return next();
    }
    if (!stat.isFile()) return next();

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    res.setHeader("Content-Length", String(stat.size));
    fs.createReadStream(filePath).pipe(res);
  });
}
