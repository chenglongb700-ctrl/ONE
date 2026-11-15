import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import { toast } from "sonner";
import { api, uploadFile, type Favorite } from "../api";

/** 有新东西被拖进来、归好类之后，通知正开着的「收藏」「网址」页面重新读一遍列表 */
export const DROPPED_EVENT = "one:dropped";

type Dropped = { where: "favorites" | "sites"; kind: "video" | "image" | "text" | "site"; title: string; platform: string; category: string };

const KIND_LABEL: Record<Dropped["kind"], string> = { video: "收藏 › 视频", image: "收藏 › 图片", text: "收藏 › 摘录", site: "网址" };
const VIDEO_TYPES = /^video\/(mp4|webm|quicktime)$/;

/**
 * 从别的网页拖过来的东西带着一段 HTML。如果它其实就是一张图片（没有文字），取出图片的地址，
 * 以及包着它的链接（一般就是图片所在的网页）。不是单独一张图片就返回 null。
 */
function loneImage(html: string): { imageUrl: string; pageUrl: string } | null {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const img = doc.querySelector("img[src]");
  const src = img?.getAttribute("src") ?? "";
  if (!img || !/^https?:\/\//i.test(src) || doc.body.textContent?.trim()) return null;
  const href = img.closest("a[href]")?.getAttribute("href") ?? "";
  return { imageUrl: src, pageUrl: /^https?:\/\//i.test(href) ? href : "" };
}

/**
 * 全站的拖放入口：把网址、文字、图片、视频文件从别处拖到网站的任何位置，松手后自动判断是什么、放到对应的地方。
 *   图片 / 视频文件 → 直接上传到收藏
 *   其余（网址、文字、网页上的图片）→ 交给服务器的 /drop 判断
 * 只管从网站外面拖进来的东西：在页面里拖动自己的图片、链接不会触发。
 */
export default function DropZone() {
  const navigate = useNavigate();
  const [active, setActive] = useState(false);
  const depth = useRef(0); // dragenter / dragleave 会在每个子元素上成对触发，数层数才知道是不是真的离开了窗口
  const internal = useRef(false); // 这次拖动是从本页面里开始的

  useEffect(() => {
    // 弹窗开着、或者正往输入框里拖文字时，不接管（让浏览器按原样处理）
    const ignore = (e: DragEvent) => internal.current || !!document.querySelector("[role=dialog]") || !!(e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable]");
    const relevant = (e: DragEvent) => {
      const types = e.dataTransfer?.types ?? [];
      return types.includes("Files") || types.includes("text/uri-list") || types.includes("text/plain");
    };

    // id：把那条"正在处理"的提示直接换成结果，不另外弹一条
    const done = (r: Dropped, id: string | number) => {
      window.dispatchEvent(new CustomEvent(DROPPED_EVENT));
      const where = KIND_LABEL[r.kind] + (r.category ? ` › ${r.category}` : "");
      toast.success(`已放进「${where}」`, {
        id,
        description: [r.platform, r.title].filter(Boolean).join(" · ") || undefined,
        action: { label: "去看看", onClick: () => navigate(r.where === "sites" ? "/sites" : "/favorites") },
      });
    };

    const handleFiles = async (files: File[]) => {
      for (const file of files) {
        const kind = file.type.startsWith("image/") ? "image" : VIDEO_TYPES.test(file.type) ? "video" : null;
        if (!kind) {
          toast.error(`「${file.name}」放不进来`, { description: "只认图片（PNG、JPG、WebP、GIF）和视频（MP4、WebM、MOV）文件。" });
          continue;
        }
        const id = toast.loading(`正在上传「${file.name}」…`);
        try {
          const form = new FormData();
          form.append("file", file);
          const f = await uploadFile<Favorite>(`/favorites/${kind}`, form);
          done({ where: "favorites", kind, title: f.title, platform: f.platform, category: "" }, id);
        } catch (err) {
          toast.error(`「${file.name}」没放进来`, { id, description: (err as Error).message });
        }
      }
    };

    const handleData = async (body: { text: string } | { imageUrl: string; pageUrl: string }) => {
      const id = toast.loading("正在看这是什么…");
      try {
        const r = await api.post<Dropped>("/drop", body);
        done(r, id);
      } catch (err) {
        toast.error("没放进来", { id, description: (err as Error).message });
      }
    };

    const onDragStart = () => {
      internal.current = true;
    };
    const onDragEnd = () => {
      internal.current = false;
    };
    const onEnter = (e: DragEvent) => {
      if (ignore(e) || !relevant(e)) return;
      depth.current++;
      setActive(true);
    };
    const onLeave = () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const onOver = (e: DragEvent) => {
      if (internal.current || !relevant(e)) return;
      // 文件一定要拦住：不拦的话浏览器会直接打开这个文件，把网站页面替换掉
      const files = e.dataTransfer?.types.includes("Files");
      if (ignore(e) && !files) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = ignore(e) ? "none" : "copy";
    };
    const onDrop = (e: DragEvent) => {
      depth.current = 0;
      setActive(false);
      const dt = e.dataTransfer;
      if (!dt || internal.current || !relevant(e)) return;
      const hasFiles = dt.files.length > 0;
      if (ignore(e)) {
        if (hasFiles) e.preventDefault(); // 同上：别让浏览器把文件打开
        return;
      }
      e.preventDefault();
      if (hasFiles) return void handleFiles([...dt.files]);
      const image = loneImage(dt.getData("text/html"));
      if (image) return void handleData(image);
      // uri-list 里以 # 开头的行是注释；没有网址就用纯文字
      const uri = dt
        .getData("text/uri-list")
        .split(/\r?\n/)
        .find((l) => l && !l.startsWith("#"));
      const text = (uri || dt.getData("text/plain")).trim();
      if (text) void handleData({ text });
    };

    window.addEventListener("dragstart", onDragStart);
    window.addEventListener("dragend", onDragEnd);
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragstart", onDragStart);
      window.removeEventListener("dragend", onDragEnd);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [navigate]);

  if (!active) return null;
  return (
    // pointer-events-none：这一层只是提示，鼠标事件照样落到下面的页面上，拖放由 window 上的监听处理
    <div className="pointer-events-none fixed inset-0 z-[70] grid place-items-center bg-veil p-6 backdrop-blur-[3px]" aria-hidden>
      <div className="glass-strong w-full max-w-md rounded-[28px] border-2 border-dashed border-brand/60 px-8 py-10 text-center">
        <Inbox className="mx-auto size-10 text-brand" strokeWidth={1.5} />
        <p className="mt-4 text-lg font-medium">松手，自动归类</p>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li>视频链接、视频文件 → 收藏 › 视频</li>
          <li>图片 → 收藏 › 图片</li>
          <li>其他网址 → 网址</li>
          <li>一段文字 → 收藏 › 摘录</li>
        </ul>
      </div>
    </div>
  );
}
