import type { UserLocation } from "@/lib/geo";

export type LocationFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export class LocationError extends Error {
  constructor(public readonly reason: LocationFailure) {
    super(reason);
    this.name = "LocationError";
  }
}

/** 정확한 위치(GPS)를 기다리는 시간. 지나면 대략적인 위치(기지국·Wi-Fi·IP)로 한 번 더 받는다. */
const PRECISE_TIMEOUT_MS = 8_000;
const COARSE_TIMEOUT_MS = 8_000;

/** 이 오차(미터)보다 크면 "내 위치가 아닐 수 있다"고 화면에서 알린다. */
export const POOR_ACCURACY_M = 300;

function readPosition(options: PositionOptions): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : undefined,
        }),
      (err) =>
        reject(
          new LocationError(
            err.code === err.PERMISSION_DENIED
              ? "denied"
              : err.code === err.TIMEOUT
                ? "timeout"
                : "unavailable",
          ),
        ),
      options,
    );
  });
}

/**
 * 브라우저의 현재 위치를 한 번 받는다. 계속 따라가지(watchPosition) 않는다 —
 * 길찾기는 누른 순간의 위치면 되고, 계속 켜 두면 배터리를 쓴다.
 *
 * 처음에는 정확도 높임(GPS)으로 받는다. 예전에는 켜지 않았는데, 그러면 기기가
 * 기지국·Wi-Fi·IP로 어림잡은 위치를 줄 수 있고(PC에서는 수 km 어긋남), 사용자가
 * "내 위치가 아니다"라고 확인했다. 실내에서 GPS가 늦으면 대략적인 위치로 한 번
 * 더 받는다(권한을 거부했으면 다시 묻지 않는다). 오래된 위치를 쓰지 않도록
 * maximumAge는 짧게 둔다. 오차 반경(accuracy)은 함께 돌려줘 화면이 말해 준다.
 */
export async function getCurrentLocation(): Promise<UserLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new LocationError("unsupported");
  }
  try {
    return await readPosition({
      enableHighAccuracy: true,
      timeout: PRECISE_TIMEOUT_MS,
      maximumAge: 10_000,
    });
  } catch (error) {
    if (error instanceof LocationError && error.reason === "denied") throw error;
    return readPosition({
      enableHighAccuracy: false,
      timeout: COARSE_TIMEOUT_MS,
      maximumAge: 60_000,
    });
  }
}

export function locationFailureMessage(reason: LocationFailure): string {
  switch (reason) {
    case "denied":
      return "위치 권한이 꺼져 있어요. 설정에서 켜 주세요";
    case "timeout":
      return "위치를 찾는 데 시간이 걸려요. 다시 눌러 주세요";
    case "unsupported":
      return "이 기기에서는 현재 위치를 쓸 수 없어요";
    default:
      return "현재 위치를 알 수 없어요";
  }
}
