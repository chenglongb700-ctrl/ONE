import { clean, readHead, safeFetch } from "./pageMeta.js";

/**
 * GitHub 今天最热的项目。
 * GitHub 没有提供"热门榜"的接口，这里读的是它公开的 Trending 网页（github.com/trending），从 HTML 里把项目挑出来。
 * 一页只有十几个项目，所以把"所有语言"和下面这些主流语言的榜单都读一遍，合在一起，
 * 按"今天新增了多少星标"从高到低排，取前 50 个。
 * 注意：这是在解析网页，GitHub 哪天改了页面的写法，这里就要跟着改。
 */
export type TrendingRepo = {
  fullName: string; // owner/repo
  description: string;
  language: string;
  stars: number;
  forks: number;
  starsToday: number;
  category: string;
};

export const TOP_N = 50;
const MAX_BYTES = 3 * 1024 * 1024; // 一页大约 500 KB
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
// 空字符串 = 不分语言的总榜。写法就是 Trending 网址里的那一段（C# 要写成 c%23）
const LANGUAGES = ["", "python", "typescript", "javascript", "go", "rust", "java", "c++", "c", "c%23", "swift", "kotlin", "shell", "html", "jupyter-notebook", "php"];

const num = (s: string | undefined) => Number((s ?? "").replace(/[^\d]/g, "")) || 0;
const plain = (html: string | undefined, max: number) => clean((html ?? "").replace(/<[^>]*>/g, " "), max);

/** 从一页 Trending 的 HTML 里把项目挑出来。每个项目是一个 <article class="Box-row"> */
export function parseTrending(html: string): Omit<TrendingRepo, "category">[] {
  const repos: Omit<TrendingRepo, "category">[] = [];
  for (const raw of html.split(/<article\b[^>]*>/).slice(1)) {
    const art = raw.split("</article>")[0].replace(/<svg\b[\s\S]*?<\/svg>/g, ""); // 图标是内嵌的 SVG，先去掉，后面好找数字
    // 项目名在标题 <h2> 里的链接上：href="/owner/repo"
    const fullName = /<h2\b[\s\S]*?href="\/([\w.-]+\/[\w.-]+)"/.exec(art)?.[1];
    if (!fullName) continue;
    repos.push({
      fullName,
      description: plain(/<p\b[^>]*>([\s\S]*?)<\/p>/.exec(art)?.[1], 300),
      language: plain(/itemprop="programmingLanguage"[^>]*>([^<]*)</.exec(art)?.[1], 30),
      stars: num(/\/stargazers"[^>]*>([\s\S]*?)<\/a>/.exec(art)?.[1]),
      forks: num(/\/forks"[^>]*>([\s\S]*?)<\/a>/.exec(art)?.[1]),
      starsToday: num(/([\d,]+)\s+stars?\s+today/.exec(art)?.[1]),
    });
  }
  return repos;
}

// ---------- 分类 ----------
// 看项目名、简介里有没有某一类的关键词，从上往下，第一个对上的就是它的分类；都对不上归"其他"。
// 全靠关键词，不用 AI，所以会有分错的时候——想调整就改下面的词表。
// 英文关键词按"整个单词"匹配（ai 不会匹配到 maintain），中文直接看有没有这几个字。
const word = (...words: string[]) => new RegExp(`(?<![a-z0-9])(${words.join("|")})(?![a-z0-9])`, "i");

const CATEGORIES: { name: string; test: RegExp[] }[] = [
  {
    name: "AI",
    test: [
      word("ai", "llms?", "gpt", "agents?", "agentic", "rag", "mcp", "machine learning", "deep learning", "neural", "transformers?", "diffusion", "chatbot", "copilot", "claude", "openai", "gemini", "ollama", "langchain", "prompts?", "inference", "embeddings?", "fine-?tun\\w*", "text-to-\\w+", "speech", "tts", "generative", "ml", "nlp", "computer vision", "skills?", "codex", "reinforcement learning", "vision-language", "multimodal"),
      /大模型|智能体|人工智能|机器学习|深度学习|提示词|神经网络/,
    ],
  },
  {
    name: "学习资源",
    test: [word("awesome", "tutorials?", "courses?", "roadmaps?", "interviews?", "books?", "guides?", "cheat ?sheets?", "curated", "curriculum", "handbook", "primer", "learn\\w*", "beginners?", "from scratch", "exercises", "papers?", "public apis"), /教程|面试|学习|指南|笔记|入门|资料|题库|课程/],
  },
  { name: "安全", test: [word("security", "pentest\\w*", "vulnerabilit\\w+", "exploits?", "malware", "osint", "hacking", "hackers?", "ctf", "privacy", "encryption", "reverse engineering", "forensics", "red team", "firewall", "antivirus", "password"), /安全|渗透|漏洞|逆向/] },
  { name: "数据", test: [word("databases?", "sql", "postgres\\w*", "mysql", "sqlite", "redis", "mongodb", "vector db", "analytics", "data pipelines?", "etl", "big data", "data engineering", "olap", "warehouse", "spreadsheets?", "dashboards?", "visuali[sz]ation", "scrap\\w+", "crawler"), /数据库|数据分析|爬虫|可视化/] },
  { name: "运维与云", test: [word("kubernetes", "k8s", "docker", "containers?", "devops", "cloud", "infrastructure", "terraform", "monitoring", "observability", "self-?hosted", "deploy\\w*", "ci/cd", "proxy", "vpn", "networking", "homelab", "serverless", "nas", "backup"), /运维|部署|容器|云原生|代理|自托管/] },
  { name: "移动与桌面", test: [word("android", "ios", "flutter", "react native", "swiftui", "electron", "tauri", "desktop app\\w*", "macos", "windows app\\w*", "mobile app\\w*", "iphone", "ipad", "wearable"), /安卓|桌面端|移动端|小程序|客户端/] },
  { name: "前端", test: [word("react", "vue", "svelte", "angular", "next\\.?js", "css", "tailwind\\w*", "ui", "components?", "frontend", "front-end", "design systems?", "animations?", "web app\\w*", "browser", "html", "icons?", "charts?", "wysiwyg", "editor framework"), /前端|组件库|界面/] },
  { name: "后端", test: [word("api", "apis", "server", "backend", "back-end", "frameworks?", "microservices?", "grpc", "http", "orm", "web framework", "graphql", "rest", "websocket", "message queue", "auth\\w*", "payments?"), /后端|框架|微服务|网关/] },
  { name: "游戏与多媒体", test: [word("games?", "gaming", "game engine", "video", "audio", "music", "images?", "3d", "graphics", "player", "render\\w*", "streaming", "podcast", "photo\\w*", "emulators?", "minecraft"), /游戏|视频|音频|音乐|图片|播放器/] },
  { name: "系统与底层", test: [word("operating system", "os", "kernel", "embedded", "firmware", "drivers?", "virtual machine", "hypervisor", "compilers?", "interpreters?", "runtime", "wasm", "webassembly", "bootloader", "filesystem", "low-level", "programming language"), /操作系统|内核|嵌入式|编译器|驱动/] },
  { name: "开发工具", test: [word("cli", "terminal", "editor", "ide", "vscode", "vs code", "neovim", "vim", "plugins?", "extensions?", "linter", "formatter", "debugger", "git", "shell", "sdk", "library", "toolkit", "tools?", "utility", "utilities", "automation", "workflow", "productivity", "dotfiles", "package manager", "testing"), /工具|命令行|插件|效率|自动化/] },
];

export const CATEGORY_NAMES = [...CATEGORIES.map((c) => c.name), "其他"];

export function categorize(repo: Pick<TrendingRepo, "fullName" | "description">): string {
  // 项目名里的连字符、下划线换成空格：awesome-llm-apps → awesome llm apps，这样能按单词匹配
  const text = `${repo.fullName.replace(/[/_.-]+/g, " ")} ${repo.description}`;
  return CATEGORIES.find((c) => c.test.some((re) => re.test(text)))?.name ?? "其他";
}

// ---------- 抓取 ----------
async function fetchPage(language: string): Promise<Omit<TrendingRepo, "category">[]> {
  const url = `https://github.com/trending${language ? `/${language}` : ""}?since=daily`;
  const got = await safeFetch(url, "text/html", TIMEOUT_MS);
  if (!got?.res.ok) {
    got?.res.body?.cancel().catch(() => {});
    throw new Error(`HTTP ${got?.res.status ?? "blocked"}`);
  }
  return parseTrending(new TextDecoder().decode(await readHead(got.res, MAX_BYTES)));
}

/**
 * 读回今天的热门榜：把各个语言的榜单合并、去重，按今天新增的星标数排，取前 50 并分好类。
 * failed 是没读到的页数；一页都没读到（网络不通，或者 GitHub 改了页面）时抛错。
 */
export async function fetchTrending(): Promise<{ repos: TrendingRepo[]; pages: number; failed: number }> {
  const byName = new Map<string, Omit<TrendingRepo, "category">>();
  let failed = 0;
  const queue = [...LANGUAGES];
  const worker = async () => {
    for (let lang = queue.shift(); lang !== undefined; lang = queue.shift()) {
      try {
        // 同一个项目会同时出现在总榜和它那个语言的榜上，留一份就够
        for (const r of await fetchPage(lang)) if (!byName.has(r.fullName)) byName.set(r.fullName, r);
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (byName.size === 0) throw new Error(failed === LANGUAGES.length ? "连不上 GitHub" : "GitHub 的热门页面读回来了，但没能从里面找到项目（可能是它改版了）");

  const repos = [...byName.values()]
    .sort((a, b) => b.starsToday - a.starsToday || b.stars - a.stars)
    .slice(0, TOP_N)
    .map((r) => ({ ...r, category: categorize(r) }));
  return { repos, pages: LANGUAGES.length, failed };
}
