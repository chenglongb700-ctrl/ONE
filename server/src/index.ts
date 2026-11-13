import express, { type ErrorRequestHandler } from "express";
import cookieParser from "cookie-parser";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ZodError } from "zod";
import { authRouter, requireAuth } from "./auth.js";
import { avatarRouter } from "./routes/avatar.js";
import { wallpaperRouter } from "./routes/wallpaper.js";
import { tasksRouter } from "./routes/tasks.js";
import { lifeRouter } from "./routes/life.js";
import { expensesRouter } from "./routes/expenses.js";
import { journalsRouter } from "./routes/journals.js";
import { statsRouter } from "./routes/stats.js";
import { learningRouter, learningLogsRouter } from "./routes/learning.js";
import { habitsRouter } from "./routes/habits.js";
import { musicRouter } from "./routes/music.js";
import { favoritesRouter } from "./routes/favorites.js";

const app = express();
app.use(express.json({ limit: "1mb" })); // 歌词文本可能比默认的 100kb 大
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/avatar", requireAuth, avatarRouter);
app.use("/api/wallpaper", requireAuth, wallpaperRouter);
app.use("/api/tasks", requireAuth, tasksRouter);
app.use("/api/life", requireAuth, lifeRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/journals", requireAuth, journalsRouter);
app.use("/api/learning", requireAuth, learningRouter);
app.use("/api/learning-logs", requireAuth, learningLogsRouter);
app.use("/api/habits", requireAuth, habitsRouter);
app.use("/api/music", requireAuth, musicRouter);
app.use("/api/favorites", requireAuth, favoritesRouter);
app.use("/api/stats", requireAuth, statsRouter);
app.use("/api", (_req, res) => {
  res.status(404).json({ error: "接口不存在" });
});

// 生产模式：如果前端已构建（npm run build），由后端直接托管
const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../../client/dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, "index.html")));
}

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return void res.status(400).json({ error: err.issues[0]?.message ?? "参数错误" });
  }
  console.error(err);
  res.status(500).json({ error: "服务器错误" });
};
app.use(onError);

// 用 API_PORT 而不是 PORT，避免和前端开发服务器争用同一个环境变量
const port = Number(process.env.API_PORT ?? 3001);
app.listen(port, () => console.log(`API server running at http://localhost:${port}`));
