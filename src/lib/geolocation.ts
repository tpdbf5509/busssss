import type { LatLng } from "@/lib/geo";

export type LocationFailure = "denied" | "unavailable" | "timeout" | "unsupported";

export class LocationError extends Error {
  constructor(public readonly reason: LocationFailure) {
    super(reason);
    this.name = "LocationError";
  }
}

const LOCATION_TIMEOUT_MS = 10_000;

/**
 * 브라우저의 현재 위치를 한 번 받는다. 계속 따라가지(watchPosition) 않는다 —
 * 길찾기는 누른 순간의 위치면 되고, 계속 켜 두면 배터리를 쓴다.
 * 정확도 높임은 켜지 않는다. 근처 500m의 정류장을 찾는 데는 기지국·Wi-Fi 수준이면
 * 되고, GPS를 기다리면 실내에서 오래 걸린다.
 */
export function getCurrentLocation(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new LocationError("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
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
      { enableHighAccuracy: false, timeout: LOCATION_TIMEOUT_MS, maximumAge: 60_000 },
    );
  });
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
