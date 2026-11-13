import { Router, type Request, type Response, type NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const COOKIE = "token";
const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, maxAge: 7 * 24 * 3600 * 1000 };

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

const credsSchema = z.object({
  username: z.string().trim().min(3, "用户名至少 3 个字符").max(32, "用户名最多 32 个字符"),
  password: z.string().min(6, "密码至少 6 位").max(100),
});

function issue(res: Response, userId: number) {
  const token = jwt.sign({ uid: userId }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie(COOKIE, token, COOKIE_OPTS);
}

/** 返回给前端的用户信息（不含密码）。avatar / wallpaper 是头像和自定义壁纸的地址，没设置时为 null */
export function publicUser(id: number) {
  const u = db.prepare("SELECT id, username, avatar, wallpaper FROM users WHERE id = ?").get(id) as
    | { id: number; username: string; avatar: string | null; wallpaper: string | null }
    | undefined;
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar ? `/api/avatar/file?v=${encodeURIComponent(u.avatar)}` : null,
    wallpaper: u.wallpaper ? `/api/wallpaper/file?v=${encodeURIComponent(u.wallpaper)}` : null,
  };
}

export const authRouter = Router();

authRouter.post("/register", (req, res) => {
  const { username, password } = credsSchema.parse(req.body);
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return void res.status(409).json({ error: "用户名已被占用" });
  const hash = bcrypt.hashSync(password, 10);
  const r = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, hash);
  const id = Number(r.lastInsertRowid);
  issue(res, id);
  res.status(201).json(publicUser(id));
});

authRouter.post("/login", (req, res) => {
  const { username, password } = credsSchema.parse(req.body);
  const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
    | { id: number; username: string; password_hash: string }
    | undefined;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return void res.status(401).json({ error: "用户名或密码错误" });
  }
  issue(res, user.id);
  res.json(publicUser(user.id));
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE];
  if (!token) return void res.status(401).json({ error: "未登录" });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { uid: number };
    req.userId = payload.uid;
    next();
  } catch {
    res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

authRouter.get("/me", requireAuth, (req, res) => {
  const user = publicUser(req.userId!);
  if (!user) return void res.status(401).json({ error: "用户不存在" });
  res.json(user);
});
