import { useState, useEffect } from "react";
import {
  ChevronRight,
  MoreHorizontal,
  MapPin,
  Star,
  Pencil,
  Trash2,
  Bell,
  HelpCircle,
  LogOut,
  Type,
  Eye,
  Volume2,
  X,
  Menu,
  Smartphone,
} from "lucide-react";
import { useApp } from "@/store/appContext";
import { useAsync } from "@/hooks/useAsync";
import { fetchAllRoutes } from "@/services/routeService";
import type { Route } from "@/types/route";
import { AddShortcutSheet } from "@/components/AddShortcutSheet";
import { Toggle } from "@/components/ui";
import { showToast } from "@/lib/toastStore";
import { requestNotificationPermission } from "@/services/alertMonitorService";
import { supabase } from "@/lib/supabaseClient";
import type { Favorite } from "@/types";

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
    // darkMode는 토글을 숨긴 동안 강제로 꺼둔다. 예전에 켜둔 사용자가
    // 끄는 방법 없이 반쪽짜리 다크 화면에 갇히는 걸 막는다.
    if (raw) return { ...defaultSettings, ...JSON.parse(raw), darkMode: false };
  } catch (err) {
    console.warn("[MyScreen] 설정 로드 실패:", err);
  }
  return { ...defaultSettings };
}

function applySettings(s: AppSettings) {
  const root = document.documentElement;
  root.classList.toggle("dark", s.darkMode);
  root.classList.toggle("large-text", s.largeText);
  root.classList.toggle("color-blind", s.colorBlind);
}

/** 노선 즐겨찾기의 기점 → 종점. 알 수 없으면 null을 돌려 부르는 쪽이 종류를 쓴다. */
function favoriteDirection(fav: Favorite, routes: Route[] | null | undefined): string | null {
  if (!routes) return null;
  const routeId = fav.type === "route" ? fav.refId : fav.appRouteId;
  if (!routeId) return null;
  const route = routes.find((r) => r.id === routeId);
  if (!route) return null;
  return `${route.start || "기점"} → ${route.end || "종점"}`;
}

export function MyScreen() {
  const { state, dispatch } = useApp();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [helpOpen, setHelpOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shortcutFavorite, setShortcutFavorite] = useState<Favorite | null>(null);

  /* 즐겨찾기에 방향(기점 → 종점)을 붙이기 위해 노선 목록을 읽는다.
     fetchAllRoutes는 모듈 수준 캐시라, 홈에서 이미 받아 뒀으면 여기서
     네트워크 요청이 새로 나가지 않는다. */
  const { data: routes } = useAsync(() => fetchAllRoutes(), []);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    () => ("Notification" in window ? Notification.permission : "denied")
  );
  /**
   * 로그인 관문을 걷어낸 뒤로(App.tsx 참고) 대부분의 사용자는 계정이 없다.
   * 그런 사용자에게 로그아웃 메뉴를 보여주면 누를 수는 있는데 아무 일도
   * 일어나지 않아 혼란스럽다. 예전에 로그인해 둔 사용자만 보이게 한다.
   * getSession()은 저장된 세션을 읽기만 해서 네트워크를 타지 않는다.
   */
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setHasSession(Boolean(data.session));
      })
      .catch((err) => {
        // 세션을 못 읽으면 메뉴를 숨긴 채로 둔다. 로그아웃은 계정이 있는
        // 사용자를 위한 부가 기능이라 실패해도 앱 사용에는 지장이 없다.
        console.debug("[MyScreen] 세션 확인 실패:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applySettings(settings);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      console.warn("[MyScreen] 설정 저장 실패:", err);
    }
  }, [settings]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const startEdit = (id: string, label: string) => {
    setEditingId(id);
    setEditLabel(label);
  };

  const saveEdit = () => {
    if (!editingId) return;

    /* 빈 이름으로 저장하면 목록에 "· 정류장"처럼 앞이 비어 보이고 되돌릴
       방법도 없다. 비었으면 저장하지 않고 편집 상태를 유지해 이어서 입력하게 둔다. */
    const label = editLabel.trim();
    if (!label) {
      showToast("이름을 입력해 주세요");
      return;
    }

    dispatch({ type: "RENAME_FAVORITE", id: editingId, label });
    showToast("이름을 변경했어요");
    setEditingId(null);
  };

  const handleNotification = async () => {
    const ok = await requestNotificationPermission();
    setNotifPermission(
      ok ? "granted" : "Notification" in window ? Notification.permission : "denied"
    );
    if (ok) showToast("알림 권한이 허용되었어요");
    else showToast("알림 권한이 필요해요. 브라우저 설정에서 허용해 주세요");
  };

  const notifPermissionLabel =
    notifPermission === "granted" ? "허용됨" : notifPermission === "denied" ? "거부됨" : "설정 필요";

  // window.confirm()은 iOS 홈 화면에 설치된 standalone PWA에서는 브라우저
  // 크롬이 없어 표시되지 않거나 즉시 취소된 것처럼 동작하는 WebKit 제약이
  // 있다. 이 앱의 목표가 아이폰 홈 화면 배포라 네이티브 confirm() 대신
  // 자체 확인 모달(logoutConfirmOpen)을 쓴다.
  const performLogout = async () => {
    setLogoutConfirmOpen(false);
    const { error } = await supabase.auth.signOut();
    if (error) {
      showToast("로그아웃에 실패했어요");
      return;
    }
    setHasSession(false);
    showToast("로그아웃되었어요");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-canvas">
      {/* 공통 얇은 헤더(DESIGN.md 8장): canvas 바탕, 안전영역 + 3.5rem, 제목
          Title, 아래 선 없음. 예전에는 넓은 파란 머리(bg-brand, pt-safe-16 +
          pb-9) 안에 프로필이 있었고 즐겨찾기 카드가 그 위로 겹쳐 올라왔다.
          4-6 "넓은 파랑 면은 히어로 하나뿐"에 맞춰 파란 면을 걷고, 프로필은
          아래 흰 카드로 옮겼다. */}
      <header className="bg-canvas px-5 pt-safe-0 shrink-0">
        <div className="h-14 flex items-center justify-between gap-3">
          <h1 className="text-title text-ink">마이</h1>
          {/* 설정 메뉴. 홈 헤더와 같은 원형 버튼(보이는 원 40px, 누르는 영역
              44px). 예전에는 파란 머리 위에 떠 있어서 Dynamic Island(59px
              안전영역)를 피하려고 top을 안전영역 기준으로 따로 계산했다
              (고정 top-14 56px이면 섬 안으로 들어갔다). 이제 헤더 줄 안에
              있어 pt-safe-0이 그 일을 한다. */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="설정 메뉴"
            className="relative w-10 h-10 shrink-0 rounded-full bg-surface border border-line flex items-center justify-center text-ink active:bg-canvas before:content-[''] before:absolute before:-inset-0.5 select-none touch-manipulation transition-transform duration-100 active:scale-[0.98]"
          >
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* 예전에는 이 상자가 overflow-hidden이라, 큰 글씨처럼 내용이 길어지면
          아래쪽이 스크롤되지 않고 잘렸다. 세로로 스크롤되게 바꾼다. 맨 아래는
          pb-5 + App 스크롤 영역의 0.5rem = 하단 탭 위 28px. */}
      <div className="flex-1 overflow-y-auto overscroll-contain pb-5">
        <section className="px-5 pt-2">
          <div className="bg-surface rounded-card border border-line p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-brand-soft text-brand flex items-center justify-center text-title shrink-0" aria-hidden="true">
              승
            </div>
            <div className="min-w-0">
              <p className="text-body-strong text-ink">승객님</p>
              {/* 지역은 전주시 고정이다. 모든 API가 JEONJU_CITY_CODE로 나가기
                  때문에 다른 지역을 골라도 전주 데이터만 나온다. 고를 수 있는
                  것처럼 보이지 않도록 표시 전용으로 둔다(홈 화면도 동일). */}
              <p className="flex items-center gap-1 text-caption text-muted mt-0.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {state.region.sido} {state.region.sigungu}
              </p>
            </div>
          </div>
        </section>

        <section className="px-5 mt-7">
          {/* 제목은 홈 섹션과 같은 문법: 카드 위 Body-strong ink, 내용과 12px.
              예전에는 카드 안에 항목 이름보다 작고 연한 제목(12px muted + 별)을
              뒀다 — 같은 무게면 위계가 사라진다는 이유였다. 제목을 카드 밖으로
              빼면 항목과 섞이지 않아 6장 섹션 제목 크기를 그대로 쓸 수 있다. */}
          <h2 className="text-body-strong text-ink">즐겨찾기 관리</h2>
          <p className="text-caption text-muted mt-0.5 mb-3">항목을 눌러 이름을 바꿀 수 있어요</p>
          {/* 카드 안에서 행마다 둥근 상자를 그리고 사이를 띄우면 항목이 따로
              떠 있는 것처럼 보인다. 한 판 안에서 구분선으로만 나눈다
              (홈 화면의 즐겨찾기와 같은 문법). */}
          <div className="bg-surface rounded-card border border-line overflow-hidden">
            {state.favorites.length === 0 ? (
              <p className="text-body text-muted text-center py-6">즐겨찾기가 없어요</p>
            ) : (
              <div className="max-h-60 overflow-y-auto overscroll-contain divide-y divide-line">
              {state.favorites.map((fav) => (
                  <div
                    key={fav.id}
                    className="min-h-16 flex items-center gap-3 px-4 py-3 select-none touch-manipulation"
                  >
                    {/* 7-8과 같은 36px 아이콘 타일(brand-soft + brand 18px).
                        예전 회색 타일은 흰 판 위에서 거의 보이지 않았다. */}
                    <div className="w-9 h-9 rounded-tile bg-brand-soft flex items-center justify-center shrink-0">
                      <Star className="w-4.5 h-4.5 text-brand" aria-hidden="true" />
                    </div>
                    {editingId === fav.id ? (
                      /* form으로 감싸면 휴대폰 키보드의 확인키가 그대로 저장이
                         된다. 예전에는 작은 체크 아이콘을 정확히 눌러야만 저장됐고,
                         키보드 확인키를 누르거나 바깥을 탭하거나 다른 탭에 갔다
                         오면 입력한 이름이 아무 말 없이 사라졌다. */
                      <form
                        /* min-w-0이 없으면 flex 항목은 내용보다 작아지지 못한다.
                           입력칸 기본 너비 때문에 폼이 카드 밖으로 삐져나가
                           저장 버튼이 화면 밖에서 잘렸다(실측: 폼 403px, 카드 358px). */
                        className="flex-1 min-w-0 flex items-center gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveEdit();
                        }}
                      >
                        <input
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          autoFocus
                          aria-label="즐겨찾기 이름"
                          placeholder="이름"
                          enterKeyHint="done"
                          className="min-w-0 flex-1 px-2.5 py-1.5 bg-canvas rounded-tile text-base text-ink placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                        {/* 아이콘만 있으면 어느 쪽이 저장인지 알 수 없다. 글자를 쓴다.
                            두 버튼은 높이 32px 알약 + 위아래 6px로 누르는 영역 44px. */}
                        <button
                          type="submit"
                          className="relative select-none touch-manipulation shrink-0 h-8 px-3 rounded-full bg-brand text-white text-caption font-semibold active:bg-brand-deep before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5"
                        >
                          저장
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="relative select-none touch-manipulation shrink-0 h-8 px-2.5 rounded-full text-caption text-ink active:bg-canvas before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1.5"
                        >
                          취소
                        </button>
                      </form>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <p className="text-body-strong text-ink truncate">
                            {fav.name}
                          </p>
                          {/* 같은 번호의 반대 방향을 둘 다 즐겨찾기하면 여기가
                              "10 · 노선"으로 똑같이 찍혀 구분이 안 됐다.
                              방향을 알 수 있으면 종류 대신 방향을 보여준다. */}
                          <p className="text-caption text-muted truncate">
                            {fav.label} ·{" "}
                            {favoriteDirection(fav, routes) ??
                              (fav.type === "station"
                                ? "정류장"
                                : fav.type === "stop_route"
                                ? "정류장 도착정보"
                                : "노선")}
                          </p>
                        </div>
                        {/* 세 버튼은 아이콘 16px + 안쪽 6px = 28px이고, ::before로
                            사방 8px씩 넓혀 누르는 영역 44px. 동작 아이콘이라
                            faint(비활성 표시)가 아니라 muted다. */}
                        <button
                          onClick={() => setShortcutFavorite(fav)}
                          className="relative p-1.5 text-muted active:text-brand active:bg-brand-soft rounded-full transition-colors before:content-[''] before:absolute before:-inset-2"
                          aria-label="홈 화면 바로가기 추가"
                        >
                          <Smartphone className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => startEdit(fav.id, fav.label)}
                          aria-label="이름 바꾸기"
                          className="relative p-1.5 text-muted active:text-brand active:bg-brand-soft rounded-full transition-colors before:content-[''] before:absolute before:-inset-2"
                        >
                          <Pencil className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          onClick={() => {
                            dispatch({ type: "REMOVE_FAVORITE", id: fav.id });
                            showToast("삭제했어요");
                          }}
                          aria-label="즐겨찾기 삭제"
                          className="relative p-1.5 text-muted active:text-danger active:bg-canvas rounded-full transition-colors before:content-[''] before:absolute before:-inset-2"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <p className="text-center text-caption text-muted pt-7">BUS STOP v1.0.0</p>
      </div>

      {shortcutFavorite && (
        <AddShortcutSheet
          favorite={shortcutFavorite}
          onClose={() => setShortcutFavorite(null)}
        />
      )}

      {/* 로그아웃 확인과 도움말은 설정 서랍(z-50) 안에서 연다. 예전에는 둘 다
          서랍과 같은 z-50이고 서랍보다 먼저 그려져서, 열려도 서랍 뒤에 깔려
          보이지 않았다(4단계 확인 중 발견). 서랍보다 한 층 위(z-[55])에 둔다.
          토스트(z-[60])와 하차 알람(z-[100])보다는 아래다. */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setLogoutConfirmOpen(false)}
          />
          {/* 바텀시트: 모서리 28px(hero), sheet 그림자(6장). */}
          <div className="relative bg-surface rounded-t-hero sm:rounded-hero w-full max-w-md p-6 shadow-sheet animate-slide-up">
            <h2 className="text-title text-ink mb-2">로그아웃 할까요?</h2>
            <p className="text-body text-muted mb-5">로컬 설정은 유지됩니다.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setLogoutConfirmOpen(false)}
                className="flex-1 py-3 bg-canvas text-ink rounded-full text-body active:bg-line"
              >
                취소
              </button>
              {/* 예전 빨간 면(흰 글자 3.8:1)은 4-2에서 빨강을 점과 아이콘에만
                  쓰기로 해서 brand로 바꿨다. 로컬 데이터는 지워지지 않는 동작이다. */}
              <button
                onClick={performLogout}
                className="flex-1 py-3 bg-brand text-white rounded-full text-body font-semibold active:scale-[0.98] transition-transform duration-100"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      )}

      {helpOpen && (
        <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setHelpOpen(false)}
          />
          <div className="relative bg-surface rounded-t-hero sm:rounded-hero w-full max-w-md p-5 shadow-sheet">
            <h2 className="text-title text-ink mb-3">도움말</h2>
            <ul className="space-y-2 text-body text-muted">
              {/* 3단계에서 알림이 하단 탭에서 빠져 홈의 종 버튼과 "하차 알림"
                  바로가기로 옮겨 갔고, 카드 탭은 숨겨져 있다. 예전 문구("알림 탭",
                  "카드 탭")는 없는 탭을 가리켜서 고쳤다(카드 줄은 뺐다). */}
              <li>· 홈에서 즐겨찾기를 관리하고 도착 정보를 확인해요.</li>
              <li>· 버스 탭에서 노선을 검색하고 실시간 위치를 볼 수 있어요.</li>
              <li>· 홈의 종 버튼이나 "하차 알림"에서 하차 알림을 설정하면 정거장 전에 알려줘요.</li>
              <li>· 큰 글씨·색약 모드는 이 기기에서만 적용돼요.</li>
            </ul>
            <button
              onClick={() => setHelpOpen(false)}
              className="mt-5 w-full py-3 bg-brand text-white rounded-full text-body font-semibold active:scale-[0.98] transition-transform duration-100"
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
            {/* 설정 서랍: canvas 바탕 위에 설정 행을 흰 카드 한 장 + 1px 구분선으로
                묶는다(8장 마이). 예전에는 서랍 전체가 흰 면이고 행마다 아래 선을
                그었다. */}
            <div className="relative bg-canvas w-72 h-full shadow-sheet overflow-y-auto">
            <div className="pt-[15vh]" />
            <div className="px-4 pb-3 flex items-center justify-between">
              <h2 className="text-title text-ink">설정</h2>
              {/* 아이콘 20px + 안쪽 4px = 28px, ::before로 사방 8px씩 넓혀 44px. */}
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="닫기"
                className="relative p-1 rounded-full active:bg-line before:content-[''] before:absolute before:-inset-2"
              >
                <X className="w-5 h-5 text-muted" aria-hidden="true" />
              </button>
            </div>

            <div className="mx-4 bg-surface rounded-card border border-line overflow-hidden divide-y divide-line">


            <SettingRow
              icon={Bell}
              label="알림 설정"
              onClick={handleNotification}
              subtitle={notifPermissionLabel}
              subtitleTone={notifPermission === "granted" ? "ok" : "warn"}
            />

            {/* settings.voiceGuide를 실제로 읽어서 동작하는 코드가 아직 없다.
                켜지는 것처럼 보이면 안 되므로 "준비 중"으로 표시하고 잠근다. */}
            <SettingToggle
              icon={Volume2}
              label="음성 안내"
              checked={false}
              onChange={() => {}}
              disabled
              note="준비 중"
            />

            {/* 다크모드 토글은 임시로 숨긴다. index.css의 대응이 흰 면, 가장
                연한 회색 면과 일부 텍스트 색(모두 옛 원시 색 클래스)까지만이라,
                실제로 켜면 그보다 진한 회색 면·테두리 등이 밝은 채로 남아 화면이
                뒤섞인다. 4단계에서 화면 색을 토큰으로 바꾸면서 그 덮어쓰기는
                거의 걸리지 않게 됐다 — 지금 켜면 더 크게 깨진다. 토큰 기반으로
                다시 만든 뒤 노출한다(DESIGN.md 10장 "나중에", loadSettings에서
                값도 꺼둔다). */}

            <SettingRow
              icon={MoreHorizontal}
              label="더보기"
              onClick={() => setMoreOpen((prev) => !prev)}
              expanded={moreOpen}
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

            {hasSession && (
              <SettingRow
                icon={LogOut}
                label="로그아웃"
                danger
                onClick={() => setLogoutConfirmOpen(true)}
              />
            )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingRow({
  icon: Icon,
  label,
  onClick,
  danger,
  expanded,
  subtitle,
  subtitleTone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  danger?: boolean;
  expanded?: boolean;
  subtitle?: string;
  subtitleTone?: "ok" | "warn";
}) {
  return (
    /* 행 사이 선은 감싸는 카드의 divide-y가 긋는다. 예전에는 행마다 아래 선을
       긋고 마지막 행만 빼느라 last 값을 따로 넘겼다. 행 높이는 6장 목록 행 최소
       64px. 글자는 Body ink(예전 muted는 흰 면 위 4.0:1). 빨강은 점과 아이콘에만
       쓰므로(4-2) 로그아웃은 아이콘만 danger다. */
    <button
      onClick={onClick}
      className="w-full min-h-16 flex items-center gap-3 px-4 py-3 select-none touch-manipulation active:bg-canvas transition-colors duration-75"
    >
      <Icon className={`w-4.5 h-4.5 shrink-0 ${danger ? "text-danger" : "text-muted"}`} />
      <span className="flex-1 text-left text-body text-ink">
        {label}
      </span>
      {subtitle && (
        <span
          className={`text-caption font-semibold ${
            subtitleTone === "ok" ? "text-live" : "text-delay"
          }`}
        >
          {subtitle}
        </span>
      )}
      <ChevronRight
        className={`w-4 h-4 text-faint transition-transform ${
          expanded ? "rotate-90" : ""
        }`}
        aria-hidden="true"
      />
    </button>
  );
}

function SettingToggle({
  icon: Icon,
  label,
  checked,
  onChange,
  disabled,
  note,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** 아직 동작하지 않는 기능을 조작 가능한 것처럼 보이지 않게 잠글 때 */
  disabled?: boolean;
  /** "준비 중"처럼 상태를 알려주는 짧은 문구 */
  note?: string;
}) {
  return (
    /* SettingRow와 같은 행(최소 64px, 선은 카드의 divide-y). 잠긴 행은
       아이콘과 이름을 faint(비활성)로 내리고, "준비 중" 같은 상태 문구는
       정보라 muted로 둔다. */
    <div className="w-full min-h-16 flex items-center gap-3 px-4 py-3">
      <Icon className={`w-4.5 h-4.5 shrink-0 ${disabled ? "text-faint" : "text-muted"}`} />
      <span
        className={`flex-1 text-left text-body ${
          disabled ? "text-faint" : "text-ink"
        }`}
      >
        {label}
      </span>
      {note && <span className="text-caption text-muted">{note}</span>}
      <div className={disabled ? "opacity-40 pointer-events-none" : undefined}>
        <Toggle checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}