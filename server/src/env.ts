import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 读取项目根目录的 .env（这个文件不进 git），并保证有一个登录用的签名密钥 JWT_SECRET。
 *
 * 登录凭证（Cookie 里的 JWT）是用 JWT_SECRET 签名的：谁知道这个密钥，谁就能自己造一张"已登录"的凭证。
 * 所以它不能写死在代码里（代码是公开的）。第一次启动时如果哪里都没有设置，就随机生成一个，追加写进 .env，
 * 以后每次启动都用同一个——不然每次重启所有人都要重新登录。
 *
 * 要在其他模块读取环境变量之前执行：index.ts 第一行就 import 这个文件，auth.ts 和 ai.ts 也各自 import 一次（只会执行一次）。
 */
export const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");

if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile); // 已经在系统环境变量里设过的值不会被覆盖
  } catch (err) {
    console.warn(`.env 文件读取失败：${(err as Error).message}`);
  }
}

if (!process.env.JWT_SECRET?.trim()) {
  const secret = randomBytes(48).toString("base64url");
  const old = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  const gap = old && !old.endsWith("\n") ? "\n" : "";
  appendFileSync(envFile, `${gap}${old ? "\n" : ""}# 登录凭证的签名密钥：网站第一次启动时自动生成。不要发给别人；改掉它，所有人都要重新登录。\nJWT_SECRET=${secret}\n`);
  process.env.JWT_SECRET = secret;
  console.log("[env] 已生成登录密钥 JWT_SECRET，写进了项目根目录的 .env");
}
