/**
 * 内置的 Claude Code 斜杠命令清单，整理自官方文档（2026-11）：
 *   https://code.claude.com/docs/en/commands
 * 每个账号第一次打开「命令」页面时，会把这份清单抄进自己的 commands 表，之后可以随意修改、删除、加备注。
 * 以后官方加了新命令，往这里加一行即可：用户点"恢复内置命令"时会补上自己还没有的。
 */
export type SeedCommand = {
  name: string;
  args?: string;
  aliases?: string;
  description: string;
  example?: string;
};

export const COMMAND_SEED: { category: string; items: SeedCommand[] }[] = [
  {
    category: "会话与上下文",
    items: [
      { name: "/clear", args: "[名字]", aliases: "/reset, /new", description: "清空上下文，开始一段新对话，项目记忆会保留。之前的对话可以用 /resume 找回。" },
      { name: "/compact", args: "[侧重点]", description: "把到目前为止的对话压缩成摘要，腾出上下文空间。可以加一句话说明摘要要侧重什么。", example: "/compact 重点保留数据库相关的决定" },
      { name: "/context", args: "[all]", description: "用彩色网格显示上下文被什么占用了，并给出优化建议。" },
      { name: "/resume", args: "[会话]", aliases: "/continue", description: "按 ID 或名字回到以前的对话；不带参数时打开会话列表。" },
      { name: "/rewind", aliases: "/checkpoint, /undo", description: "把对话和代码退回到之前的某个检查点，也可以从选中的消息开始做摘要。" },
      { name: "/branch", args: "[名字]", description: "从当前位置给对话开一个分支，换个方向试试。原对话保留，可以用 /resume 回去。" },
      { name: "/btw", args: "[问题]", description: "顺口问一个旁支问题，不计入对话历史。", example: "/btw 这个函数是哪次提交加的" },
      { name: "/recap", description: "生成一句话的当前会话摘要。" },
      { name: "/rename", args: "[名字]", description: "给当前会话改名；不写名字时根据对话内容自动起一个。" },
      { name: "/export", args: "[文件名]", description: "把当前对话导出成纯文本。带文件名直接写入文件，不带则选择复制或保存。" },
      { name: "/copy", args: "[N]", description: "复制 Claude 的上一条回复到剪贴板；/copy 2 复制倒数第二条。" },
      { name: "/diff", description: "查看工作区里的改动，包括 Claude 目前为止做的修改。" },
      { name: "/exit", aliases: "/quit", description: "退出命令行。在后台会话里是断开连接，会话继续运行。" },
    ],
  },
  {
    category: "模型与工作方式",
    items: [
      { name: "/model", args: "[模型]", description: "切换模型，并保存为新会话的默认值；不带参数时打开选择器。", example: "/model sonnet" },
      { name: "/effort", args: "[级别|auto|status]", description: "设置思考力度：low 到 xhigh、max，或者 auto；status 查看当前值。max 只对当前会话有效。", example: "/effort high" },
      { name: "/fast", args: "[on|off]", description: "开关快速模式。" },
      { name: "/plan", args: "[描述]", description: "进入计划模式：先分析、出方案，你确认后再动手。", example: "/plan 修复登录失效的问题" },
      { name: "/goal", args: "[条件|clear]", description: "设定一个目标，Claude 会跨多轮一直做到条件满足为止；clear 取消目标。", example: "/goal 所有测试都通过" },
      { name: "/advisor", args: "[模型|off]", description: "开关「顾问」工具：在任务的关键时刻请第二个模型给意见。" },
      { name: "/output-style", args: "[风格]", description: "列出或切换输出风格。", example: "/output-style concise" },
      { name: "/voice", args: "[hold|tap|off]", description: "开关语音输入。" },
    ],
  },
  {
    category: "代码与审查",
    items: [
      { name: "/init", description: "为项目生成一份 CLAUDE.md 说明文件，让 Claude 以后每次都了解这个项目。" },
      {
        name: "/code-review",
        args: "[级别] [--fix] [--comment] [PR号|分支|路径]",
        aliases: "/review",
        description: "审查当前改动（或指定的 PR、分支、路径）里的正确性问题。--fix 直接修复，--comment 把结果发到 PR 上。级别从 low 到 max；ultra 是云端的多代理深度审查。",
        example: "/code-review high --fix",
      },
      { name: "/security-review", description: "检查当前分支的改动里有没有安全漏洞，比如注入、鉴权、数据泄露。需要仓库有 origin 远程地址。" },
      { name: "/simplify", args: "[目标]", description: "检查改过的代码有没有可以复用、简化、提速的地方，并直接修改。它不找 bug，找 bug 用 /code-review。" },
      { name: "/debug", args: "[描述]", description: "打开当前会话的调试日志，并根据日志排查问题。" },
      { name: "/run", description: "启动并操作项目的应用，亲眼确认改动生效，而不只是测试通过。" },
      { name: "/verify", description: "构建并运行应用、观察结果，确认改动确实做到了该做的事。" },
      { name: "/batch", args: "<指令>", description: "把一项大改动拆成 5 到 30 个互不依赖的单元，每个单元由一个后台代理在独立的工作树里并行完成。", example: "/batch 把 src/ 从 JavaScript 迁移到 TypeScript" },
      { name: "/autofix-pr", args: "[要求]", description: "开一个云端会话盯着当前分支的 PR：CI 失败或有人留评论时自动推送修复。需要 gh 命令行。", example: "/autofix-pr 只修 lint 和类型错误" },
    ],
  },
  {
    category: "并行与自动化",
    items: [
      { name: "/loop", args: "[间隔] [提示词]", aliases: "/proactive", description: "会话开着的时候反复执行一段提示词；不写间隔时由 Claude 自己把握节奏。", example: "/loop 5m 看看部署完成了没有" },
      { name: "/schedule", args: "[描述]", aliases: "/routines", description: "创建、修改、查看或运行云端的定时任务。" },
      { name: "/tasks", aliases: "/bashes", description: "查看和管理当前会话的后台任务，包括已经结束的子代理。" },
      { name: "/background", args: "[提示词]", aliases: "/bg", description: "把当前会话转到后台继续跑，把终端腾出来。" },
      { name: "/fork", args: "[提示词]", description: "把当前对话复制成一个新的后台会话，自己留在这里继续做。" },
      { name: "/subtask", args: "<任务>", description: "派一个继承完整对话的后台子代理去做一件旁支任务，做完后结果回到这个对话里。" },
      { name: "/workflows", description: "打开工作流进度视图，查看、暂停、继续或保存工作流。" },
      { name: "/deep-research", args: "<问题>", description: "分头做网络搜索、抓取并交叉核对来源，最后汇总成带引用的报告。" },
      { name: "/remote-control", aliases: "/rc", description: "让这个会话可以从 claude.ai 远程操控，比如在手机上接着用。" },
      { name: "/teleport", aliases: "/tp", description: "把一个云端会话拉到这个终端里继续。" },
      { name: "/desktop", aliases: "/app", description: "在 Claude Code 桌面应用里接着当前会话。" },
    ],
  },
  {
    category: "设置与扩展",
    items: [
      { name: "/config", args: "[key=value …]", aliases: "/settings", description: "打开设置界面，调整主题、模型、输出风格等；也可以直接写 key=value 改某一项。", example: "/config theme=dark" },
      { name: "/permissions", aliases: "/allowed-tools", description: "管理工具权限的允许、询问、拒绝规则。" },
      { name: "/memory", description: "编辑 CLAUDE.md，开关自动记忆，查看已有的记忆条目。" },
      { name: "/mcp", args: "[reconnect|enable|disable [服务器|all]]", description: "管理 MCP 服务器的连接和登录授权；不带参数时打开列表。" },
      { name: "/hooks", description: "查看钩子（hook）配置。" },
      { name: "/skills", description: "列出可用的技能，可以按名称、描述、来源筛选。" },
      { name: "/plugin", args: "[子命令]", description: "管理插件：不带参数打开插件菜单，也可以直接用 list、install、enable、disable。" },
      { name: "/add-dir", args: "<路径>", description: "给当前会话再加一个可以读写文件的工作目录。" },
      { name: "/cd", args: "<路径>", description: "把会话搬到另一个工作目录，对话保留。" },
      { name: "/update-config", args: "[要求]", description: "用一句话描述想改的设置（允许某个命令、设环境变量、加钩子），Claude 替你改 settings.json。" },
      { name: "/fewer-permission-prompts", description: "扫描历史对话里常见的只读命令，生成一份允许清单，减少权限确认的弹窗。" },
      { name: "/autocompact", args: "[auto|<tokens>]", description: "设置自动压缩的阈值：上下文用到多满时自动压缩。", example: "/autocompact 500k" },
      { name: "/import", args: "[codex|gemini|cursor]", description: "把本机上 Codex、Gemini CLI 或 Cursor 的配置搬进 Claude Code。加 --dry-run 可以先预览。" },
      { name: "/keybindings", description: "打开键盘快捷键的配置文件。" },
      { name: "/statusline", description: "配置状态栏；可以描述想要的样子，也可以不带参数自动配置。" },
      { name: "/theme", description: "更换配色主题。" },
      { name: "/terminal-setup", description: "给终端装上 Shift+Enter 换行的快捷键。" },
      { name: "/chrome", description: "配置 Claude in Chrome。" },
      { name: "/ide", description: "管理 IDE 集成并查看状态。" },
      { name: "/sandbox", description: "开关沙箱模式，只在支持的平台上可用。" },
    ],
  },
  {
    category: "创作与设计",
    items: [
      { name: "/artifacts", description: "列出你拥有的或别人分享给你的 Artifact（发布出来的网页），可以打开或复制链接。" },
      { name: "/design", args: "[需求]", description: "在一张画布上起草界面稿、流程、落地页或海报。", example: "/design 一个手机银行的设置页" },
      { name: "/slides", args: "[需求]", description: "根据描述做一份幻灯片。", example: "/slides 平台组的季度回顾" },
      { name: "/dataviz", args: "[需求]", description: "做图表和仪表盘时的设计指引：选图表类型、配色、检查色盲友好和对比度。" },
    ],
  },
  {
    category: "账号与帮助",
    items: [
      { name: "/help", description: "显示帮助和可用的命令。" },
      { name: "/usage", aliases: "/cost, /stats", description: "查看本次会话的花费、套餐的用量限额和使用统计。" },
      { name: "/status", description: "查看版本、模型、账号和连接状态。" },
      { name: "/doctor", aliases: "/checkup", description: "给安装和配置做一次体检，找出问题，并在你确认后修复。" },
      { name: "/insights", description: "生成一份 HTML 报告，分析你最近的使用情况：在哪些项目里工作、哪里容易出问题、还有哪些功能值得试。" },
      { name: "/powerup", description: "通过带动画演示的小课程了解 Claude Code 的功能。" },
      { name: "/release-notes", description: "查看更新日志，可以选择具体版本。" },
      { name: "/feedback", args: "[内容]", description: "给 Claude Code 提产品反馈。" },
      { name: "/bug", args: "[内容]", aliases: "/share", description: "报告 bug 或分享对话。发送前可以选择附带多少会话记录。" },
      { name: "/rate-limit-options", description: "被用量限制挡住时，看看有哪些办法继续：等重置、加额度或升级套餐。" },
      { name: "/usage-credits", description: "用量到上限时，配置额外的用量额度。" },
      { name: "/upgrade", description: "打开升级套餐的页面。" },
      { name: "/privacy-settings", description: "查看和修改隐私设置。" },
      { name: "/install-github-app", description: "给仓库安装 Claude 的 GitHub 应用，可以顺便配置 GitHub Actions。" },
      { name: "/web-setup", description: "用本机 gh 的登录信息，为云端会话连接 GitHub 账号。" },
      { name: "/mobile", aliases: "/ios, /android", description: "显示下载 Claude 手机 App 的二维码。" },
      { name: "/login", description: "登录 Anthropic 账号。" },
      { name: "/logout", description: "退出 Anthropic 账号。" },
    ],
  },
];
