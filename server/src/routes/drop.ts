import { Router } from "express";
import { z } from "zod";
import { inspectUrl, metaContent, pageTitle } from "../pageMeta.js";
import { isVideoPage, platformCategory, platformName } from "../platforms.js";
import { addImageBytes, addText, addVideoLink } from "./favorites.js";
import { addSite } from "./sites.js";

/**
 * 拖进来自动归类：把一段文字、一个网址或者一张网页上的图片拖到网站上，这里判断它是什么，放到该放的地方。
 *   视频平台上的视频（B 站、YouTube、抖音…）→ 收藏 › 视频
 *   直接指向一张图片的网址                    → 收藏 › 图片（把图片下载回来）
 *   其他网址                                  → 网址（认得出的平台顺便分好类）
 *   一段不是网址的文字                        → 收藏 › 摘录
 * 图片和视频「文件」不走这里：前端直接用 /favorites/image、/favorites/video 上传。
 * 全靠规则判断（域名查表、看服务器返回的文件类型），不用 AI。
 */
const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 和手动收藏图片的上限一致

const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .url()
  .refine((u) => /^https?:\/\//i.test(u));

const schema = z.union([
  // 拖进来的文字（网址也是文字）
  z.object({ text: z.string().trim().min(1, "拖进来的内容是空的").max(20000, "文字太长了，最多两万字") }),
  // 从别的网页拖过来的一张图片：图片本身的地址，和它所在的网页（知道的话）
  z.object({ imageUrl: httpUrl, pageUrl: z.union([z.literal(""), httpUrl]).default("") }),
]);

// 文字里的网址。遇到空白、引号、尖括号和中文标点就算结束（"…看看这个 https://v.douyin.com/abc/ 复制打开抖音"）
const URL_IN_TEXT = /https?:\/\/[^\s<>"'，。；！？、（）【】《》]+/gi;
// 只打了域名没写协议的，比如 github.com/anthropics
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i;

/** 从拖进来的文字里找出"其实是一个网址"的情况；纯粹是一段话就返回 null */
function urlFromText(text: string): string | null {
  if (!/\s/.test(text)) {
    if (/^https?:\/\//i.test(text)) return text;
    if (BARE_DOMAIN.test(text)) return `https://${text}`;
    return null;
  }
  // App 里"复制链接"得到的常常是一句话夹着一个网址：短短一句、只有一个网址，就当它是在分享这个网址
  const urls = text.match(URL_IN_TEXT) ?? [];
  return urls.length === 1 && text.length <= 300 ? urls[0] : null;
}

type Result = { where: "favorites" | "sites"; kind: "video" | "image" | "text" | "site"; title: string; platform: string; category: string };

const fromFavorite = (kind: "video" | "image" | "text", f: { title: string; platform: string; content: string }): Result => ({
  where: "favorites",
  kind,
  title: f.title || (kind === "text" ? f.content.slice(0, 30) : ""),
  platform: f.platform,
  category: "",
});

export const dropRouter = Router();

dropRouter.post("/", async (req, res) => {
  const d = schema.parse(req.body);
  const uid = req.userId!;
  const bad = (error: string) => void res.status(400).json({ error });

  // ---- 从网页上拖过来的图片 ----
  if ("imageUrl" in d) {
    const got = await inspectUrl(d.imageUrl, IMAGE_MAX_BYTES);
    const image = got.kind === "image" ? addImageBytes(uid, got.bytes, { url: d.pageUrl || d.imageUrl }) : null;
    if (!image) return bad("没能把这张图片取回来（可能太大，或者那个网站不让下载）。可以先把图片存到电脑上，再把文件拖进来。");
    return void res.status(201).json(fromFavorite("image", image));
  }

  // ---- 一段文字：不是网址就当摘录 ----
  const url = urlFromText(d.text);
  if (!url || !httpUrl.safeParse(url).success) {
    const sources = d.text.match(URL_IN_TEXT) ?? [];
    // 文字里正好带着一个网址的，把它记成出处
    const source = sources.length === 1 && httpUrl.safeParse(sources[0]).success ? sources[0] : "";
    return void res.status(201).json(fromFavorite("text", addText(uid, { content: d.text, url: source })));
  }

  // ---- 一个网址 ----
  // 看域名就知道是视频的，直接当视频收（它自己会去取标题和封面）
  if (isVideoPage(url)) return void res.status(201).json(fromFavorite("video", await addVideoLink(uid, { url })));

  // 其余的要去看一眼网址后面是什么
  const got = await inspectUrl(url, IMAGE_MAX_BYTES);
  if (got.kind === "image") {
    const image = addImageBytes(uid, got.bytes, { url });
    if (image) return void res.status(201).json(fromFavorite("image", image));
  }
  const page = got.kind === "page" ? got.page : null;
  // 短链接跳转之后落在视频页上；或者网页自己声明了"我是一个视频"（og:type = video.*）
  const looksLikeVideo = got.kind === "video" || (page && (isVideoPage(page.url.href) || /^video/i.test(metaContent(page.html, "og:type") ?? "")));
  if (looksLikeVideo) return void res.status(201).json(fromFavorite("video", await addVideoLink(uid, { url }, page)));

  // 普通网址：放进「网址」，认得出平台的顺便分好类。短链接换成跳转后的真实地址
  const finalUrl = page && page.url.hostname !== new URL(url).hostname ? page.url.href : url;
  const category = platformCategory(finalUrl);
  // 拖进来的如果是网站里的某一页（不是首页），名称用这一页自己的标题，而不是网站名：不然十篇文章都叫"知乎"
  const title = page && page.url.pathname.length > 1 ? pageTitle(page.html).slice(0, 60) : "";
  const site = await addSite(uid, { url: finalUrl, title, category, pinned: false }, page);
  if (!site) return bad("这个网址已经在「网址」里了");
  res.status(201).json({ where: "sites", kind: "site", title: site.title, platform: platformName(finalUrl), category } satisfies Result);
});
