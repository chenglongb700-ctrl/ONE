import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 给一个网址，抓回网页的标题和简介（收藏网址时自动填标题用）。
 * 抓不到就返回空字符串，不抛错：标题填不上只是小事，用户可以自己写。
 */
export type PageMeta = { title: string; description: string };

const MAX_BYTES = 300 * 1024; // 标题都在网页开头，读前 300 KB 足够
const TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 4;

// 这个接口会让服务器替用户去访问一个地址。为了不被用来探测本机或局域网里的服务，
// 只允许访问公网地址：回环、局域网、链路本地这些一律拒绝。
function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

async function isPublicHost(hostname: string): Promise<boolean> {
  const host = hostname.replace(/^\[|\]$/g, "");
  try {
    const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** 最多读 max 字节，读够就断开，不把整个大文件下载下来 */
export async function readHead(res: Response, max = MAX_BYTES): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return Buffer.concat(chunks).subarray(0, max);
}

/** 不少中文网站还在用 GBK 编码：先看响应头，再看网页里的 <meta charset>，都没有就按 UTF-8 */
export function decodeHtml(bytes: Uint8Array, contentType: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  const fromMeta = /<meta[^>]+charset=["']?\s*([\w-]+)/i.exec(Buffer.from(bytes.subarray(0, 4096)).toString("latin1"))?.[1];
  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      /* 不认识的编码名，试下一个 */
    }
  }
  return "";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const clean = (s: string | undefined, max: number) =>
  (s ?? "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? m;
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** 取 <meta property="og:title" content="..."> 这类标签的内容，属性顺序不固定所以两种都试 */
export function metaContent(html: string, key: string): string | undefined {
  const a = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i").exec(html)?.[1];
  return a ?? new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${key}["']`, "i").exec(html)?.[1];
}

/**
 * 替用户去访问一个公网地址。自己一步步跟随跳转：每跳一次都重新检查目标是不是公网地址。
 * 返回最后的响应和最终地址（相对路径要以它为准）；不允许访问、跳转太多次时返回 null。超时、域名不存在等会抛错。
 */
export async function safeFetch(rawUrl: string | URL, accept: string, timeoutMs = TIMEOUT_MS): Promise<{ res: Response; url: URL } | null> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(url.protocol) || !(await isPublicHost(url.hostname))) return null;
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; bookmark-title-fetcher)", Accept: accept, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
    });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) return { res, url };
    res.body?.cancel().catch(() => {});
    url = new URL(next, url);
  }
  return null;
}

/** 抓回一个网页的 HTML（只读开头的 300 KB）和它的最终地址；不是网页或者抓不到时返回 null */
export async function fetchHtml(rawUrl: string, timeoutMs = TIMEOUT_MS): Promise<{ html: string; url: URL } | null> {
  try {
    const got = await safeFetch(rawUrl, "text/html,application/xhtml+xml", timeoutMs);
    if (!got) return null;
    const type = got.res.headers.get("content-type") ?? "";
    if (!got.res.ok || !/html|xml/i.test(type)) {
      got.res.body?.cancel().catch(() => {});
      return null;
    }
    return { html: decodeHtml(await readHead(got.res), type), url: got.url };
  } catch {
    return null; // 超时、域名不存在、证书错误等等
  }
}

export const pageTitle = (html: string) => clean(metaContent(html, "og:title") ?? /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1], 200);

export async function fetchPageMeta(rawUrl: string): Promise<PageMeta> {
  const page = await fetchHtml(rawUrl);
  if (!page) return { title: "", description: "" };
  return {
    title: pageTitle(page.html),
    description: clean(metaContent(page.html, "description") ?? metaContent(page.html, "og:description"), 300),
  };
}
