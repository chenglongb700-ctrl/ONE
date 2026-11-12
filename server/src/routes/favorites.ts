import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlink } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { db } from "../db.js";
import { sniffImage } from "../images.js";
import { fetchPageMeta } from "../pageMeta.js";

/**
 * 收藏夹。一条收藏是三种之一：
 *   link  网址：url 必填，content 是备注
 *   text  摘录：content 是正文，url 是出处（可空）
 *   image 图片：文件存在 server/data/favorites/，content 是备注，url 是出处（可空）
 * 每条属于一个分组（grp，空字符串 = 未分组），可以有多个标签（逗号分隔），可以置顶。
 */
export const FAVORITES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/favorites");
mkdirSync(FAVORITES_DIR, { recursive: true });

const MAX_MB = 10;
const IMAGE_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };

type Row = {
  id: number;
  user_id: number;
  kind: "link" | "text" | "image";
  title: string;
  url: string;
  content: string;
  file_name: string | null;
  mime: string | null;
  grp: string;
  tags: string;
  pinned: number;
  created_at: string;
};

// 返回给前端：pinned 转成布尔值，图片给出读取地址，不暴露服务器上的文件名
const toClient = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  url: r.url,
  content: r.content,
  group: r.grp,
  tags: r.tags,
  pinned: r.pinned === 1,
  image: r.kind === "image" ? `/api/favorites/${r.id}/image` : null,
  created_at: r.created_at,
});

const getOwn = (id: number, uid: number) => db.prepare("SELECT * FROM favorites WHERE id = ? AND user_id = ?").get(id, uid) as Row | undefined;
const idSchema = z.coerce.number().int().positive();

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url("请输入完整的网址，以 http:// 或 https:// 开头")
  .refine((u) => /^https?:\/\//i.test(u), "只支持 http 或 https 链接");

// 三种收藏共用的字段
const common = {
  title: z.string().trim().max(200).default(""),
  content: z.string().max(20000).default(""),
  group: z.string().trim().max(40).default(""),
  tags: z.string().trim().max(200).default(""),
  // 图片是用表单上传的，表单里的值都是字符串，所以布尔值两种写法都接受
  pinned: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).default(false),
};
const optionalUrl = z.union([z.literal(""), httpUrl]).default("");

const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("link"), ...common, url: httpUrl }),
  z.object({ kind: z.literal("text"), ...common, url: optionalUrl, content: z.string().trim().min(1, "摘录内容不能为空").max(20000) }),
]);
const imageSchema = z.object({ ...common, url: optionalUrl });
const updateSchema = z.object({ ...common, url: optionalUrl }).partial();

const insert = db.prepare(
  "INSERT INTO favorites (user_id, kind, title, url, content, file_name, mime, grp, tags, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
);

class UploadError extends Error {}
const upload = multer({
  storage: multer.diskStorage({
    destination: FAVORITES_DIR,
    filename: (_req, file, cb) => cb(null, randomUUID() + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) cb(null, true);
    else cb(new UploadError("只支持 PNG、JPG、WebP、GIF 图片"));
  },
});

// multer 按 latin1 解码中文文件名，这里转回 UTF-8
const fixName = (name: string) => (/[^\u0000-ÿ]/.test(name) ? name : Buffer.from(name, "latin1").toString("utf8"));

const removeFile = (name: string | null) => {
  if (name) unlink(resolve(FAVORITES_DIR, name), () => {}); // 删不掉也不影响结果
};

export const favoritesRouter = Router();

// 置顶的排最前，其余按添加时间从新到旧
favoritesRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM favorites WHERE user_id = ? ORDER BY pinned DESC, id DESC").all(req.userId!) as Row[];
  res.json(rows.map(toClient));
});

// 收藏网址时自动填标题：GET /favorites/meta?url=...
favoritesRouter.get("/meta", async (req, res) => {
  const url = httpUrl.parse(req.query.url);
  res.json(await fetchPageMeta(url));
});

// 新建网址或摘录（JSON）
favoritesRouter.post("/", (req, res) => {
  const d = createSchema.parse(req.body);
  // 网址没填标题时先用域名顶上，至少能认出来是哪个网站
  const title = d.title || (d.kind === "link" ? new URL(d.url).hostname.replace(/^www\./, "") : "");
  const r = insert.run(req.userId!, d.kind, title, d.url, d.content, null, null, d.group, d.tags, d.pinned ? 1 : 0);
  res.status(201).json(toClient(getOwn(Number(r.lastInsertRowid), req.userId!)!));
});

// 新建图片（multipart/form-data：file 是图片，其余字段和上面一样）
favoritesRouter.post("/image", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? `图片太大，最大 ${MAX_MB} MB` : `上传失败：${err.message}`;
      return void res.status(400).json({ error: msg });
    }
    if (err instanceof UploadError) return void res.status(400).json({ error: err.message });
    if (err) return next(err);
    if (!req.file) return void res.status(400).json({ error: "没有收到图片" });
    const file = req.file;
    if (!sniffImage(file.path)) {
      removeFile(file.filename);
      return void res.status(400).json({ error: "这个文件不是有效的图片" });
    }
    const parsed = imageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      removeFile(file.filename); // 其他字段不合格时，别把图片留在硬盘上
      return next(parsed.error);
    }
    const d = parsed.data;
    const title = d.title || fixName(file.originalname).replace(/\.[^.]+$/, "").slice(0, 200);
    const r = insert.run(req.userId!, "image", title, d.url, d.content, file.filename, file.mimetype, d.group, d.tags, d.pinned ? 1 : 0);
    res.status(201).json(toClient(getOwn(Number(r.lastInsertRowid), req.userId!)!));
  });
});

// 修改（可以只传要改的字段）。种类和图片本身不能改，想换就删掉重新收藏
favoritesRouter.put("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const old = getOwn(id, req.userId!);
  if (!old) return void res.status(404).json({ error: "这条收藏不存在" });
  const d = updateSchema.parse(req.body);
  const next = {
    title: d.title ?? old.title,
    url: d.url ?? old.url,
    content: d.content ?? old.content,
    grp: d.group ?? old.grp,
    tags: d.tags ?? old.tags,
    pinned: d.pinned === undefined ? old.pinned : d.pinned ? 1 : 0,
  };
  if (old.kind === "link" && !next.url) return void res.status(400).json({ error: "网址不能为空" });
  if (old.kind === "text" && !next.content.trim()) return void res.status(400).json({ error: "摘录内容不能为空" });
  db.prepare("UPDATE favorites SET title = ?, url = ?, content = ?, grp = ?, tags = ?, pinned = ? WHERE id = ? AND user_id = ?").run(
    next.title,
    next.url,
    next.content,
    next.grp,
    next.tags,
    next.pinned,
    id,
    req.userId!,
  );
  res.json(toClient(getOwn(id, req.userId!)!));
});

favoritesRouter.delete("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const old = getOwn(id, req.userId!);
  if (!old) return void res.status(404).json({ error: "这条收藏不存在" });
  db.prepare("DELETE FROM favorites WHERE id = ? AND user_id = ?").run(id, req.userId!);
  removeFile(old.file_name);
  res.json({ ok: true });
});

favoritesRouter.get("/:id/image", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const f = getOwn(id, req.userId!);
  if (!f || f.kind !== "image" || !f.file_name) return void res.status(404).json({ error: "图片不存在" });
  res.sendFile(f.file_name, {
    root: FAVORITES_DIR,
    headers: { "Content-Type": f.mime ?? "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
});
