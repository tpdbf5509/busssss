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
      /* 7단계: 모든 색은 CSS 변수(index.css의 :root, html.dark)를 가리킨다. 라이트
       * 값은 예전 16진수와 같아서(주석에 그대로 남긴다) 화면이 달라지지 않고,
       * html.dark가 변수만 바꿔 다크 모드가 된다. 변수는 "R G B" 세 숫자라
       * bg-canvas/60 같은 투명도 표기도 그대로 쓴다. */
      colors: {
        canvas: 'rgb(var(--c-canvas) / <alpha-value>)',   // 화면 바탕 (라이트 #F7F8FA)
        surface: 'rgb(var(--c-surface) / <alpha-value>)', // 카드 면 (라이트 #FFFFFF)
        line: 'rgb(var(--c-line) / <alpha-value>)',       // 1px 테두리 (라이트 #E8ECF2)
        ink: 'rgb(var(--c-ink) / <alpha-value>)',         // 본문 텍스트 (라이트 #172033)
        /* 보조 텍스트. 예전에는 #718096(흰 카드 위 4.0:1, 바탕 위 3.8:1)이라 작은
           글자 기준(4.5:1)에 못 미쳤다. 5단계에서 DESIGN.md 4-5가 대안으로 적어 둔
           #64748B(slate-500, 이미 pending으로 쓰는 값)로 바꾼다: 흰 카드 위 4.76:1,
           바탕 위 4.48:1. 실기기에서 보고 되돌릴 수 있게 이 줄만 따로 커밋했다. */
        muted: 'rgb(var(--c-muted) / <alpha-value>)', // 라이트 #64748B
        faint: 'rgb(var(--c-faint) / <alpha-value>)', // 비활성 아이콘/라벨 (라이트 #94A3B8)
        brand: {
          /* 글자·아이콘·테두리·링에 쓰는 파랑(라이트 #2563EB). 다크에서는 어두운 면
             위에서 읽히도록 밝아진다. */
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          deep: 'rgb(var(--c-brand-deep) / <alpha-value>)', // 히어로 그라데이션의 끝 색 (라이트 #1D4ED8)
          soft: 'rgb(var(--c-brand-soft) / <alpha-value>)', // 아주 좁은 면적의 선택 배경에만 (라이트 #EFF4FE)
          /* 7단계: 흰 글자가 올라가는 파란 면(버튼, 켜진 토글, 다음 출발 칸)의 바탕.
             글자·아이콘용 brand를 다크에서 밝게 하면 이 면 위 흰 글자 대비가 무너져서
             따로 뗐다. 라이트에서는 brand·brand-deep과 같은 값이다. */
          fill: {
            DEFAULT: 'rgb(var(--c-brand-fill) / <alpha-value>)', // 라이트 #2563EB
            deep: 'rgb(var(--c-brand-fill-deep) / <alpha-value>)', // 눌렀을 때 (라이트 #1D4ED8)
          },
        },

        /* 상태 색 (DESIGN.md 4-2).
           지금까지 쓰던 emerald-600 / amber-600은 흰 바탕 위 대비가 3:1대라
           칩 안의 11px 글자에는 부족했다. 한 단계 진한 -700 값으로 올린다.
           예전(0단계)에는 live 하나로 글자와 아이콘·점을 모두 칠했다. 녹색이 너무
           어둡다는 의견으로 녹색 복원 작업에서 글자가 없는 자리(아이콘·점)는 디자인
           작업 전의 밝은 녹색으로 되돌렸다. 글자만 대비 때문에 -700에 남는다. */
        live: {
          DEFAULT: 'rgb(var(--c-live) / <alpha-value>)', // 실시간 글자 (라이트 #047857, emerald-700, 5.2:1). 칩 글자, 알림 권한 "허용됨"
          icon: 'rgb(var(--c-live-icon) / <alpha-value>)', // 실시간 아이콘 (라이트 #059669, emerald-600, 예전 실시간 태그·도착 알림 아이콘 값)
          bright: 'rgb(var(--c-live-bright) / <alpha-value>)', // 점, 토스트 완료 아이콘 (라이트 #10B981, emerald-500, 예전 토스트 완료 아이콘 값)
          soft: 'rgb(var(--c-live-soft) / <alpha-value>)', // 실시간 칩 배경 (라이트 #ECFDF5)
        },
        delay: {
          DEFAULT: 'rgb(var(--c-delay) / <alpha-value>)', // 지연 의심 글자·아이콘 (라이트 #B45309, amber-700, 4.8:1)
          soft: 'rgb(var(--c-delay-soft) / <alpha-value>)', // 지연 의심 칩 배경 (라이트 #FFFBEB)
        },
        /* "확인 중" 칩 글자. 예전 muted(#718096)는 canvas 칩 위에서 3.78:1이라
           작은 글자 기준(4.5:1)에 한참 못 미친다. DESIGN.md 4-5가 대안으로
           적어 둔 slate-500 값을 쓴다(결정 기록 참고). 이 값도 canvas 칩
           위에서는 4.48:1로 기준에 살짝 모자라고, 흰 칩(히어로) 위에서는
           4.76:1이다. 5단계에서 muted도 같은 값이 됐다. pending은 "확인 중"
           칩의 뜻을 담은 이름이라 따로 둔다(muted 커밋을 되돌려도 칩은 그대로). */
        pending: 'rgb(var(--c-pending) / <alpha-value>)', // 라이트 #64748B

        /* 노선 배지 배경. 흰 번호가 올라가므로 흰 글자 대비 기준으로 고른다.
           예전 blue-500 / emerald-500은 흰 글자 대비가 3.7 / 2.5:1이었다.
           분선은 0단계에서 emerald-700(#047857, 5.5:1)으로 올렸는데, 실제로 써 보니
           너무 어둡다는 사용자 의견으로 녹색 복원 작업에서 한 단계 밝은 emerald-600으로
           내렸다. 예전 emerald-500(2.5:1)까지는 흰 번호가 읽기 어려워 가지 않았다.
           흰 번호 대비 3.77:1로 작은 글자 기준(4.5:1)에는 못 미친다(DESIGN.md 12장
           "녹색 복원"에 근거). */
        route: {
          main: 'rgb(var(--c-route-main) / <alpha-value>)',     // 본선 (라이트 #2563EB, 5.2:1)
          branch: 'rgb(var(--c-route-branch) / <alpha-value>)', // 분선 (라이트 #059669, emerald-600, 3.8:1). 색약 모드는 변수만 바꾼다(index.css)
        },

        danger: 'rgb(var(--c-danger) / <alpha-value>)', // 알림 점, 삭제 (라이트 #EF4444). 점과 아이콘에만 쓴다

        /* 즐겨찾기 별. 예전에 화면마다 직접 쓰던 amber-400 값을 그대로 이름만
           붙였다(새 색 아님). 채운 별/빈 별 모양이 함께 상태를 말하므로 색만으로
           구분하지 않는다. 글자에는 쓰지 않는다(흰 바탕 대비 1.7:1). */
        star: 'rgb(var(--c-star) / <alpha-value>)', // 라이트 #FBBF24
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
        card: '20px',  // 카드 (예전 홈 빠른 실행 타일에도 썼음, 빠른 실행은 삭제)
        tile: '12px',  // 노선 배지, 아이콘 타일
      },

      /* 그림자 (DESIGN.md 6장). 일반 카드는 그림자 없이 1px line으로 나눈다. */
      boxShadow: {
        /* 색은 변수(--shadow-hero, --shadow-float: "R G B")고 불투명도는 여기 그대로다.
           라이트 값은 예전과 같다(파랑 25%, 먹색 8%). */
        hero: '0 12px 32px rgb(var(--shadow-hero) / 0.25)',
        float: '0 8px 24px rgb(var(--shadow-float) / 0.08)',
        sheet: '0 25px 50px -12px rgb(0 0 0 / 0.25)', // 기존 shadow-2xl과 같은 값
      },

      /* 히어로 면 (DESIGN.md 4-3).
         시작 색을 #3B82F6으로 하면 흰 글자 대비가 3.7:1로 떨어져서
         brand에서 brand-deep으로 간다. 위에 옅은 광택을 한 겹 얹는다. */
      backgroundImage: {
        hero:
          'linear-gradient(120deg, rgba(255, 255, 255, 0) 30%, rgba(255, 255, 255, var(--hero-gloss)) 50%, rgba(255, 255, 255, 0) 70%), ' +
          'linear-gradient(135deg, rgb(var(--hero-from)) 0%, rgb(var(--hero-to)) 100%)',
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
