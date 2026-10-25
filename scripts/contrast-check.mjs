// DESIGN.md 4장 색 조합의 대비를 한꺼번에 계산한다(WCAG 2.x 상대 휘도 공식).
// 실행: node scripts/contrast-check.mjs [--theme=light|dark|light-cb|dark-cb|all] [--md]
// 5단계 마감 점검에서 만들었고, 7단계에서 색이 CSS 변수가 되어 값을 src/index.css에서 읽도록
// 바꿨다(:root = 라이트, html.dark, html.color-blind, html.dark.color-blind 블록의
// --c-… 줄). 색을 바꾸면 이 스크립트를 다시 돌려 12장 표를 고친다. 값을 이 파일에 따로
// 적어 두지 않으므로 CSS와 어긋날 일이 없다.
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
// 블록 하나의 변수 줄을 모은다. 선택자 뒤의 첫 { … } 안에서 --이름: R G B 또는 숫자.
function block(selector) {
  const i = css.indexOf(`${selector} {`);
  if (i === -1) return {};
  const body = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  const vars = {};
  for (const m of body.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
const L = block(':root'), D = block('html.dark'), CB = block('html.color-blind'), DCB = block('html.dark.color-blind');
const THEMES = {
  light: { ...L },
  dark: { ...L, ...D },
  'light-cb': { ...L, ...CB },
  'dark-cb': { ...L, ...D, ...CB, ...DCB },
};
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// 반투명 색을 바탕 위에 섞는다
const over = (fg, a, bg) => toHex(hex(fg).map((v, i) => v * a + hex(bg)[i] * (1 - a)));
const lum = (h) => { const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function palette(vars) {
  const c = (name) => toHex(vars[`c-${name}`].split(/\s+/).map(Number));
  const C = {};
  for (const k of ['canvas', 'surface', 'line', 'ink', 'muted', 'faint', 'brand', 'brand-soft', 'brand-fill', 'brand-fill-deep', 'live', 'live-icon', 'live-bright', 'live-soft', 'delay', 'delay-soft', 'pending', 'route-main', 'route-branch', 'danger', 'star']) C[k] = c(k);
  C['hero-from'] = toHex(vars['hero-from'].split(/\s+/).map(Number));
  C['hero-to'] = toHex(vars['hero-to'].split(/\s+/).map(Number));
  C.gloss = Number(vars['hero-gloss']);
  C.white = '#FFFFFF'; C.black = '#000000';
  return C;
}

function rowsFor(C) {
  // 히어로 면: 시작색, 끝색, 광택(흰 gloss)이 가장 밝게 겹친 시작색
  const heroGloss = over(C.white, C.gloss, C['hero-from']);
  const chipOnHero = over(C.black, 0.20, C['hero-from']);
  const chipOnGloss = over(C.black, 0.20, heroGloss);
  const w90 = over(C.white, 0.90, C['hero-from']);
  const w90gloss = over(C.white, 0.90, heroGloss);
  // [글자, 바탕, 쓰는 곳, 기준] 기준: text(4.5) / large(3, 18.66px 굵게·24px 이상) / ui(3, 아이콘·선) / none(장식·비활성)
  return [
    ['ink', 'surface', '본문, 카드 제목', 'text'],
    ['ink', 'canvas', '헤더 제목, 바탕 위 섹션 제목', 'text'],
    ['ink', 'brand-soft', '선택 배경 위 글자', 'text'],
    ['ink', 'line', '버스 검색 전환 알약(고르지 않은 쪽)', 'text'],
    ['ink', 'delay-soft', '저장 오류 배너 글자', 'text'],
    ['muted', 'surface', '보조 글자(카드)', 'text'],
    ['muted', 'canvas', '보조 글자(바탕)', 'text'],
    ['faint', 'surface', '자리표시 글자, 비활성 아이콘(하단 탭 제외)', 'none'],
    ['faint', 'canvas', '자리표시 글자(바탕)', 'none'],
    ['muted', 'surface', '하단 탭 비선택 아이콘(라벨 없이 아이콘만 단서)', 'ui'],
    ['pending', 'canvas', '"확인 중" 칩, 꺼짐 칩', 'text'],
    ['pending', 'surface', '"확인 중" 칩(히어로 위 칩)', 'text'],
    ['brand', 'surface', '링크, 강조 숫자, 칩 글자', 'text'],
    ['brand', 'canvas', '"전체보기", "모두 읽음"(바탕)', 'text'],
    ['brand', 'brand-soft', '활성 탭 아이콘, 추가 알약', 'text'],
    ['white', 'brand-fill', '파란 버튼·켜진 토글·다음 출발 칸의 흰 글자', 'text'],
    ['white', 'brand-fill-deep', '파란 버튼을 누를 때', 'text'],
    ['white', 'hero-from', '히어로 숫자·이름', 'text'],
    ['white', 'hero-to', '히어로 끝색 위 흰 글자', 'text'],
    ['white', heroGloss, '히어로 광택이 가장 밝은 자리', 'text'],
    [w90, 'hero-from', '히어로 보조 글자 white/90 (시작색)', 'text'],
    [w90gloss, heroGloss, '히어로 보조 글자 white/90 (광택 자리)', 'text'],
    ['white', chipOnHero, '히어로 노선 칩 black/20 (시작색)', 'text'],
    ['white', chipOnGloss, '히어로 노선 칩 black/20 (광택 자리)', 'text'],
    ['white', 'route-main', '본선 배지 흰 번호(15px 굵게)', 'text'],
    ['white', 'route-branch', '분선 배지 흰 번호(15px 굵게)', 'text'],
    ['live', 'live-soft', '실시간 칩 글자', 'text'],
    ['live', 'surface', '실시간 칩 글자(히어로 위 칩), 알림 권한 "허용됨"', 'text'],
    ['live-icon', 'live-soft', '실시간 칩 아이콘(옆 글자와 함께)', 'ui'],
    ['live-icon', 'surface', '실시간 칩 아이콘(히어로 위 칩), 알림 센터 도착 아이콘', 'ui'],
    ['live-bright', 'surface', '토스트 완료 아이콘(옆 문구와 함께)', 'ui'],
    ['live-bright', 'canvas', '노선 상세 실시간 점(옆 글자와 함께)', 'ui'],
    ['delay', 'delay-soft', '지연 의심 칩', 'text'],
    ['delay', 'surface', '지연 의심(히어로 위 칩), 경고 글자', 'text'],
    ['delay', 'canvas', '알림 추가 창 경고 글자(바탕)', 'text'],
    ['danger', 'surface', '알림 점, 삭제 아이콘(글자 아님)', 'ui'],
    ['white', 'danger', '편집 모드 삭제 버튼 아이콘', 'ui'],
    ['star', 'surface', '즐겨찾기 별(채운/빈 모양 함께)', 'ui'],
    ['faint', 'surface', '토글 꺼짐 바탕(비글자)', 'ui'],
    ['line', 'surface', '1px 테두리(장식)', 'none'],
    [over(C.white, 0.6, C['hero-from']), 'hero-from', '미니 노선도 남은 구간 white/60 (장식)', 'none'],
  ];
}

const need = { text: 4.5, large: 3, ui: 3, none: 0 };
const arg = process.argv.find((a) => a.startsWith('--theme='));
const wanted = arg ? arg.split('=')[1] : 'all';
const md = process.argv.includes('--md');
const NAMES = { light: '라이트', dark: '다크', 'light-cb': '라이트 + 색약', 'dark-cb': '다크 + 색약' };
let failed = 0;
for (const name of Object.keys(THEMES)) {
  if (wanted !== 'all' && wanted !== name) continue;
  const C = palette(THEMES[name]);
  const v = (k) => C[k] ?? k;
  const out = [];
  for (const [fg, bg, use, kind] of rowsFor(C)) {
    const r = ratio(v(fg), v(bg));
    const pass = kind === 'none' ? '장식/비활성' : r >= need[kind] ? '통과' : (kind === 'text' && r >= 3 ? '미달(큰 글자만 통과)' : '미달');
    if (pass.startsWith('미달')) failed++;
    out.push({ fg: C[fg] ? `${fg} ${C[fg]}` : fg, bg: C[bg] ? `${bg} ${C[bg]}` : bg, use, kind, r: r.toFixed(2), pass });
  }
  console.log(md ? `\n#### ${NAMES[name]}\n` : `\n== ${NAMES[name]} ==`);
  if (md) {
    console.log('| 글자/아이콘 | 바탕 | 쓰는 곳 | 기준 | 대비 | 결과 |\n|---|---|---|---|---|---|');
    for (const o of out) console.log(`| ${o.fg} | ${o.bg} | ${o.use} | ${{ text: '4.5', ui: '3(비글자)', large: '3', none: '-' }[o.kind]} | ${o.r}:1 | ${o.pass} |`);
  } else {
    for (const o of out) console.log(o.r.padStart(6), o.pass.padEnd(14), o.fg.padEnd(22), o.bg.padEnd(22), o.use);
  }
}
console.log(`\n미달 ${failed}건`);
