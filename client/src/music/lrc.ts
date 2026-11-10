export type LyricLine = { time: number; text: string };

/**
 * 解析 LRC 歌词：
 *   [00:12.34]第一句
 *   [00:20.00][01:30.50]重复出现的一句
 * 忽略 [ti:] [ar:] 这类信息标签；支持 [offset:+500] 整体偏移（毫秒）。
 */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  let offset = 0;
  const off = text.match(/\[offset:\s*([+-]?\d+)\s*\]/i);
  if (off) offset = Number(off[1]) / 1000;

  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!stamps.length) continue;
    const content = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const m of stamps) {
      const frac = m[3] ? Number(m[3]) / 10 ** m[3].length : 0;
      const time = Number(m[1]) * 60 + Number(m[2]) + frac - offset;
      lines.push({ time: Math.max(0, time), text: content });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** 当前时间对应第几行（二分查找），还没到第一句返回 -1 */
export function currentLine(lines: LyricLine[], time: number) {
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time + 0.15) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** 歌词文件常见 UTF-8 和 GBK 两种编码：先按 UTF-8 严格解码，失败再用 GBK */
export async function readTextFile(file: File) {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("gbk").decode(buf);
  }
}

export function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
