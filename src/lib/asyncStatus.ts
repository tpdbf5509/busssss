/** useAsync가 돌려주는 조회 상태와 같은 값. */
export type AsyncStatus = "idle" | "loading" | "success" | "error";

/**
 * 조회가 끝났는지. 성공뿐 아니라 실패도 "끝난 것"이다.
 *
 * 다른 조회가 이 결과를 기다렸다가 시작할 때 쓴다(홈의 노선 목록 → 도착 조회).
 * 실패를 끝난 것으로 보지 않으면, 노선 목록 조회가 실패했을 때 기다리던
 * 도착 조회가 영원히 시작되지 않아 화면이 로딩 상태에 갇힌다.
 *
 * 데이터 유무(`data !== undefined`)로 판단하면 안 된다. useAsync의 data는
 * 처음부터 null이라 그 판단은 늘 참이 되어, 기다리는 장치가 작동하지 않았다.
 */
export function isSettled(status: AsyncStatus): boolean {
  return status === "success" || status === "error";
}
