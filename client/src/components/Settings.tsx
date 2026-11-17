import { useRef, useState, type ReactNode } from "react";
import { Check, ImageUp, LogOut, Moon, Pipette, RotateCcw, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api, uploadFile, type User } from "../api";
import Avatar, { squareAvatar } from "./Avatar";
import Modal from "./Modal";
import { useAuth } from "../context/AuthContext";
import { useMusic } from "../music/MusicContext";
import { shrinkWallpaper } from "../wallpaper";
import { PET_COLORS, PET_SCALE, petPalette, setPetPrefs, usePetPrefs, type PetColor } from "../pet/prefs";
import { ACCENTS, GLASS_RANGE, setAccent, setGlass, setThemePref, useTheme, type Accent, type ThemePref } from "../theme";

const THEME_OPTIONS: { key: ThemePref; label: string; icon: LucideIcon }[] = [
  { key: "dark", label: "黄昏", icon: Moon },
  { key: "light", label: "晨曦", icon: Sun },
  { key: "system", label: "跟随系统", icon: SunMoon },
];

// 没动过滑块时，滑块停在主题自带的默认值上（和 index.css 里的 --glass-fill 一致）
const GLASS_DEFAULT = { light: 46, dark: 36 };

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

/** 设置弹窗。外观和音乐偏好只存在这台电脑的浏览器里，头像存在服务器上；都是改了立刻生效，不需要保存按钮 */
export default function Settings({ onClose, onLogout }: { onClose: () => void; onLogout: () => void }) {
  const { user, updateUser } = useAuth();
  const { pref, theme, accent, glass } = useTheme();
  const music = useMusic();
  const glassValue = glass ?? GLASS_DEFAULT[theme];
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  // 头像跟着账号走（存在服务器上），和上面那些只存在浏览器里的外观偏好不同
  const pickAvatar = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ""; // 清空，这样下次选同一张图也会触发
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", await squareAvatar(file), "avatar.webp");
      updateUser(await uploadFile<User>("/avatar", form));
      toast.success("头像已更换");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 壁纸和头像一样存在服务器上；AuthContext 发现 user.wallpaper 变了会自动铺到全站
  const wallRef = useRef<HTMLInputElement>(null);
  const [wallBusy, setWallBusy] = useState(false);

  const pickWallpaper = async (file: File | undefined) => {
    if (wallRef.current) wallRef.current.value = "";
    if (!file) return;
    setWallBusy(true);
    try {
      const form = new FormData();
      form.append("file", await shrinkWallpaper(file), "wallpaper.webp");
      updateUser(await uploadFile<User>("/wallpaper", form));
      toast.success("壁纸已更换");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWallBusy(false);
    }
  };

  const removeWallpaper = async () => {
    if (!user) return;
    setWallBusy(true);
    try {
      await api.del("/wallpaper");
      updateUser({ ...user, wallpaper: null });
      toast.success("已恢复默认壁纸");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setWallBusy(false);
    }
  };

  const removeAvatar = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await api.del("/avatar");
      updateUser({ ...user, avatar: null });
      toast.success("头像已移除");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="设置" onClose={onClose}>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <Section title="外观">
          <Row label="主题" hint="黄昏是深色，晨曦是浅色">
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

          <div className="flex items-center gap-4">
            {/* 小预览直接用当前生效的壁纸变量：内置的天空或者上传的图都能显示 */}
            <div className="h-14 w-24 shrink-0 rounded-[10px] ring-1 ring-line" style={{ background: "var(--wallpaper)" }} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm">壁纸</div>
              <div className="mt-0.5 text-xs text-slate-500">{user?.wallpaper ? "正在用你上传的图片。" : "正在用内置的天空，可以换成自己的图片。"}深色的图配黄昏、浅色的图配晨曦，文字最清楚。</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button className="btn bg-ink/8 px-2.5 py-1 text-xs hover:bg-ink/12" disabled={wallBusy} onClick={() => wallRef.current?.click()}>
                  <ImageUp className="size-3.5" /> {wallBusy ? "处理中…" : user?.wallpaper ? "换一张" : "上传图片"}
                </button>
                {user?.wallpaper && (
                  <button className="btn-ghost px-2.5 py-1 text-xs" disabled={wallBusy} onClick={removeWallpaper}>
                    <RotateCcw className="size-3.5" /> 恢复默认
                  </button>
                )}
              </div>
            </div>
            <input ref={wallRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickWallpaper(e.target.files?.[0])} />
          </div>

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
                    accent === a ? "ring-2 ring-ink ring-offset-2 ring-offset-transparent" : "opacity-80 hover:opacity-100"
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
            <div className="mt-0.5 text-xs text-slate-500">所有玻璃面板有多透</div>
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

        <PetSection />

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
          <div className="flex items-center gap-4">
            <Avatar user={user} className="size-14 text-xl" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.username}</div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <button className="btn bg-ink/6 px-2.5 py-1 text-xs hover:bg-ink/10" disabled={busy} onClick={() => fileRef.current?.click()}>
                  <ImageUp className="size-3.5" /> {busy ? "上传中…" : user?.avatar ? "更换头像" : "上传头像"}
                </button>
                {user?.avatar && (
                  <button className="btn-ghost px-2.5 py-1 text-xs" disabled={busy} onClick={removeAvatar}>
                    移除头像
                  </button>
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">图片会自动裁成正方形，取正中间的部分。</div>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickAvatar(e.target.files?.[0])} />
          </div>
          <Row label="退出登录" hint="退出后需要重新输入密码">
            <button className="btn-danger" onClick={onLogout}>
              <LogOut className="size-4" /> 退出
            </button>
          </Row>
        </Section>
      </div>
    </Modal>
  );
}

/** 桌宠：显不显示、名字、颜色、位置（都存在这台电脑的浏览器里） */
function PetSection() {
  const pet = usePetPrefs();
  const custom = petPalette({ color: "custom", customColor: pet.customColor });
  return (
    <Section title="桌宠">
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4" checked={pet.visible} onChange={(e) => setPetPrefs({ visible: e.target.checked })} />
        <span>
          显示果冻团子
          <span className="mt-0.5 block text-xs text-slate-500">待在右下角，AI 干活时会告诉你进度，也会提醒你今天的事；点它有菜单，按住可以拖动</span>
        </span>
      </label>
      {pet.visible && (
        <>
          <Row label="名字">
            <input className="input w-36" maxLength={8} value={pet.name} onChange={(e) => setPetPrefs({ name: e.target.value })} onBlur={(e) => !e.target.value.trim() && setPetPrefs({ name: "团团" })} aria-label="桌宠的名字" />
          </Row>
          <Row label="颜色">
            <div className="flex max-w-[11.5rem] flex-wrap justify-end gap-2" role="radiogroup" aria-label="桌宠的颜色">
              {(Object.keys(PET_COLORS) as Exclude<PetColor, "custom">[]).map((k) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={pet.color === k}
                  aria-label={PET_COLORS[k].name}
                  title={PET_COLORS[k].name}
                  onClick={() => setPetPrefs({ color: k })}
                  style={{ background: `radial-gradient(circle at 38% 30%, ${PET_COLORS[k].light}, ${PET_COLORS[k].deep})` }}
                  className={`grid size-7 cursor-pointer place-items-center rounded-full text-white transition active:scale-90 ${pet.color === k ? "ring-2 ring-ink ring-offset-2 ring-offset-transparent" : "opacity-80 hover:opacity-100"}`}
                >
                  {pet.color === k && <Check className="size-4" strokeWidth={3} />}
                </button>
              ))}
              {/* 自己挑颜色：系统的取色器盖在圆点上，点圆点就弹出来 */}
              <label
                role="radio"
                aria-checked={pet.color === "custom"}
                title="自己挑颜色"
                style={{ background: pet.color === "custom" ? `radial-gradient(circle at 38% 30%, ${custom.light}, ${custom.deep})` : "conic-gradient(#ff6b6b, #ffd45e, #6fd08f, #4a95e8, #8b6cf0, #ff6b9c, #ff6b6b)" }}
                className={`relative grid size-7 cursor-pointer place-items-center rounded-full text-white transition active:scale-90 ${pet.color === "custom" ? "ring-2 ring-ink ring-offset-2 ring-offset-transparent" : "opacity-80 hover:opacity-100"}`}
              >
                {pet.color === "custom" ? <Check className="size-4" strokeWidth={3} /> : <Pipette className="size-3.5 drop-shadow" />}
                <input
                  type="color"
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  value={pet.customColor}
                  onClick={() => pet.color !== "custom" && setPetPrefs({ color: "custom" })}
                  onChange={(e) => setPetPrefs({ color: "custom", customColor: e.target.value })}
                  aria-label="自己挑颜色"
                />
              </label>
            </div>
          </Row>
          <Row label="大小" hint={`${Math.round(pet.scale * 100)}%${pet.scale === 1 ? "（默认）" : ""}`}>
            <div className="flex items-center gap-2">
              <input
                type="range"
                className="w-32 cursor-pointer accent-brand"
                min={PET_SCALE.min}
                max={PET_SCALE.max}
                step={PET_SCALE.step}
                value={pet.scale}
                onChange={(e) => setPetPrefs({ scale: Math.round(Number(e.target.value) * 10) / 10 })}
                aria-label="桌宠的大小"
              />
              {pet.scale !== 1 && (
                <button className="btn-ghost p-1" onClick={() => setPetPrefs({ scale: 1 })} title="恢复默认大小" aria-label="恢复默认大小">
                  <RotateCcw className="size-3.5" />
                </button>
              )}
            </div>
          </Row>
          {pet.pos && (
            <Row label="位置" hint="拖到了找不到的地方？放回右下角">
              <button className="btn bg-ink/6 px-2.5 py-1 text-xs hover:bg-ink/10" onClick={() => setPetPrefs({ pos: null })}>
                <RotateCcw className="size-3.5" /> 放回原位
              </button>
            </Row>
          )}
        </>
      )}
    </Section>
  );
}
