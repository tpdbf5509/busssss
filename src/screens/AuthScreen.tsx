import { FormEvent, useRef, useState } from "react";
import { LockKeyhole, Mail, WifiOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { AuthDebugProbe } from "@/components/AuthDebugProbe";

/**
 * Supabase/브라우저가 주는 영어 원문을 한국어 안내로 바꾼다.
 *
 * 네트워크가 불안정할 때 "Failed to fetch" 같은 문구가 한국어 화면 한가운데
 * 그대로 뜨던 문제(QA #12). 원인을 모르는 사용자에게는 무슨 일이 일어났는지도,
 * 뭘 해야 하는지도 알려주지 못한다.
 */
function toKoreanAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const m = raw.toLowerCase();

  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network request")) {
    return "네트워크에 연결하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요.";
  }
  if (m.includes("invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않아요.";
  }
  if (m.includes("email not confirmed")) {
    return "이메일 인증이 아직 완료되지 않았어요. 받은 편지함을 확인해 주세요.";
  }
  if (m.includes("user already registered") || m.includes("already been registered")) {
    return "이미 가입된 이메일이에요. 로그인해 주세요.";
  }
  if (m.includes("password should be at least")) {
    return "비밀번호는 6자 이상이어야 해요.";
  }
  if (m.includes("rate limit") || m.includes("too many requests")) {
    return "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
  }
  // 매핑하지 못한 경우: 원문을 숨기지 않고 덧붙인다. 문의 시 단서가 된다.
  return raw ? `인증에 실패했어요. (${raw})` : "인증에 실패했어요.";
}

type AuthScreenProps = {
  /**
   * 로그인 화면으로 넘어온 이유가 "로그아웃"이 아닐 때 그 사정을 알린다.
   * 예: 네트워크 문제로 로그인 상태를 확인하지 못한 경우(App.tsx).
   */
  notice?: string;
};

export function AuthScreen({ notice }: AuthScreenProps = {}) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

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
      setMessage(toKoreanAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-500 px-5 py-16 flex items-center justify-center"
    >
      {/* TEST C: 콘텐츠와 무관한 순수 배경 전용 레이어. 뷰포트 하단 경계
          밖으로 47px 일부러 넘치게(bleed) 둬서, iOS가 그 색을 상태바/홈
          인디케이터 영역에 반영하는지 확인한다. 상호작용 없음
          (pointer-events:none), 메인 컨테이너 배경 뒤에 깔림(z-index:-1).
          결과 확정되면 이 블록 통째로 제거한다. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: -47,
          background: "linear-gradient(to bottom, #2563eb, #3b82f6)",
          zIndex: -1,
          pointerEvents: "none",
        }}
      />
      <AuthDebugProbe rootRef={rootRef} />
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6">
        <div className="text-center mb-7">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <LockKeyhole className="w-7 h-7 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">BUS STOP</h1>
          <p className="text-sm text-slate-500 mt-1">
            {mode === "login" ? "로그인하고 버스 정보를 이용해 주세요" : "BUS STOP 계정을 만들어 주세요"}
          </p>
        </div>

        {notice && !message && (
          <div className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
            <WifiOff className="mt-0.5 w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-slate-600">이메일</span>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-slate-100 px-3">
              <Mail className="w-4 h-4 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="이메일을 입력하세요"
                className="w-full bg-transparent py-3 text-base outline-none"
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
                className="w-full bg-transparent py-3 text-base outline-none"
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
