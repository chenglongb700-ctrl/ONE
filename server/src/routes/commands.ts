import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { COMMAND_SEED } from "../commandSeed.js";

/**
 * 命令：一份自己的 Claude Code 斜杠命令速查表。
 * 每个账号第一次读取时，把内置清单（commandSeed.ts）抄一份进来；之后每条都可以改、删、标成常用、加备注，
 * 也可以添加自己的命令。删掉的内置命令可以用 POST /restore 补回来。
 */
type Row = {
  id: number;
  user_id: number;
  name: string;
  args: string;
  aliases: string;
  category: string;
  description: string;
  example: string;
  note: string;
  pinned: number;
  builtin: number;
  created_at: string;
};

const toClient = (r: Row) => ({
  id: r.id,
  name: r.name,
  args: r.args,
  aliases: r.aliases,
  category: r.category,
  description: r.description,
  example: r.example,
  note: r.note,
  pinned: r.pinned === 1,
  builtin: r.builtin === 1,
});

const getOwn = (id: number, uid: number) => db.prepare("SELECT * FROM commands WHERE id = ? AND user_id = ?").get(id, uid) as Row | undefined;
const idSchema = z.coerce.number().int().positive();

// 同一个账号里命令名不重复（不分大小写）。exceptId：修改时把自己排除在外
const nameTaken = (uid: number, name: string, exceptId = 0) =>
  !!db.prepare("SELECT 1 FROM commands WHERE user_id = ? AND name = ? COLLATE NOCASE AND id <> ?").get(uid, name, exceptId);

const schema = z.object({
  // 忘了写开头的斜杠就补上；中间多打的空格收成一个
  name: z
    .string()
    .trim()
    .max(60, "命令名太长了")
    .transform((s) => (s.startsWith("/") ? s : "/" + s).replace(/\s+/g, " "))
    .refine((s) => s.length > 1, "请填写命令名"),
  args: z.string().trim().max(200).default(""),
  aliases: z.string().trim().max(200).default(""),
  category: z.string().trim().max(20).default(""),
  description: z.string().trim().max(1000).default(""),
  example: z.string().trim().max(300).default(""),
  note: z.string().trim().max(4000).default(""),
  pinned: z.boolean().default(false),
});

const DEFAULT_CATEGORY = "我的命令";

// 只插入这个账号还没有的内置命令，已有的（包括改过的）不动
const insertBuiltin = db.prepare(
  `INSERT INTO commands (user_id, name, args, aliases, category, description, example, builtin)
   SELECT ?, ?, ?, ?, ?, ?, ?, 1
   WHERE NOT EXISTS (SELECT 1 FROM commands WHERE user_id = ? AND name = ? COLLATE NOCASE)`,
);

function addBuiltins(uid: number): number {
  let added = 0;
  db.exec("BEGIN"); // 几十条放进一个事务里，要么全加上，要么都不加
  try {
    for (const group of COMMAND_SEED) {
      for (const c of group.items) {
        added += Number(insertBuiltin.run(uid, c.name, c.args ?? "", c.aliases ?? "", group.category, c.description, c.example ?? "", uid, c.name).changes);
      }
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return added;
}

/** 每个账号只自动抄一次内置清单：这样用户删掉的命令不会在下次打开时又冒出来 */
function seedOnce(uid: number) {
  const u = db.prepare("SELECT commands_seeded FROM users WHERE id = ?").get(uid) as { commands_seeded: number } | undefined;
  if (!u || u.commands_seeded) return;
  addBuiltins(uid);
  db.prepare("UPDATE users SET commands_seeded = 1 WHERE id = ?").run(uid);
}

export const commandsRouter = Router();

// 按 id 排：内置的保持清单里的顺序，自己加的排在后面。分组和常用置顶由前端来排
commandsRouter.get("/", (req, res) => {
  seedOnce(req.userId!);
  const rows = db.prepare("SELECT * FROM commands WHERE user_id = ? ORDER BY id").all(req.userId!) as Row[];
  res.json(rows.map(toClient));
});

// 把删掉的内置命令补回来
commandsRouter.post("/restore", (req, res) => {
  res.json({ added: addBuiltins(req.userId!) });
});

commandsRouter.post("/", (req, res) => {
  const d = schema.parse(req.body);
  if (nameTaken(req.userId!, d.name)) return void res.status(400).json({ error: `${d.name} 已经在列表里了` });
  const r = db
    .prepare("INSERT INTO commands (user_id, name, args, aliases, category, description, example, note, pinned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(req.userId!, d.name, d.args, d.aliases, d.category || DEFAULT_CATEGORY, d.description, d.example, d.note, d.pinned ? 1 : 0);
  res.status(201).json(toClient(getOwn(Number(r.lastInsertRowid), req.userId!)!));
});

// 修改（可以只传要改的字段，比如只改 pinned）
commandsRouter.put("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const old = getOwn(id, req.userId!);
  if (!old) return void res.status(404).json({ error: "这条命令不存在" });
  const d = schema.partial().parse(req.body);
  if (d.name !== undefined && nameTaken(req.userId!, d.name, id)) return void res.status(400).json({ error: `${d.name} 已经在列表里了` });
  db.prepare("UPDATE commands SET name = ?, args = ?, aliases = ?, category = ?, description = ?, example = ?, note = ?, pinned = ? WHERE id = ? AND user_id = ?").run(
    d.name ?? old.name,
    d.args ?? old.args,
    d.aliases ?? old.aliases,
    d.category === undefined ? old.category : d.category || DEFAULT_CATEGORY,
    d.description ?? old.description,
    d.example ?? old.example,
    d.note ?? old.note,
    d.pinned === undefined ? old.pinned : d.pinned ? 1 : 0,
    id,
    req.userId!,
  );
  res.json(toClient(getOwn(id, req.userId!)!));
});

commandsRouter.delete("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const result = db.prepare("DELETE FROM commands WHERE id = ? AND user_id = ?").run(id, req.userId!);
  if (!result.changes) return void res.status(404).json({ error: "这条命令不存在" });
  res.json({ ok: true });
});
