import { XMLParser } from "fast-xml-parser";
import { clean, fetchHtml, readHead, safeFetch } from "./pageMeta.js";
import { attr } from "./siteIcon.js";

/**
 * 读取一个新闻来源。新闻网站大多提供一个"订阅地址"，内容是 XML 格式的文章列表，常见三种写法：
 *   RSS 2.0   <rss><channel><item>…          最常见
 *   Atom      <feed><entry>…                 Google、The Verge 等在用
 *   RSS 1.0   <rdf:RDF><item>…               老格式，偶尔还能见到
 * 这里把三种都整理成同一个样子（FeedItem），后面的代码就不用管来源用的是哪种了。
 */
export type FeedItem = { guid: string; title: string; url: string; summary: string; publishedAt: string | null };
export type ParsedFeed = { title: string; siteUrl: string; items: FeedItem[] };

/** 读取失败时抛出，message 是可以直接显示给用户看的中文原因 */
export class FeedError extends Error {}

const MAX_BYTES = 5 * 1024 * 1024; // 有的来源把几年的旧文章都放在一个文件里，所以上限给得宽一些
const MAX_ITEMS = 30; // 每次只要最新的这么多条
const TIMEOUT_MS = 12_000;
const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5";

const parser = new XMLParser({
  ignoreAttributes: false, // Atom 的链接写在属性里：<link href="…"/>
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false, // 标题"2026"保持是字符串，不要变成数字
  trimValues: true,
});

type Node = Record<string, unknown>;
const asArray = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** 一个标签的文字。解析器给的可能是字符串，也可能是 { "#text": "…", "@_type": "html" } 这种带属性的对象 */
function text(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") return text((v as Node)["#text"]);
  return String(v);
}

/** 把一段 HTML 变成纯文字：去掉标签，还原 &amp; 这类转义，压掉多余的空白。存进数据库的只有纯文字 */
const plain = (html: unknown, max: number) =>
  clean(
    text(html)
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]*>/g, " "),
    max,
  );

/** 只认 http / https 的链接，其他的（javascript: 之类）一律当作没有 */
function httpUrl(raw: unknown, base?: string): string {
  try {
    const u = new URL(text(raw).trim(), base);
    return /^https?:$/.test(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
}

/** 各种写法的时间 → ISO 格式；看不懂的、或者比现在还晚的（来源写错了）返回 null，由调用的人用"现在"代替 */
function isoDate(raw: unknown): string | null {
  const t = Date.parse(text(raw));
  return Number.isFinite(t) && t <= Date.now() + 3_600_000 ? new Date(t).toISOString() : null;
}

/** Atom 的 <link> 可以有好几个：要 rel="alternate"（或者没写 rel）的那个，它才是给人看的网页 */
function atomLink(links: unknown, base?: string): string {
  const list = asArray(links as Node | Node[]);
  const pick = list.find((l) => typeof l === "object" && (!l["@_rel"] || l["@_rel"] === "alternate")) ?? list[0];
  return typeof pick === "object" && pick ? httpUrl(pick["@_href"], base) : httpUrl(pick, base);
}

export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new FeedError("这个地址的内容不是有效的 RSS");
  }
  const rss = (doc.rss as Node | undefined)?.channel as Node | undefined;
  const rdf = doc["rdf:RDF"] as Node | undefined;
  const atom = doc.feed as Node | undefined;

  let title: string;
  let siteUrl: string;
  let items: FeedItem[];
  if (rss || rdf) {
    const channel = (rss ?? rdf!.channel ?? {}) as Node;
    title = plain(channel.title, 100);
    // <channel> 里可能同时有 <link> 和 <atom:link>，解析出来是数组，取第一个文字形式的
    siteUrl = httpUrl(asArray(channel.link).find((l) => typeof l !== "object") ?? "", feedUrl);
    items = asArray((rss ? rss.item : rdf!.item) as Node | Node[]).map((it) => {
      const url = httpUrl(asArray(it.link).find((l) => typeof l !== "object") ?? text(it.guid), feedUrl);
      return {
        guid: text(it.guid) || url || text(it.title),
        title: plain(it.title, 300),
        url,
        summary: plain(it.description ?? it["content:encoded"], 400),
        publishedAt: isoDate(it.pubDate ?? it["dc:date"]),
      };
    });
  } else if (atom) {
    title = plain(atom.title, 100);
    siteUrl = atomLink(atom.link, feedUrl);
    items = asArray(atom.entry as Node | Node[]).map((e) => {
      const url = atomLink(e.link, feedUrl);
      return {
        guid: text(e.id) || url || text(e.title),
        title: plain(e.title, 300),
        url,
        summary: plain(e.summary ?? e.content, 400),
        publishedAt: isoDate(e.published ?? e.updated),
      };
    });
  } else {
    throw new FeedError("这个地址不是 RSS 订阅地址");
  }

  // 没有标题或者没有链接的条目没法显示，丢掉；按时间从新到旧，只留最新的一批
  items = items
    .filter((i) => i.title && i.url && i.guid)
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, MAX_ITEMS);
  return { title, siteUrl, items };
}

/** XML 用的文字编码写在第一行（<?xml version="1.0" encoding="gb2312"?>），没写就看响应头，再没有就按 UTF-8 */
function decodeXml(bytes: Uint8Array, contentType: string): string {
  const fromDecl = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(Buffer.from(bytes.subarray(0, 200)).toString("latin1"))?.[1];
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  for (const label of [fromDecl, fromHeader, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      /* 不认识的编码名，试下一个 */
    }
  }
  return "";
}

/** 去读一个订阅地址。读不到、不是 RSS，都抛 FeedError */
export async function fetchFeed(url: string): Promise<ParsedFeed> {
  let got: Awaited<ReturnType<typeof safeFetch>>;
  try {
    got = await safeFetch(url, ACCEPT, TIMEOUT_MS);
  } catch {
    throw new FeedError("连不上这个地址（超时或者网站打不开）");
  }
  if (!got) throw new FeedError("这个地址不能访问（只能读公网上的 http / https 地址）");
  if (!got.res.ok) {
    got.res.body?.cancel().catch(() => {});
    throw new FeedError(`网站返回了错误（${got.res.status}）`);
  }
  let bytes: Uint8Array;
  try {
    bytes = await readHead(got.res, MAX_BYTES + 1);
  } catch {
    throw new FeedError("读到一半断开了");
  }
  if (bytes.byteLength > MAX_BYTES) throw new FeedError("这个来源的文件太大了");
  return parseFeed(decodeXml(bytes, got.res.headers.get("content-type") ?? ""), got.url.href);
}

/**
 * 用户填的可能是订阅地址，也可能只是网站的地址。先按订阅地址读；不是的话，去网页里找它声明的订阅地址
 * （<link rel="alternate" type="application/rss+xml" href="…">）再读一次。返回最终用的订阅地址和读到的内容。
 */
export async function resolveFeed(inputUrl: string): Promise<{ url: string; feed: ParsedFeed }> {
  let firstError: FeedError;
  try {
    return { url: inputUrl, feed: await fetchFeed(inputUrl) };
  } catch (err) {
    if (!(err instanceof FeedError)) throw err;
    firstError = err;
  }
  const page = await fetchHtml(inputUrl);
  for (const tag of page?.html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/alternate/i.test(attr(tag, "rel")) || !/(rss|atom)\+xml/i.test(attr(tag, "type"))) continue;
    const found = httpUrl(attr(tag, "href"), page!.url.href);
    if (!found || found === inputUrl) continue;
    try {
      return { url: found, feed: await fetchFeed(found) };
    } catch (err) {
      if (!(err instanceof FeedError)) throw err; // 这个不行就试网页里声明的下一个
    }
  }
  // 网页里没声明的（或者首页本身打不开的），再试几个最常见的订阅地址：同时去读，谁读得到用谁，按这里的先后顺序
  const guesses = ["/feed", "/rss", "/rss.xml", "/atom.xml", "/feed.xml", "/index.xml"].map((p) => new URL(p, page?.url ?? inputUrl).href);
  const tried = await Promise.allSettled(guesses.map((g) => fetchFeed(g)));
  const hit = tried.findIndex((r) => r.status === "fulfilled");
  if (hit >= 0) return { url: guesses[hit], feed: (tried[hit] as PromiseFulfilledResult<ParsedFeed>).value };
  throw page ? new FeedError("在这个网页里没有找到 RSS 订阅地址。可以去网站上找找「RSS」或「订阅」的链接，把那个地址填进来。") : firstError;
}
