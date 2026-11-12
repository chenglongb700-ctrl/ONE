import { closeSync, openSync, readSync } from "node:fs";

export type ImageKind = "png" | "jpg" | "webp" | "gif";

/**
 * 看文件开头的几个字节，判断它到底是不是图片、是哪种图片。
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
  if (buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png";
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "jpg";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") return "webp";
  if (buf.toString("latin1", 0, 4) === "GIF8") return "gif";
  return null;
}
