import { useEffect, useRef } from "react";
import { useTheme } from "../theme";

/**
 * 频谱：用 Web Audio 的 AnalyserNode 读取每个频段的能量，画成柱子。
 * 没有 analyser（外链歌曲）时，播放中画一段柔和的波动动画代替。
 */
export default function Spectrum({
  analyser,
  playing,
  bars = 24,
  className = "",
}: {
  analyser: AnalyserNode | null;
  playing: boolean;
  bars?: number;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme(); // 换主题时重新取一次颜色

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    if (!g) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    // 柱子用全站唯一的强调色，底部实、顶部淡
    const brand = getComputedStyle(document.documentElement).getPropertyValue("--brand").trim() || "#2452d6";

    // 跟随元素大小和屏幕像素密度调整画布
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.max(1, cv.clientWidth * dpr);
      cv.height = Math.max(1, cv.clientHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(cv);

    const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
    const levels = new Float32Array(bars);
    let raf = 0;

    const draw = (now: number) => {
      const W = cv.width;
      const H = cv.height;
      g.clearRect(0, 0, W, H);

      if (analyser && playing) {
        analyser.getByteFrequencyData(data);
        // 低频细、高频粗地分组（人耳对低频更敏感），只取前 45% 的频段（约 10kHz 以下），再往上音乐里基本没有能量
        const usable = Math.floor(data.length * 0.45);
        for (let i = 0; i < bars; i++) {
          const a = Math.floor(usable * (i / bars) ** 1.6);
          const b = Math.max(a + 1, Math.floor(usable * ((i + 1) / bars) ** 1.6));
          let sum = 0;
          for (let k = a; k < b; k++) sum += data[k];
          const v = sum / (b - a) / 255;
          levels[i] = Math.max(v, levels[i] * 0.85); // 下落时慢一点，看起来更顺
        }
      } else {
        for (let i = 0; i < bars; i++) {
          const target = playing && !reduce ? 0.18 + 0.14 * Math.sin(now / 380 + i * 0.55) * Math.sin(now / 900 + i * 0.21) : 0.04;
          levels[i] += (target - levels[i]) * 0.12;
        }
      }

      const gap = Math.max(1, W / bars / 4);
      const bw = W / bars - gap;
      const grad = g.createLinearGradient(0, H, 0, 0);
      grad.addColorStop(0, brand);
      grad.addColorStop(1, brand + "73");
      g.fillStyle = grad;
      for (let i = 0; i < bars; i++) {
        const h = Math.max(H * 0.06, levels[i] * H);
        const x = i * (bw + gap) + gap / 2;
        const r = Math.max(0, Math.min(bw / 2, 3 * (window.devicePixelRatio || 1))); // 画布还没排好版时宽度可能是 0
        if (bw <= 0) break;
        g.beginPath();
        g.roundRect(x, H - h, bw, h, [r, r, 0, 0]);
        g.fill();
      }

      // 暂停后柱子落到底就停止重绘，省电
      const settled = !playing && levels.every((v) => Math.abs(v - 0.04) < 0.005);
      if (!settled) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [analyser, playing, bars, theme]);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
