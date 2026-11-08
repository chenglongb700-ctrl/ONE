import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const nav = [
  { to: "/", label: "总览", icon: "🏠" },
  { to: "/work", label: "工作", icon: "💼" },
  { to: "/life", label: "生活", icon: "🌿" },
  { to: "/journal", label: "感悟", icon: "✍️" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex shrink-0 items-center justify-between glass sticky top-0 z-40 border-x-0 border-t-0 px-4 py-3 md:top-3 md:m-3 md:h-[calc(100vh-1.5rem)] md:w-56 md:flex-col md:items-stretch md:justify-start md:rounded-2xl md:border md:py-6">
        <div className="text-lg font-bold tracking-wide md:mb-8 md:px-2">🌱 ONE</div>
        <nav className="flex gap-1 md:flex-col">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                  isActive ? "bg-white/80 font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/50"
                }`
              }
            >
              <span>{n.icon}</span>
              <span className="hidden sm:inline">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 md:mt-auto md:flex-col md:items-stretch md:px-2">
          <span className="hidden text-sm text-slate-500 md:block">👤 {user?.username}</span>
          <button className="btn-ghost" onClick={onLogout}>
            退出
          </button>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
