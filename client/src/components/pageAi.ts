/**
 * 每个页面自己的 AI 助手：名字、菜单里的一句说明、几个一点就问的问题，以及"会把什么发给模型"的说明。
 * key 要和服务器 server/src/aiMaterial.ts 里的 PAGES 对得上——那边决定这个页面给 AI 看哪些内容。
 */
export type PageAi = {
  key: string;
  name: string; // 页面名，助手叫「{name}助手」
  hint: string; // 菜单里的小字
  examples: string[]; // 一点就问
  sends: string; // 提问时发给模型的内容
};

const PAGE_AI: Record<string, PageAi> = {
  "": {
    key: "dashboard",
    name: "总览",
    hint: "今天先做什么、这周过得怎样、有什么落下了",
    examples: ["今天我该先做什么？", "这周过得怎么样？", "有什么事被我落下了？"],
    sends: "你最近 90 天的记录（任务、清单、收支、随记、健身）和倒计时",
  },
  work: {
    key: "work",
    name: "工作",
    hint: "排先后顺序、看哪些快到期、怎么拆",
    examples: ["今天先做哪几件？", "哪些任务逾期或快到期了？", "帮我排一下这周的顺序"],
    sends: "你所有没完成的任务（含描述）和最近 90 天完成的任务",
  },
  life: {
    key: "life",
    name: "生活",
    hint: "钱花在哪了、和上个月比、清单先办哪件",
    examples: ["这个月钱主要花在哪了？", "和上个月比花得多还是少？", "清单里哪些该先办？"],
    sends: "你的生活清单和最近 90 天的每一笔收支",
  },
  fitness: {
    key: "fitness",
    name: "健身",
    hint: "进度正不正常、吃得怎样、接下来怎么练",
    examples: ["我的减脂进度正常吗？", "最近吃得怎么样？", "下周怎么练比较好？"],
    sends: "你的健身资料、最近 90 天的体重和运动、最近 14 天吃的东西",
  },
  journal: {
    key: "journal",
    name: "随记",
    hint: "最近的心情、反复在想的事、帮你回顾",
    examples: ["最近我的心情怎么样？", "我最近反复在想什么？", "帮我回顾一下这个月"],
    sends: "你最近 90 天的随记（每篇正文的前 500 字）",
  },
  news: {
    key: "news",
    name: "资讯",
    hint: "今天值得看什么、按主题归纳、找某类新闻",
    examples: ["今天有什么值得看的？", "按主题归纳一下最近的新闻", "有哪些和 AI 有关的大事？"],
    sends: "最新 100 篇文章的标题和开头摘要（不含全文）",
  },
  trending: {
    key: "trending",
    name: "GitHub 热门",
    hint: "榜上有什么值得看、按方向归类、挑适合学的",
    examples: ["今天榜上有什么值得关注的？", "按方向给这些项目归个类", "有哪些适合拿来学习的项目？"],
    sends: "最近一天榜单上 50 个项目的名字、简介、语言和星标数",
  },
  favorites: {
    key: "favorites",
    name: "收藏",
    hint: "找收藏过的东西、看都收了些什么、怎么整理",
    examples: ["我收藏的东西主要是哪几类？", "有哪些可能已经忘了的？", "帮我想想怎么整理分组"],
    sends: "你收藏的标题、分组、标签、来源网站和内容开头（图片和视频本身不发）",
  },
  sites: {
    key: "sites",
    name: "网址",
    hint: "帮你想分类、找重复的、找某个网站",
    examples: ["帮我想想这些网址怎么分类", "有没有重复或很像的网址？", "这里面哪些是学习用的？"],
    sends: "你存的网址的名称、地址和分类",
  },
  commands: {
    key: "commands",
    name: "命令",
    hint: "说想做的事，帮你找对应的命令",
    examples: ["我想回到之前的某一步，用哪个命令？", "上下文太长了该怎么办？", "有哪些好用但我没标常用的命令？"],
    sends: "你的命令速查表（命令、说明、例子和你写的备注）",
  },
};

/** 按地址找到这个页面的助手；没有对应的页面就返回 undefined */
export const pageAiFor = (pathname: string): PageAi | undefined => PAGE_AI[pathname.split("/")[1] ?? ""];
