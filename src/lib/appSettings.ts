/**
 * 화면 설정(큰 글씨, 색약 모드 등)을 읽고 html에 붙인다.
 *
 * 예전에는 이 코드가 MyScreen 안에만 있어서, 마이 화면에 한 번 들어가야
 * 설정이 적용됐다. 앱을 열면 큰 글씨를 켜 둔 사용자도 보통 글씨로 홈을 보다가
 * 마이에 들어가는 순간에야 글자가 커졌다(4단계 보고에서 보류, 5단계에서 고침).
 * 이제 main.tsx가 첫 화면을 그리기 전에 같은 함수로 붙이고, MyScreen은 바꿀 때
 * 다시 붙인다.
 */

import {
  DEFAULT_EVENING,
  DEFAULT_MORNING,
  sanitizeWindow,
  type CommuteConfig,
  type HourWindow,
} from "@/lib/commute";

export const SETTINGS_KEY = "busssss_settings_v1";

/**
 * 화면 모드(7단계). 끄기(라이트) / 켜기(다크) / 기기 설정 따르기.
 * 기본은 끄기다 — 업데이트로 사용자의 화면이 저절로 바뀌지 않게 한다(12장 "7단계").
 */
export type ThemeMode = "light" | "dark" | "system";

export interface AppSettings {
  /**
   * 다크 모드를 "켜기"로 골랐는지. 7단계 전에는 이 값이 화면 모드의 전부였다. 지금은
   * themeMode의 거울이다(themeMode === "dark"일 때만 true). 예전 앱 버전과 저장 형식이
   * 같게 남기려고 키를 지우지 않았다.
   */
  darkMode: boolean;
  /**
   * 화면 모드. 7단계에서 생긴 필드라 예전 저장값에는 없고, 없으면 "light"다.
   * 예전 저장값의 darkMode: true는 읽지 않는다 — 그 값은 다크 토글을 숨긴 채 강제로
   * 끄던 시절의 찌꺼기라, 읽으면 업데이트 뒤 화면이 갑자기 어두워진다.
   */
  themeMode: ThemeMode;
  largeText: boolean;
  colorBlind: boolean;
  voiceGuide: boolean;
  /**
   * 시간대별 "내 정류장"(6단계). 꺼 두면 5단계까지와 똑같이 고정 → 첫 번째
   * stop_route다. 아래 두 시간대는 켠 때만 쓰인다. 6단계에서 생긴 필드라
   * 예전 저장값에는 없고, 없으면 기본값(꺼짐, 출근 5~11시, 퇴근 15~21시)이 된다.
   */
  commuteSwitch: boolean;
  commuteMorning: HourWindow;
  commuteEvening: HourWindow;
}

export const defaultSettings: AppSettings = {
  darkMode: false,
  themeMode: "light",
  largeText: false,
  colorBlind: false,
  voiceGuide: false,
  commuteSwitch: false,
  commuteMorning: { ...DEFAULT_MORNING },
  commuteEvening: { ...DEFAULT_EVENING },
};

const THEME_MODES: readonly ThemeMode[] = ["light", "dark", "system"];

/** 저장값에서 읽은 화면 모드를 쓸 수 있는 값으로 고친다. 없거나 이상하면 "light". */
export function sanitizeThemeMode(raw: unknown): ThemeMode {
  return THEME_MODES.includes(raw as ThemeMode) ? (raw as ThemeMode) : "light";
}

/**
 * 저장된 글자를 설정으로 바꾼다. 저장값이 없거나 깨졌으면 기본값이다.
 * 화면 모드(themeMode)는 값이 없거나 이상하면 "light"다. 7단계 전에 다크 토글을 숨기고
 * 읽을 때 darkMode를 강제로 끄던 코드는 지웠다(다크 모드를 다시 만들었다).
 */
export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return { ...defaultSettings };
  const parsed: unknown = JSON.parse(raw);
  // 객체가 아니면(null, 숫자 등) 쓸 값이 없다. 예전 코드는 펼쳐 넣어 기본값과
  // 같은 결과가 났는데, 그 동작을 그대로 둔다.
  const stored = parsed && typeof parsed === "object" ? (parsed as Partial<AppSettings>) : {};
  const themeMode = sanitizeThemeMode(stored.themeMode);
  return {
    ...defaultSettings,
    ...stored,
    themeMode,
    darkMode: themeMode === "dark",
    // 6단계 필드는 값이 이상해도 앱이 깨지지 않게 한 번 걸러서 쓴다.
    commuteSwitch: stored.commuteSwitch === true,
    commuteMorning: sanitizeWindow(stored.commuteMorning, DEFAULT_MORNING),
    commuteEvening: sanitizeWindow(stored.commuteEvening, DEFAULT_EVENING),
  };
}

/** 시간대 전환을 켰을 때만 설정을 돌려준다. null이면 5단계까지의 규칙이다. */
export function commuteConfigOf(s: AppSettings): CommuteConfig | null {
  return s.commuteSwitch ? { morning: s.commuteMorning, evening: s.commuteEvening } : null;
}

export function loadSettings(): AppSettings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch (err) {
    console.warn("[appSettings] 설정 로드 실패:", err);
    return { ...defaultSettings };
  }
}

/** 지금 다크로 그려야 하는지. 기기 설정 따르기면 기기의 화면 모드를 본다. */
export function resolveDark(mode: ThemeMode, systemPrefersDark: boolean): boolean {
  return mode === "dark" || (mode === "system" && systemPrefersDark);
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** 기기가 다크 모드인지. matchMedia가 없으면(시험 환경 등) false. */
export function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

/**
 * 기기 화면 모드가 바뀔 때 부른다. 돌려주는 함수로 구독을 끊는다. 기기 설정 따르기를
 * 켜 둔 사람이 앱을 연 채로 기기 모드를 바꿔도 따라가게 한다.
 */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/**
 * 상태바 줄·브라우저 주소창 색(theme-color). 라이트 값은 index.html과 같은 canvas 색이다.
 * iOS 홈 화면 앱은 이 값을 홈 화면에 추가할 때 읽어서 앱을 다시 추가해야 반영된다
 * (index.html 주석, CLAUDE.md 8장). Safari 탭과 안드로이드는 바로 바뀐다.
 */
export const THEME_COLOR = { light: "#F7F8FA", dark: "#0B1220" } as const;

/** theme-color 메타를 모두 같은 값으로 맞춘다(기기 설정용 media 메타도 앱 설정을 따르게). */
export function applyThemeColor(
  doc: { querySelectorAll(selector: string): ArrayLike<{ setAttribute(name: string, value: string): void }> },
  dark: boolean,
): void {
  const color = dark ? THEME_COLOR.dark : THEME_COLOR.light;
  for (const meta of Array.from(doc.querySelectorAll('meta[name="theme-color"]'))) {
    meta.setAttribute("content", color);
  }
}

/**
 * 앱을 열 때와 설정을 바꿀 때 화면 모드·큰 글씨·색약 모드를 html에 붙이고 theme-color를 맞춘다.
 * main.tsx(첫 화면 전)와 MyScreen이 같은 함수를 쓴다.
 */
export function applyAppearance(s: AppSettings): void {
  const dark = resolveDark(s.themeMode, systemPrefersDark());
  applySettings(document.documentElement, s, dark);
  applyThemeColor(document, dark);
}

/** html(또는 시험용 가짜)에 설정 클래스를 붙이거나 뗀다. systemDark는 기기가 다크인지. */
export function applySettings(
  root: { classList: { toggle(token: string, force?: boolean): unknown } },
  s: AppSettings,
  systemDark = false,
): void {
  root.classList.toggle("dark", resolveDark(s.themeMode, systemDark));
  root.classList.toggle("large-text", s.largeText);
  root.classList.toggle("color-blind", s.colorBlind);
}
