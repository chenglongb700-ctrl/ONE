# 🌱 ONE · 个人管理

一个前后端 + 数据库齐全的个人管理网站，分为 **工作 / 学习 / 习惯 / 生活 / 感悟** 五大板块，底部带一个音乐播放器，支持多用户注册登录，数据按用户隔离。

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite + React Router + Tailwind CSS 4 |
| 后端 | Express 5 + TypeScript（tsx 运行）+ zod 参数校验 |
| 数据库 | SQLite（Node 内置 `node:sqlite`，无需安装数据库） |
| 鉴权 | bcrypt 密码加密 + JWT（httpOnly Cookie，7 天有效） |

## 功能

- **总览**：左边是今天要做的事（进行中和到期的工作、今日打卡、生活清单，都可以直接勾选），右边是日期、各项数字和最近的感悟
- **工作**：三列任务看板（待办 / 进行中 / 已完成），优先级、截止日期、逾期标红
- **学习**：学习项目（书 / 课程 / 技能），进度条、目标日期、累计学习时长；每次学习记一条日志，可同时更新进度；最近 7 天学习柱状图
- **习惯**：最近 7 天打卡表、连续天数和最长连续、近一年热力图（可看全部或单个习惯）、归档
- **生活**：生活清单（分类、日期、勾选完成）+ 记账（按月查看、收支汇总、支出分类占比）
- **感悟**：日记卡片，心情、标签筛选、全文搜索
- **外观**：干净的实心卡片，侧边栏和播放条是毛玻璃，全站只用一个强调色（钴蓝）；浅色 / 深色两套主题，默认跟随系统，侧边栏底部的按钮可以手动切换
- **设置**：侧边栏底部的齿轮按钮。可以选主题、换强调色（钴蓝 / 青 / 暖橙 / 玫瑰红 / 紫罗兰）、调侧边栏和播放条的玻璃通透度、开关音乐自动播放（这些偏好存在浏览器本地，改了立刻生效）；还可以上传头像，图片自动裁成正方形，头像跟着账号走
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
- 上传的音乐和头像：`server/data/music/`、`server/data/avatars/`（不进 git，换电脑或备份时要和数据库一起带走）

### 生产部署

```bash
npm run build   # 构建前端到 client/dist
npm start       # 后端同时托管前端页面，访问 http://localhost:3001
```

部署时请设置环境变量 `JWT_SECRET` 为一个随机长字符串，可选 `API_PORT`（默认 3001）、`DB_PATH`。

## 目录

```
server/src/
  index.ts        Express 入口、错误处理、生产环境托管前端
  db.ts           SQLite 连接与建表
  auth.ts         注册 / 登录 / 登出 / me，requireAuth 中间件
  crud.ts         通用的按用户隔离的 CRUD 路由生成器
  routes/         tasks / life / expenses / journals / learning / habits / music / avatar / stats
client/src/
  api.ts          fetch 封装与类型定义
  context/        AuthContext 登录状态
  theme.ts        外观偏好：主题、强调色、玻璃通透度
  index.css       设计变量（配色、卡片和玻璃、深色模式映射）和通用样式
  components/     Layout 侧边栏、Settings 设置弹窗、Modal、Brand 标志等
  music/          MusicContext 播放状态、PlayerBar 播放条、Spectrum 频谱、lrc 歌词解析
  pages/          AuthPage / Dashboard / Work / Learning / Habits / Life / Journal
```

## API

所有接口前缀 `/api`，除 `/auth/*` 外都需要登录。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` `/auth/login` `/auth/logout` | 账号 |
| GET | `/auth/me` | 当前用户 `{id, username, avatar}` |
| POST / DELETE | `/avatar` | 上传头像（multipart，字段名 `file`，PNG / JPG / WebP，最大 2 MB）/ 移除头像 |
| GET | `/avatar/file` | 读取自己的头像 |
| GET / POST | `/tasks` `/life` `/expenses` `/journals` `/learning` `/learning-logs` `/habits` | 列表 / 新建 |
| PUT / DELETE | `/tasks/:id` 等 | 修改（可只传部分字段）/ 删除 |
| GET | `/stats` | 首页统计 |
| GET / POST | `/music` | 歌单 / 添加音频链接 `{url, title?, artist?}` |
| POST | `/music/upload` | 上传音频文件（multipart，字段名 `file`） |
| PUT / DELETE | `/music/:id` | 改歌名、歌手、歌词 / 删除（连同文件） |
| GET | `/music/:id/file` | 播放上传的文件（支持 Range，可拖动进度） |
| GET | `/habits/checks?from=&to=` | 一段时间内的打卡记录 |
| POST | `/habits/:id/toggle` `{date}` | 打卡 / 取消打卡 |

## 下一步

功能构思见 [docs/IDEAS.md](docs/IDEAS.md)（交互版页面：`docs/ideas-board.html`）。
