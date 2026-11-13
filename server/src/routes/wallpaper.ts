import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlink } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../db.js";
import { publicUser } from "../auth.js";
import { sniffImage } from "../images.js";

// 自定义壁纸存在 server/data/wallpapers/，文件名用随机 UUID；数据库的 users.wallpaper 只记文件名
export const WALLPAPER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/wallpapers");
mkdirSync(WALLPAPER_DIR, { recursive: true });

const MAX_MB = 8; // 前端会先把长边缩到 2560 像素再传，正常在 1 MB 以内
const TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };

class UploadError extends Error {}

const upload = multer({
  storage: multer.diskStorage({
    destination: WALLPAPER_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + TYPES[file.mimetype]),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (TYPES[file.mimetype]) cb(null, true);
    else cb(new UploadError("壁纸只支持 PNG、JPG、WebP 图片"));
  },
});

const currentFile = (userId: number) =>
  (db.prepare("SELECT wallpaper FROM users WHERE id = ?").get(userId) as { wallpaper: string | null } | undefined)?.wallpaper ?? null;

const removeFile = (name: string | null) => {
  if (name) unlink(resolve(WALLPAPER_DIR, name), () => {}); // 删不掉也不影响结果
};

export const wallpaperRouter = Router();

// 上传并替换壁纸（multipart/form-data，字段名 file），返回更新后的用户信息
wallpaperRouter.post("/", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? `图片太大，最大 ${MAX_MB} MB` : `上传失败：${err.message}`;
      return void res.status(400).json({ error: msg });
    }
    if (err instanceof UploadError) return void res.status(400).json({ error: err.message });
    if (err) return next(err);
    if (!req.file) return void res.status(400).json({ error: "没有收到图片" });
    // 浏览器报的类型可以伪造，所以再看一眼文件内容，确认真的是图片
    const kind = sniffImage(req.file.path);
    if (!kind || kind === "gif") {
      removeFile(req.file.filename);
      return void res.status(400).json({ error: "这个文件不是有效的图片" });
    }

    const old = currentFile(req.userId!);
    db.prepare("UPDATE users SET wallpaper = ? WHERE id = ?").run(req.file.filename, req.userId!);
    removeFile(old);
    res.status(201).json(publicUser(req.userId!));
  });
});

// 移除自定义壁纸，回到内置的天空
wallpaperRouter.delete("/", (req, res) => {
  const old = currentFile(req.userId!);
  db.prepare("UPDATE users SET wallpaper = NULL WHERE id = ?").run(req.userId!);
  removeFile(old);
  res.json({ ok: true });
});

// 读取自己的壁纸。地址里带 ?v=文件名，换壁纸后地址会变，浏览器不会用旧缓存
wallpaperRouter.get("/file", (req, res) => {
  const name = currentFile(req.userId!);
  if (!name) return void res.status(404).json({ error: "还没有设置壁纸" });
  res.sendFile(name, { root: WALLPAPER_DIR, headers: { "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
});
