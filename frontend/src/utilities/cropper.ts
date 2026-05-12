import type { CropArea } from 'types/components';

export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });

export async function getCroppedFile(
  imageSrc: string,
  crop: CropArea,
  outputWidth: number,
  outputHeight: number,
  fileName: string = 'image.png',
  mimeType: string = 'image/png',
  quality: number = 0.92,
): Promise<File> {
  const image = await createImage(imageSrc);

  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context is not available');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, outputWidth, outputHeight);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, quality));

  if (!blob) throw new Error('Failed to create blob');

  return new File([blob], fileName, {
    type: mimeType,
    lastModified: Date.now(),
  });
}
