// Cuts a rectangle out of an image (a data URL) with a canvas, in memory.

import type { Rect } from './crop';

/** Resolves to the cropped image as a PNG data URL. Injectable for tests. */
export type CropImage = (dataUrl: string, rect: Rect) => Promise<string>;

export const cropWithCanvas: CropImage = async (dataUrl, rect) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = rect.width;
  canvas.height = rect.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser can’t draw the cropped image.');
  context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
  return canvas.toDataURL('image/png');
};
