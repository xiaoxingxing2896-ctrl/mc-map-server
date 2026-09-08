import { deflateSync } from 'node:zlib';
export function png(color = 0, invalidPixels = false) {
  function chunk(type, data) {
    const out = Buffer.alloc(data.length + 12); out.writeUInt32BE(data.length); out.write(type, 4); data.copy(out, 8);
    let crc = 0xffffffff;
    for (const value of out.subarray(4, -4)) { crc ^= value; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(1024); header.writeUInt32BE(1024, 4); header[8] = 8; header[9] = 0;
  const pixels = Buffer.alloc(1025 * 1024, color); for (let row = 0; row < 1024; row++) pixels[row * 1025] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', invalidPixels ? deflateSync(Buffer.alloc(1)) : deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
