import { useId } from "react";
import type { PetPalette } from "./prefs";

/**
 * 果冻团子（原创形象，SVG 画的）。动画都在 pet.css 里，只用 transform 和 opacity，不卡。
 *
 * mood    表情：idle 平常 / happy 开心（眯眼张嘴笑）/ think 在想（眼睛往上看，头上冒"…"）
 *         / sleep 睡着（闭眼、冒 z）/ worried 担心（八字眉、嘴角往下）
 * stage   成长阶段 1–5，每长一级多一样东西：
 *         1 光溜溜的小团子 → 2 头上冒出小芽 → 3 小芽开花 → 4 再别一颗小星星 → 5 戴上小皇冠
 * 眼睛会跟着鼠标看：外面设 CSS 变量 --look-x / --look-y（几个像素）
 */
export type Mood = "idle" | "happy" | "think" | "sleep" | "worried";

const INK = "#2a2f3d";

export default function Blob({ mood, stage, palette: c }: { mood: Mood; stage: number; palette: PetPalette }) {
  const id = useId().replace(/:/g, "");
  const eyesUp = mood === "think" ? -3 : 0;

  return (
    <svg viewBox="0 0 120 120" className="pet-svg" aria-hidden>
      <defs>
        <radialGradient id={`body-${id}`} cx="38%" cy="30%" r="80%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="100%" stopColor={c.deep} />
        </radialGradient>
      </defs>

      {/* 地上的影子：身体弹起来时它会缩小（pet.css） */}
      <ellipse className="pet-shadow" cx="60" cy="109" rx="33" ry="4.5" fill="#000" opacity=".16" />

      <g className="pet-body">
        {/* 身体：上面圆、下面宽一点的一团 */}
        <path d="M60 26 C 89 26, 104 51, 104 77 C 104 97, 86 105, 60 105 C 34 105, 16 97, 16 77 C 16 51, 31 26, 60 26 Z" fill={`url(#body-${id})`} />
        {/* 果冻的高光 */}
        <ellipse cx="42" cy="46" rx="11" ry="6.5" fill="#fff" opacity=".6" transform="rotate(-28 42 46)" />
        <circle cx="54" cy="38" r="2.4" fill="#fff" opacity=".7" />
        {/* 腮红 */}
        <ellipse cx="35" cy="80" rx="6" ry="3.5" fill="#ff5c8a" opacity={mood === "sleep" ? 0.3 : 0.5} />
        <ellipse cx="85" cy="80" rx="6" ry="3.5" fill="#ff5c8a" opacity={mood === "sleep" ? 0.3 : 0.5} />

        {/* 眼睛 */}
        <g className="pet-look">
          {mood === "happy" ? (
            <g stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none">
              <path d="M41 71 Q46 64 51 71" />
              <path d="M69 71 Q74 64 79 71" />
            </g>
          ) : mood === "sleep" ? (
            <g stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none">
              <path d="M41 69 Q46 74 51 69" />
              <path d="M69 69 Q74 74 79 69" />
            </g>
          ) : (
            // 往上看的位移放在外面一层：里面那层的眨眼动画会占用 transform
            <g transform={`translate(0 ${eyesUp})`}>
              <g className="pet-eyes">
                <ellipse cx="46" cy="69" rx="4.4" ry="5.8" fill={INK} />
                <ellipse cx="74" cy="69" rx="4.4" ry="5.8" fill={INK} />
                <circle cx="47.6" cy="66.6" r="1.6" fill="#fff" />
                <circle cx="75.6" cy="66.6" r="1.6" fill="#fff" />
              </g>
            </g>
          )}
          {mood === "worried" && (
            <g stroke={INK} strokeWidth="2" strokeLinecap="round">
              <path d="M40 58 L50 61" />
              <path d="M80 58 L70 61" />
            </g>
          )}
        </g>

        {/* 嘴 */}
        {mood === "happy" ? (
          <g>
            <path d="M53 80 Q60 91 67 80 Z" fill={INK} />
            <path d="M56.5 85 Q60 88.5 63.5 85 Q60 83 56.5 85 Z" fill="#ff8fa8" />
          </g>
        ) : mood === "think" ? (
          <circle cx="63" cy="83" r="2.4" fill={INK} />
        ) : mood === "worried" ? (
          <path d="M54 85 Q60 79 66 85" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        ) : mood === "sleep" ? (
          <ellipse cx="60" cy="83" rx="2.2" ry="1.6" fill={INK} opacity=".8" />
        ) : (
          <path d="M55 81 Q60 86 65 81" stroke={INK} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        )}

        {/* ---- 成长的装饰 ---- */}
        {stage >= 2 && stage < 5 && (
          <g className="pet-sprout">
            <path d="M60 27 Q58.5 19 61 12" stroke="#3f9a5c" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            <path d="M60.5 17 Q70 8 75 14 Q67 20 60.5 17 Z" fill="#6fd08f" />
            <path d="M60 20 Q50 13 45.5 18.5 Q53 24 60 20 Z" fill="#5cc27e" />
            {stage >= 3 && (
              <g transform="translate(61 10)">
                {[0, 72, 144, 216, 288].map((a) => (
                  <circle key={a} cx={Math.cos(((a - 90) * Math.PI) / 180) * 4} cy={Math.sin(((a - 90) * Math.PI) / 180) * 4} r="3.4" fill="#ffb3c8" />
                ))}
                <circle r="2.6" fill="#ffd45e" />
              </g>
            )}
          </g>
        )}
        {stage >= 4 && (
          <path className="pet-star" d="M90 44 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5-2.4 -4.5 2.4 .9-5 -3.6-3.5 5-.7 Z" fill="#ffd45e" stroke="#e9a92a" strokeWidth=".8" strokeLinejoin="round" />
        )}
        {stage >= 5 && (
          <g className="pet-crown">
            <path d="M46 29 L48 16 L54.5 23 L60 12 L65.5 23 L72 16 L74 29 Z" fill="#ffcf4a" stroke="#dc9f22" strokeWidth="1.2" strokeLinejoin="round" />
            <circle cx="60" cy="24" r="2" fill="#ff7b9c" />
          </g>
        )}
      </g>

      {/* 头上冒的东西 */}
      {mood === "think" && (
        <g className="pet-dots" fill={c.deep}>
          <circle cx="92" cy="22" r="3" />
          <circle cx="101" cy="16" r="3" />
          <circle cx="110" cy="10" r="3" />
        </g>
      )}
      {mood === "sleep" && (
        <g className="pet-zzz" fill={c.deep} fontWeight="700" fontFamily="system-ui, sans-serif">
          <text x="88" y="30" fontSize="12">z</text>
          <text x="97" y="20" fontSize="15">z</text>
          <text x="107" y="9" fontSize="18">Z</text>
        </g>
      )}
    </svg>
  );
}
