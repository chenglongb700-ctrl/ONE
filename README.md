# 🌱 ONE · 个人管理

一个前后端 + 数据库齐全的个人管理网站，分为 **工作 / 生活 / 健身 / 随记 / 资讯 / GitHub 热门 / 收藏 / 网址 / 命令** 九大板块，底部带一个音乐播放器，支持多用户注册登录，数据按用户隔离。

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite + React Router + Tailwind CSS 4 |
| 后端 | Express 5 + TypeScript（tsx 运行）+ zod 参数校验 |
| 数据库 | SQLite（Node 内置 `node:sqlite`，无需安装数据库） |
| 鉴权 | bcrypt 密码加密 + JWT（httpOnly Cookie，7 天有效） |

## 功能

- **总览**：左边是今天要做的事（进行中和到期的工作、生活清单，都可以直接勾选），右边是日期、各项数字和最近的随记；下面还有三张小图：最近 14 天每天完成的任务和各状态的比例、最近 17 周每天的记录热力图（完成任务 + 记账 + 随记）、最近 30 天随记里的心情，鼠标移上去看具体数字
- **工作**：三列任务看板（待办 / 进行中 / 已完成），优先级、截止日期、逾期标红
- **生活**：生活清单（分类、日期、勾选完成）+ 记账（按月查看、收支汇总、支出分类占比）
- **健身**：帮自己减脂——填一次身高、年龄、活动量和目标体重，按公式估算基础代谢、每日消耗和建议摄入（不低于安全下限），算出离目标还差多少、大概哪天能到。五个标签：概览（进度、今天的热量、本周运动、体重曲线）、体重（可记腰围和体脂率，一天一条）、饮食（分四餐，内置约 90 种常见食物的热量，也可以手填，记过的会记住）、运动（按类型、时长和体重估算消耗，可手动改）、力量（动作 × 重量 × 次数 × 组数，能看每个动作的重量进步）。配好 AI 模型后可以让它点评最近 7 天的记录。所有数字都是估算，不是医疗建议
- **随记**：日记卡片，心情、标签筛选、全文搜索
- **资讯**：订阅新闻来源（RSS），把最新文章读回来按主题看——内置 13 个中英文来源（AI：量子位、OpenAI、Google AI、Hugging Face、TechCrunch、The Verge、Hacker News；科技：IT之家、爱范儿、少数派、Solidot；开发：InfoQ、开源中国）；按天分组，支持主题筛选、只看未读、搜索；打开页面时自动更新超过半小时没读过的来源；可以自己加来源（填 RSS 地址或网站地址）、停用、删除。配好 AI 模型后可以一键生成今天 / 本周 / 本月的中文简报
- **AI 助手**（每个页面右上角的 AI 按钮）：
  - **页面助手**：菜单第一项是当前页面自己的助手（总览、工作、生活、健身、随记、资讯、GitHub 热门、收藏、网址、命令各有一个），只看这个页面的内容，比"问我的数据"看得更细；每个都带几个一键提问，比如工作助手"今天先做哪几件"、命令助手"上下文太长了该怎么办"。只读，对话不保存
  - **记一笔**：用大白话写"早上称了 74.1；中午吃了黄焖鸡花了 28；晚上跑步 30 分钟；明天交报告"，AI 拆成任务、生活清单、记账、随记、体重、饮食、运动、力量训练的待确认记录，逐条可改、可取消，点保存才写入（走各功能自己的接口）
  - **问我的数据**：问"这个月花最多的是什么""最近体重变化怎么样"，AI 根据最近 90 天的记录回答。只读，对话不保存
  - 各页面里的小入口：资讯「翻译英文标题」和单篇「AI 摘要」、GitHub 热门「翻译英文简介」、随记「AI 建议标题和标签」、任务「AI 把它拆成几步」、饮食「让 AI 估一下热量」
  - 回答是**边写边显示**的（流式输出）：一两秒就能开始看。页面助手和问我的数据可以点「停止」，写了一半的留着；关掉窗口也会停，不再花钱。总结和健身点评写完才保存，写到一半关掉就不保存
  - 原则：AI 只提建议，要写进数据库的都先给你确认；只在你点按钮时调用；模型回来的内容都校验过才用。**调用时相关内容会发给你配置的模型服务**：记一笔发你写的那段话，问我的数据发最近 90 天记录的摘要，页面助手发这个页面的内容（窗口里写明具体是哪些），翻译和摘要发标题、简介或文章正文
- **桌宠「果冻团子」**：待在右下角的一团小果冻（原创形象，SVG 画的），按住可以拖到任何地方：拖着时丝滑跟手，用力一甩会滑出去，碰到窗口边弹回来、像果冻一样压扁再晃几下。会呼吸、眨眼，眼睛跟着鼠标转，闲着时偶尔蹦一下；3 分钟没动鼠标键盘就睡着，一动就醒
  - AI 在干活时它冒气泡说"在想怎么回答…""在写总结…"，写完说"好啦"，并告诉你这次用了多少 token
  - 提醒：任务逾期、今天截止、倒计时 3 天内到、今天还没称体重（填过健身资料才提醒）/ 还没写随记、AI 账户余额不到 1 元。每条一天只说一次，两条之间至少隔 15 分钟；点气泡直接跳到对应页面
  - 你记了东西它会高兴；按"一共记过几天"长大：小团子 → 冒芽团子（3 天）→ 开花团子（10 天）→ 星星团子（30 天）→ 皇冠团子（90 天）
  - 点它有菜单：连续记录天数、今天 AI 用了多少 token、AI 账户还剩多少钱（DeepSeek 有查余额的接口；别家查不到就不显示）、全部提醒、当前页面的 AI 助手、记一笔、摸摸它、让它躲起来。名字、颜色（8 种现成的，也可以自己挑）、大小（60%–160%）、显不显示在「设置」里改，存在这台电脑的浏览器里
  - 提醒和成长都是服务器在本机数据库里算的，不调用 AI、不花钱
- **AI 总结**：按一下按钮，让 AI 写一份每日 / 每周 / 每月的总结——总览页总结自己的记录（任务、收支、随记、生活清单），资讯页总结订阅的文章。写好的总结会存下来，可以重新生成。模型自己选：用的是 OpenAI 兼容接口，DeepSeek、通义千问、豆包、Kimi、智谱、本机 Ollama 都行，配置见下面「AI 模型」。**注意：生成时这段时间的记录会发给你配置的那家模型服务**
- **GitHub 热门**：GitHub 每天星标涨得最快的 50 个项目——读 GitHub Trending 的总榜和 15 种主流语言的榜单，合并后按当天新增星标数排名；按领域自动分类（AI、前端、开发工具…，关键词判断，不用 AI），可以按分类或按热度看，按语言筛选、搜索；每天的榜单保留 30 天，能回看，并标出新上榜的项目
- **收藏**：收三种东西——摘录（一段文字，可注明出处）、图片（选择文件或直接粘贴截图，单张最大 10 MB）、视频（贴 B 站、YouTube 等视频页面的链接，自动取标题和封面，B 站和 YouTube 可以直接在页面里播放；或者上传 MP4 / WebM / MOV 文件，单个最大 500 MB）；按分组和标签整理，支持搜索、置顶、按种类筛选（网址不放这里，统一放在「网址」）
- **网址**：常用网站的导航页——添加网址时服务器自动去对方网站取回 logo 和网站名（取不到就用名称的第一个字，也可以自己上传图标）；按分类分区显示，可以置顶、搜索，点一下在新标签页打开
- **命令**：Claude Code 斜杠命令速查表——内置 83 条常用命令的中文说明（整理自官方文档），按类别分组；点命令名复制，可以搜索（按 `/` 键直达搜索框）、标为常用、写自己的备注，也可以添加自己的命令；删掉的内置命令能一键恢复
- **倒计时**：每个页面右上角的一枚小胶囊，显示离某个日子还有多少天（填了时间的，最后一天精确到秒）；点开可以管理多个倒计时，自动显示最近的一个，也可以固定一个；过去的日子显示「已过 N 天」，可以当纪念日
- **拖进来自动归类**：把网址、一段文字、图片或视频文件从别处拖到网站的任何位置，松手后自动判断是什么并放好——视频平台的视频链接和视频文件进「收藏 › 视频」，图片进「收藏 › 图片」，其他网址进「网址」（认得出的平台顺便分好类），文字进「收藏 › 摘录」；收藏的卡片上会显示来自哪个平台（B 站、YouTube、知乎、GitHub…）。全靠规则判断，不接 AI
- **外观**：「琉璃」风格——一张铺满全屏的天空壁纸，所有面板都是透光的毛玻璃，大号细体数字；两套主题：黄昏（深色，默认）和晨曦（浅色），也可以跟随系统；全站只用一个强调色（默认琥珀金）
- **设置**：侧边栏底部的齿轮按钮。可以选主题、换强调色（琥珀金 / 钴蓝 / 青 / 暖橙 / 玫瑰红 / 紫罗兰）、调所有玻璃面板的通透度、开关音乐自动播放（这些偏好存在浏览器本地，改了立刻生效）；还可以上传头像（自动裁成正方形）和自定义壁纸（大图自动缩到长边 2560 像素），这两项存在服务器上，跟着账号走
- **音乐**：底部播放条，切换页面不中断。可以上传音频文件（mp3 / m4a / flac / wav 等，单个最大 100 MB）或添加音频链接；列表循环、单曲循环、随机播放；LRC 歌词滚动显示，点歌词跳转；频谱可视化（Web Audio）；可设置进入网站后第一次点击时自动播放

## 运行

需要 Node.js 22.5 及以上。

```bash
npm install
npm run dev
```

打开 http://localhost:5173 ，注册一个账号即可使用。

- 前端开发服务器：5173（`/api` 请求代理到后端）
- 后端 API：3001
- 数据库文件：`server/data/app.db`（首次启动自动创建）
- 上传的音乐、头像和收藏的图片、视频：`server/data/music/`、`server/data/avatars/`、`server/data/favorites/`、`server/data/wallpapers/`、`server/data/site-icons/`（不进 git，换电脑或备份时要和数据库一起带走）

### 生产部署

```bash
npm run build   # 构建前端到 client/dist
npm start       # 后端同时托管前端页面，访问 http://localhost:3001
```

登录密钥 `JWT_SECRET`：第一次启动时自动随机生成，写进项目根目录的 `.env`（不进 git），不用手动设；改掉它所有人都要重新登录。
后端默认只监听本机（127.0.0.1），同一个网络里的其他设备访问不了。要部署到外网时设置 `API_HOST`（例如 `0.0.0.0`），并先确认注册和登录的安全措施。其他可选：`API_PORT`（默认 3001）、`DB_PATH`。

### AI 模型

「AI 总结」需要一个模型。在项目根目录的 `.env` 里（网站第一次启动时已经自动建好，不会进 git）加上三项，然后重启网站。不要用 `.env.example` 整个覆盖 `.env`，那样会丢掉里面的登录密钥：

```
AI_BASE_URL=https://api.deepseek.com/v1   # 接口地址（OpenAI 兼容）
AI_API_KEY=你的密钥                        # 本机 Ollama 可以留空
AI_MODEL=deepseek-v4-flash                # 模型名
```

`.env.example` 里有几家常见服务的写法。没配置时功能照常显示，只是点开会提示还没配置。

## 目录

```
server/src/
  index.ts        Express 入口、错误处理、生产环境托管前端
  db.ts           SQLite 连接与建表
  auth.ts         注册 / 登录 / 登出 / me，requireAuth 中间件
  crud.ts         通用的按用户隔离的 CRUD 路由生成器
  routes/         tasks / life / expenses / journals / music / favorites / sites / commands / countdowns / drop / news / trending / summary / fitness / assist / avatar / wallpaper / stats
  images.ts       检查上传的文件是不是真的图片
  pageMeta.ts     安全地访问公网网页（只读开头一段，不访问内网地址）
  commandSeed.ts  内置的斜杠命令清单（每个账号第一次打开「命令」时抄一份）
  siteIcon.ts     取回网站的 logo 和名称（添加网址时用）
  platforms.ts    平台识别表：域名 → 平台名、是不是视频、默认分类（想多认一个平台在这里加一行）
  feeds.ts        读取并解析一个 RSS / Atom 订阅地址（用 fast-xml-parser），以及从网站地址找出它的订阅地址
  feedSeed.ts     内置的新闻来源清单（每个账号第一次打开「资讯」时抄一份）
  trending.ts     读取 GitHub Trending 网页、挑出项目、按关键词分类（分类的词表在这里）
  fitnessMath.ts  减脂用的估算公式（基础代谢、建议摄入等）；前端 client/src/fitness/math.ts 是同一份，改的时候两边一起改
  env.ts          读取 .env；没有登录密钥 JWT_SECRET 时随机生成一个写进去
  ai.ts           调用 AI 模型（OpenAI 兼容接口），读取 .env 里的 AI_BASE_URL / AI_API_KEY / AI_MODEL；chatJson 让模型回 JSON 并解析
  translate.ts    批量翻译成中文、从网页里取正文文字（资讯和热门的 AI 功能用）
  routes/pet.ts   桌宠要的数据：提醒、连续记录天数、成长阶段、AI 用量和余额
  aiUsage.ts      AI 用了多少 token（每次调用后记进 ai_usage 表，记在当前登录的人头上）、查账户余额
  aiStream.ts     流式返回：把模型边写边出的文字，一行一个 JSON 转给浏览器；浏览器断开就停止模型请求
  aiMaterial.ts   把记录整理成给 AI 看的文字材料：问我的数据用的总概要，和每个页面助手各自的材料与要求
client/src/
  api.ts          fetch 封装与类型定义
  context/        AuthContext 登录状态
  theme.ts        外观偏好：主题、强调色、玻璃通透度
  index.css       设计变量（配色、卡片和玻璃、深色模式映射）和通用样式
  components/     Layout 侧边栏、Settings 设置弹窗、Modal、SidePanel 右侧面板、Brand 标志等
  pet/            桌宠：Pet（位置、拖动、气泡、菜单、睡觉）、Blob（团子的 SVG）、physics（拖动、甩出去、撞墙反弹）、pet.css（动画）、prefs（名字、颜色、大小、位置）
  music/          MusicContext 播放状态、PlayerBar 播放条、Spectrum 频谱、lrc 歌词解析
  pages/          AuthPage / Dashboard / Work / Learning / Habits / Life / Journal / Favorites
```

## API

所有接口前缀 `/api`，除 `/auth/*` 外都需要登录。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` `/auth/login` `/auth/logout` | 账号 |
| GET | `/auth/me` | 当前用户 `{id, username, avatar}` |
| POST / DELETE | `/avatar` | 上传头像（multipart，字段名 `file`，PNG / JPG / WebP，最大 2 MB）/ 移除头像 |
| GET | `/avatar/file` | 读取自己的头像 |
| POST / DELETE | `/wallpaper` | 上传自定义壁纸（multipart，字段名 `file`，PNG / JPG / WebP，最大 8 MB）/ 恢复默认壁纸 |
| GET | `/wallpaper/file` | 读取自己的壁纸 |
| GET / POST | `/tasks` `/life` `/expenses` `/journals` | 列表 / 新建 |
| PUT / DELETE | `/tasks/:id` 等 | 修改（可只传部分字段）/ 删除 |
| GET | `/stats` | 首页统计 |
| GET | `/stats/charts` | 总览页三张图的数据 `{taskDays, taskStatus, activity, moods}` |
| GET / POST | `/music` | 歌单 / 添加音频链接 `{url, title?, artist?}` |
| POST | `/music/upload` | 上传音频文件（multipart，字段名 `file`） |
| PUT / DELETE | `/music/:id` | 改歌名、歌手、歌词 / 删除（连同文件） |
| GET | `/music/:id/file` | 播放上传的文件（支持 Range，可拖动进度） |
| GET / POST | `/favorites` | 收藏列表 / 新建摘录或视频链接 `{kind: "text" | "video", title, url, content, group, tags, pinned}` |
| POST | `/favorites/image` | 新建图片收藏（multipart，字段名 `file`，其余字段同上） |
| PUT / DELETE | `/favorites/:id` | 修改 / 删除（图片、视频、封面文件一并删除） |
| POST | `/favorites/video` | 上传视频文件（multipart，字段名 `file`，其余字段同上） |
| GET | `/favorites/:id/image`、`/favorites/:id/video`、`/favorites/:id/cover` | 读取收藏的图片 / 视频文件（支持拖动进度）/ 视频链接的封面 |
| GET / POST | `/commands` | 命令列表（第一次读取时自动填入内置命令）/ 新建 `{name, args, aliases, category, description, example, note, pinned}` |
| PUT / DELETE | `/commands/:id` | 修改（可只传部分字段）/ 删除 |
| POST | `/commands/restore` | 补回被删掉的内置命令，返回 `{added}` |
| GET / POST | `/sites` | 网址列表 / 添加 `{url, title, category, pinned}`（会去网站取 logo 和名称，最多约十秒） |
| PUT / DELETE | `/sites/:id` | 修改（可只传部分字段；换了网址会重新取 logo）/ 删除 |
| POST | `/sites/:id/icon/refresh` | 重新去网站取一次 logo |
| POST / GET | `/sites/:id/icon` | 上传自己的图标（multipart，字段名 `file`，最大 1 MB）/ 读取图标 |
| GET / POST | `/countdowns` | 倒计时列表 / 新建 `{title, date, time, pinned}`（`time` 可为空；`pinned` 同时只有一个） |
| PUT / DELETE | `/countdowns/:id` | 修改 / 删除 |
| POST | `/drop` | 拖进来自动归类：`{text}`（网址或文字）或 `{imageUrl, pageUrl}`（网页上的图片），返回 `{where, kind, title, platform, category}` |
| GET | `/news?topic=&unread=1&q=&offset=` | 文章列表（每次 40 条），返回 `{items, hasMore, unread}` |
| POST | `/news/refresh` | 重新读取来源：默认只读超过半小时没读过的，`{force: true}` 全部重读；返回 `{checked, added, failed}` |
| PUT | `/news/:id` | 标为已读 / 未读 `{read}` |
| POST | `/news/read-all` | 全部标为已读，可以只标某个主题 `{topic}` |
| GET / POST | `/news/feeds` | 来源列表 / 添加 `{url, title, topic}`（RSS 地址或网站地址，会当场读一次） |
| PUT / DELETE | `/news/feeds/:id` | 改名、换主题、停用 `{title, topic, enabled}` / 删除（文章一并删除） |
| POST | `/news/feeds/restore` | 补回被删掉的内置来源 |
| GET | `/trending?date=` | 某一天的 GitHub 热门榜（不传日期给最新的），返回 `{date, fetchedAt, items, dates, categories, stale}` |
| POST | `/trending/refresh` | 重新读取今天的榜单：默认只在今天还没有或已过 6 小时才读，`{force: true}` 一定读 |
| GET / PUT | `/fitness/profile` | 健身的个人资料 `{sex, birth_year, height_cm, activity, target_weight, weekly_loss}`；没填过时 GET 返回 null |
| GET | `/fitness/overview` | 健身概览要用的汇总：资料、起始和最新体重、体重序列、今天吃的和消耗的、本周运动、最近 14 天摄入、最近 8 周运动分钟 |
| GET / POST / PUT / DELETE | `/fitness/body` `/fitness/food` `/fitness/workouts` `/fitness/strength` | 体重、饮食、运动、力量训练记录的增删改查；体重同一天再 POST 是更新；饮食可以 `?date=` 只取某一天 |
| GET | `/fitness/food/mine` | 自己记过的食物（去重，最近用的在前） |
| GET | `/fitness/strength/progress?exercise=` | 某个动作每个训练日的最大重量 |
| GET / POST | `/fitness/review` | 读取最近一份 AI 点评 / 现在生成一份（看最近 7 天的记录；POST 是流式返回，见下面的说明） |
| GET | `/pet` | 桌宠要的数据：今天记了几条、连续记录天数、一共记过几天、成长阶段、提醒列表、今天 AI 用了多少 token 和账户余额 |
| GET | `/ai/status` | AI 模型配好了没有 `{configured, model}` |
| POST | `/ai/parse` | 把一段话 `{text}` 拆成待确认的记录 `{items, dropped}`；不写数据库 |
| POST | `/ai/ask` | 根据最近 90 天的记录回答问题 `{question, history}`；流式返回，最后一行 `{done, answer}` |
| POST | `/ai/page` | 某个页面的助手 `{page, question, history}`；流式返回，最后一行 `{done, answer}`；page 是 dashboard / work / life / fitness / journal / news / trending / favorites / sites / commands |
| POST | `/ai/food` `/ai/journal-suggest` `/ai/task-split` | 估一样食物的热量 / 给随记建议标题和标签 / 把任务拆成几步；都只返回建议 |
| POST | `/news/translate` | 把一批文章 `{ids}`（最多 40）的英文标题翻成中文并保存 |
| POST | `/news/:id/summary` | 读原文并写一段中文摘要，保存后返回 `{aiSummary}` |
| POST | `/trending/translate` | 把某一天 `{date}` 榜单里的英文简介翻成中文并保存 |
| GET | `/summary?kind=&period=` | 某种内容（`personal` 自己的记录 / `news` 资讯）某个时间段（`day` / `week` / `month`）已经生成的 AI 总结，返回 `{configured, model, range, summary}` |
| POST | `/summary` | 现在生成（或重新生成）一份 `{kind, period}`；流式返回，写完保存，最后一行 `{done, summary}` |

**流式返回**（上面标了"流式"的几个）：响应是 `application/x-ndjson`，一行一个 JSON——`{"t":"新写出来的一截"}` 写一截发一行，最后一行是 `{"done":true, …}`，中途出错是 `{"error":"原因"}`。参数不对、没配模型、正在忙这些还是普通的 4xx JSON。客户端断开连接，服务器就停止向模型的请求，也不保存。

## 下一步

功能构思见 [docs/IDEAS.md](docs/IDEAS.md)（交互版页面：`docs/ideas-board.html`）。
