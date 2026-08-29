import { useState } from "react";
import { Plus, Minus, CreditCard, TrendingUp, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { useApp } from "@/store/appContext";
import { CARD_INFO } from "@/data/mock";
import { showToast } from "@/lib/toastStore";

const chargeAmounts = [1000, 5000, 10000, 50000];
const MAX_CHARGE_AMOUNT = 900000; // 실제 교통카드 1회 최대 충전 한도와 비슷하게 제한

export function CardScreen() {
  const { state } = useApp();
  const [amount, setAmount] = useState(5000);
  const [charging, setCharging] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState("");

  const card = CARD_INFO;

  const handleCharge = () => {
    if (amount <= 0) return;
    setCharging(true);
    setTimeout(() => {
      // 모바일 버스카드 연동 전이라 실제로는 잔액을 바꾸지 않습니다.
      // (화면 상단에도 "준비중"이라고 안내하는데, 이전엔 여기서 실제로
      // CHARGE_CARD를 dispatch해 안내 문구와 동작이 어긋났습니다.)
      setCharging(false);
      showToast("아직 준비 중인 기능이에요. 미리보기 화면입니다");
    }, 800);
  };

  const applyCustomInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, "").slice(0, 7); // 900,000원 상한이라 7자리면 충분
    setCustomInput(digits);
    const n = parseInt(digits || "0", 10);
    if (!Number.isNaN(n)) setAmount(Math.min(MAX_CHARGE_AMOUNT, n));
  };

  const formatLabel = (amt: number) => {
    if (amt >= 10000) return `${amt / 10000}만원`;
    if (amt >= 1000) return `${amt / 1000}천원`;
    return `${amt}원`;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      <header className="bg-white px-5 pt-safe-header pb-6 sticky top-0 z-30 shrink-0 border-b border-slate-200">
        <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em] leading-tight">
          모바일 버스카드
        </h1>

        <div className="mt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500">
              <CreditCard className="w-4 h-4" />
              <span className="text-[13px] font-medium">{card.cardName}</span>
            </div>
            <span className="text-[12px] text-slate-400 tabular-nums">{card.cardNumber}</span>
          </div>
          <div className="mt-3">
            <p className="text-[12px] text-slate-400">잔액</p>
            <p className="text-[34px] font-bold tracking-[-0.03em] text-slate-900 leading-none mt-1">
              {state.cardBalance.toLocaleString()}
              <span className="text-lg font-medium ml-1 text-slate-400">원</span>
            </p>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain">
          <section className="px-5 pt-5 pb-6">
            <p className="text-[13px] font-semibold text-slate-900">카드 기능은 준비중이에요</p>
            <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">
              모바일 버스카드 연동이 아직 완료되지 않아 실제 충전·결제 기능은 사용할 수 없어요.
              아래 화면은 미리보기용입니다.
            </p>
          </section>

      <section className="px-5">
        <div className="border-t border-slate-200 pt-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[17px] font-bold text-slate-900 tracking-[-0.01em]">충전하기</h2>
            <button
              onClick={() => {
                setCustomMode((v) => !v);
                if (!customMode) setCustomInput(amount > 0 ? String(amount) : "");
              }}
              className="text-xs text-blue-600 font-medium hover:underline"
            >
              {customMode ? "금액 선택" : "직접 입력"}
            </button>
          </div>

          {!customMode ? (
            <div className="grid grid-cols-4 gap-2 mb-4">
              {chargeAmounts.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAmount(amt)}
                  className={`py-2.5 rounded-xl text-sm font-medium transition-colors ${
                    amount === amt
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {formatLabel(amt)}
                </button>
              ))}
            </div>
          ) : (
            <div className="mb-4">
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  value={customInput}
                  onChange={(e) => applyCustomInput(e.target.value)}
                  placeholder="충전 금액 입력"
                  className="w-full px-4 py-3 pr-12 bg-slate-100 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  원
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5 px-1">
                1,000원 단위로 입력하는 것을 권장해요
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => {
                const next = Math.max(0, amount - 1000);
                setAmount(next);
                if (customMode) setCustomInput(next > 0 ? String(next) : "");
              }}
              className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <Minus className="w-4 h-4 text-slate-600" />
            </button>
            <div className="flex-1 text-center">
              <span className="text-2xl font-bold text-slate-900">
                {amount.toLocaleString()}
              </span>
              <span className="text-base text-slate-400 ml-1">원</span>
            </div>
            <button
              onClick={() => {
                const next = Math.min(MAX_CHARGE_AMOUNT, amount + 1000);
                setAmount(next);
                if (customMode) setCustomInput(String(next));
              }}
              className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
            >
              <Plus className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <button
            onClick={handleCharge}
            disabled={charging || amount <= 0}
            className="w-full py-3.5 bg-blue-600 text-white rounded-2xl font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {charging ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                충전 중...
              </>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                {amount.toLocaleString()}원 충전
              </>
            )}
          </button>
        </div>
      </section>

      <section className="px-5 mt-8">
        <div className="grid grid-cols-2 gap-6 border-t border-slate-200 pt-5">
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
              <TrendingUp className="w-3.5 h-3.5" />
              이번 주
            </div>
            <p className="text-[20px] font-bold text-slate-900 mt-1.5 tracking-[-0.02em]">
              {card.weeklyUsage.toLocaleString()}
              <span className="text-[13px] font-medium text-slate-400 ml-0.5">원</span>
            </p>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
              <TrendingUp className="w-3.5 h-3.5" />
              이번 달
            </div>
            <p className="text-[20px] font-bold text-slate-900 mt-1.5 tracking-[-0.02em]">
              {card.monthlyUsage.toLocaleString()}
              <span className="text-[13px] font-medium text-slate-400 ml-0.5">원</span>
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 mt-8 scroll-pb-safe">
        <h2 className="text-[17px] font-bold text-slate-900 tracking-[-0.01em] mb-3">
          이용 내역
        </h2>
        <div className="divide-y divide-slate-100 border-t border-slate-200">
          {card.history.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-3 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                {/* 아이콘 컨테이너에 같은 계열 배경을 깔지 않는다 — 아이콘만 중립색으로 */}
                {h.type === "charge" ? (
                  <ArrowDownLeft className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ArrowUpRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-[15px] font-medium text-slate-900 truncate tracking-tight">
                    {h.type === "charge" ? "충전" : h.routeName}
                  </p>
                  <p className="text-[12px] text-slate-400 mt-0.5 truncate">
                    {h.fromStation} · {h.date}
                  </p>
                </div>
              </div>
              <span className="text-[15px] font-semibold text-slate-900 tabular-nums shrink-0">
                {h.type === "charge" ? "+" : "−"}
                {h.amount.toLocaleString()}원
              </span>
            </div>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
