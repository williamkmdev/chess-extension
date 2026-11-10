// Runs the board locator on a screenshot (a data URL), in memory: the whole image, or
// only the part the user selected. The result is in the screenshot's own pixels.

import { locateBoard, type LocateResult } from '../../vision/locate';
import { toScreenshotRect, type Rect } from './crop';

/** Locates the board in `region` (or the whole image). Injectable for tests. */
export type FindBoard = (dataUrl: string, region?: Rect) => Promise<LocateResult>;

export const findBoardWithCanvas: FindBoard = async (dataUrl, region) => {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const area = region ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
  const canvas = document.createElement('canvas');
  canvas.width = area.width;
  canvas.height = area.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser can’t read the screenshot’s pixels.');
  context.drawImage(image, area.x, area.y, area.width, area.height, 0, 0, area.width, area.height);
  const result = locateBoard(context.getImageData(0, 0, area.width, area.height));
  return result.ok ? { ...result, rect: toScreenshotRect(result.rect, region) } : result;
};
