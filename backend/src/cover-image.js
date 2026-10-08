import jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

// Décoder le contenu réel, limiter la mémoire puis produire une image sans métadonnées originales.
export function convertCover(buffer, mimeType) {
  let image;
  if (mimeType === 'image/jpeg' && buffer[0] === 255 && buffer[1] === 216) {
    image = jpeg.decode(buffer, { maxResolutionInMP: 4, maxMemoryUsageInMB: 64, tolerantDecoding: false });
  } else if (mimeType === 'image/png' && buffer.length >= 33 &&
      buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      buffer.toString('ascii', 12, 16) === 'IHDR') {
    // Lire les dimensions PNG avant toute décompression évite une allocation excessive.
    const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
    if (!width || !height || width * height > 4000000) throw new Error('Dimensions trop grandes');
    image = PNG.sync.read(buffer, { checkCRC: true });
  } else {
    throw new Error('Contenu image invalide');
  }
  // Réduire à 800 pixels en conservant le ratio ; reconstruire les pixels enlève EXIF et commentaires.
  const scale = Math.min(1, 800 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
    const target = (y * width + x) * 4;
    // La transparence PNG est composée sur blanc avant l'encodage JPEG.
    const alpha = image.data[source + 3] / 255;
    for (let c = 0; c < 3; c++) data[target + c] = Math.round(image.data[source + c] * alpha + 255 * (1 - alpha));
    data[target + 3] = 255;
  }
  return jpeg.encode({ data, width, height }, 82).data;
}
