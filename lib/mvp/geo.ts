export interface Coordinates {
  lat: number;
  lng: number;
}

/** Great-circle distance in kilometres. */
export function haversineKm(from: Coordinates, to: Coordinates): number {
  const radiusKm = 6371.0088;
  const radians = (degree: number) => (degree * Math.PI) / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}
