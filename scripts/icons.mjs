import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = join(root, 'extension', 'icons');
const sizes = [16, 32, 48, 128];

mkdirSync(iconDir, { recursive: true });

for (const size of sizes) {
  const out = join(iconDir, `icon-${size}.png`);
  writeFileSync(out, renderIcon(size));
  console.log(`wrote ${out}`);
}

function renderIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 128;
      const ny = ((y + 0.5) / size) * 128;
      const color = pixel(nx, ny);
      rgba.set(color, (y * size + x) * 4);
    }
  }
  return png(size, size, rgba);
}

function pixel(x, y) {
  let color = [248, 250, 253, 255];
  if (roundedRect(x, y, 0, 0, 128, 128, 24)) color = [248, 250, 253, 255];
  const outer = Math.abs(y - 64) <= 33 * (1 - Math.abs(x - 64) / 58);
  if (outer) color = [26, 115, 232, 255];
  const inner = Math.abs(y - 64) <= 21 * (1 - Math.abs(x - 64) / 36);
  if (inner) color = [255, 255, 255, 255];
  if (circle(x, y, 64, 64, 20)) color = [23, 78, 166, 255];
  if (circle(x, y, 64, 64, 9)) color = [11, 16, 32, 255];
  if (circle(x, y, 56, 56, 5)) color = [255, 255, 255, 255];
  return color;
}

function circle(x, y, cx, cy, r) {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function roundedRect(x, y, rx, ry, w, h, r) {
  const cx = Math.max(rx + r, Math.min(x, rx + w - r));
  const cy = Math.max(ry + r, Math.min(y, ry + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2 || (x >= rx + r && x <= rx + w - r && y >= ry && y <= ry + h) || (y >= ry + r && y <= ry + h - r && x >= rx && x <= rx + w);
}

function png(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', Buffer.concat([u32(width), u32(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk('IDAT', deflateSync(scanlines)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  return Buffer.concat([u32(data.length), typeBuffer, data, u32(crc32(Buffer.concat([typeBuffer, data])))]);
}

function u32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
