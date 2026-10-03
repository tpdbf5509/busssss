/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      /* 색 역할 토큰.
       *
       * 지금까지 화면마다 slate / blue 원시 클래스를 직접 써서, 색 하나를
       * 바꾸려면 전 파일을 찾아 고쳐야 했다. 역할별 이름을 먼저 정의해 두고
       * 화면은 이 이름만 쓰도록 바꾼다.
       *
       * 원칙: 파란색은 넓은 면적에 깔지 않고 브랜드 헤더와 선택/강조 상태에만
       * 쓴다. 면(surface)과 배경(canvas)은 흰색 계열로 두고, 구분은 그림자가
       * 아니라 1px 테두리와 여백으로 만든다.
       */
      colors: {
        canvas: '#F7F8FA',   // 화면 바탕
        surface: '#FFFFFF',  // 카드 면
        line: '#E8ECF2',     // 1px 테두리
        ink: '#172033',      // 본문 텍스트
        muted: '#718096',    // 보조 텍스트
        faint: '#94A3B8',    // 비활성 아이콘/라벨
        brand: {
          DEFAULT: '#2563EB',
          deep: '#1D4ED8',   // 히어로 그라데이션의 끝 색
          soft: '#EFF4FE',   // 아주 좁은 면적의 선택 배경에만
        },

        /* 상태 색 (DESIGN.md 4-2).
           지금까지 쓰던 emerald-600 / amber-600은 흰 바탕 위 대비가 3:1대라
           칩 안의 11px 글자에는 부족했다. 한 단계 진한 -700 값으로 올린다. */
        live: {
          DEFAULT: '#047857', // 실시간 글자·아이콘 (emerald-700, 5.2:1)
          soft: '#ECFDF5',    // 실시간 칩 배경
        },
        delay: {
          DEFAULT: '#B45309', // 지연 의심 글자·아이콘 (amber-700, 4.8:1)
          soft: '#FFFBEB',    // 지연 의심 칩 배경
        },
        /* "확인 중" 칩 글자. muted(#718096)는 canvas 칩 위에서 3.78:1이라
           작은 글자 기준(4.5:1)에 한참 못 미친다. DESIGN.md 4-5가 대안으로
           적어 둔 slate-500 값을 쓴다(결정 기록 참고). 이 값도 canvas 칩
           위에서는 4.48:1로 기준에 살짝 모자라고, 흰 칩(히어로) 위에서는
           4.76:1이다. */
        pending: '#64748B',

        /* 노선 배지 배경. 흰 번호가 올라가므로 흰 글자 대비 기준으로 고른다.
           예전 blue-500 / emerald-500은 흰 글자 대비가 3.7 / 2.5:1이었다. */
        route: {
          main: '#2563EB',    // 본선 (5.2:1)
          branch: '#047857',  // 분선 (5.5:1)
        },

        danger: '#EF4444',   // 알림 점, 삭제. 점과 아이콘에만 쓴다
      },

      /* 글자 크기 (DESIGN.md 5장).
         rem으로 둬야 "큰 글씨" 설정(html 112.5%)을 따라 함께 커진다.
         굵기와 자간을 크기와 한 묶음으로 넣어, 화면마다 조합이 흩어지지
         않게 한다. 행간은 문서의 "제목 1.2, 본문 1.5"를 따르고, 한 줄짜리
         큰 숫자(display)만 1로 둬서 숫자 위아래 빈 공간을 줄인다. */
      fontSize: {
        display: ['4rem', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '700' }],
        'display-unit': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        headline: ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        title: ['1.25rem', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'body-strong': ['0.9375rem', { lineHeight: '1.5', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['0.875rem', { lineHeight: '1.5', letterSpacing: '-0.01em', fontWeight: '500' }],
        caption: ['0.75rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '500' }],
        micro: ['0.6875rem', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
      },

      /* 모서리 (DESIGN.md 6장). 칩·알약·원형 버튼은 기본 rounded-full을 쓴다. */
      borderRadius: {
        hero: '28px',  // 히어로 카드, 바텀시트
        nav: '24px',   // 하단 내비
        card: '20px',  // 카드, 빠른 실행 타일
        tile: '12px',  // 노선 배지, 아이콘 타일
      },

      /* 그림자 (DESIGN.md 6장). 일반 카드는 그림자 없이 1px line으로 나눈다. */
      boxShadow: {
        hero: '0 12px 32px rgba(37, 99, 235, 0.25)',
        float: '0 8px 24px rgba(23, 32, 51, 0.08)',
        sheet: '0 25px 50px -12px rgb(0 0 0 / 0.25)', // 기존 shadow-2xl과 같은 값
      },

      /* 히어로 면 (DESIGN.md 4-3).
         시작 색을 #3B82F6으로 하면 흰 글자 대비가 3.7:1로 떨어져서
         brand에서 brand-deep으로 간다. 위에 옅은 광택을 한 겹 얹는다. */
      backgroundImage: {
        hero:
          'linear-gradient(120deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, 0.10) 50%, rgba(255, 255, 255, 0) 70%), ' +
          'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        /* 숫자 바뀜(DESIGN.md 6장 움직임). 새 값이 150ms 동안 나타난다.
           "동작 줄이기" 설정이면 index.css가 즉시 끝낸다. */
        'fade-in': 'fade-in 150ms ease-out',
        /* 곧 도착 점. 동작 줄이기에서는 한 번만 돌고 마지막 프레임
           (불투명)에 멈춰 점은 그대로 보인다. */
        blink: 'blink 1.2s ease-in-out infinite',
      },
      /* 미니 노선도 버스 마커 이동 400ms (기본 단계에 없는 값). */
      transitionDuration: {
        400: '400ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        blink: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.2' },
        },
        'slide-up': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          from: { transform: 'translateY(-100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
