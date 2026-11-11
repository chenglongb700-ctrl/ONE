import type { ReactNode } from "react";
import { Check, LogOut, Moon, Sun, SunMoon, type LucideIcon } from "lucide-react";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";
import { useMusic } from "../music/MusicContext";
import { ACCENTS, GLASS_RANGE, setAccent, setGlass, setThemePref, useTheme, type Accent, type ThemePref } from "../theme";

const THEME_OPTIONS: { key: ThemePref; label: string; icon: LucideIcon }[] = [
  { key: "system", label: "跟随系统", icon: SunMoon },
  { key: "light", label: "浅色", icon: Sun },
  { key: "dark", label: "深色", icon: Moon },
];

// 没动过滑块时，滑块停在主题自带的默认值上（和 index.css 里的 --glass-fill 一致）
const GLASS_DEFAULT = { light: 38, dark: 32 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-5 first:border-t-0 first:pt-0 last:pb-0">
      <h3 className="mb-3 text-sm font-medium">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** 设置弹窗。外观和音乐偏好只存在这台电脑的浏览器里，改了立刻生效，不需要保存按钮 */
export default function Settings({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const { user } = useAuth();
  const { pref, theme, accent, glass } = useTheme();
  const music = useMusic();
  const glassValue = glass ?? GLASS_DEFAULT[theme];

  return (
    <Modal title="设置" onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <Section title="外观">
          <Row label="主题">
            <div className="flex rounded-xl bg-ink/6 p-1 text-sm" role="radiogroup" aria-label="主题">
              {THEME_OPTIONS.map((o) => (
                <button
                  key={o.key}
                  role="radio"
                  aria-checked={pref === o.key}
                  onClick={() => setThemePref(o.key)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 transition ${pref === o.key ? "bg-surface shadow-sm" : "text-slate-600 hover:text-ink"}`}
                >
                  <o.icon className="size-4" />
                  {o.label}
                </button>
              ))}
            </div>
          </Row>

          <Row label="强调色" hint="用在选中的导航、进度条和链接上">
            <div className="flex gap-2" role="radiogroup" aria-label="强调色">
              {(Object.keys(ACCENTS) as Accent[]).map((a) => (
                <button
                  key={a}
                  role="radio"
                  aria-checked={accent === a}
                  aria-label={ACCENTS[a].name}
                  title={ACCENTS[a].name}
                  onClick={() => setAccent(a)}
                  style={{ backgroundColor: ACCENTS[a].swatch }}
                  className={`grid size-7 cursor-pointer place-items-center rounded-full text-white transition active:scale-90 ${
                    accent === a ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  {accent === a && <Check className="size-4" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </Row>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="glass-range" className="text-sm">
                玻璃通透度
              </label>
              {glass !== null && (
                <button className="cursor-pointer text-xs text-slate-500 underline underline-offset-4 hover:text-ink" onClick={() => setGlass(null)}>
                  恢复默认
                </button>
              )}
            </div>
            <div className="mt-0.5 text-xs text-slate-500">侧边栏和播放条的毛玻璃有多透</div>
            <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
              <span>更透</span>
              <input
                id="glass-range"
                type="range"
                className="h-1 min-w-0 flex-1 cursor-pointer"
                min={GLASS_RANGE.min}
                max={GLASS_RANGE.max}
                value={glassValue}
                onChange={(e) => setGlass(Number(e.target.value))}
              />
              <span>更实</span>
            </div>
          </div>
        </Section>

        <Section title="音乐">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-4" checked={music.autoplay} onChange={(e) => music.setAutoplay(e.target.checked)} />
            <span>
              自动播放
              <span className="mt-0.5 block text-xs text-slate-500">打开网站后，第一次点击页面时开始播放上次听的歌</span>
            </span>
          </label>
        </Section>

        <Section title="账号">
          <Row label={user?.username ?? ""} hint="当前登录的账号">
            <button className="btn-danger" onClick={onLogout}>
              <LogOut className="size-4" /> 退出登录
            </button>
          </Row>
        </Section>
      </div>
    </Modal>
  );
}
