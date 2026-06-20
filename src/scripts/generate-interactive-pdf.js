import PDFDocument from 'pdfkit';
import fs from 'fs';
import PDFParser from 'pdf-parse';

const SHOPIFY_CONFIG = {
  store: 'racketcentral.com',
  products: [
    { name: 'NOX Equation Light 2025', handle: 'nox-padel-racket-equation-light-2025', variantId: '48793685197077' },
    { name: 'NOX AT10 Genius 18K', handle: 'nox-padel-racket-at10-genius-18k-25', variantId: '48659252019477' }
  ]
};

/**
 * Generate interactive PDF with clickeable hotspots over products
 * Each hotspot links to: https://store/cart/VARIANT:1?checkout
 */
async function generateInteractivePdf(inputPath, outputPath) {
  try {
    const pdfBuffer = fs.readFileSync(inputPath);
    const pdfData = await PDFParser(pdfBuffer);
    
    const doc = new PDFDocument({ bufferPages: true });
    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    doc.fontSize(16).text('Interactive Product Catalog', 100, 50);
    doc.fontSize(12).text('Click on product areas below to add to cart:', 100, 100);

    const textContent = pdfData.text;

    SHOPIFY_CONFIG.products.forEach((prod, idx) => {
      const regex = new RegExp(prod.name, 'i');
      const match = textContent.match(regex);
      
      if (match) {
        const yPos = 150 + idx * 60;
        doc.fontSize(11).text(`${idx + 1}. ${prod.name}`, 100, yPos);
        
        // Add clickable link
        const linkUrl = `https://${SHOPIFY_CONFIG.store}/cart/${prod.variantId}:1?checkout`;
        doc.link(100, yPos + 15, 300, 20, linkUrl);
        doc.fontSize(10).fillColor('blue').text('👉 Add to cart / Buy now', 100, yPos + 15);
        doc.fillColor('black');
      }
    });

    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => {
        console.log(`✅ Interactive PDF generated: ${outputPath}`);
        resolve(outputPath);
      });
      writeStream.on('error', reject);
    });
  } catch (err) {
    console.error('❌ Error generating PDF:', err);
    throw err;
  }
}

// Usage
const inputPdf = './public/shopify-coupon-validator/catalogo.pdf';
const outputPdf = './public/shopify-coupon-validator/catalogo-interactive.pdf';

generateInteractivePdf(inputPdf, outputPdf).catch(console.error);