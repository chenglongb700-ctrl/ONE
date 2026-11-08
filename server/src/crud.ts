import { Router } from "express";
import { z, type ZodObject, type ZodRawShape } from "zod";
import { db } from "./db.js";

type Row = Record<string, unknown>;

/**
 * 生成按 user_id 隔离的通用 CRUD 路由：GET / POST / PUT /:id / DELETE /:id
 * 表名、列名都来自代码常量（schema 的 key），不来自用户输入，因此拼接 SQL 是安全的。
 */
export function crudRouter<S extends ZodRawShape>(opts: {
  table: string;
  schema: ZodObject<S>;
  orderBy: string;
  touchUpdatedAt?: boolean;
  /** SELECT 的列，可以带子查询算出额外字段，默认 "*" */
  select?: string;
  /** 允许 GET 时用 ?列名=值 过滤的列 */
  filters?: string[];
  /** 外键列 → 被引用的表：写入前检查被引用的记录也属于当前用户 */
  ownedRefs?: Record<string, string>;
  toDb?: (data: Row) => Row;
  fromDb?: (row: Row) => Row;
}) {
  const { table, schema, orderBy } = opts;
  const select = opts.select ?? "*";
  const toDb = opts.toDb ?? ((d) => d);
  const fromDb = opts.fromDb ?? ((r) => ({ ...r }));
  const idSchema = z.coerce.number().int().positive();
  const r = Router();

  const getOne = (id: number, uid: number) =>
    db.prepare(`SELECT ${select} FROM ${table} WHERE id = ? AND user_id = ?`).get(id, uid) as Row | undefined;

  // 防止把数据挂到别人的记录下面，例如给别人的学习项目添加日志
  const checkRefs = (data: Row, uid: number) => {
    for (const [col, refTable] of Object.entries(opts.ownedRefs ?? {})) {
      if (data[col] === undefined) continue;
      const ok = db.prepare(`SELECT 1 FROM ${refTable} WHERE id = ? AND user_id = ?`).get(data[col] as number, uid);
      if (!ok) return false;
    }
    return true;
  };

  r.get("/", (req, res) => {
    const where = ["user_id = ?"];
    const params: (string | number)[] = [req.userId!];
    for (const col of opts.filters ?? []) {
      const v = req.query[col];
      if (typeof v === "string" && v !== "") {
        where.push(`${col} = ?`);
        params.push(v);
      }
    }
    const rows = db.prepare(`SELECT ${select} FROM ${table} WHERE ${where.join(" AND ")} ORDER BY ${orderBy}`).all(...params) as Row[];
    res.json(rows.map(fromDb));
  });

  r.post("/", (req, res) => {
    const data = toDb(schema.parse(req.body) as Row);
    if (!checkRefs(data, req.userId!)) return void res.status(404).json({ error: "关联的记录不存在" });
    const cols = Object.keys(data);
    const sql = `INSERT INTO ${table} (user_id${cols.map((c) => ", " + c).join("")}) VALUES (?${cols.map(() => ", ?").join("")})`;
    const result = db.prepare(sql).run(req.userId!, ...(Object.values(data) as never[]));
    res.status(201).json(fromDb(getOne(Number(result.lastInsertRowid), req.userId!)!));
  });

  r.put("/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    if (!getOne(id, req.userId!)) return void res.status(404).json({ error: "记录不存在" });
    // partial()：只更新传入的字段；去掉 default 生成的 undefined
    const parsed = schema.partial().parse(req.body) as Row;
    const data = toDb(Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)));
    if (!checkRefs(data, req.userId!)) return void res.status(404).json({ error: "关联的记录不存在" });
    const cols = Object.keys(data);
    if (cols.length) {
      const sets = cols.map((c) => `${c} = ?`);
      if (opts.touchUpdatedAt) sets.push("updated_at = datetime('now','localtime')");
      db.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(
        ...(Object.values(data) as never[]),
        id,
        req.userId!,
      );
    }
    res.json(fromDb(getOne(id, req.userId!)!));
  });

  r.delete("/:id", (req, res) => {
    const id = idSchema.parse(req.params.id);
    const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).run(id, req.userId!);
    if (!result.changes) return void res.status(404).json({ error: "记录不存在" });
    res.json({ ok: true });
  });

  return r;
}
