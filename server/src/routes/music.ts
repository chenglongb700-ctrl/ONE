import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlink } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { db } from "../db.js";

// 上传的音乐存在 server/data/music/，文件名用随机 UUID
export const MUSIC_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/music");
mkdirSync(MUSIC_DIR, { recursive: true });

const AUDIO_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
};
const MAX_MB = 100;

// multer 按 latin1 解码中文文件名，这里转回 UTF-8
function fixName(name: string) {
  return /[^\u0000-ÿ]/.test(name) ? name : Buffer.from(name, "latin1").toString("utf8");
}

const upload = multer({
  storage: multer.diskStorage({
    destination: MUSIC_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + extname(fixName(file.originalname)).toLowerCase()),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = extname(fixName(file.originalname)).toLowerCase();
    if (AUDIO_EXT[ext]) cb(null, true);
    else cb(new UploadError(`不支持 ${ext || "这种"} 格式，请上传 ${Object.keys(AUDIO_EXT).join(" ")} 文件`));
  },
});

class UploadError extends Error {}

type Track = {
  id: number;
  user_id: number;
  title: string;
  artist: string;
  source: "file" | "url";
  file_name: string | null;
  mime: string | null;
  size: number | null;
  url: string | null;
  lyrics: string;
  created_at: string;
};

// 返回给前端时，文件歌曲给出播放地址，不暴露服务器文件名
const toClient = (t: Track) => ({
  id: t.id,
  title: t.title,
  artist: t.artist,
  source: t.source,
  size: t.size,
  src: t.source === "file" ? `/api/music/${t.id}/file` : t.url,
  lyrics: t.lyrics,
  created_at: t.created_at,
});

const getOwn = (id: number, uid: number) =>
  db.prepare("SELECT * FROM tracks WHERE id = ? AND user_id = ?").get(id, uid) as Track | undefined;

const idSchema = z.coerce.number().int().positive();

/** 「周杰伦 - 晴天.mp3」→ { artist: 周杰伦, title: 晴天 } */
function parseName(fileName: string) {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const m = base.match(/^(.+?)\s+-\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: base || "未命名" };
}

export const musicRouter = Router();

musicRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM tracks WHERE user_id = ? ORDER BY id").all(req.userId!) as Track[];
  res.json(rows.map(toClient));
});

// 上传一个音频文件（multipart/form-data，字段名 file）
musicRouter.post("/upload", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? `文件太大，单个文件最大 ${MAX_MB} MB` : `上传失败：${err.message}`;
      return void res.status(400).json({ error: msg });
    }
    if (err instanceof UploadError) return void res.status(400).json({ error: err.message });
    if (err) return next(err);
    if (!req.file) return void res.status(400).json({ error: "没有收到文件" });

    const original = fixName(req.file.originalname);
    const parsed = parseName(original);
    const title = (typeof req.body?.title === "string" && req.body.title.trim()) || parsed.title;
    const artist = (typeof req.body?.artist === "string" && req.body.artist.trim()) || parsed.artist;
    const ext = extname(req.file.filename);
    const r = db
      .prepare("INSERT INTO tracks (user_id, title, artist, source, file_name, mime, size) VALUES (?, ?, ?, 'file', ?, ?, ?)")
      .run(req.userId!, title.slice(0, 200), artist.slice(0, 200), req.file.filename, AUDIO_EXT[ext], req.file.size);
    res.status(201).json(toClient(getOwn(Number(r.lastInsertRowid), req.userId!)!));
  });
});

// 添加一个外部链接
const urlSchema = z.object({
  url: z
    .string()
    .trim()
    .url("请输入完整的网址，以 http:// 或 https:// 开头")
    .refine((u) => /^https?:\/\//i.test(u), "只支持 http 或 https 链接"),
  title: z.string().trim().max(200).optional(),
  artist: z.string().trim().max(200).default(""),
});

musicRouter.post("/", (req, res) => {
  const { url, title, artist } = urlSchema.parse(req.body);
  const fromUrl = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
  const parsed = parseName(fromUrl);
  const r = db
    .prepare("INSERT INTO tracks (user_id, title, artist, source, url) VALUES (?, ?, ?, 'url', ?)")
    .run(req.userId!, title || parsed.title, artist || parsed.artist, url);
  res.status(201).json(toClient(getOwn(Number(r.lastInsertRowid), req.userId!)!));
});

// 改标题、歌手、歌词
const editSchema = z.object({
  title: z.string().trim().min(1, "歌名不能为空").max(200).optional(),
  artist: z.string().trim().max(200).optional(),
  lyrics: z.string().max(200_000, "歌词太长了").optional(),
});

musicRouter.put("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  if (!getOwn(id, req.userId!)) return void res.status(404).json({ error: "歌曲不存在" });
  const data = Object.fromEntries(Object.entries(editSchema.parse(req.body)).filter(([, v]) => v !== undefined));
  const cols = Object.keys(data);
  if (cols.length) {
    db.prepare(`UPDATE tracks SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ? AND user_id = ?`).run(
      ...(Object.values(data) as string[]),
      id,
      req.userId!,
    );
  }
  res.json(toClient(getOwn(id, req.userId!)!));
});

musicRouter.delete("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const t = getOwn(id, req.userId!);
  if (!t) return void res.status(404).json({ error: "歌曲不存在" });
  db.prepare("DELETE FROM tracks WHERE id = ? AND user_id = ?").run(id, req.userId!);
  if (t.file_name) unlink(resolve(MUSIC_DIR, t.file_name), () => {}); // 文件删不掉也不影响结果
  res.json({ ok: true });
});

// 播放上传的文件。sendFile 自带 Range 支持，所以可以拖动进度条
musicRouter.get("/:id/file", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const t = getOwn(id, req.userId!);
  if (!t || t.source !== "file" || !t.file_name) return void res.status(404).json({ error: "歌曲不存在" });
  res.sendFile(t.file_name, {
    root: MUSIC_DIR,
    headers: { "Content-Type": t.mime ?? "application/octet-stream", "Cache-Control": "private, max-age=86400" },
  });
});
