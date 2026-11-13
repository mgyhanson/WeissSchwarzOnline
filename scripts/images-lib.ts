/** Checks that card images really decode, shared by the importers. */

import { createHash } from 'node:crypto';
import { crc32, inflateSync } from 'node:zlib';

export const sha256 = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex');
/** File name stem of a card's picture: the card number with "/" replaced by "_" (card-assets/README.md). */
export const fileStem = (cardId: string): string => cardId.replace(/\//g, '_');

/**
 * Checks that a PNG decodes: signature, every chunk's CRC, and the image
 * data inflates to exactly the size its header promises.
 */
export function checkPng(buf: Buffer): { width: number; height: number } {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(signature)) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  let ended = false;
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    const crc = buf.readUInt32BE(offset + 8 + length);
    if (crc32(buf.subarray(offset + 4, offset + 8 + length)) >>> 0 !== crc) throw new Error(`bad CRC in ${type}`);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') {
      ended = true;
      break;
    }
    offset += 12 + length;
  }
  if (!ended || !width || !height || idat.length === 0) throw new Error('incomplete PNG');
  const pixels = inflateSync(Buffer.concat(idat));
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unknown colour type ${colorType}`);
  if (interlace === 0) {
    const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
    if (pixels.length !== height * (1 + rowBytes)) throw new Error('image data has the wrong size');
  }
  return { width, height };
}

/** JPEG: start and end markers and the frame header with the size. */
export function checkJpeg(buf: Buffer): { width: number; height: number } {
  if (buf[0] !== 0xff || buf[1] !== 0xd8 || buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) throw new Error('not a complete JPEG');
  for (let i = 2; i < buf.length - 9; ) {
    if (buf[i] !== 0xff) throw new Error('bad JPEG marker');
    const marker = buf[i + 1]!;
    const length = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + length;
  }
  throw new Error('JPEG without a frame header');
}

export function checkImage(buf: Buffer): { width: number; height: number; format: 'png' | 'jpeg' } {
  if (buf[0] === 0x89) return { ...checkPng(buf), format: 'png' };
  return { ...checkJpeg(buf), format: 'jpeg' };
}

