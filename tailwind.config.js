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
          soft: '#EFF4FE',   // 아주 좁은 면적의 선택 배경에만
        },
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
      },
      keyframes: {
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
