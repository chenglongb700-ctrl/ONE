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
import { Toaster } from "sonner";
import { ConfirmHost } from "./components/Confirm";

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-screen place-items-center text-slate-400">加载中…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function GuestOnly({ mode }: { mode: "login" | "register" }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage mode={mode} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <div className="bg-blobs" aria-hidden>
      <span className="left-[-8rem] top-[-6rem] size-[28rem] bg-indigo-300" />
      <span className="right-[-6rem] top-[20%] size-[24rem] bg-pink-300 [animation-delay:-6s]" />
      <span className="bottom-[-8rem] left-[30%] size-[30rem] bg-emerald-200 [animation-delay:-12s]" />
    </div>
    <Toaster
      position="top-center"
      richColors
      closeButton
      duration={2500}
      toastOptions={{ className: "!rounded-xl !border-white/60 !shadow-lg !backdrop-blur-xl" }}
    />
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
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>,
);
