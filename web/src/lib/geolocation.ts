export interface SimpleCoords {
  lat: number
  lon: number
}

/** Promise wrapper around navigator.geolocation.getCurrentPosition, with a sane timeout. */
export function getCurrentPosition(options?: PositionOptions): Promise<SimpleCoords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000, ...options }
    )
  })
}
