import rawProvincesData from './data.json';

export interface WardItem {
  ward_code: string;
  name: string;
  province_code: string;
}

export interface ProvinceItem {
  province_code: string;
  name: string;
  short_name: string;
  code: string;
  place_type: string;
  wards: WardItem[];
}

export const PROVINCES_DATA: ProvinceItem[] = rawProvincesData as ProvinceItem[];

/**
 * Strips Vietnamese diacritics for fast accent-insensitive search
 */
export function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Approximate center coordinates for major provinces/cities in Vietnam
 * to suggest a matching province when browser Geolocation succeeds.
 */
const PROVINCE_COORDS: Array<{ code: string; nameMatch: string; lat: number; lng: number }> = [
  { code: '01', nameMatch: 'hà nội', lat: 21.0285, lng: 105.8542 },
  { code: '79', nameMatch: 'hồ chí minh', lat: 10.8231, lng: 106.6297 },
  { code: '48', nameMatch: 'đà nẵng', lat: 16.0544, lng: 108.2022 },
  { code: '31', nameMatch: 'hải phòng', lat: 20.8449, lng: 106.6881 },
  { code: '92', nameMatch: 'cần thơ', lat: 10.0452, lng: 105.7469 },
  { code: '74', nameMatch: 'bình dương', lat: 11.1731, lng: 106.6715 },
  { code: '75', nameMatch: 'đồng nai', lat: 10.9574, lng: 106.8427 },
  { code: '95', nameMatch: 'bạc liêu', lat: 9.2941, lng: 105.7216 },
  { code: '96', nameMatch: 'cà mau', lat: 9.1768, lng: 105.1524 },
  { code: '94', nameMatch: 'sóc trăng', lat: 9.6025, lng: 105.9739 },
  { code: '89', nameMatch: 'an giang', lat: 10.3864, lng: 105.4352 },
  { code: '91', nameMatch: 'kiên giang', lat: 10.0125, lng: 105.0809 },
  { code: '82', nameMatch: 'tiền giang', lat: 10.3600, lng: 106.3600 },
  { code: '80', nameMatch: 'long an', lat: 10.5333, lng: 106.4167 },
  { code: '46', nameMatch: 'huế', lat: 16.4637, lng: 107.5909 },
  { code: '56', nameMatch: 'khánh hòa', lat: 12.2388, lng: 109.1967 },
  { code: '68', nameMatch: 'lâm đồng', lat: 11.9404, lng: 108.4583 },
  { code: '66', nameMatch: 'đắk lắk', lat: 12.6667, lng: 108.0500 },
];

export function findNearestProvinceByCoords(lat: number, lng: number): ProvinceItem | null {
  // Check if coordinates are roughly within or near Vietnam bounding box
  if (lat < 7 || lat > 24.5 || lng < 101 || lng > 111) {
    return null;
  }

  let bestMatch: { code: string; nameMatch: string } | null = null;
  let minDistance = Infinity;

  for (const item of PROVINCE_COORDS) {
    const dLat = lat - item.lat;
    const dLng = lng - item.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < minDistance) {
      minDistance = dist;
      bestMatch = item;
    }
  }

  if (!bestMatch || minDistance > 2.5) return null;

  return (
    PROVINCES_DATA.find((p) => p.province_code === bestMatch!.code) ||
    PROVINCES_DATA.find((p) => p.name.toLowerCase().includes(bestMatch!.nameMatch)) ||
    null
  );
}
