import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Briefcase, CircleCheckBig, CircleUser, LayoutDashboard, Leaf, LogOut, PenLine, Sprout, type LucideIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";

// 每个模块一个固定颜色，页面标题和首页卡片用同一套
export const MODULES: Record<string, { label: string; icon: LucideIcon; tone: string; text: string }> = {
  "/": { label: "总览", icon: LayoutDashboard, tone: "bg-slate-800", text: "text-slate-700" },
  "/work": { label: "工作", icon: Briefcase, tone: "bg-indigo-500", text: "text-indigo-600" },
  "/learning": { label: "学习", icon: BookOpen, tone: "bg-violet-500", text: "text-violet-600" },
  "/habits": { label: "习惯", icon: CircleCheckBig, tone: "bg-rose-500", text: "text-rose-600" },
  "/life": { label: "生活", icon: Leaf, tone: "bg-emerald-500", text: "text-emerald-600" },
  "/journal": { label: "感悟", icon: PenLine, tone: "bg-amber-500", text: "text-amber-600" },
};

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center justify-between glass sticky top-0 z-40 border-x-0 border-t-0 px-4 py-3 md:top-3 md:m-3 md:h-[calc(100vh-1.5rem)] md:w-56 md:flex-col md:items-stretch md:justify-start md:rounded-2xl md:border md:py-6">
        <div className="flex items-center gap-2 text-lg font-bold tracking-wide md:mb-8 md:px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-md shadow-emerald-900/20">
            <Sprout className="size-4.5" strokeWidth={2.4} />
          </span>
          <span className="hidden sm:inline">ONE</span>
        </div>
        <nav className="flex gap-1 md:flex-col">
          {Object.entries(MODULES).map(([to, m]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={m.label}
              className={({ isActive }) =>
                `group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                  isActive ? "bg-white/80 font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <m.icon className={`size-[18px] shrink-0 transition ${isActive ? m.text : "text-slate-500 group-hover:text-slate-700"}`} strokeWidth={isActive ? 2.4 : 2} />
                  <span className="hidden md:inline">{m.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 md:mt-auto md:flex-col md:items-stretch md:gap-2 md:px-1">
          <span className="hidden items-center gap-2 px-1.5 text-sm text-slate-500 md:flex">
            <CircleUser className="size-4" />
            {user?.username}
          </span>
          <button className="btn-ghost md:justify-start" onClick={onLogout} title="退出登录">
            <LogOut className="size-4" />
            <span className="hidden md:inline">退出</span>
          </button>
        </div>
      </aside>
      <main key={location.pathname} className="page-enter mx-auto w-full min-w-0 max-w-6xl flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
