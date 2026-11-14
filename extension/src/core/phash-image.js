// pHash a partir de uma imagem (Blob), no navegador: reduz para 32×32 com
// createImageBitmap e lê os pixels num OffscreenCanvas. Serve ao service worker
// e ao painel. A redução não é idêntica à do Pillow: medido, difere em mediana
// 2 bits do Python na mesma miniatura.
import { grayFromRgba, phashFromGray } from './phash.js';

let ctx = null;

export async function phashFromBlob(blob) {
  ctx ??= new OffscreenCanvas(32, 32).getContext('2d', { willReadFrequently: true });
  const bmp = await createImageBitmap(blob, { resizeWidth: 32, resizeHeight: 32, resizeQuality: 'high' });
  ctx.clearRect(0, 0, 32, 32);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  return phashFromGray(grayFromRgba(ctx.getImageData(0, 0, 32, 32).data));
}

export function phashFromBase64(b64) {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return phashFromBlob(new Blob([bytes]));
}
