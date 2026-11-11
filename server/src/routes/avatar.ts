import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, openSync, readSync, closeSync, unlink } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db.js";
import { publicUser } from "../auth.js";

// 头像存在 server/data/avatars/，文件名用随机 UUID；数据库的 users.avatar 只记文件名
export const AVATAR_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/avatars");
mkdirSync(AVATAR_DIR, { recursive: true });

const MAX_MB = 2; // 前端会先裁成 256×256 再传，正常只有几十 KB
const TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

class UploadError extends Error {}

const upload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + TYPES[file.mimetype]),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (TYPES[file.mimetype]) cb(null, true);
    else cb(new UploadError("头像只支持 PNG、JPG、WebP 图片"));
  },
});

/** 浏览器报的类型可以伪造，所以再看一眼文件开头的几个字节，确认真的是图片 */
function looksLikeImage(path: string) {
  const buf = Buffer.alloc(12);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, 12, 0);
  } finally {
    closeSync(fd);
  }
  const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const jpg = buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const webp = buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP";
  return png || jpg || webp;
}

const currentFile = (userId: number) =>
  (db.prepare("SELECT avatar FROM users WHERE id = ?").get(userId) as { avatar: string | null } | undefined)?.avatar ?? null;

const removeFile = (name: string | null) => {
  if (name) unlink(resolve(AVATAR_DIR, name), () => {}); // 删不掉也不影响结果
};

export const avatarRouter = Router();

// 上传并替换头像（multipart/form-data，字段名 file），返回更新后的用户信息
avatarRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? `图片太大，最大 ${MAX_MB} MB` : `上传失败：${err.message}`;
      return void res.status(400).json({ error: msg });
    }
    if (err instanceof UploadError) return void res.status(400).json({ error: err.message });
    if (err) return next(err);
    if (!req.file) return void res.status(400).json({ error: "没有收到图片" });
    if (!looksLikeImage(req.file.path)) {
      removeFile(req.file.filename);
      return void res.status(400).json({ error: "这个文件不是有效的图片" });
    }

    const old = currentFile(req.userId!);
    db.prepare("UPDATE users SET avatar = ? WHERE id = ?").run(req.file.filename, req.userId!);
    removeFile(old);
    res.status(201).json(publicUser(req.userId!));
  });
});

// 移除头像，回到用户名首字母
avatarRouter.delete("/", (req, res) => {
  const old = currentFile(req.userId!);
  db.prepare("UPDATE users SET avatar = NULL WHERE id = ?").run(req.userId!);
  removeFile(old);
  res.json({ ok: true });
});

// 读取自己的头像。地址里带 ?v=文件名，换头像后地址会变，浏览器不会用旧缓存
avatarRouter.get("/file", (req, res) => {
  const name = currentFile(req.userId!);
  if (!name) return void res.status(404).json({ error: "还没有设置头像" });
  res.sendFile(name, { root: AVATAR_DIR, headers: { "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
});
