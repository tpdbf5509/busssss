import { FormEvent, useState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setMessage("가입이 완료되었습니다. 이메일을 확인한 뒤 로그인해 주세요.");
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "인증에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 px-5 py-16 flex items-center justify-center">
      <div className="pointer-events-none absolute -right-20 -top-24 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 -bottom-20 w-72 h-72 rounded-full bg-white/10 blur-3xl" />
      <div className="relative w-full max-w-md bg-white rounded-[28px] card-shadow-lg p-7">
        <div className="text-center mb-7">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/30">
            <LockKeyhole className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">BUS STOP</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            {mode === "login" ? "로그인하고 버스 정보를 이용해 주세요" : "BUS STOP 계정을 만들어 주세요"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">이메일</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-slate-100 px-3 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white transition-all">
              <Mail className="w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="이메일을 입력하세요"
                className="w-full bg-transparent py-3 text-sm outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-slate-600">비밀번호</span>
            <div className="mt-1.5 rounded-xl bg-slate-100 px-3 ring-1 ring-transparent focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white transition-all">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="6자 이상 입력하세요"
                className="w-full bg-transparent py-3 text-sm outline-none"
              />
            </div>
          </label>

          {message && (
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-600">
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-blue-500/35 active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
          }}
          className="w-full mt-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
        >
          {mode === "login" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}
        </button>
      </div>
    </div>
  );
}
