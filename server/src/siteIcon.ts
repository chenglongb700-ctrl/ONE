import { randomUUID } from "node:crypto";
import { mkdirSync, unlink, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sniffBytes } from "./images.js";
import { clean, fetchHtml, metaContent, pageTitle, readHead, safeFetch } from "./pageMeta.js";

/**
 * 「网址」的 logo：添加网址时，服务器去那个网站把图标取回来，存在 server/data/site-icons/。
 * 存一份在自己这里，而不是每次都让浏览器去对方网站拿：打开页面更快，对方网站挂了或者改版了图标也还在。
 */
export const SITE_ICON_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../data/site-icons");
mkdirSync(SITE_ICON_DIR, { recursive: true });

export const ICON_MAX_BYTES = 1024 * 1024;
const BUDGET_MS = 10_000; // 整个过程最多花这么久，别让"添加"按钮一直转

const EXT = { png: ".png", jpg: ".jpg", webp: ".webp", gif: ".gif", ico: ".ico" } as const;
export const ICON_MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon" };

/** 确认是图片后存进图标目录，返回文件名；不是图片返回 null */
export function saveIcon(bytes: Uint8Array): string | null {
  const kind = sniffBytes(bytes);
  if (!kind) return null;
  const name = randomUUID() + EXT[kind];
  writeFileSync(resolve(SITE_ICON_DIR, name), bytes);
  return name;
}

export const removeIcon = (name: string | null) => {
  if (name) unlink(resolve(SITE_ICON_DIR, name), () => {}); // 删不掉也不影响结果
};

/** 取 HTML 标签里某个属性的值，引号用单的、双的、不用都认 */
function attr(tag: string, name: string): string {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return clean(m?.[1] ?? m?.[2] ?? m?.[3], 2000);
}

/**
 * 从网页里找出候选的图标地址，最清楚的排前面：
 *   <link rel="apple-touch-icon">  一般是 180×180 的大图，最适合做 logo
 *   <link rel="icon" sizes="…">    按标注的尺寸排
 *   /favicon.ico                    几乎每个网站都有，放最后兜底
 * SVG 不要：它里面可以带脚本，存下来再提供给浏览器不安全。
 */
function iconCandidates(html: string, base: URL): string[] {
  const found: { href: string; size: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = attr(tag, "rel").toLowerCase();
    const href = attr(tag, "href");
    if (!href || !/(^|\s)(icon|apple-touch-icon(-precomposed)?)(\s|$)/.test(rel)) continue;
    if (/svg/i.test(attr(tag, "type")) || /\.svg([?#]|$)/i.test(href) || href.startsWith("data:")) continue;
    const declared = Number(/(\d+)x\d+/i.exec(attr(tag, "sizes"))?.[1] ?? 0);
    found.push({ href, size: declared || (rel.includes("apple") ? 180 : 16) });
  }
  found.sort((a, b) => b.size - a.size);
  const urls: string[] = [];
  for (const href of [...found.slice(0, 4).map((f) => f.href), "/favicon.ico"]) {
    try {
      const u = new URL(href, base).href;
      if (!urls.includes(u)) urls.push(u);
    } catch {
      /* 写错的地址，跳过 */
    }
  }
  return urls;
}

/**
 * 导航页上的名称要短。网页标题常常是"知乎 - 有问题，就会有答案"这种带口号的，
 * 所以优先用网站自己声明的名字（og:site_name），没有就取标题里第一个分隔符之前的部分。
 */
function siteName(html: string, url: URL): string {
  const declared = clean(metaContent(html, "og:site_name") ?? metaContent(html, "application-name"), 60);
  if (declared) return declared;
  const title = pageTitle(html);
  const short = (title.split(/\s+[-–—|·•:：]\s+|[|_｜]/)[0] || title).trim();
  if (short && short.length <= 16) return short;
  // 标题还是太长（或者没有标题）：用域名里最有辨识度的那一段，比如 www.bilibili.com → bilibili
  const labels = url.hostname.replace(/^www\./, "").split(".");
  const tldParts = labels.length > 2 && /^(com|net|org|gov|edu|co|ac)$/.test(labels[labels.length - 2]) ? 2 : 1;
  return labels[labels.length - 1 - tldParts] ?? short.slice(0, 60);
}

async function download(url: string, timeoutMs: number): Promise<Uint8Array | null> {
  try {
    const got = await safeFetch(url, "image/*,*/*;q=0.5", timeoutMs);
    if (!got) return null;
    if (!got.res.ok) {
      got.res.body?.cancel().catch(() => {});
      return null;
    }
    // 多读一个字节：读满了说明文件超过上限，不要
    const bytes = await readHead(got.res, ICON_MAX_BYTES + 1);
    return bytes.byteLength > ICON_MAX_BYTES ? null : bytes;
  } catch {
    return null;
  }
}

/**
 * 去一个网站取回它的标题和图标。哪样拿不到，哪样就是空的（title: ""，icon: null），不抛错。
 * 图标已经存到硬盘上，返回的是文件名；调用的人如果最后没用上，要自己 removeIcon。
 */
export async function fetchSiteInfo(rawUrl: string): Promise<{ title: string; icon: string | null }> {
  const deadline = Date.now() + BUDGET_MS;
  const left = () => Math.max(deadline - Date.now(), 0);

  const page = await fetchHtml(rawUrl, 6000);
  const title = page ? siteName(page.html, page.url) : "";
  // 网页本身打不开时，仍然试一下 /favicon.ico：有的网站首页要登录，图标却能直接拿
  const candidates = page ? iconCandidates(page.html, page.url) : iconCandidates("", new URL(rawUrl));

  for (const url of candidates) {
    if (left() < 500) break;
    const bytes = await download(url, Math.min(left(), page ? 5000 : 3000));
    const icon = bytes && saveIcon(bytes);
    if (icon) return { title, icon };
  }
  return { title, icon: null };
}
