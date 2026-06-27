const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse?format=json';
const USER_AGENT    = 'ROV-Management/1.0 (thanhle20072004@gmail.com)';

// Strip Vietnamese administrative level prefixes so we get clean names:
// "Phường Hòa Cường" → "Hòa Cường", "Thành phố Đà Nẵng" → "Đà Nẵng"
const VN_PREFIXES = /^(Phường|Xã|Thị trấn|Quận|Huyện|Thị xã|Thành phố|Tỉnh)\s+/i;
const strip = s => (s || '').replace(VN_PREFIXES, '').trim();

function buildCleanName(address) {
  if (!address) return null;

  // suburb covers ward/neighbourhood; fall back to quarter/village
  const sub  = strip(address.suburb || address.quarter || address.neighbourhood || address.village || '');
  // city → town → county (district) → state (province)
  const city = strip(address.city || address.town || address.county || address.state || '');

  if (sub && city) return `${sub}, ${city}`;
  if (city)        return city;
  return null;
}

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`${NOMINATIM_URL}&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';
    const geo = await res.json();
    return buildCleanName(geo.address) || geo.display_name || '';
  } catch { return ''; }
}

// Detect if a string looks like "lat, lng" coordinates
// e.g. "16.1031, 108.1403" or "16.1031,108.1403"
function parseCoordString(str) {
  if (!str) return null;
  const m = String(str).trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

module.exports = { reverseGeocode, parseCoordString };
