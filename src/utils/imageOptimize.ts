/**
 * Client-side image optimization for Media Library uploads.
 *
 * Large PNG/JPEGs (painted backgrounds, panel art, logos) re-encode to WebP
 * at upload time — typically 25-50% smaller. Deliberately NOT touched:
 * - small files: pixel-art sprites are tiny and lossy WebP frays their hard
 *   edges — never worth it
 * - GIFs: re-encoding would strip the animation
 * - WebP/AVIF/SVG: already modern
 * The conversion also only sticks when it genuinely pays for itself — if the
 * WebP comes out less than 10% smaller, the original uploads unchanged.
 */

const CONVERT_THRESHOLD_BYTES = 150 * 1024;
const WEBP_QUALITY = 0.85;

export async function optimizeImageForUpload(file: File): Promise<File> {
  if (file.size < CONVERT_THRESHOLD_BYTES) return file;
  if (file.type !== 'image/png' && file.type !== 'image/jpeg') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const webpBlob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY)
    );
    if (!webpBlob || webpBlob.size >= file.size * 0.9) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return new File([webpBlob], newName, { type: 'image/webp' });
  } catch {
    return file; // decode/encode failed — upload the original untouched
  }
}
