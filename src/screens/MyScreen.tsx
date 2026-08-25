import { useState, useEffect } from "react";
import {
  ChevronRight,
  MapPin,
  Star,
  Pencil,
  Trash2,
  Bell,
  HelpCircle,
  LogOut,
  Moon,
  Type,
  Eye,
  Volume2,
  Check,
  X,
  Menu,
} from "lucide-react";
import { useApp } from "@/store/AppContext";
import { RegionModal } from "@/components/RegionModal";
import { Toggle } from "@/components/ui";
import { showToast } from "@/components/Toast";
import { requestNotificationPermission } from "@/services/alertMonitorService";
import { supabase } from "@/lib/supabaseClient";

const SETTINGS_KEY = "busssss_settings_v1";

interface AppSettings {
  darkMode: boolean;
  largeText: boolean;
  colorBlind: boolean;
  voiceGuide: boolean;
}

const defaultSettings: AppSettings = {
  darkMode: false,
  largeText: false,
  colorBlind: false,
  voiceGuide: false,
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {}
  return { ...defaultSettings };
}

function applySettings(s: AppSettings) {
  const root = document.documentElement;
  root.classList.toggle("dark", s.darkMode);
  root.classList.toggle("large-text", s.largeText);
  root.classList.toggle("color-blind", s.colorBlind);
}

export function MyScreen() {
  const { state, dispatch } = useApp();
  const [regionOpen, setRegionOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    applySettings(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = (id: string, label: string) => {
    setEditingId(id);
    setEditLabel(label);
  };

  const saveEdit = () => {
    if (editingId) {
      dispatch({ type: "RENAME_FAVORITE", id: editingId, label: editLabel });
      showToast("이름을 변경했어요");
    }
    setEditingId(null);
  };

  const handleNotification = async () => {
    const ok = await requestNotificationPermission();
    if (ok) showToast("알림 권한이 허용되었어요");
    else showToast("알림 권한이 필요해요. 브라우저 설정에서 허용해 주세요");
  };

  const handleLogout = async () => {
    if (!confirm("로그아웃 할까요? (로컬 설정은 유지됩니다)")) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast("로그아웃에 실패했어요");
      return;
    }
    showToast("로그아웃되었어요");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      <div className="flex-1 overflow-hidden overscroll-contain">
      <header className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-600 px-5 pt-16 pb-11 text-white">
          <div className="pointer-events-none absolute -right-10 -top-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
          <button
            onClick={() => setMenuOpen(true)}
            className="absolute top-14 right-4 p-2 text-white rounded-full hover:bg-white/10 active:scale-90 transition-all"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm ring-2 ring-white/30 flex items-center justify-center text-2xl font-bold">
              승
            </div>
            <div>
              <h1 className="text-lg font-bold">승객님</h1>
              <button
                onClick={() => setRegionOpen(true)}
                className="flex items-center gap-1 text-sm text-blue-100 mt-0.5 hover:text-white transition-colors"
              >
                <MapPin className="w-3.5 h-3.5" />
                {state.region.sido} {state.region.sigungu}
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </header>

        
        <div className="flex-1 overscroll-contain">
        {/* 즐겨찾기 카드 — 파란 헤더 위로 겹침 */}
        <section className="px-4 -mt-5 relative z-10">
          <div className="bg-white rounded-2xl card-shadow-lg p-4">
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-700 mb-3">
              <Star className="w-4 h-4 text-amber-400" />
              즐겨찾기 관리
            </div>
            <p className="text-xs text-slate-400 mb-3">항목을 눌러 이름을 바꿀 수 있어요</p>

            {state.favorites.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">즐겨찾기가 없어요</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto overscroll-contain">
              {state.favorites.map((fav) => (
                  <div
                    key={fav.id}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center shrink-0">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    </div>
                    {editingId === fav.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          autoFocus
                          className="flex-1 px-2.5 py-1.5 bg-slate-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          onClick={saveEdit}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {fav.name}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {fav.label} · {fav.type === "station" ? "정류장" : "노선"}
                          </p>
                        </div>
                        <button
                          onClick={() => startEdit(fav.id, fav.label)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            dispatch({ type: "REMOVE_FAVORITE", id: fav.id });
                            showToast("삭제했어요");
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>


        <p className="text-center text-xs text-slate-300 pt-4 pb-6">BUS STOP v1.0.0</p>
      </div>

      <RegionModal
        open={regionOpen}
        onClose={() => setRegionOpen(false)}
        onSelect={(sido, sigungu) => {
          dispatch({ type: "SET_REGION", sido, sigungu });
          setRegionOpen(false);
          showToast(`${sido} ${sigungu}로 설정되었어요`);
        }}
      />

      {helpOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md p-5 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 mb-3">도움말</h2>
            <ul className="space-y-2 text-sm text-slate-600 leading-relaxed">
              <li>· 홈에서 즐겨찾기를 관리하고 도착 정보를 확인해요.</li>
              <li>· 버스 탭에서 노선을 검색하고 실시간 위치를 볼 수 있어요.</li>
              <li>· 알림 탭에서 하차 알림을 설정하면 정거장 전에 알려줘요.</li>
              <li>· 카드 탭은 미리보기용이며 실제 결제는 지원하지 않아요.</li>
              <li>· 다크모드·큰 글씨·색약 모드는 이 기기에서만 적용돼요.</li>
            </ul>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-5 w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl font-semibold text-sm shadow-lg shadow-blue-500/25 active:scale-[0.99] transition-all"
            >
              확인
            </button>
          </div>
          </div>
      )}

      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
            <div className="relative bg-white w-72 h-full shadow-2xl overflow-y-auto animate-slide-in-right">
            <div className="pt-[15vh]" />
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 text-lg">설정</h2>
              <button
                onClick={() => setMenuOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

           

            <SettingRow
              icon={Bell}
              label="알림 설정"
              onClick={handleNotification}
            />

            <SettingToggle
              icon={Volume2}
              label="음성 안내"
              checked={settings.voiceGuide}
              onChange={(v) => {
                updateSetting("voiceGuide", v);
                showToast(v ? "음성 안내를 켰어요" : "음성 안내를 껐어요");
              }}
            />

            <SettingToggle
              icon={Moon}
              label="다크모드"
              checked={settings.darkMode}
              onChange={(v) => {
                updateSetting("darkMode", v);
                showToast(v ? "다크모드를 켰어요" : "다크모드를 껐어요");
              }}
            />

            <SettingRow
              icon={ChevronRight}
              label="더보기"
              onClick={() => setMoreOpen((prev) => !prev)}
            />

            {moreOpen && (
              <>
                <SettingToggle
                  icon={Type}
                  label="큰 글씨"
                  checked={settings.largeText}
                  onChange={(v) => {
                    updateSetting("largeText", v);
                    showToast(v ? "큰 글씨를 켰어요" : "큰 글씨를 껐어요");
                  }}
                />

                <SettingToggle
                  icon={Eye}
                  label="색약 모드"
                  checked={settings.colorBlind}
                  onChange={(v) => {
                    updateSetting("colorBlind", v);
                    showToast(v ? "색약 모드를 켰어요" : "색약 모드를 껐어요");
                  }}
                />

                <SettingRow
                  icon={HelpCircle}
                  label="도움말"
                  onClick={() => setHelpOpen(true)}
                />
              </>
            )}

            <SettingRow
              icon={LogOut}
              label="로그아웃"
              danger
              onClick={handleLogout}
              last
            />
          </div>
        </div>
      )}
    </div>
  </div>
  );
}

function SettingRow({
  icon: Icon,
  label,
  onClick,
  danger,
  last,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors ${
        !last ? "border-b border-slate-50" : ""
      }`}
    >
      <span
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          danger ? "bg-red-50" : "bg-slate-100"
        }`}
      >
        <Icon className={`w-4 h-4 ${danger ? "text-red-500" : "text-slate-500"}`} />
      </span>
      <span
        className={`flex-1 text-left text-sm font-medium ${
          danger ? "text-red-500" : "text-slate-700"
        }`}
      >
        {label}
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300" />
    </button>
  );
}

function SettingToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50">
      <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </span>
      <span className="flex-1 text-left text-sm font-medium text-slate-700">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}