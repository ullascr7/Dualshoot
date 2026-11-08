import fs from 'fs';
import zlib from 'zlib';

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcInput);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function generateDualShotPng(size: number, isMaskable: boolean = false): Buffer {
  // 32-bit RGBA raw image buffer: width * height * 4
  const raw = Buffer.alloc((size * 4 + 1) * size); // each scanline has 1 filter byte prefix (0)

  const center = size / 2;
  const radius = size * (isMaskable ? 0.38 : 0.46);

  for (let y = 0; y < size; y++) {
    const rowOffset = y * (size * 4 + 1);
    raw[rowOffset] = 0; // Filter: None

    for (let x = 0; x < size; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background
      let r = 15;
      let g = 23;
      let b = 42; // #0f172a
      let a = 255;

      // Subtle gradient on background
      const grad = (y / size) * 20;
      r = Math.min(255, r + grad);
      g = Math.min(255, g + grad);
      b = Math.min(255, b + grad);

      // Outer camera ring
      if (dist >= radius - 8 && dist <= radius) {
        // Gold/Amber gradient on top, cyan on bottom
        const angle = Math.atan2(dy, dx);
        if (angle < 0) {
          // Amber/Gold
          r = 234; g = 179; b = 8;
        } else {
          // Cyan
          r = 59; g = 130; b = 246;
        }
      } else if (dist < radius - 8 && dist >= radius * 0.72) {
        // Inner lens metallic barrel
        r = 30; g = 41; b = 59;
      } else if (dist < radius * 0.72 && dist >= radius * 0.4) {
        // Lens optical glass
        const glassGrad = 1 - (dist / (radius * 0.72));
        r = Math.round(15 + glassGrad * 40);
        g = Math.round(23 + glassGrad * 60);
        b = Math.round(42 + glassGrad * 120);
      } else if (dist < radius * 0.4 && dist >= radius * 0.32) {
        // Aperture inner ring
        r = 239; g = 68; b = 68; // Red shutter border
      } else if (dist < radius * 0.32) {
        // Center record button
        r = 220; g = 38; b = 38; // Red shutter
      }

      // Dual aspect overlay indicators:
      // Vertical rectangle guide (9:16)
      const vHalfW = size * 0.12;
      const vHalfH = size * 0.22;
      const inVBorder =
        Math.abs(dx) <= vHalfW && Math.abs(dy) <= vHalfH &&
        (Math.abs(dx) >= vHalfW - 2 || Math.abs(dy) >= vHalfH - 2);

      // Horizontal rectangle guide (16:9)
      const hHalfW = size * 0.24;
      const hHalfH = size * 0.135;
      const inHBorder =
        Math.abs(dx) <= hHalfW && Math.abs(dy) <= hHalfH &&
        (Math.abs(dx) >= hHalfW - 2 || Math.abs(dy) >= hHalfH - 2);

      if (inVBorder) {
        r = 234; g = 179; b = 8; // Gold guide for 9:16
      } else if (inHBorder) {
        r = 96; g = 165; b = 250; // Blue guide for 16:9
      }

      raw[pxOffset] = Math.min(255, Math.max(0, Math.round(r)));
      raw[pxOffset + 1] = Math.min(255, Math.max(0, Math.round(g)));
      raw[pxOffset + 2] = Math.min(255, Math.max(0, Math.round(b)));
      raw[pxOffset + 3] = a;
    }
  }

  // PNG Header
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: 6 (RGBA)
  ihdrData[10] = 0; // Compression: 0
  ihdrData[11] = 0; // Filter: 0
  ihdrData[12] = 0; // Interlace: 0
  const ihdr = makeChunk('IHDR', ihdrData);

  // IDAT Chunk
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = makeChunk('IDAT', compressed);

  // IEND Chunk
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdr, idat, iend]);
}

// Generate all icons
fs.writeFileSync('public/pwa-192x192.png', generateDualShotPng(192, false));
fs.writeFileSync('public/pwa-512x512.png', generateDualShotPng(512, false));
fs.writeFileSync('public/pwa-maskable-512x512.png', generateDualShotPng(512, true));
fs.writeFileSync('public/apple-touch-icon.png', generateDualShotPng(180, false));
console.log('Successfully generated all PWA icons!');
