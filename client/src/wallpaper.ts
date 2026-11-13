/**
 * 自定义壁纸。图片存在服务器上（跟着账号走），这里负责两件事：
 *   1. 把图片地址写进 CSS 变量 --wallpaper，整站背景就换了（index.css 里 body::before 用它）
 *   2. 上传前把大图缩小
 * 地址另外在 localStorage 里记一份，index.html 的小脚本在页面渲染前先用上，避免每次刷新都先闪一下默认壁纸。
 */
const KEY = "one-wallpaper";

export function applyWallpaper(url: string | null) {
  const root = document.documentElement;
  try {
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
  } catch {
    /* 存不了只是下次刷新会闪一下，不影响使用 */
  }
  if (!url) return root.style.removeProperty("--wallpaper");
  // 图片上面盖一层很淡的罩子（--wall-scrim，深色主题偏暗、浅色主题偏亮），文字在各种图上都更容易看清
  root.style.setProperty("--wallpaper", `linear-gradient(var(--wall-scrim), var(--wall-scrim)), url("${url}") center / cover no-repeat`);
}

const MAX_SIDE = 2560;

/** 长边超过 2560 像素的图等比缩小，统一转成 WebP：手机原图十几 MB，处理完通常不到 1 MB */
export async function shrinkWallpaper(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("请选择一张图片");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("这张图片打不开，换一张试试");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.86));
  if (!blob) throw new Error("图片处理失败，换一张试试");
  return blob;
}
