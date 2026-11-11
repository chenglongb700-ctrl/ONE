import type { User } from "../api";

/** 圆形头像：有图显示图，没有就显示用户名的第一个字。大小和字号由 className 决定 */
export default function Avatar({ user, className = "size-7 text-xs" }: { user: User | null; className?: string }) {
  if (user?.avatar) {
    return <img src={user.avatar} alt="" className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-ink/8 font-medium ${className}`} aria-hidden>
      {user?.username.slice(0, 1).toUpperCase()}
    </span>
  );
}

const SIZE = 256;

/**
 * 把用户选的图片裁成正方形（取正中间）并缩到 256×256，转成 WebP。
 * 这样传给服务器的只有几十 KB，手机拍的大图也不用担心。
 */
export async function squareAvatar(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("请选择一张图片");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("这张图片打不开，换一张试试");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/webp", 0.9));
  if (!blob) throw new Error("图片处理失败，换一张试试");
  return blob;
}
