import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ErrorText } from "../components/Modal";

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
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-stone-100 to-amber-50 p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-8">
        <div className="text-center">
          <div className="text-4xl">🌱</div>
          <h1 className="mt-2 text-xl font-bold">{isLogin ? "欢迎回来" : "创建账号"}</h1>
          <p className="mt-1 text-sm text-stone-500">记录工作、生活与每一次感悟</p>
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
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "请稍候…" : isLogin ? "登录" : "注册"}
        </button>
        <p className="text-center text-sm text-stone-500">
          {isLogin ? "还没有账号？" : "已有账号？"}
          <Link className="ml-1 font-medium text-stone-800 underline" to={isLogin ? "/register" : "/login"}>
            {isLogin ? "去注册" : "去登录"}
          </Link>
        </p>
      </form>
    </div>
  );
}
