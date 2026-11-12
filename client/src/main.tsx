import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "./index.css";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import Dashboard from "./pages/Dashboard";
import Work from "./pages/Work";
import Life from "./pages/Life";
import JournalPage from "./pages/Journal";
import Learning from "./pages/Learning";
import Habits from "./pages/Habits";
import Favorites from "./pages/Favorites";
import { Toaster } from "sonner";
import { ConfirmHost } from "./components/Confirm";
import { MusicProvider } from "./music/MusicContext";
import { useTheme } from "./theme";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-screen place-items-center text-sm text-slate-400">加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  // 音乐播放器的状态放在页面之上：切换页面时音乐不会断
  return (
    <MusicProvider>
      <Layout />
    </MusicProvider>
  );
}

function GuestOnly({ mode }: { mode: "login" | "register" }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage mode={mode} />;
}

// 提示条跟随当前主题
function Toasts() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="top-center"
      richColors
      closeButton
      duration={2500}
      toastOptions={{ className: "!rounded-2xl !shadow-lg" }}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Toasts />
    <ConfirmHost />
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<GuestOnly mode="login" />} />
          <Route path="/register" element={<GuestOnly mode="register" />} />
          <Route element={<Protected />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/work" element={<Work />} />
            <Route path="/learning" element={<Learning />} />
            <Route path="/habits" element={<Habits />} />
            <Route path="/life" element={<Life />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/favorites" element={<Favorites />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
