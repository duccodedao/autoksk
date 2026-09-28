import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Search,
  Building2,
  Map,
  Check,
  X,
  RefreshCw,
  Code2,
  Lock,
} from 'lucide-react';
import rawLocationData from '../xaphuong/data.json';

export interface WardDataItem {
  ward_code: string;
  name: string;
  province_code: string;
}

export interface ProvinceDataItem {
  province_code: string;
  name: string;
  short_name: string;
  code: string;
  place_type: string;
  wards: WardDataItem[];
}

export interface UserLocationSelection {
  provinceCode: string;
  provinceName: string;
  wardCode: string;
  wardName: string;
  latitude?: number;
  longitude?: number;
}

interface LocationSetupModalProps {
  isOpen: boolean;
  initialProvinceCode?: string;
  initialWardCode?: string;
  isFirstTimeSetup?: boolean;
  canEditLocation?: boolean;
  onSaveLocation: (selection: UserLocationSelection) => Promise<void>;
  onClose: () => void;
}

const PROVINCES_LIST: ProvinceDataItem[] = rawLocationData as ProvinceDataItem[];

function removeVietnameseTones(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export const LocationSetupModal: React.FC<LocationSetupModalProps> = ({
  isOpen,
  initialProvinceCode,
  initialWardCode,
  isFirstTimeSetup = false,
  canEditLocation = true,
  onSaveLocation,
  onClose,
}) => {
  // Default to Cà Mau (96) - Phường Hiệp Thành (31840) if not set yet
  const [selectedProvinceCode, setSelectedProvinceCode] = useState<string>(
    initialProvinceCode || '96'
  );
  const [selectedWardCode, setSelectedWardCode] = useState<string>(
    initialWardCode || '31840'
  );
  const [wardSearchQuery, setWardSearchQuery] = useState<string>('');
  const [globalSearchQuery, setGlobalSearchQuery] = useState<string>('');

  // GPS State
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [gpsMessage, setGpsMessage] = useState<string>('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialProvinceCode) {
      setSelectedProvinceCode(initialProvinceCode);
    }
    if (initialWardCode) {
      setSelectedWardCode(initialWardCode);
    }
  }, [initialProvinceCode, initialWardCode, isOpen]);

  // Automatically request location permission when modal opens
  useEffect(() => {
    if (isOpen && gpsStatus === 'idle' && canEditLocation) {
      requestGeolocation();
    }
  }, [isOpen, canEditLocation]);

  const selectedProvince = useMemo(() => {
    return (
      PROVINCES_LIST.find((p) => p.province_code === selectedProvinceCode) ||
      PROVINCES_LIST[0]
    );
  }, [selectedProvinceCode]);

  const availableWards = useMemo(() => {
    return selectedProvince ? selectedProvince.wards : [];
  }, [selectedProvince]);

  const filteredWards = useMemo(() => {
    if (!wardSearchQuery.trim()) return availableWards;
    const normQuery = removeVietnameseTones(wardSearchQuery);
    return availableWards.filter(
      (w) =>
        removeVietnameseTones(w.name).includes(normQuery) ||
        w.ward_code.includes(normQuery)
    );
  }, [availableWards, wardSearchQuery]);

  const selectedWard = useMemo(() => {
    return (
      availableWards.find((w) => w.ward_code === selectedWardCode) ||
      availableWards[0]
    );
  }, [availableWards, selectedWardCode]);

  // Quick Global Search across all provinces & wards in data.json
  const globalSearchResults = useMemo(() => {
    const q = globalSearchQuery.trim();
    if (q.length < 2) return [];
    const normQ = removeVietnameseTones(q);
    const results: { province: ProvinceDataItem; ward: WardDataItem }[] = [];

    for (const prov of PROVINCES_LIST) {
      for (const ward of prov.wards) {
        if (
          removeVietnameseTones(ward.name).includes(normQ) ||
          ward.ward_code.includes(normQ) ||
          removeVietnameseTones(`${ward.name} ${prov.name}`).includes(normQ)
        ) {
          results.push({ province: prov, ward });
          if (results.length >= 25) return results;
        }
      }
    }
    return results;
  }, [globalSearchQuery]);

  const handleProvinceChange = (newProvinceCode: string) => {
    setSelectedProvinceCode(newProvinceCode);
    setWardSearchQuery('');
    const prov = PROVINCES_LIST.find((p) => p.province_code === newProvinceCode);
    if (prov && prov.wards.length > 0) {
      setSelectedWardCode(prov.wards[0].ward_code);
    }
  };

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      setGpsStatus('denied');
      setGpsMessage('Trình duyệt không hỗ trợ định vị GPS. Vui lòng chọn Tỉnh/Thành phố và Xã/Phường bên dưới.');
      return;
    }

    setGpsStatus('requesting');
    setGpsMessage('Hệ thống đang xin phép truy cập vị trí của bạn...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setCoords({ lat, lng });
        setGpsStatus('granted');
        setGpsMessage(
          `Đã cấp quyền truy cập vị trí (${lat.toFixed(4)}, ${lng.toFixed(4)}). Đang đối chiếu Tỉnh/Thành phố & Xã/Phường...`
        );

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1&accept-language=vi`
          );
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const stateText = String(addr.state || addr.city || addr.province || '');
            const suburbText = String(
              addr.suburb || addr.quarter || addr.village || addr.town || addr.city_district || ''
            );

            if (stateText) {
              const normState = removeVietnameseTones(
                stateText.replace(/^(tinh|thanh pho|tp\.?)\s+/i, '')
              );
              const matchedProv = PROVINCES_LIST.find((p) => {
                const normP = removeVietnameseTones(
                  p.name.replace(/^(tinh|thanh pho)\s+/i, '')
                );
                return normP.includes(normState) || normState.includes(normP);
              });

              if (matchedProv) {
                setSelectedProvinceCode(matchedProv.province_code);
                let matchedWard = matchedProv.wards[0];
                if (suburbText) {
                  const normSuburb = removeVietnameseTones(
                    suburbText.replace(/^(phuong|xa|thi tran|dac khu)\s+/i, '')
                  );
                  const foundWard = matchedProv.wards.find((w) => {
                    const normW = removeVietnameseTones(
                      w.name.replace(/^(phuong|xa|thi tran|dac khu)\s+/i, '')
                    );
                    return normW.includes(normSuburb) || normSuburb.includes(normW);
                  });
                  if (foundWard) {
                    matchedWard = foundWard;
                  }
                }
                if (matchedWard) {
                  setSelectedWardCode(matchedWard.ward_code);
                }
                setGpsMessage(
                  `Đã xác định vị trí GPS (${lat.toFixed(4)}, ${lng.toFixed(4)}) — Gợi ý: ${
                    matchedWard?.name || ''
                  }, ${matchedProv.name}. Bạn có thể chỉnh sửa lại bên dưới.`
                );
                return;
              }
            }
          }
          setGpsMessage(
            `Đã cấp quyền vị trí (${lat.toFixed(4)}, ${lng.toFixed(4)}). Hãy kiểm tra và chọn Tỉnh/Thành phố, Xã/Phường bên dưới.`
          );
        } catch {
          setGpsMessage(
            `Đã cấp quyền vị trí (${lat.toFixed(4)}, ${lng.toFixed(4)}). Hãy chọn Tỉnh/Thành phố và Xã/Phường bên dưới.`
          );
        }
      },
      (err) => {
        setGpsStatus('denied');
        if (err.code === err.PERMISSION_DENIED) {
          setGpsMessage(
            'Bạn đã từ chối hoặc trình duyệt chặn quyền vị trí. Vui lòng tự chọn Tỉnh/Thành phố và Xã/Phường theo danh mục bên dưới.'
          );
        } else {
          setGpsMessage(
            'Không thể lấy tọa độ GPS tự động. Vui lòng tự chọn Tỉnh/Thành phố và Xã/Phường bên dưới.'
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000,
      }
    );
  };

  const handleConfirmSave = async () => {
    if (!selectedProvince || !selectedWard || !canEditLocation) return;
    setSaving(true);
    try {
      await onSaveLocation({
        provinceCode: selectedProvince.province_code,
        provinceName: selectedProvince.name,
        wardCode: selectedWard.ward_code,
        wardName: selectedWard.name,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-auto">
        {/* Modal Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/25 shrink-0">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold leading-tight">
                {isFirstTimeSetup
                  ? 'Cấp Quyền Vị Trí & Thiết Lập Tỉnh/Thành Phố, Xã/Phường'
                  : 'Cập Nhật Tỉnh/Thành Phố & Xã/Phường Tiếp Nhận'}
              </h2>
              <p className="text-[11px] text-blue-100 mt-0.5">
                Giữ nguyên JS Tiếp nhận gốc v3.8 — chỉ thay đổi Xã/Phường (CV30), Tỉnh/Thành chọn để biết & lọc danh sách
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            title="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Notice Banner: 1-Time Setup Rule or Locked Rule */}
          {!canEditLocation ? (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2.5 text-xs">
              <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="block text-rose-950">
                  Đã vô hiệu hóa thay đổi Xã/Phường (Chỉ được setup 1 lần duy nhất)
                </strong>
                <span>
                  Tài khoản của bạn đã thiết lập Xã/Phường lần đầu. Theo quy định phân quyền, bạn chỉ có thể thay đổi lại Xã/Phường khi được <strong>Admin cấp quyền Thay đổi Xã/Phường</strong>.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-indigo-50/90 border border-indigo-200 text-indigo-950 flex items-start gap-2.5 text-xs">
              <AlertTriangle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Lưu ý phân quyền Xã/Phường:</strong>{' '}
                {isFirstTimeSetup
                  ? 'Bạn chỉ được phép thiết lập Xã/Phường 1 lần duy nhất. Sau khi lưu, chức năng thay đổi sẽ tự động vô hiệu hóa và chỉ mở lại khi Admin phân quyền.'
                  : 'Tài khoản của bạn đang được Admin cấp quyền thay đổi Xã/Phường.'}
              </div>
            </div>
          )}

          {/* 1. Location Permission Bar */}
          <div
            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              gpsStatus === 'granted'
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : gpsStatus === 'requesting'
                ? 'bg-blue-50/80 border-blue-200 text-blue-900'
                : 'bg-amber-50/80 border-amber-200 text-amber-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {gpsStatus === 'granted' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : gpsStatus === 'requesting' ? (
                <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0 mt-0.5" />
              ) : (
                <Navigation className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs leading-relaxed">
                <span className="font-bold block">
                  {gpsStatus === 'granted'
                    ? 'Đã truy cập vị trí thiết bị'
                    : gpsStatus === 'requesting'
                    ? 'Đang yêu cầu quyền truy cập vị trí...'
                    : 'Bước 1: Cấp quyền truy cập vị trí'}
                </span>
                <span className="text-[11px] opacity-90">
                  {gpsMessage ||
                    'Bấm "Định vị GPS" để hệ thống xin phép truy cập vị trí và gợi ý địa phương tự động.'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={requestGeolocation}
              disabled={gpsStatus === 'requesting'}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0 self-start sm:self-center shadow-2xs disabled:opacity-50"
            >
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
              <span>{gpsStatus === 'granted' ? 'Định vị lại' : 'Cho phép Vị trí GPS'}</span>
            </button>
          </div>

          {/* 2. Quick Search Ward/Province */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Tìm nhanh Xã / Phường / Đặc khu (Toàn quốc)</span>
              <span className="text-[10px] font-mono text-slate-400">
                Dữ liệu chuẩn: {PROVINCES_LIST.length} Tỉnh/TP
              </span>
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder="Gõ tên xã/phường để tìm nhanh (VD: Phường Hiệp Thành, Phường Ba Đình, Phường Ninh Kiều...)"
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
              />
              {globalSearchQuery && (
                <button
                  type="button"
                  onClick={() => setGlobalSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {globalSearchResults.length > 0 && (
              <div className="border border-blue-200 rounded-xl bg-blue-50/40 max-h-40 overflow-y-auto divide-y divide-slate-100 shadow-inner">
                {globalSearchResults.map((item) => {
                  const isCurrent =
                    item.province.province_code === selectedProvinceCode &&
                    item.ward.ward_code === selectedWardCode;
                  return (
                    <button
                      key={`${item.province.province_code}_${item.ward.ward_code}`}
                      type="button"
                      onClick={() => {
                        setSelectedProvinceCode(item.province.province_code);
                        setSelectedWardCode(item.ward.ward_code);
                        setGlobalSearchQuery('');
                      }}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-blue-100/60 transition-colors cursor-pointer ${
                        isCurrent ? 'bg-blue-100/80 font-bold text-blue-900' : 'text-slate-700'
                      }`}
                    >
                      <div>
                        <span className="font-bold text-slate-900">{item.ward.name}</span>
                        <span className="text-slate-400 mx-1.5">·</span>
                        <span className="text-slate-600">{item.province.name}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-500">
                        Mã xã: {item.ward.ward_code}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Select Province & Ward */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Province Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>1. Chọn Tỉnh / Thành phố</span>
                </span>
                <span className="text-[10px] font-normal text-slate-400">Chỉ chọn để biết & lọc phường</span>
              </label>
              <select
                value={selectedProvinceCode}
                onChange={(e) => handleProvinceChange(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 shadow-2xs cursor-pointer"
              >
                {PROVINCES_LIST.map((prov) => (
                  <option key={prov.province_code} value={prov.province_code}>
                    [{prov.province_code}] {prov.name} ({prov.wards.length} xã/phường)
                  </option>
                ))}
              </select>
            </div>

            {/* Ward Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Map className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Chọn Xã / Phường ({availableWards.length})</span>
                </span>
              </label>
              <select
                value={selectedWard?.ward_code || ''}
                onChange={(e) => setSelectedWardCode(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-600 shadow-2xs cursor-pointer"
              >
                {filteredWards.map((w) => (
                  <option key={w.ward_code} value={w.ward_code}>
                    {w.name} (Mã: {w.ward_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Filter wards within selected province */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-500">
                Danh sách Xã/Phường thuộc <strong className="text-slate-800">{selectedProvince?.name}</strong>:
              </span>
              <input
                type="text"
                value={wardSearchQuery}
                onChange={(e) => setWardSearchQuery(e.target.value)}
                placeholder={`Lọc nhanh trong ${selectedProvince?.name}...`}
                className="w-48 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] focus:bg-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {filteredWards.map((ward) => {
                const isSelected = ward.ward_code === selectedWard?.ward_code;
                return (
                  <button
                    key={ward.ward_code}
                    type="button"
                    onClick={() => setSelectedWardCode(ward.ward_code)}
                    className={`px-2.5 py-1.5 rounded-lg text-left text-[11px] transition-all cursor-pointer flex items-center justify-between gap-1 ${
                      isSelected
                        ? 'bg-blue-600 text-white font-bold shadow-2xs'
                        : 'bg-white hover:bg-blue-50 text-slate-700 border border-slate-200/70'
                    }`}
                  >
                    <span className="truncate">{ward.name}</span>
                    <span
                      className={`font-mono text-[9px] shrink-0 ${
                        isSelected ? 'text-blue-100' : 'text-slate-400'
                      }`}
                    >
                      {ward.ward_code}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Live Preview of Code Injection */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5" />
                Giữ nguyên JS gốc v3.8 — Chỉ thay đổi Xã/Phường trong AUTO_DATA:
              </span>
              <span className="text-[10px] font-mono text-slate-400">CV30 (#maxa_cu_tru)</span>
            </div>

            <div className="font-mono text-[11px] bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-1 text-slate-300">
              <div>
                <span className="text-slate-500">TARGET_WARD_TEXT:</span>{' '}
                <span className="text-emerald-300 font-bold">"{selectedWard?.name}"</span>{' '}
                <span className="text-slate-500">// Xã/Phường chọn tại Địa chỉ (CV30)</span>
              </div>
              <div className="text-[10px] text-slate-500">
                // Tỉnh/Thành phố ({selectedProvince?.name}) chỉ chọn để biết, không can thiệp vào cấu trúc JS Tiếp nhận
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            {isFirstTimeSetup ? 'Để sau (Dùng mặc định Phường Hiệp Thành)' : 'Hủy bỏ'}
          </button>

          <button
            type="button"
            onClick={handleConfirmSave}
            disabled={saving || !selectedProvince || !selectedWard || !canEditLocation}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 ${
              !canEditLocation
                ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer disabled:opacity-50'
            }`}
          >
            {!canEditLocation ? (
              <>
                <Lock className="w-4 h-4" />
                <span>Đã khóa đổi Xã/Phường (Cần Admin cấp quyền)</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Đang lưu thiết lập...'
                    : `Áp dụng: ${selectedWard?.name}, ${selectedProvince?.name}`}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
