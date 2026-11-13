import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Bookmark, BookOpen, Briefcase, CircleCheckBig, Compass, LayoutDashboard, Leaf, LogOut, Moon, PenLine, Settings as SettingsIcon, SquareSlash, Sun, SunMoon, type LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import PlayerBar from "../music/PlayerBar";
import { setThemePref, useTheme, type ThemePref } from "../theme";
import Avatar from "./Avatar";
import { Mark, Wordmark } from "./Brand";
import Settings from "./Settings";

export const MODULES: Record<string, { label: string; icon: LucideIcon }> = {
  "/": { label: "总览", icon: LayoutDashboard },
  "/work": { label: "工作", icon: Briefcase },
  "/learning": { label: "学习", icon: BookOpen },
  "/habits": { label: "习惯", icon: CircleCheckBig },
  "/life": { label: "生活", icon: Leaf },
  "/journal": { label: "感悟", icon: PenLine },
  "/favorites": { label: "收藏", icon: Bookmark },
  "/sites": { label: "网址", icon: Compass },
  "/commands": { label: "命令", icon: SquareSlash },
};

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

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="glass sticky top-0 z-40 flex shrink-0 items-center justify-between border-x-0 border-t-0 px-2 py-2 sm:px-3 md:top-3 md:m-3 md:h-[calc(100vh-1.5rem)] md:w-56 md:flex-col md:items-stretch md:justify-start md:rounded-[24px] md:border md:px-3 md:py-5">
        <div className="flex items-center gap-2.5 px-1 md:mb-7 md:px-2.5">
          <Mark />
          <Wordmark className="hidden text-[17px] sm:inline" />
        </div>

        {/* 手机上图标一排放不下时可以左右滑 */}
        <nav ref={navRef} className="flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none] md:flex-col md:gap-1 md:overflow-visible" aria-label="主导航">
          {Object.entries(MODULES).map(([to, m]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={m.label}
              className={({ isActive }) =>
                `group flex items-center gap-3 rounded-[10px] px-2 py-2 text-sm transition md:px-2.5 ${
                  isActive ? "bg-surface font-medium text-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.22)]" : "text-slate-600 hover:bg-ink/8 hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <m.icon className={`size-[18px] shrink-0 ${isActive ? "text-brand" : "text-slate-500 group-hover:text-slate-700"}`} strokeWidth={isActive ? 2.2 : 1.8} />
                  <span className="hidden md:inline">{m.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1 md:mt-auto md:border-t md:border-line md:pt-3">
          <span className="hidden min-w-0 flex-1 items-center gap-2 px-1.5 md:flex" title={user?.username}>
            <Avatar user={user} className="size-7 text-xs" />
            <span className="truncate text-sm text-slate-600">{user?.username}</span>
          </span>
          {/* 手机上位置紧，主题切换收进设置里 */}
          <button className="btn-ghost hidden p-2 md:inline-flex" onClick={() => setThemePref(T.next)} title={`主题：${T.label}（点击切换）`} aria-label={`主题：${T.label}，点击切换`}>
            <T.icon className="size-4" />
          </button>
          <button className="btn-ghost p-2" onClick={() => setSettingsOpen(true)} title="设置" aria-label="设置">
            <SettingsIcon className="size-4" />
          </button>
          {/* 手机上位置紧，退出登录在设置里也有 */}
          <button className="btn-ghost hidden p-2 md:inline-flex" onClick={onLogout} title="退出登录" aria-label="退出登录">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>

      <main key={location.pathname} className="page-enter mx-auto w-full min-w-0 max-w-6xl flex-1 p-4 pb-24 md:px-8 md:pb-28 md:pt-9">
        <Outlet />
      </main>
      <PlayerBar />
      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} onLogout={onLogout} />}
    </div>
  );
}
