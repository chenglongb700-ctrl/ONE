import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ErrorText } from "../components/Modal";
import { Mark, Wordmark } from "../components/Brand";

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isLogin && password !== confirm) return setError("两次输入的密码不一致");
    setBusy(true);
    try {
      await (isLogin ? login : register)(username, password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 rounded-[22px] p-8">
        <div className="pb-2">
          <div className="flex items-center gap-2.5">
            <Mark />
            <Wordmark className="text-[17px]" />
          </div>
          <h1 className="mt-7 text-[26px] font-light leading-tight tracking-wide">{isLogin ? "欢迎回来" : "创建账号"}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{isLogin ? "登录后继续安排今天。" : "工作、学习、习惯和日子，都放在这一个地方。"}</p>
        </div>
        <div>
          <label className="label">用户名</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoFocus required />
        </div>
        <div>
          <label className="label">密码</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {!isLogin && (
          <div>
            <label className="label">确认密码</label>
            <input className="input" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
        )}
        <ErrorText msg={error} />
        <button className="btn-primary w-full py-2.5" disabled={busy}>
          {busy ? "请稍候…" : isLogin ? "登录" : "注册"}
        </button>
        <p className="text-center text-sm text-slate-500">
          {isLogin ? "还没有账号？" : "已有账号？"}
          <Link className="ml-1 font-medium text-ink underline underline-offset-4" to={isLogin ? "/register" : "/login"}>
            {isLogin ? "去注册" : "去登录"}
          </Link>
        </p>
      </form>
    </div>
  );
}
