// Generate PWA icons — pure Node.js, zero dependencies
// Creates simple dark icons with a checkmark
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const ICONS_DIR = path.join(__dirname, 'public', 'icons');

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (~crc) >>> 0;
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function createPNG(width, height, pixels) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT — raw pixel data with filter byte per row
  const rawData = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 3)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const pi = (y * width + x) * 3;
      const ri = y * (1 + width * 3) + 1 + x * 3;
      rawData[ri] = pixels[pi];
      rawData[ri + 1] = pixels[pi + 1];
      rawData[ri + 2] = pixels[pi + 2];
    }
  }
  const compressed = zlib.deflateSync(rawData);

  // IEND
  const iend = Buffer.alloc(0);

  return Buffer.concat([
    sig,
    createChunk('IHDR', ihdr),
    createChunk('IDAT', compressed),
    createChunk('IEND', iend),
  ]);
}

function drawIcon(size, maskable) {
  const pixels = Buffer.alloc(size * size * 3);

  // Background: #030712 (gray-950)
  const bgR = 3, bgG = 7, bgB = 18;
  // Checkmark: #3b82f6 (blue-500)
  const fgR = 59, fgG = 130, fgB = 246;

  // Fill background
  for (let i = 0; i < size * size; i++) {
    pixels[i * 3] = bgR;
    pixels[i * 3 + 1] = bgG;
    pixels[i * 3 + 2] = bgB;
  }

  // Draw a checkmark — scaled to icon size
  // Maskable icons need content within the safe zone (inner 80%)
  const padding = maskable ? Math.floor(size * 0.2) : Math.floor(size * 0.15);
  const inner = size - padding * 2;

  // Checkmark path: short stroke from bottom-left to bottom-center,
  // then long stroke from bottom-center to top-right
  // Using a thick line (proportional to size)
  const thickness = Math.max(Math.floor(inner * 0.1), 2);

  function setPixel(x, y, r, g, b) {
    if (x >= 0 && x < size && y >= 0 && y < size) {
      const idx = (y * size + x) * 3;
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
    }
  }

  function drawThickLine(x0, y0, x1, y1) {
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0, cy = y0;

    while (true) {
      // Draw a filled circle at each point
      const half = Math.floor(thickness / 2);
      for (let oy = -half; oy <= half; oy++) {
        for (let ox = -half; ox <= half; ox++) {
          if (ox * ox + oy * oy <= half * half + half) {
            setPixel(cx + ox, cy + oy, fgR, fgG, fgB);
          }
        }
      }

      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  // Checkmark coordinates (relative to padded area)
  // Short leg: from (0.2, 0.55) to (0.4, 0.75)
  // Long leg: from (0.4, 0.75) to (0.8, 0.25)
  const x0 = padding + Math.floor(inner * 0.2);
  const y0 = padding + Math.floor(inner * 0.55);
  const x1 = padding + Math.floor(inner * 0.4);
  const y1 = padding + Math.floor(inner * 0.75);
  const x2 = padding + Math.floor(inner * 0.8);
  const y2 = padding + Math.floor(inner * 0.25);

  drawThickLine(x0, y0, x1, y1);
  drawThickLine(x1, y1, x2, y2);

  return createPNG(size, size, pixels);
}

// Generate all 4 icons
fs.mkdirSync(ICONS_DIR, { recursive: true });

const variants = [
  { size: 192, maskable: false, name: 'icon-192.png' },
  { size: 512, maskable: false, name: 'icon-512.png' },
  { size: 192, maskable: true, name: 'icon-maskable-192.png' },
  { size: 512, maskable: true, name: 'icon-maskable-512.png' },
];

for (const { size, maskable, name } of variants) {
  const png = drawIcon(size, maskable);
  fs.writeFileSync(path.join(ICONS_DIR, name), png);
  console.log(`  Created ${name} (${size}x${size}${maskable ? ', maskable' : ''})`);
}

console.log('  Done.');
