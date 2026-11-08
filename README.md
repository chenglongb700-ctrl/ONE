# 🌱 ONE · 个人管理

一个前后端 + 数据库齐全的个人管理网站，分为 **工作 / 学习 / 习惯 / 生活 / 感悟** 五大板块，支持多用户注册登录，数据按用户隔离。

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite + React Router + Tailwind CSS 4 |
| 后端 | Express 5 + TypeScript（tsx 运行）+ zod 参数校验 |
| 数据库 | SQLite（Node 内置 `node:sqlite`，无需安装数据库） |
| 鉴权 | bcrypt 密码加密 + JWT（httpOnly Cookie，7 天有效） |

## 功能

- **总览**：待处理任务、逾期提醒、本周学习时长、今日打卡（可直接勾选）、生活清单、本月收支结余、最近感悟
- **工作**：三列任务看板（待办 / 进行中 / 已完成），优先级、截止日期、逾期标红
- **学习**：学习项目（书 / 课程 / 技能），进度条、目标日期、累计学习时长；每次学习记一条日志，可同时更新进度；最近 7 天学习柱状图
- **习惯**：最近 7 天打卡表、连续天数和最长连续、近一年热力图（可看全部或单个习惯）、归档
- **生活**：生活清单（分类、日期、勾选完成）+ 记账（按月查看、收支汇总、支出分类占比）
- **感悟**：日记卡片，心情、标签筛选、全文搜索

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
  routes/         tasks / life / expenses / journals / stats
client/src/
  api.ts          fetch 封装与类型定义
  context/        AuthContext 登录状态
  components/     Layout 侧边栏、Modal 等
  pages/          AuthPage / Dashboard / Work / Life / Journal
```

## API

所有接口前缀 `/api`，除 `/auth/*` 外都需要登录。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` `/auth/login` `/auth/logout` | 账号 |
| GET | `/auth/me` | 当前用户 |
| GET / POST | `/tasks` `/life` `/expenses` `/journals` `/learning` `/learning-logs` `/habits` | 列表 / 新建 |
| PUT / DELETE | `/tasks/:id` 等 | 修改（可只传部分字段）/ 删除 |
| GET | `/stats` | 首页统计 |
| GET | `/habits/checks?from=&to=` | 一段时间内的打卡记录 |
| POST | `/habits/:id/toggle` `{date}` | 打卡 / 取消打卡 |
