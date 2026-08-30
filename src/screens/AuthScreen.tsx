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

  // body가 position:fixed + overflow:hidden이라(index.css) 브라우저의 기본
  // "포커스된 입력창을 화면에 보이게 자동 스크롤" 동작이 막힌다. 앱 안의
  // 다른 화면은 전부 자체 overflow-y-auto 컨테이너를 갖고 있어 괜찮지만
  // 이 화면은 body 밖 최상위에 그대로 렌더링돼 스크롤 가능한 조상이 아예
  // 없었다 — 키보드가 비밀번호 입력창을 가려도 스크롤해서 볼 방법이
  // 없었다. overflow-y-auto를 추가해 그 조상 역할을 하게 한다.
  // Auth는 Brand Screen — 브랜드 블루 단색을 화면 전체 배경으로 사용한다
  // (그라디언트 금지). min-h-screen 배경이 뷰포트 전체를 채우므로 상단/하단
  // Safe Area에도 별도 처리 없이 브랜드 블루가 자연스럽게 이어진다.
  return (
    <div className="min-h-screen overflow-y-auto bg-blue-600 px-5 py-16 flex items-center justify-center">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-100 p-6">
        <div className="text-center mb-7">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
            <LockKeyhole className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">BUS STOP</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "login" ? "로그인하고 버스 정보를 이용해 주세요" : "BUS STOP 계정을 만들어 주세요"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">이메일</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-slate-100 px-3">
              <Mail className="w-4 h-4 text-slate-500" />
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
            <div className="mt-1.5 rounded-xl bg-slate-100 px-3">
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
            className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
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
          className="w-full mt-4 py-2 text-sm font-medium text-blue-600"
        >
          {mode === "login" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}
        </button>
      </div>
    </div>
  );
}
