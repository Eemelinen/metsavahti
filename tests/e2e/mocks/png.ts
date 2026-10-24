import { crc32, deflateSync } from 'node:zlib'

type Rgba = [number, number, number, number]

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * A `size`×`size` RGBA PNG whose pixel colour is `pixel(x, y)`; enough for the e2e map tiles
 * without an image library.
 */
export function png(size: number, pixel: (x: number, y: number) => Rgba): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8 bits per channel, RGBA, deflate, no filter, no interlace
  const rows = Buffer.alloc(size * (1 + size * 4))
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4)
    for (let x = 0; x < size; x++) rows.set(pixel(x, y), row + 1 + x * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
