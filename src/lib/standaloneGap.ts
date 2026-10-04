/**
 * iOS 홈 화면 앱에서 화면 아래에 생기는 빈 띠의 높이를 구한다.
 *
 * 홈 화면 앱(상태바 black-translucent + viewport-fit=cover)에서 iOS가 화면
 * 세로 길이를 상태바 높이만큼 짧게 잡는 경우가 있다. 앱 틀(fixed inset-0)은
 * 그 짧은 높이로 그려지는데 화면은 맨 위(상태바 밑)부터 시작하므로, 맨 아래에
 * 상태바 높이만큼 앱이 닿지 않는 띠가 남고 그 아래 흰 바탕이 드러난다.
 * 실측: iPhone(상태바 47pt) 캡처에서 하단 탭 아래 흰 띠가 47pt였다. 예전 기록
 * (index.css pb-nav-safe 주석)의 "홈 화면 앱에서만 탭이 약 58pt 더 크게 잡힘"도
 * Dynamic Island 기기의 상태바 높이(59pt)와 같다.
 *
 * 띠를 색으로 덮지 않고 페이지와 앱 틀을 그만큼 아래로 늘려 없앤다(앱 틀만
 * 늘리면 실기기에서 페이지 끝인 797pt에서 잘렸다). 다만 이 문제가 없는
 * 기기에서 늘리면 하단 탭이 화면 밖으로 밀려나므로, "모자란 높이가 상태바
 * 높이와 같다"는 이 문제의 모양이 확인될 때만 값을 돌려준다.
 */
export interface StandaloneGapInput {
  /** iOS 홈 화면 앱으로 열렸는지(navigator.standalone). Safari 탭이면 false */
  iosStandalone: boolean;
  portrait: boolean;
  /** screen.width / screen.height. iOS는 기기를 돌려도 이 두 값을 바꾸지 않는다. */
  screenWidth: number;
  screenHeight: number;
  /** 앱 틀이 실제로 받는 세로 길이(fixed top:0 bottom:0 상자의 높이) */
  viewportHeight: number;
  /** env(safe-area-inset-top) — 상태바 높이 */
  safeAreaTop: number;
}

/** 이 오차(px) 안이면 "모자란 높이 = 상태바 높이"로 본다. */
const MATCH_TOLERANCE = 2;

export function standaloneBottomGap(input: StandaloneGapInput): number {
  const { iosStandalone, portrait, screenWidth, screenHeight, viewportHeight, safeAreaTop } = input;
  if (!iosStandalone || safeAreaTop <= 0) return 0;

  // 홈 화면 앱은 화면 전체를 쓰므로 실제로 보이는 세로 길이는 화면 크기다.
  const screenLong = Math.max(screenWidth, screenHeight);
  const screenShort = Math.min(screenWidth, screenHeight);
  const visibleHeight = portrait ? screenLong : screenShort;

  const gap = visibleHeight - viewportHeight;
  if (gap <= 0) return 0;
  // 모자란 높이가 상태바 높이와 다르면 이 문제가 아니다(예: iPad 화면 나누기).
  if (Math.abs(gap - safeAreaTop) > MATCH_TOLERANCE) return 0;
  return Math.round(gap);
}
