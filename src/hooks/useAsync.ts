import { useState, useEffect, useCallback } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    setStatus("loading");
    setError(null);
    fn()
      .then((result) => {
        setData(result);
        setStatus("success");
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "오류가 발생했습니다.");
        setStatus("error");
      });
    // deps는 이 훅을 쓰는 쪽에서 넘기는 배열이라 리터럴이 아니므로
    // eslint-plugin-react-hooks가 정적으로 검사할 수 없다. 런타임 동작은 정상.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    run();
  }, [run]);

  return { data, status, error, retry: run };
}
