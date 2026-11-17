import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bookmark, Dumbbell, Briefcase, Compass, Flame, LayoutDashboard, Leaf, LogOut, Moon, Newspaper, PenLine, Settings as SettingsIcon, SquareSlash, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PlayerBar from "../music/PlayerBar";
import { setThemePref, useTheme, type ThemePref } from "../theme";
import Avatar from "./Avatar";
import AiMenu from "./AiMenu";
import { DATA_CHANGED_EVENT } from "./AiCapture";
import CountdownCorner from "./Countdown";
import DropZone from "./DropZone";
import { Mark, Wordmark } from "./Brand";
import Settings from "./Settings";
import Pet from "../pet/Pet";

export const MODULES: Record<string, { label: string; icon: LucideIcon }> = {
  "/": { label: "总览", icon: LayoutDashboard },
  "/work": { label: "工作", icon: Briefcase },
  "/life": { label: "生活", icon: Leaf },
  "/fitness": { label: "健身", icon: Dumbbell },
  "/journal": { label: "随记", icon: PenLine },
  "/news": { label: "资讯", icon: Newspaper },
  "/trending": { label: "GitHub 热门", icon: Flame },
  "/favorites": { label: "收藏", icon: Bookmark },
  "/sites": { label: "网址", icon: Compass },
  "/commands": { label: "命令", icon: SquareSlash },
};

// 侧边栏里把页面分成三组：每天要处理的、每天来看看的、存起来备查的
const NAV_GROUPS: { label: string; paths: string[] }[] = [
  { label: "日常", paths: ["/", "/work", "/life", "/fitness", "/journal"] },
  { label: "发现", paths: ["/news", "/trending"] },
  { label: "收集", paths: ["/favorites", "/sites", "/commands"] },
];

// 主题按钮：点一下换到下一种
const THEMES: Record<ThemePref, { label: string; icon: LucideIcon; next: ThemePref }> = {
  dark: { label: "黄昏", icon: Moon, next: "light" },
  light: { label: "晨曦", icon: Sun, next: "system" },
  system: { label: "跟随系统", icon: SunMoon, next: "dark" },
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { pref } = useTheme();
  const T = THEMES[pref];
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 手机上导航图标一排放不下、可以左右滑：换页面后把当前这一项滑到看得见的地方
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [location.pathname]);

  // 「记一笔」保存了新记录后会发这个事件：把版本号加一，当前页面整个重建一次，自然就重新读数据了
  const [dataVersion, setDataVersion] = useState(0);
  useEffect(() => {
    const bump = () => setDataVersion((v) => v + 1);
    window.addEventListener(DATA_CHANGED_EVENT, bump);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, bump);
  }, []);

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="glass sticky top-0 z-40 flex shrink-0 items-center justify-between border-x-0 border-t-0 px-2 py-2 sm:px-3 md:top-3 md:m-3 md:h-[calc(100vh-1.5rem)] md:w-56 md:flex-col md:items-stretch md:justify-start md:rounded-[24px] md:border md:px-3 md:py-5">
        <div className="flex shrink-0 items-center gap-2.5 px-1 md:mb-6 md:px-2.5">
          <Mark />
          <Wordmark className="hidden text-[17px] sm:inline" />
        </div>

        {/* 手机上图标一排放不下时可以左右滑 */}
        {/* 窗口不够高时，电脑上这一列自己上下滚，底下的账号一栏始终看得见 */}
        <nav ref={navRef} className="flex min-w-0 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:-mx-1 md:min-h-0 md:flex-1 md:flex-col md:items-stretch md:gap-0 md:overflow-y-auto md:overflow-x-visible md:px-1" aria-label="主导航">
          {NAV_GROUPS.map((g, gi) => (
            <div key={g.label} className="contents md:block" role="group" aria-label={g.label}>
              {/* 组与组之间：手机上是一道细竖线，电脑上是一行小标题 */}
              {gi > 0 && <span className="mx-1 h-4 w-px shrink-0 bg-line md:hidden" aria-hidden />}
              <div className={`hidden px-2.5 pb-1.5 text-[11px] font-medium tracking-[0.18em] text-slate-400 md:block ${gi > 0 ? "pt-5" : ""}`} aria-hidden>
                {g.label}
              </div>
              <div className="contents md:flex md:flex-col md:gap-0.5">
                {g.paths.map((to) => {
                  const m = MODULES[to];
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/"}
                      title={m.label}
                      className={({ isActive }) =>
                        `group relative flex shrink-0 items-center gap-3 rounded-[10px] px-2 py-2 text-sm transition md:px-2.5 ${
                          isActive ? "bg-surface font-medium text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.22)]" : "text-slate-600 hover:bg-ink/8 hover:text-ink"
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <m.icon className={`size-[18px] shrink-0 transition-colors ${isActive ? "text-brand" : "text-slate-500 group-hover:text-slate-700"}`} strokeWidth={isActive ? 2.2 : 1.8} />
                          <span className="hidden md:inline">{m.label}</span>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex items-center gap-0.5 md:mt-3 md:border-t md:border-line md:pt-3">
          {/* 头像和名字合成一个按钮，点开就是设置 */}
          <button className="hidden min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-left transition hover:bg-ink/8 md:flex" onClick={() => setSettingsOpen(true)} title={`${user?.username ?? ""} · 打开设置`}>
            <Avatar user={user} className="size-8 text-xs" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium leading-tight">{user?.username}</span>
              <span className="block text-[11px] leading-tight text-slate-500">设置</span>
            </span>
          </button>
          {/* 手机上位置紧，主题切换收进设置里 */}
          <button className="btn-ghost hidden p-2 md:inline-flex" onClick={() => setThemePref(T.next)} title={`主题：${T.label}（点击切换）`} aria-label={`主题：${T.label}，点击切换`}>
            <T.icon className="size-4" />
          </button>
          <button className="btn-ghost p-2 md:hidden" onClick={() => setSettingsOpen(true)} title="设置" aria-label="设置">
            <SettingsIcon className="size-4" />
          </button>
          {/* 手机上位置紧，退出登录在设置里也有 */}
          <button className="btn-ghost hidden p-2 md:inline-flex" onClick={onLogout} title="退出登录" aria-label="退出登录">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      {/* side-panel-room：右侧的 AI 面板打开时，宽屏上给它让出位置（见 index.css） */}
      <div className="side-panel-room mx-auto flex w-full min-w-0 max-w-6xl flex-1 flex-col">
        {/* 右上角的倒计时放在换页时会重建的 main 外面：换页面不闪、不重新读数据 */}
        <div className="flex items-center justify-end gap-2 px-4 pt-3 md:px-8 md:pt-4">
          <div className="min-w-0">
            <CountdownCorner />
          </div>
          <AiMenu />
        </div>
        <main key={`${location.pathname}#${dataVersion}`} className="page-enter w-full min-w-0 flex-1 p-4 pb-24 pt-2 md:px-8 md:pb-28 md:pt-2">
          <Outlet />
        </main>
      </div>
      <PlayerBar />
      <Pet />
      <DropZone />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onLogout={onLogout} />}
    </div>
  );
}
