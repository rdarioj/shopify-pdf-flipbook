import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

// Reemplaza esto con tu URL de GitHub Pages
const flipbookUrl = 'https://tu-usuario.github.io/shopify-flipbook-catalog';

const outputPath = path.join(process.cwd(), 'public', 'flipbook-qr.png');

// Asegúrate de que la carpeta public existe
if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
  fs.mkdirSync(path.join(process.cwd(), 'public'), { recursive: true });
}

QRCode.toFile(outputPath, flipbookUrl, {
  color: {
    dark: '#000000',
    light: '#FFFFFF'
  },
  width: 300,
  margin: 2,
  type: 'image/png',
  quality: 0.95
}, (err) => {
  if (err) {
    console.error('❌ Error generando QR:', err);
  } else {
    console.log(`✅ QR Code generado correctamente en: ${outputPath}`);
    console.log(`📱 URL del flipbook: ${flipbookUrl}`);
  }
});