/**
 * 内置的新闻来源。每个账号第一次打开「资讯」时抄一份进自己的 feeds 表，之后可以停用、删除、改主题。
 * 这些地址在 2026-11-15 实测都能读到。想多加一个内置来源，在这里加一行即可：
 * 用户在"管理来源"里点"恢复内置来源"时会补上自己还没有的。
 */
export const FEED_SEED: { topic: string; title: string; url: string; siteUrl: string }[] = [
  // ---- AI ----
  { topic: "AI", title: "量子位", url: "https://www.qbitai.com/feed", siteUrl: "https://www.qbitai.com/" },
  { topic: "AI", title: "OpenAI", url: "https://openai.com/news/rss.xml", siteUrl: "https://openai.com/news/" },
  { topic: "AI", title: "Google AI", url: "https://blog.google/technology/ai/rss/", siteUrl: "https://blog.google/technology/ai/" },
  { topic: "AI", title: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", siteUrl: "https://huggingface.co/blog" },
  { topic: "AI", title: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", siteUrl: "https://techcrunch.com/category/artificial-intelligence/" },
  { topic: "AI", title: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", siteUrl: "https://www.theverge.com/ai-artificial-intelligence" },
  // Hacker News 上标题带 AI、而且得分在 150 以上的帖子（hnrss.org 是给 Hacker News 生成 RSS 的第三方服务）
  { topic: "AI", title: "Hacker News · AI", url: "https://hnrss.org/newest?q=AI&points=150", siteUrl: "https://news.ycombinator.com/" },
  // ---- 科技 ----
  { topic: "科技", title: "IT之家", url: "https://www.ithome.com/rss/", siteUrl: "https://www.ithome.com/" },
  { topic: "科技", title: "爱范儿", url: "https://www.ifanr.com/feed", siteUrl: "https://www.ifanr.com/" },
  { topic: "科技", title: "少数派", url: "https://sspai.com/feed", siteUrl: "https://sspai.com/" },
  { topic: "科技", title: "Solidot", url: "https://www.solidot.org/index.rss", siteUrl: "https://www.solidot.org/" },
  // ---- 开发 ----
  { topic: "开发", title: "InfoQ 中文", url: "https://www.infoq.cn/feed", siteUrl: "https://www.infoq.cn/" },
  { topic: "开发", title: "开源中国", url: "https://www.oschina.net/news/rss", siteUrl: "https://www.oschina.net/news" },
];
