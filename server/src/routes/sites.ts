import { Router } from "express";
import multer from "multer";
import { extname } from "node:path";
import { z } from "zod";
import { db } from "../db.js";
import { fetchSiteInfo, ICON_MAX_BYTES, ICON_MIME, removeIcon, saveIcon, SITE_ICON_DIR } from "../siteIcon.js";

/**
 * 网址：常用网站的导航页。每个网址有名称、分类、是否置顶，还有一个 logo。
 * logo 在添加时由服务器去对方网站取回来（见 siteIcon.ts），取不到时前端用名称的第一个字代替，也可以自己上传。
 */
type Row = {
  id: number;
  user_id: number;
  title: string;
  url: string;
  category: string;
  pinned: number;
  icon: string | null;
  created_at: string;
};

// 不暴露服务器上的文件名；地址里带 ?v=，换了图标后地址会变，浏览器不会用旧缓存
const toClient = (r: Row) => ({
  id: r.id,
  title: r.title,
  url: r.url,
  category: r.category,
  pinned: r.pinned === 1,
  icon: r.icon ? `/api/sites/${r.id}/icon?v=${encodeURIComponent(r.icon)}` : null,
});

const getOwn = (id: number, uid: number) => db.prepare("SELECT * FROM sites WHERE id = ? AND user_id = ?").get(id, uid) as Row | undefined;
const idSchema = z.coerce.number().int().positive();

const urlTaken = (uid: number, url: string, exceptId = 0) => !!db.prepare("SELECT 1 FROM sites WHERE user_id = ? AND url = ? AND id <> ?").get(uid, url, exceptId);

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "");

const schema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .url("请输入完整的网址，以 http:// 或 https:// 开头")
    .refine((u) => /^https?:\/\//i.test(u), "只支持 http 或 https 链接"),
  title: z.string().trim().max(60).default(""),
  category: z.string().trim().max(20).default(""),
  pinned: z.boolean().default(false),
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: ICON_MAX_BYTES, files: 1 } });

export const sitesRouter = Router();

// 置顶的排最前，其余按添加的先后：导航页的位置固定下来，才能凭习惯找到
sitesRouter.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM sites WHERE user_id = ? ORDER BY pinned DESC, id").all(req.userId!) as Row[];
  res.json(rows.map(toClient));
});

// 添加：去网站取标题和图标，所以会花一两秒（最多十秒左右）
sitesRouter.post("/", async (req, res) => {
  const d = schema.parse(req.body);
  if (urlTaken(req.userId!, d.url)) return void res.status(400).json({ error: "这个网址已经添加过了" });
  const info = await fetchSiteInfo(d.url);
  // 名称：自己填的 > 网页标题 > 域名
  const title = d.title || info.title.slice(0, 60) || hostOf(d.url);
  const r = db
    .prepare("INSERT INTO sites (user_id, title, url, category, pinned, icon) VALUES (?, ?, ?, ?, ?, ?)")
    .run(req.userId!, title, d.url, d.category, d.pinned ? 1 : 0, info.icon);
  res.status(201).json(toClient(getOwn(Number(r.lastInsertRowid), req.userId!)!));
});

// 修改（可以只传要改的字段）。换了网址就重新取一次图标
sitesRouter.put("/:id", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const old = getOwn(id, req.userId!);
  if (!old) return void res.status(404).json({ error: "这个网址不存在" });
  const d = schema.partial().parse(req.body);
  const url = d.url ?? old.url;
  if (url !== old.url && urlTaken(req.userId!, url, id)) return void res.status(400).json({ error: "这个网址已经添加过了" });

  let icon = old.icon;
  let title = d.title ?? old.title;
  if (url !== old.url) {
    const info = await fetchSiteInfo(url);
    // 还是同一个网站（只是换了页面）而这次没取到时，留着原来的图标；换了网站就不能留了
    if (info.icon || hostOf(url) !== hostOf(old.url)) icon = info.icon;
    title ||= info.title.slice(0, 60);
  }
  title ||= hostOf(url);

  db.prepare("UPDATE sites SET title = ?, url = ?, category = ?, pinned = ?, icon = ? WHERE id = ? AND user_id = ?").run(
    title,
    url,
    d.category ?? old.category,
    d.pinned === undefined ? old.pinned : d.pinned ? 1 : 0,
    icon,
    id,
    req.userId!,
  );
  if (icon !== old.icon) removeIcon(old.icon);
  res.json(toClient(getOwn(id, req.userId!)!));
});

sitesRouter.delete("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const old = getOwn(id, req.userId!);
  if (!old) return void res.status(404).json({ error: "这个网址不存在" });
  db.prepare("DELETE FROM sites WHERE id = ? AND user_id = ?").run(id, req.userId!);
  removeIcon(old.icon);
  res.json({ ok: true });
});

const setIcon = (old: Row, icon: string) => {
  db.prepare("UPDATE sites SET icon = ? WHERE id = ? AND user_id = ?").run(icon, old.id, old.user_id);
  removeIcon(old.icon);
  return toClient(getOwn(old.id, old.user_id)!);
};

// 重新去网站取一次图标（网站换了 logo，或者第一次没取到）
sitesRouter.post("/:id/icon/refresh", async (req, res) => {
  const id = idSchema.parse(req.params.id);
  const old = getOwn(id, req.userId!);
  if (!old) return void res.status(404).json({ error: "这个网址不存在" });
  const info = await fetchSiteInfo(old.url);
  if (!info.icon) return void res.status(502).json({ error: "没能从这个网站取到图标，可以自己上传一张" });
  res.json(setIcon(old, info.icon));
});

// 自己上传图标（multipart/form-data，字段名 file）
sitesRouter.post("/:id/icon", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const msg = err.code === "LIMIT_FILE_SIZE" ? "图标太大，最大 1 MB" : `上传失败：${err.message}`;
      return void res.status(400).json({ error: msg });
    }
    if (err) return next(err);
    const id = idSchema.safeParse(req.params.id);
    const old = id.success ? getOwn(id.data, req.userId!) : undefined;
    if (!old) return void res.status(404).json({ error: "这个网址不存在" });
    if (!req.file) return void res.status(400).json({ error: "没有收到图片" });
    // 浏览器报的类型可以伪造，saveIcon 会看文件内容确认真的是图片
    const icon = saveIcon(req.file.buffer);
    if (!icon) return void res.status(400).json({ error: "图标只支持 PNG、JPG、WebP、GIF、ICO 图片" });
    res.status(201).json(setIcon(old, icon));
  });
});

sitesRouter.get("/:id/icon", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const s = getOwn(id, req.userId!);
  if (!s?.icon) return void res.status(404).json({ error: "没有图标" });
  res.sendFile(s.icon, {
    root: SITE_ICON_DIR,
    headers: { "Content-Type": ICON_MIME[extname(s.icon)] ?? "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" },
  });
});
