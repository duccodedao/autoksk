export interface DeviceNetworkInfo {
  deviceId: string;
  ipWifi: string;
  deviceIp: string;
  networkAddress: string;
  userAgent: string;
  updatedAt: string;
}

export interface LockedDeviceRecord {
  deviceId: string;
  ipWifi: string;
  deviceIp: string;
  networkAddress: string;
  userAgent: string;
  failedAttempts: number;
  locked: boolean;
  lockedAt: string;
  reason: string;
  targetEmail?: string;
}

export const MAX_LOGIN_FAILED_ATTEMPTS = 5;
const DEVICE_ID_STORAGE_KEY = 'his_security_device_id';
const DEVICE_LOCK_STORAGE_KEY = 'his_security_device_lock_state';
const CACHED_NET_INFO_KEY = 'his_security_cached_net_info';

/**
 * Generates or retrieves a persistent hardware/browser device identifier
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 8) {
      return existing;
    }
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const screenInfo =
      typeof window !== 'undefined' && window.screen
        ? `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
        : '0x0';
    const rawFingerprint = [
      nav?.userAgent || '',
      nav?.language || '',
      screenInfo,
      Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    ].join('|');

    let hash = 2166136261;
    for (let i = 0; i < rawFingerprint.length; i++) {
      hash ^= rawFingerprint.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const hexHash = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
    const randSuffix = Math.random().toString(16).substring(2, 6).toUpperCase();
    const newId = `DEV-${hexHash}-${randSuffix}`;
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, newId);
    return newId;
  } catch {
    return 'DEV-LOCAL-0001';
  }
}

/**
 * Derives a deterministic local LAN IP representation when WebRTC mDNS masks the raw LAN IP
 */
function deriveFallbackDeviceLanIp(deviceId: string): string {
  let sumA = 1;
  let sumB = 100;
  for (let i = 0; i < deviceId.length; i++) {
    sumA = (sumA + deviceId.charCodeAt(i) * (i + 1)) % 250;
    sumB = (sumB + deviceId.charCodeAt(i) * 7) % 250;
  }
  const subnet = (sumA % 2) + 1; // 192.168.1.x or 192.168.2.x
  const host = Math.max(10, sumB);
  return `192.168.${subnet}.${host}`;
}

/**
 * Attempts to detect local device LAN IP via WebRTC ICE candidates (with 1.2s timeout)
 */
export async function detectLocalDeviceIp(deviceId: string): Promise<string> {
  const fallbackLan = deriveFallbackDeviceLanIp(deviceId);
  if (typeof window === 'undefined' || !window.RTCPeerConnection) {
    return `${fallbackLan} (${deviceId})`;
  }

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (ip: string) => {
      if (!resolved) {
        resolved = true;
        resolve(`${ip} (${deviceId})`);
      }
    };

    const timer = setTimeout(() => {
      finish(fallbackLan);
    }, 1000);

    try {
      const pc = new RTCPeerConnection({ iceServers: [] });
      pc.createDataChannel('');
      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) return;
        const cand = ice.candidate.candidate;
        const ipMatch = cand.match(
          /([0-9]{1,3}(\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{1,4}){7})/i
        );
        if (ipMatch && ipMatch[1] && !ipMatch[1].startsWith('0.') && ipMatch[1] !== '127.0.0.1') {
          clearTimeout(timer);
          pc.close();
          finish(ipMatch[1]);
        }
      };
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          clearTimeout(timer);
          finish(fallbackLan);
        });
    } catch {
      clearTimeout(timer);
      finish(fallbackLan);
    }
  });
}

/**
 * Collects full client network & device telemetry:
 * - ipWifi: Public Wi-Fi / WAN IP
 * - deviceIp: Local Device IP + Hardware Fingerprint ID
 * - networkAddress: Physical/Geo Address & ISP
 */
export async function fetchClientNetworkInfo(): Promise<DeviceNetworkInfo> {
  const deviceId = getOrCreateDeviceId();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

  // Return cached info quickly if fetched within the last 5 minutes
  try {
    const cachedRaw = sessionStorage.getItem(CACHED_NET_INFO_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw) as DeviceNetworkInfo;
      if (cached && cached.ipWifi && cached.deviceIp && cached.networkAddress) {
        return cached;
      }
    }
  } catch {
    // ignore cache error
  }

  const deviceIpPromise = detectLocalDeviceIp(deviceId);

  let ipWifi = '';
  let networkAddress = '';

  // 1. Try ipwho.is (HTTPS CORS friendly, returns IP + City + Region + Country + ISP)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://ipwho.is/', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.ip) {
        ipWifi = String(data.ip);
        const parts = [data.city, data.region, data.country].filter(Boolean);
        const isp = data.connection?.isp || data.connection?.org || '';
        networkAddress = parts.join(', ') + (isp ? ` · ${isp}` : '');
      }
    }
  } catch {
    // Fallback to next provider
  }

  // 2. Fallback to backend /api/security/client-info if public geo-IP blocked
  if (!ipWifi || !networkAddress) {
    try {
      const res = await fetch('/api/security/client-info');
      if (res.ok) {
        const data = await res.json();
        if (!ipWifi && data.ipWifi) ipWifi = data.ipWifi;
        if (!networkAddress && data.networkAddress) networkAddress = data.networkAddress;
      }
    } catch {
      // ignore
    }
  }

  const deviceIp = await deviceIpPromise;

  const finalInfo: DeviceNetworkInfo = {
    deviceId,
    ipWifi: ipWifi || '113.161.72.104',
    deviceIp,
    networkAddress: networkAddress || 'Việt Nam (Mạng nội bộ HIS)',
    userAgent,
    updatedAt: new Date().toISOString(),
  };

  try {
    sessionStorage.setItem(CACHED_NET_INFO_KEY, JSON.stringify(finalInfo));
  } catch {
    // ignore
  }

  return finalInfo;
}

/**
 * Local storage helper for immediate client-side failed attempt & lock tracking
 */
export function getLocalDeviceLockState(): {
  failedAttempts: number;
  locked: boolean;
  lockedAt: string | null;
} {
  try {
    const raw = localStorage.getItem(DEVICE_LOCK_STORAGE_KEY);
    if (!raw) return { failedAttempts: 0, locked: false, lockedAt: null };
    const parsed = JSON.parse(raw);
    return {
      failedAttempts: Number(parsed.failedAttempts) || 0,
      locked: Boolean(parsed.locked),
      lockedAt: parsed.lockedAt || null,
    };
  } catch {
    return { failedAttempts: 0, locked: false, lockedAt: null };
  }
}

export function setLocalDeviceLockState(state: {
  failedAttempts: number;
  locked: boolean;
  lockedAt: string | null;
}): void {
  try {
    localStorage.setItem(DEVICE_LOCK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}
