import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type User } from "../api";
import { applyWallpaper } from "../wallpaper";

type AuthCtx = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** 资料变了（比如换了头像）以后，用新的用户信息替换当前的 */
  updateUser: (u: User) => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  // 登录状态确定后，把这个账号的壁纸铺上；退出登录或没设置壁纸时回到内置的天空
  useEffect(() => {
    if (!loading) applyWallpaper(user?.wallpaper ?? null);
  }, [loading, user?.wallpaper]);

  const value: AuthCtx = {
    user,
    loading,
    login: async (username, password) => setUser(await api.post<User>("/auth/login", { username, password })),
    register: async (username, password) => setUser(await api.post<User>("/auth/register", { username, password })),
    logout: async () => {
      await api.post("/auth/logout");
      setUser(null);
    },
    updateUser: setUser,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
