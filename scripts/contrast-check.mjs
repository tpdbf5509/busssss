// DESIGN.md 4장 색 조합의 대비를 한꺼번에 계산한다(WCAG 2.x 상대 휘도 공식).
// 실행: node scripts/contrast-check.mjs [--muted=#64748B]
// 5단계 마감 점검에서 만들었다. 색을 바꾸면 다시 돌려 12장 표를 고친다.
// muted는 tailwind.config.js에서 읽는다. muted 색 변경 커밋을 되돌려도 이 스크립트를
// 따로 고칠 필요가 없게 하기 위해서다. --muted=#xxxxxx로 다른 값을 시험할 수 있다.
import tailwindConfig from '../tailwind.config.js';
const arg = process.argv.find((a) => a.startsWith('--muted='));
const C = {
  brand: '#2563EB', 'brand-deep': '#1D4ED8', 'brand-soft': '#EFF4FE',
  canvas: '#F7F8FA', surface: '#FFFFFF', line: '#E8ECF2',
  ink: '#172033', muted: arg ? arg.split('=')[1] : tailwindConfig.theme.extend.colors.muted, faint: '#94A3B8', pending: '#64748B',
  live: '#047857', 'live-soft': '#ECFDF5', delay: '#B45309', 'delay-soft': '#FFFBEB',
  danger: '#EF4444', star: '#FBBF24', white: '#FFFFFF', black: '#000000',
  // 색약 모드 대체 색(index.css)
  'cb-blue': '#1D4ED8', 'cb-blue-soft': '#DBEAFE', 'cb-amber': '#B45309', 'cb-amber-soft': '#FEF3C7',
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
// 반투명 색을 바탕 위에 섞는다
const over = (fg, a, bg) => toHex(hex(fg).map((v, i) => v * a + hex(bg)[i] * (1 - a)));
const lum = (h) => { const [r, g, b] = hex(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// 히어로 면: 시작색, 끝색, 광택(흰 10%)이 가장 밝게 겹친 시작색
const heroGloss = over(C.white, 0.10, C.brand);
const chipOnBrand = over(C.black, 0.20, C.brand);
const chipOnGloss = over(C.black, 0.20, heroGloss);
const w90brand = over(C.white, 0.90, C.brand);
const w90gloss = over(C.white, 0.90, heroGloss);

// [글자, 바탕, 쓰는 곳, 기준] 기준: text(4.5) / large(3, 18.66px 굵게·24px 이상) / ui(3, 아이콘·선) / none(장식·비활성)
const rows = [
  ['ink', 'surface', '본문, 카드 제목', 'text'],
  ['ink', 'canvas', '헤더 제목, 바탕 위 섹션 제목', 'text'],
  ['ink', 'brand-soft', '선택 배경 위 글자', 'text'],
  ['ink', 'line', '버스 검색 전환 알약(고르지 않은 쪽)', 'text'],
  ['ink', 'delay-soft', '저장 오류 배너 글자', 'text'],
  ['muted', 'surface', '보조 글자(흰 카드)', 'text'],
  ['muted', 'canvas', '보조 글자(바탕)', 'text'],
  ['muted', 'brand-soft', '참고: 지금 쓰는 곳 없음(누를 때 아이콘만)', 'text'],
  ['muted', 'line', '참고: 지금 쓰는 곳 없음(4단계에서 ink로 바꿈)', 'text'],
  ['muted', 'delay-soft', '참고: 지금 쓰는 곳 없음(배너 글자는 ink)', 'text'],
  ['faint', 'surface', '자리표시 글자, 비활성 아이콘', 'none'],
  ['faint', 'canvas', '자리표시 글자(바탕)', 'none'],
  ['pending', 'canvas', '"확인 중" 칩, 꺼짐 칩', 'text'],
  ['pending', 'surface', '"확인 중" 칩(히어로 흰 칩)', 'text'],
  ['brand', 'surface', '링크, 강조 숫자, 칩 글자', 'text'],
  ['brand', 'canvas', '"전체보기", "모두 읽음"(바탕)', 'text'],
  ['brand', 'brand-soft', '활성 탭 라벨, 추가 알약', 'text'],
  ['white', 'brand', '히어로 숫자·이름, 본선 배지, 버튼', 'text'],
  ['white', 'brand-deep', '히어로 끝색 위 흰 글자', 'text'],
  ['white', heroGloss, '히어로 광택이 가장 밝은 자리(흰 10%)', 'text'],
  [w90brand, 'brand', '히어로 보조 글자 white/90 (시작색)', 'text'],
  [w90gloss, heroGloss, '히어로 보조 글자 white/90 (광택 자리)', 'text'],
  ['white', chipOnBrand, '히어로 노선 칩 black/20 (시작색)', 'text'],
  ['white', chipOnGloss, '히어로 노선 칩 black/20 (광택 자리)', 'text'],
  ['white', 'live', '분선 배지', 'text'],
  ['white', 'ink', '"다시 시도" 버튼', 'text'],
  ['live', 'live-soft', '실시간 칩', 'text'],
  ['live', 'surface', '실시간 칩(히어로 흰 칩), 알림 권한 허용', 'text'],
  ['delay', 'delay-soft', '지연 의심 칩', 'text'],
  ['delay', 'surface', '지연 의심(히어로 흰 칩), 경고 글자', 'text'],
  ['delay', 'canvas', '알림 추가 창 경고 글자(바탕)', 'text'],
  ['cb-blue', 'cb-blue-soft', '색약: 실시간 칩', 'text'],
  ['cb-blue', 'surface', '색약: 실시간(히어로 흰 칩)', 'text'],
  ['white', 'cb-amber', '색약: 분선 배지', 'text'],
  ['cb-amber', 'cb-amber-soft', '색약: 지연 의심 칩', 'text'],
  ['danger', 'surface', '알림 점, 삭제 아이콘(글자 아님)', 'ui'],
  ['white', 'danger', '편집 모드 삭제 버튼 아이콘', 'ui'],
  ['star', 'surface', '즐겨찾기 별(채운/빈 모양 함께)', 'ui'],
  ['faint', 'surface', '토글 꺼짐 바탕(비글자)', 'ui'],
  ['line', 'surface', '1px 테두리(장식)', 'none'],
  [over(C.white, 0.6, C.brand), 'brand', '미니 노선도 남은 구간 white/60 (장식)', 'none'],
];
const need = { text: 4.5, large: 3, ui: 3, none: 0 };
const v = (k) => C[k] ?? k;
const out = [];
for (const [fg, bg, use, kind] of rows) {
  const r = ratio(v(fg), v(bg));
  const pass = kind === 'none' ? '장식/비활성' : r >= need[kind] ? '통과' : (kind === 'text' && r >= 3 ? '미달(큰 글자만 통과)' : '미달');
  out.push({ fg: C[fg] ? `${fg} ${C[fg]}` : fg, bg: C[bg] ? `${bg} ${C[bg]}` : bg, use, kind, r: r.toFixed(2), pass });
}
if (process.argv.includes('--md')) {
  console.log('| 글자/아이콘 | 바탕 | 쓰는 곳 | 기준 | 대비 | 결과 |\n|---|---|---|---|---|---|');
  for (const o of out) console.log(`| ${o.fg} | ${o.bg} | ${o.use} | ${{ text: '4.5', ui: '3(비글자)', large: '3', none: '-' }[o.kind]} | ${o.r}:1 | ${o.pass} |`);
} else {
  for (const o of out) console.log(o.r.padStart(6), o.pass.padEnd(14), o.fg.padEnd(22), o.bg.padEnd(22), o.use);
}
