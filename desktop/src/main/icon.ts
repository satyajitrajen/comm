import { app, nativeImage, NativeImage } from 'electron';
import fs from 'fs';
import path from 'path';

/** resources/icon.png — shipped via extraResources when packaged. */
function iconPath(): string | null {
  const candidates = app.isPackaged
    ? [path.join(process.resourcesPath, 'icon.png')]
    : [path.join(__dirname, '../../resources/icon.png')];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function appIcon(size?: number): NativeImage {
  const p = iconPath();
  if (!p) return nativeImage.createEmpty();
  const image = nativeImage.createFromPath(p);
  return size ? image.resize({ width: size, height: size }) : image;
}

/**
 * Small red dot drawn in memory for the Windows taskbar overlay, so unread
 * state is visible without shipping another asset.
 */
export function unreadOverlay(): NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside = (x - c) ** 2 + (y - c) ** 2 <= (c - 0.5) ** 2;
      const i = (y * size + x) * 4;
      // BGRA
      buf[i] = inside ? 0x44 : 0;
      buf[i + 1] = inside ? 0x44 : 0;
      buf[i + 2] = inside ? 0xef : 0;
      buf[i + 3] = inside ? 0xff : 0;
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}
