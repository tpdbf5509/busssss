import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * 화면을 그리다 예외가 나면 그 자리만 대신 보여 준다. 이게 없으면 React가 앱 전체를
 * 지워 하얀 화면만 남는다(홈 화면 앱에서 길찾기 위치 허용 직후 실제로 겪음).
 * 예외 내용은 fallback에 넘겨 화면에 보이게 한다. 폰에서는 개발자 도구를 열 수
 * 없어서, 화면 캡처로 원인을 알 수 있게 하기 위해서다.
 */
interface Props {
  children: ReactNode;
  fallback: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

/** 앱 전체가 죽었을 때 보여 주는 화면. 색은 토큰만 쓴다. */
export function AppCrashScreen({ error }: { error: Error }) {
  return (
    <div className="fixed inset-0 bg-canvas flex flex-col items-start justify-center px-6">
      <p className="text-title text-ink">화면을 불러오지 못했어요</p>
      <p className="mt-2 text-body text-muted">
        앱을 다시 열어 주세요. 같은 화면이 반복되면 아래 내용을 알려 주세요.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="select-none touch-manipulation mt-5 min-h-11 px-5 rounded-full bg-brand-fill text-body-strong text-white active:bg-brand-fill-deep"
      >
        다시 불러오기
      </button>
      <p className="mt-6 w-full break-words text-caption text-faint select-text">
        {error.name}: {error.message}
      </p>
    </div>
  );
}
