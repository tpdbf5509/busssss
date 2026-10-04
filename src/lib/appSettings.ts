/**
 * 화면 설정(큰 글씨, 색약 모드 등)을 읽고 html에 붙인다.
 *
 * 예전에는 이 코드가 MyScreen 안에만 있어서, 마이 화면에 한 번 들어가야
 * 설정이 적용됐다. 앱을 열면 큰 글씨를 켜 둔 사용자도 보통 글씨로 홈을 보다가
 * 마이에 들어가는 순간에야 글자가 커졌다(4단계 보고에서 보류, 5단계에서 고침).
 * 이제 main.tsx가 첫 화면을 그리기 전에 같은 함수로 붙이고, MyScreen은 바꿀 때
 * 다시 붙인다.
 */

export const SETTINGS_KEY = "busssss_settings_v1";

export interface AppSettings {
  darkMode: boolean;
  largeText: boolean;
  colorBlind: boolean;
  voiceGuide: boolean;
}

export const defaultSettings: AppSettings = {
  darkMode: false,
  largeText: false,
  colorBlind: false,
  voiceGuide: false,
};

/**
 * 저장된 글자를 설정으로 바꾼다. 저장값이 없거나 깨졌으면 기본값이다.
 * darkMode는 토글을 숨긴 동안 강제로 꺼둔다. 예전에 켜둔 사용자가
 * 끄는 방법 없이 반쪽짜리 다크 화면에 갇히는 걸 막는다.
 */
export function parseSettings(raw: string | null): AppSettings {
  if (!raw) return { ...defaultSettings };
  const parsed: unknown = JSON.parse(raw);
  // 객체가 아니면(null, 숫자 등) 쓸 값이 없다. 예전 코드는 펼쳐 넣어 기본값과
  // 같은 결과가 났는데, 그 동작을 그대로 둔다.
  const stored = parsed && typeof parsed === "object" ? (parsed as Partial<AppSettings>) : {};
  return { ...defaultSettings, ...stored, darkMode: false };
}

export function loadSettings(): AppSettings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_KEY));
  } catch (err) {
    console.warn("[appSettings] 설정 로드 실패:", err);
    return { ...defaultSettings };
  }
}

/** html(또는 시험용 가짜)에 설정 클래스를 붙이거나 뗀다. */
export function applySettings(
  root: { classList: { toggle(token: string, force?: boolean): unknown } },
  s: AppSettings,
): void {
  root.classList.toggle("dark", s.darkMode);
  root.classList.toggle("large-text", s.largeText);
  root.classList.toggle("color-blind", s.colorBlind);
}
