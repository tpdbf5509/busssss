import { useState } from "react";
import { Plus, Minus, CreditCard, TrendingUp, Receipt, ArrowUpRight, ArrowDownLeft } from "lucide-react";
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
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      <header className="bg-gradient-to-b from-slate-900 to-slate-800 px-5 pt-16 pb-9 text-white sticky top-0 z-30 shrink-0">
        <h1 className="text-xl font-bold mb-4">모바일 버스카드</h1>

        <div className="relative bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-400 rounded-2xl p-5 shadow-xl overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full" />
          <div className="absolute -right-4 -bottom-10 w-24 h-24 bg-white/10 rounded-full" />
          <div className="relative">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                <span className="text-sm font-medium text-blue-50">{card.cardName}</span>
              </div>
              <span className="text-xs text-blue-100">{card.cardNumber}</span>
            </div>
            <div>
              <p className="text-xs text-blue-100 mb-1">잔액</p>
              <p className="text-3xl font-bold tracking-tight">
                {state.cardBalance.toLocaleString()}
                <span className="text-lg font-medium ml-1">원</span>
              </p>
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain">
          <section className="px-4 -mt-4 mb-7">
            <div className="bg-surface rounded-2xl border border-line px-4 py-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <CreditCard className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">카드 기능은 준비중이에요</p>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  모바일 버스카드 연동이 아직 완료되지 않아 실제 충전·결제 기능은 사용할 수 없어요.
                  아래 화면은 미리보기용입니다.
                </p>
              </div>
            </div>
          </section>

          <section className="px-4 mt-1"></section>

      <section className="px-4 -mt-4">
        <div className="bg-surface rounded-2xl border border-line p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">충전하기</h2>
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
                  className="w-full px-4 py-3 pr-12 bg-slate-100 rounded-xl text-base font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      <section className="px-4 mt-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              이번 주
            </div>
            <p className="text-lg font-bold text-slate-900">
              {card.weeklyUsage.toLocaleString()}
              <span className="text-sm text-slate-400 ml-0.5">원</span>
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
              <TrendingUp className="w-3.5 h-3.5" />
              이번 달
            </div>
            <p className="text-lg font-bold text-slate-900">
              {card.monthlyUsage.toLocaleString()}
              <span className="text-sm text-slate-400 ml-0.5">원</span>
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 mt-4">
        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-3">
          <Receipt className="w-4 h-4" />
          이용 내역
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          {card.history.map((h, i) => (
            <div
              key={h.id}
              className={`flex items-center justify-between px-4 py-3.5 ${
                i !== card.history.length - 1 ? "border-b border-slate-50" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    h.type === "charge" ? "bg-emerald-50" : "bg-blue-50"
                  }`}
                >
                  {h.type === "charge" ? (
                    <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <ArrowUpRight className="w-4 h-4 text-blue-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {h.type === "charge" ? "충전" : h.routeName}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{h.fromStation}</p>
                  <p className="text-[11px] text-slate-300">{h.date}</p>
                </div>
              </div>
              <span
                className={`text-sm font-semibold ${
                  h.type === "charge" ? "text-emerald-600" : "text-slate-700"
                }`}
              >
                {h.type === "charge" ? "+" : "-"}
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
