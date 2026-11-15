import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { mkdirSync, unlink, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { db } from "../db.js";
import { sniffBytes, sniffImage, sniffVideo } from "../images.js";
import { clean, fetchBytes, fetchHtml, metaContent, pageTitle, safeFetch, type Page } from "../pageMeta.js";
import { platformName } from "../platforms.js";

/**
 * 收藏夹。一条收藏是三种之一（普通网址不放这里，统一放在「网址」页面，见 sites.ts）：
 *   text  摘录：content 是正文，url 是出处（可空）
 *   image 图片：文件存在 server/data/favorites/，content 是备注，url 是出处（可空）
 *   video 视频：两种来源——
 *           上传的文件：file_name 是视频文件，url 是出处（可空）
 *           视频链接：  url 是视频所在的网页，cover 是从那个网页取回来的封面图（可能没有）
 *         content 都是备注
 * 每条属于一个分组（grp，空字符串 = 未分组），可以有多个标签（逗号分隔），可以置顶。
 */
export const FAVORITES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../data/favorites");
mkdirSync(FAVORITES_DIR, { recursive: true });

const IMAGE_MAX_MB = 10;
const VIDEO_MAX_MB = 500;
const COVER_MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };
// MOV 是手机录的视频常见的格式，里面装的通常和 MP4 一样，浏览器大多能放
const VIDEO_TYPES: Record<string, string> = { "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov" };
const COVER_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

type Row = {
  id: number;
  user_id: number;
  kind: "text" | "image" | "video";
  title: string;
  url: string;
  content: string;
  file_name: string | null;
  mime: string | null;
  cover: string | null;
  grp: string;
  tags: string;
  pinned: number;
  created_at: string;
};

// 返回给前端：pinned 转成布尔值，图片、视频、封面给出读取地址，不暴露服务器上的文件名
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
  video: r.kind === "video" && r.file_name ? `/api/favorites/${r.id}/video` : null,
  cover: r.cover ? `/api/favorites/${r.id}/cover` : null,
  // 来自哪个平台：按出处的网址查表（platforms.ts）；没有出处的图片和视频文件是自己传的
  platform: (r.url && platformName(r.url)) || (r.file_name && !r.url ? "本地" : ""),
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

// 各种收藏共用的字段
const common = {
  title: z.string().trim().max(200).default(""),
  content: z.string().max(20000).default(""),
  group: z.string().trim().max(40).default(""),
  tags: z.string().trim().max(200).default(""),
  // 图片和视频是用表单上传的，表单里的值都是字符串，所以布尔值两种写法都接受
  pinned: z.union([z.boolean(), z.enum(["true", "false"]).transform((v) => v === "true")]).default(false),
};
const optionalUrl = z.union([z.literal(""), httpUrl]).default("");

// 用 JSON 新建的两种：摘录，和视频链接
const createSchema = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("text"), ...common, url: optionalUrl, content: z.string().trim().min(1, "摘录内容不能为空").max(20000) }),
    z.object({ kind: z.literal("video"), ...common, url: httpUrl }),
  ],
  { errorMap: (issue, ctx) => ({ message: issue.code === "invalid_union_discriminator" ? "这里只收摘录、图片和视频，普通网址请放到「网址」页面" : ctx.defaultError }) },
);
const fileSchema = z.object({ ...common, url: optionalUrl });
const updateSchema = z.object({ ...common, url: optionalUrl }).partial();

const insert = db.prepare(
  "INSERT INTO favorites (user_id, kind, title, url, content, file_name, mime, cover, grp, tags, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
);

class UploadError extends Error {}
const uploader = (types: Record<string, string>, maxMb: number, wrongType: string) =>
  multer({
    storage: multer.diskStorage({
      destination: FAVORITES_DIR,
      filename: (_req, file, cb) => cb(null, randomUUID() + types[file.mimetype]),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (types[file.mimetype]) cb(null, true);
      else cb(new UploadError(wrongType));
    },
  });
const uploadImage = uploader(IMAGE_TYPES, IMAGE_MAX_MB, "只支持 PNG、JPG、WebP、GIF 图片");
const uploadVideo = uploader(VIDEO_TYPES, VIDEO_MAX_MB, "只支持 MP4、WebM、MOV 视频");

// multer 按 latin1 解码中文文件名，这里转回 UTF-8
const fixName = (name: string) => (/[^\u0000-ÿ]/.test(name) ? name : Buffer.from(name, "latin1").toString("utf8"));

const removeFile = (name: string | null) => {
  if (name) unlink(resolve(FAVORITES_DIR, name), () => {}); // 删不掉也不影响结果
};

/**
 * 去视频所在的网页取标题和封面图（网页里的 og:image，B 站、YouTube 等视频网站都有）。
 * 哪样拿不到，哪样就是空的，不抛错。短链接（比如 b23.tv）会跟着跳转，返回最终的网页地址。
 */
async function fetchVideoPage(rawUrl: string, fetched?: Page | null): Promise<{ title: string; cover: string | null; url: string }> {
  // YouTube 的网页对程序只给一个空壳，标题和封面要从它公开的 oEmbed 接口拿
  if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(rawUrl).hostname)) {
    try {
      const got = await safeFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(rawUrl)}`, "application/json");
      if (got?.res.ok) {
        const info = (await got.res.json()) as { title?: unknown; thumbnail_url?: unknown };
        return {
          title: typeof info.title === "string" ? info.title.slice(0, 200) : "",
          cover: typeof info.thumbnail_url === "string" ? await saveCover(info.thumbnail_url) : null,
          url: rawUrl,
        };
      }
      got?.res.body?.cancel().catch(() => {});
    } catch {
      /* 连不上就按普通网页再试一次 */
    }
  }
  // 调用的人已经把网页抓回来了就直接用（null 表示抓过了但没抓到）
  const page = fetched === undefined ? await fetchHtml(rawUrl) : fetched;
  if (!page) return { title: "", cover: null, url: rawUrl };
  const image = clean(metaContent(page.html, "og:image"), 2000);
  let cover: string | null = null;
  try {
    // 有的网站写的是 //i0.hdslb.com/… 这种省略协议的地址，以网页地址为准补全
    if (image) cover = await saveCover(new URL(image, page.url).href);
  } catch {
    /* 封面地址写错了，就不要封面 */
  }
  // 去掉标题末尾的网站名："某某视频_哔哩哔哩_bilibili" → "某某视频"
  const title = pageTitle(page.html).replace(/[\s_|-]*(哔哩哔哩_bilibili|bilibili|YouTube)\s*$/i, "");
  return { title, cover, url: page.url.href };
}

/** 下载封面图，确认是图片后存进收藏目录，返回文件名；拿不到返回 null */
async function saveCover(imageUrl: string): Promise<string | null> {
  const bytes = await fetchBytes(imageUrl, "image/*,*/*;q=0.5", COVER_MAX_BYTES);
  const kind = bytes && sniffBytes(bytes);
  if (!bytes || !kind || kind === "ico") return null;
  const name = `${randomUUID()}.${kind}`;
  writeFileSync(resolve(FAVORITES_DIR, name), bytes);
  return name;
}

export const favoritesRouter = Router();

// 置顶的排最前，其余按添加时间从新到旧
favoritesRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM favorites WHERE user_id = ? ORDER BY pinned DESC, id DESC").all(req.userId!) as Row[];
  res.json(rows.map(toClient));
});

// 新建摘录或视频链接（JSON）。视频链接要去对方网页取标题和封面，会花几秒
favoritesRouter.post("/", async (req, res) => {
  const d = createSchema.parse(req.body);
  res.status(201).json(d.kind === "video" ? await addVideoLink(req.userId!, d) : addText(req.userId!, d));
});

// 下面三个函数各新建一种收藏，返回给前端的那条记录。「拖进来自动归类」（drop.ts）也用它们。
type Extra = { title?: string; url?: string; content?: string; group?: string; tags?: string; pinned?: boolean };

export function addText(uid: number, d: Extra & { content: string }) {
  const r = insert.run(uid, "text", d.title ?? "", d.url ?? "", d.content, null, null, null, d.group ?? "", d.tags ?? "", d.pinned ? 1 : 0);
  return toClient(getOwn(Number(r.lastInsertRowid), uid)!);
}

/** 视频链接。page：调用的人已经抓回来的网页，传进来就不再抓第二遍 */
export async function addVideoLink(uid: number, d: Extra & { url: string }, page?: Page | null) {
  const info = await fetchVideoPage(d.url, page);
  // 短链接换成跳转后的真实地址：以后才认得出是哪个网站的视频，能直接在页面里播放
  const url = new URL(info.url).hostname !== new URL(d.url).hostname ? info.url : d.url;
  const r = insert.run(uid, "video", d.title || info.title, url, d.content ?? "", null, null, info.cover, d.group ?? "", d.tags ?? "", d.pinned ? 1 : 0);
  return toClient(getOwn(Number(r.lastInsertRowid), uid)!);
}

/** 已经下载到内存里的图片（从别的网页拖过来的）。不是图片、或者是 ico 这种不适合收藏的，返回 null */
export function addImageBytes(uid: number, bytes: Uint8Array, d: Extra) {
  const kind = sniffBytes(bytes);
  if (!kind || kind === "ico") return null;
  const name = `${randomUUID()}.${kind}`;
  writeFileSync(resolve(FAVORITES_DIR, name), bytes);
  const mime = COVER_MIME[`.${kind}`];
  const r = insert.run(uid, "image", d.title ?? "", d.url ?? "", d.content ?? "", name, mime, null, d.group ?? "", d.tags ?? "", d.pinned ? 1 : 0);
  return toClient(getOwn(Number(r.lastInsertRowid), uid)!);
}

// 新建图片或视频文件（multipart/form-data：file 是文件，其余字段和上面一样）
const fileRoute = (kind: "image" | "video", upload: multer.Multer, maxMb: number, isValid: (path: string) => unknown) =>
  favoritesRouter.post(`/${kind}`, (req, res, next) => {
    const what = kind === "image" ? "图片" : "视频";
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const msg = err.code === "LIMIT_FILE_SIZE" ? `${what}太大，最大 ${maxMb} MB` : `上传失败：${err.message}`;
        return void res.status(400).json({ error: msg });
      }
      if (err instanceof UploadError) return void res.status(400).json({ error: err.message });
      if (err) return next(err);
      if (!req.file) return void res.status(400).json({ error: `没有收到${what}` });
      const file = req.file;
      // 浏览器报的类型可以伪造，所以再看一眼文件内容
      if (!isValid(file.path)) {
        removeFile(file.filename);
        return void res.status(400).json({ error: `这个文件不是有效的${what}` });
      }
      const parsed = fileSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        removeFile(file.filename); // 其他字段不合格时，别把文件留在硬盘上
        return next(parsed.error);
      }
      const d = parsed.data;
      const title = d.title || fixName(file.originalname).replace(/\.[^.]+$/, "").slice(0, 200);
      const r = insert.run(req.userId!, kind, title, d.url, d.content, file.filename, file.mimetype, null, d.group, d.tags, d.pinned ? 1 : 0);
      res.status(201).json(toClient(getOwn(Number(r.lastInsertRowid), req.userId!)!));
    });
  });
fileRoute("image", uploadImage, IMAGE_MAX_MB, sniffImage);
fileRoute("video", uploadVideo, VIDEO_MAX_MB, sniffVideo);

// 修改（可以只传要改的字段）。种类、图片和视频本身不能改，想换就删掉重新收藏
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
  if (old.kind === "text" && !next.content.trim()) return void res.status(400).json({ error: "摘录内容不能为空" });
  // 视频链接没有文件，链接就是它的全部；而且封面是按原来的链接取的，所以不让改
  if (old.kind === "video" && !old.file_name && next.url !== old.url) return void res.status(400).json({ error: "视频链接不能改，想换一个视频请删掉重新收藏" });
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
  removeFile(old.cover);
  res.json({ ok: true });
});

const fileHeaders = (mime: string | undefined | null) => ({
  "Content-Type": mime ?? "application/octet-stream",
  "Cache-Control": "private, max-age=31536000, immutable",
  "X-Content-Type-Options": "nosniff",
});

// 读取图片 / 视频文件。sendFile 支持分段读取（Range），所以视频可以拖动进度条
for (const kind of ["image", "video"] as const) {
  favoritesRouter.get(`/:id/${kind}`, (req, res) => {
    const id = idSchema.parse(req.params.id);
    const f = getOwn(id, req.userId!);
    if (!f || f.kind !== kind || !f.file_name) return void res.status(404).json({ error: "文件不存在" });
    res.sendFile(f.file_name, { root: FAVORITES_DIR, headers: fileHeaders(f.mime) });
  });
}

favoritesRouter.get("/:id/cover", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const f = getOwn(id, req.userId!);
  if (!f?.cover) return void res.status(404).json({ error: "没有封面" });
  res.sendFile(f.cover, { root: FAVORITES_DIR, headers: fileHeaders(COVER_MIME[f.cover.slice(f.cover.lastIndexOf("."))]) });
});
