/**
 * 平台识别表：看一个网址的域名，认出它是哪个平台的、在那个平台上是不是一个视频、适合放进「网址」的哪个分类。
 * 全靠规则，不用 AI：域名和网址的写法是确定的东西，查表又快又准。认不出的平台就不贴标签、不猜分类。
 * 想多认一个平台，在下面加一行就行。
 */
type Platform = {
  /** 显示在标签上的名字 */
  name: string;
  /** 这个平台的域名，子域名自动算在内（bilibili.com 也匹配 www.bilibili.com、m.bilibili.com） */
  hosts: string[];
  /** 拖进来一个这个平台的网址时，「网址」页面默认放进哪个分类 */
  category?: string;
  /** 这个平台上，什么样的网址是一个视频：true = 全部都是；正则 = 路径（含查询参数）符合才是 */
  video?: true | RegExp;
};

const PLATFORMS: Platform[] = [
  // ---- 视频 ----
  { name: "B站", hosts: ["bilibili.com"], category: "视频", video: /^\/(video|bangumi\/play)\// },
  { name: "B站", hosts: ["b23.tv"], category: "视频", video: true }, // 短链接，分享出来的基本都是视频
  { name: "YouTube", hosts: ["youtube.com"], category: "视频", video: /^\/(watch\?|shorts\/|live\/|embed\/)/ },
  { name: "YouTube", hosts: ["youtu.be"], category: "视频", video: true },
  { name: "抖音", hosts: ["v.douyin.com", "iesdouyin.com"], category: "视频", video: true },
  { name: "抖音", hosts: ["douyin.com"], category: "视频", video: /^\/(video|note)\/|[?&]modal_id=/ },
  { name: "快手", hosts: ["v.kuaishou.com"], category: "视频", video: true },
  { name: "快手", hosts: ["kuaishou.com"], category: "视频", video: /^\/(short-video|f)\// },
  { name: "西瓜视频", hosts: ["ixigua.com"], category: "视频", video: /^\/\d+/ },
  { name: "腾讯视频", hosts: ["v.qq.com"], category: "视频", video: /^\/x\/(cover|page)\// },
  { name: "爱奇艺", hosts: ["iqiyi.com"], category: "视频", video: /^\/v_/ },
  { name: "优酷", hosts: ["youku.com"], category: "视频", video: /^\/(v_show|video)\// },
  { name: "AcFun", hosts: ["acfun.cn"], category: "视频", video: /^\/v\/ac/ },
  { name: "Vimeo", hosts: ["vimeo.com"], category: "视频", video: /^\/(\d+|channels\/[^/]+\/\d+)/ },
  { name: "TikTok", hosts: ["tiktok.com"], category: "视频", video: /\/video\/\d+/ },
  { name: "Twitch", hosts: ["twitch.tv"], category: "视频", video: /^\/videos\// },
  // ---- 社区、内容 ----
  { name: "微信公众号", hosts: ["mp.weixin.qq.com"], category: "阅读" },
  { name: "微博", hosts: ["video.weibo.com"], category: "社区", video: true },
  { name: "微博", hosts: ["weibo.com", "weibo.cn"], category: "社区", video: /^\/tv\// },
  { name: "知乎", hosts: ["zhihu.com"], category: "社区", video: /^\/zvideo\// },
  { name: "小红书", hosts: ["xiaohongshu.com", "xhslink.com"], category: "社区" },
  { name: "豆瓣", hosts: ["douban.com"], category: "社区" },
  { name: "贴吧", hosts: ["tieba.baidu.com"], category: "社区" },
  { name: "X", hosts: ["x.com", "twitter.com"], category: "社区" },
  { name: "Reddit", hosts: ["reddit.com"], category: "社区" },
  { name: "V2EX", hosts: ["v2ex.com"], category: "社区" },
  { name: "Medium", hosts: ["medium.com"], category: "阅读" },
  { name: "少数派", hosts: ["sspai.com"], category: "阅读" },
  // ---- 开发 ----
  { name: "GitHub", hosts: ["github.com"], category: "开发" },
  { name: "Gitee", hosts: ["gitee.com"], category: "开发" },
  { name: "Stack Overflow", hosts: ["stackoverflow.com"], category: "开发" },
  { name: "掘金", hosts: ["juejin.cn"], category: "开发" },
  { name: "CSDN", hosts: ["csdn.net"], category: "开发" },
  { name: "博客园", hosts: ["cnblogs.com"], category: "开发" },
  { name: "思否", hosts: ["segmentfault.com"], category: "开发" },
  { name: "MDN", hosts: ["developer.mozilla.org"], category: "开发" },
  { name: "npm", hosts: ["npmjs.com"], category: "开发" },
  { name: "力扣", hosts: ["leetcode.cn", "leetcode.com"], category: "开发" },
  // ---- AI ----
  { name: "Claude", hosts: ["claude.ai", "claude.com", "anthropic.com"], category: "AI" },
  { name: "ChatGPT", hosts: ["chatgpt.com", "openai.com"], category: "AI" },
  { name: "Gemini", hosts: ["gemini.google.com"], category: "AI" },
  { name: "DeepSeek", hosts: ["deepseek.com"], category: "AI" },
  { name: "豆包", hosts: ["doubao.com"], category: "AI" },
  { name: "Kimi", hosts: ["kimi.com", "kimi.moonshot.cn"], category: "AI" },
  { name: "通义", hosts: ["tongyi.com", "tongyi.aliyun.com"], category: "AI" },
  // ---- 设计 ----
  { name: "Figma", hosts: ["figma.com"], category: "设计" },
  { name: "Dribbble", hosts: ["dribbble.com"], category: "设计" },
  { name: "Behance", hosts: ["behance.net"], category: "设计" },
  { name: "Pinterest", hosts: ["pinterest.com"], category: "设计" },
  { name: "花瓣", hosts: ["huaban.com"], category: "设计" },
  { name: "站酷", hosts: ["zcool.com.cn"], category: "设计" },
  { name: "Unsplash", hosts: ["unsplash.com"], category: "设计" },
  // ---- 办公、工具 ----
  { name: "Notion", hosts: ["notion.so", "notion.com"], category: "办公" },
  { name: "飞书", hosts: ["feishu.cn", "larksuite.com"], category: "办公" },
  { name: "语雀", hosts: ["yuque.com"], category: "办公" },
  { name: "腾讯文档", hosts: ["docs.qq.com"], category: "办公" },
  { name: "石墨文档", hosts: ["shimo.im"], category: "办公" },
  { name: "Gmail", hosts: ["mail.google.com"], category: "办公" },
  { name: "QQ邮箱", hosts: ["mail.qq.com"], category: "办公" },
  { name: "网易邮箱", hosts: ["mail.163.com", "mail.126.com"], category: "办公" },
  { name: "Outlook", hosts: ["outlook.com", "outlook.live.com", "outlook.office.com"], category: "办公" },
  // ---- 搜索 ----
  { name: "Google", hosts: ["google.com"], category: "搜索" },
  { name: "百度", hosts: ["baidu.com"], category: "搜索" },
  { name: "必应", hosts: ["bing.com"], category: "搜索" },
  // ---- 购物 ----
  { name: "淘宝", hosts: ["taobao.com", "tmall.com"], category: "购物" },
  { name: "京东", hosts: ["jd.com"], category: "购物" },
  { name: "拼多多", hosts: ["pinduoduo.com", "yangkeduo.com"], category: "购物" },
  { name: "亚马逊", hosts: ["amazon.com", "amazon.cn"], category: "购物" },
  // ---- 音乐 ----
  { name: "网易云音乐", hosts: ["music.163.com"], category: "音乐" },
  { name: "QQ音乐", hosts: ["y.qq.com"], category: "音乐" },
  { name: "Spotify", hosts: ["spotify.com"], category: "音乐" },
  // ---- 学习 ----
  { name: "中国大学MOOC", hosts: ["icourse163.org"], category: "学习" },
  { name: "Coursera", hosts: ["coursera.org"], category: "学习" },
  { name: "维基百科", hosts: ["wikipedia.org"], category: "学习" },
];

// 域名长的先比：mail.google.com 要先于 google.com 匹配上，v.qq.com 先于其他 qq.com 的
const BY_HOST = PLATFORMS.flatMap((p) => p.hosts.map((host) => ({ host, p }))).sort((a, b) => b.host.length - a.host.length);

function find(rawUrl: string): { p: Platform; url: URL } | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const hit = BY_HOST.find((e) => host === e.host || host.endsWith("." + e.host));
  return hit ? { p: hit.p, url } : null;
}

/** 这个网址来自哪个平台，认不出返回空字符串 */
export const platformName = (rawUrl: string) => find(rawUrl)?.p.name ?? "";

/** 这个网址适合放进「网址」的哪个分类，认不出返回空字符串 */
export const platformCategory = (rawUrl: string) => find(rawUrl)?.p.category ?? "";

/** 这个网址是不是某个视频平台上的一个视频（而不是那个平台的首页、个人主页之类） */
export function isVideoPage(rawUrl: string): boolean {
  const hit = find(rawUrl);
  if (!hit?.p.video) return false;
  return hit.p.video === true || hit.p.video.test(hit.url.pathname + hit.url.search);
}
