import { closeSync, openSync, readSync } from "node:fs";

export type ImageKind = "png" | "jpg" | "webp" | "gif";

/**
 * 看开头的几个字节，判断这到底是不是图片、是哪种图片。
 * ico 是网站图标常用的格式，只有「网址」的 logo 接受它。
 */
export function sniffBytes(buf: Uint8Array): ImageKind | "ico" | null {
  const b = Buffer.from(buf.buffer, buf.byteOffset, Math.min(buf.byteLength, 12));
  if (b.length < 12) return null;
  if (b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png";
  if (b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (b.toString("latin1", 0, 4) === "GIF8") return "gif";
  // ico：00 00 01 00，后面两个字节是里面装了几张图（至少一张）
  if (b.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) && b.readUInt16LE(4) > 0) return "ico";
  return null;
}

/**
 * 检查硬盘上的一个文件是不是图片。
 * 浏览器上传时报的类型（Content-Type）可以伪造，所以存下来之前要自己再确认一次。
 */
export function sniffImage(path: string): ImageKind | null {
  const buf = Buffer.alloc(12);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  const kind = sniffBytes(buf);
  return kind === "ico" ? null : kind;
}
