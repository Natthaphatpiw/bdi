// Fallback ER list for the UCEP card (spec §5.4). The live facility data has
// no ER flag (see data/knowledge/v1/facilities.json — care_level EMERGENCY is
// only the 1669 hotline), so the Emergency Co-pilot ranks from this seed of
// state + private hospitals with 24-hr emergency rooms around the app's
// service area (บางกะปิ / ลาดพร้าว / ห้วยขวาง / วังทองหลาง) and inner Bangkok.
// Sorted client-side by haversine distance from the user's position.

export interface ErFacility {
  id: string;
  name: string;
  kind: 'public' | 'private';
  kindLabel: string; // "รพ.รัฐ" | "รพ.เอกชน"
  lat: number;
  lng: number;
  phone?: string;
  note?: string;
}

export const ER_SEED: ErFacility[] = [
  {
    id: 'er:nopparat',
    name: 'โรงพยาบาลนพรัตนราชธานี',
    kind: 'public',
    kindLabel: 'รพ.รัฐ',
    lat: 13.8228,
    lng: 100.6907,
    phone: '02-548-1000',
    note: 'ห้องฉุกเฉิน 24 ชม. · กรมการแพทย์',
  },
  {
    id: 'er:vejthani',
    name: 'โรงพยาบาลเวชธานี (ลาดพร้าว 111)',
    kind: 'private',
    kindLabel: 'รพ.เอกชน',
    lat: 13.7846,
    lng: 100.6473,
    phone: '02-734-0000',
    note: 'ห้องฉุกเฉิน 24 ชม.',
  },
  {
    id: 'er:ladprao',
    name: 'โรงพยาบาลลาดพร้าว',
    kind: 'private',
    kindLabel: 'รพ.เอกชน',
    lat: 13.8065,
    lng: 100.6088,
    phone: '02-530-2556',
    note: 'ห้องฉุกเฉิน 24 ชม.',
  },
  {
    id: 'er:ramkhamhaeng',
    name: 'โรงพยาบาลรามคำแหง',
    kind: 'private',
    kindLabel: 'รพ.เอกชน',
    lat: 13.7554,
    lng: 100.6383,
    phone: '02-743-9999',
    note: 'ห้องฉุกเฉิน 24 ชม.',
  },
  {
    id: 'er:praram9',
    name: 'โรงพยาบาลพระราม 9',
    kind: 'private',
    kindLabel: 'รพ.เอกชน',
    lat: 13.7488,
    lng: 100.5651,
    phone: '1270',
    note: 'ห้องฉุกเฉิน 24 ชม.',
  },
  {
    id: 'er:rajavithi',
    name: 'โรงพยาบาลราชวิถี',
    kind: 'public',
    kindLabel: 'รพ.รัฐ',
    lat: 13.7657,
    lng: 100.5372,
    phone: '02-206-2900',
    note: 'ห้องฉุกเฉิน 24 ชม. · กรมการแพทย์',
  },
  {
    id: 'er:chula',
    name: 'โรงพยาบาลจุฬาลงกรณ์ สภากาชาดไทย',
    kind: 'public',
    kindLabel: 'รพ.รัฐ',
    lat: 13.7326,
    lng: 100.5364,
    phone: '02-256-4000',
    note: 'ห้องฉุกเฉิน 24 ชม.',
  },
  {
    id: 'er:klang',
    name: 'โรงพยาบาลกลาง (สำนักการแพทย์ กทม.)',
    kind: 'public',
    kindLabel: 'รพ.รัฐ',
    lat: 13.7508,
    lng: 100.5122,
    phone: '02-220-8000',
    note: 'ห้องฉุกเฉิน 24 ชม.',
  },
];

export function mapsDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
