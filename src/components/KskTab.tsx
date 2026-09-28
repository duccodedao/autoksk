import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Stethoscope,
  Copy,
  Check,
  Download,
  Code2,
  Baby,
  Server,
  RefreshCw,
  CheckCircle2,
  Globe,
  Zap,
  Lock,
  Eye,
} from 'lucide-react';
import {
  KskConfigData,
  UserProfile,
  JS_UPDATED_DATE,
  getEffectivePermissions,
} from '../firebase';
import {
  buildKskScript,
  buildKskApiLoaderSnippet,
  encodeKskConfigToken,
} from '../utils/kskScriptBuilder';
import { obfuscateScript } from '../utils/obfuscate';

export { buildKskScript };

export type KskScriptViewMode = 'api_loader' | 'obfuscated' | 'raw';

interface KskTabProps {
  config: KskConfigData;
  currentUser?: UserProfile | null;
  configId?: string;
  configName?: string;
  isAdmin?: boolean;
  canViewRawCode?: boolean;
  showToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    title: string,
    message: string
  ) => void;
}

interface ApiStatusInfo {
  online: boolean;
  checking: boolean;
  latencyMs: number | null;
  totalRequests: number;
  configName: string;
  payloadLength: number | null;
}

export const KskTab: React.FC<KskTabProps> = ({
  config,
  currentUser,
  configId = 'preset_tt32_standard',
  configName,
  showToast,
}) => {
  const [kskCategory, setKskCategory] = useState<'adult' | 'child'>('adult');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedApiUrl, setCopiedApiUrl] = useState(false);

  const perms = getEffectivePermissions(currentUser);
  const canApiSystem = perms.kskApiSystem;
  const canSyncParams = perms.kskSyncParams;
  const canViewObfuscated = perms.kskViewObfuscated;
  const canViewRaw = perms.kskViewRaw;
  const hasAnyCodeAccess = canApiSystem || canViewObfuscated || canViewRaw;

  const [viewMode, setViewMode] = useState<KskScriptViewMode>('api_loader');

  const isModePermitted = useCallback(
    (mode: KskScriptViewMode): boolean => {
      switch (mode) {
        case 'api_loader':
          return canApiSystem;
        case 'obfuscated':
          return canViewObfuscated;
        case 'raw':
          return canViewRaw;
      }
    },
    [canApiSystem, canViewObfuscated, canViewRaw]
  );

  // Automatically select a permitted mode if the current viewMode is not permitted
  useEffect(() => {
    if (!isModePermitted(viewMode)) {
      if (canApiSystem) setViewMode('api_loader');
      else if (canViewObfuscated) setViewMode('obfuscated');
      else if (canViewRaw) setViewMode('raw');
    }
  }, [viewMode, canApiSystem, canViewObfuscated, canViewRaw, isModePermitted]);

  const [apiStatus, setApiStatus] = useState<ApiStatusInfo>({
    online: true,
    checking: false,
    latencyMs: null,
    totalRequests: 0,
    configName: configName || config.presetName || 'Khám sức khỏe toàn dân',
    payloadLength: null,
  });

  const effectiveConfig = useMemo<KskConfigData>(
    () => ({
      ...config,
      presetName: configName || config.presetName || 'Khám sức khỏe toàn dân',
    }),
    [config, configName]
  );

  const originUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Direct API endpoint URL for current configuration
  const apiEndpointUrl = useMemo(() => {
    const cleanOrigin = originUrl.replace(/\/+$/, '');
    const publicOrigin = cleanOrigin.includes('://ais-dev-')
      ? cleanOrigin.replace('://ais-dev-', '://ais-pre-')
      : cleanOrigin;
    const token = encodeKskConfigToken(effectiveConfig);
    return `${publicOrigin}/api/ksk/script?configId=${encodeURIComponent(configId)}&c=${encodeURIComponent(token)}`;
  }, [originUrl, configId, effectiveConfig]);

  // 1. API Loader snippet (GET API về Webapp để lấy JS Khám bệnh)
  const apiLoaderScript = useMemo(() => {
    return buildKskApiLoaderSnippet(effectiveConfig, originUrl, configId);
  }, [effectiveConfig, originUrl, configId]);

  // 2. Full Raw Script (Mã gốc cũ)
  const rawScript = useMemo(() => {
    return buildKskScript(effectiveConfig);
  }, [effectiveConfig]);

  // 3. Full Obfuscated Script (Mã hóa cũ)
  const obfuscatedScript = useMemo(() => {
    return obfuscateScript(rawScript, `HIS CLINICAL ENGINE v4.2 - JS UPDATED: ${JS_UPDATED_DATE}`);
  }, [rawScript]);

  const finalScriptOutput = useMemo(() => {
    if (!hasAnyCodeAccess) {
      return '// Tài khoản của bạn chưa được Admin phân quyền xem Code Khám bệnh.';
    }
    if (viewMode === 'raw' && canViewRaw) {
      return rawScript;
    }
    if (viewMode === 'obfuscated' && canViewObfuscated) {
      return obfuscatedScript;
    }
    if (viewMode === 'api_loader' && canApiSystem) {
      return apiLoaderScript;
    }
    if (canApiSystem) return apiLoaderScript;
    if (canViewObfuscated) return obfuscatedScript;
    if (canViewRaw) return rawScript;
    return '// Chưa được Admin phân quyền.';
  }, [
    hasAnyCodeAccess,
    viewMode,
    canViewRaw,
    canViewObfuscated,
    canApiSystem,
    rawScript,
    obfuscatedScript,
    apiLoaderScript,
  ]);

  const handleSelectViewMode = (mode: KskScriptViewMode) => {
    if (!isModePermitted(mode)) {
      const modeName =
        mode === 'api_loader'
          ? 'Hệ Thống API Khám Bệnh (Code Gọi API)'
          : mode === 'obfuscated'
          ? 'Mã hóa (Cũ)'
          : 'Mã gốc (Cũ)';
      showToast(
        'warning',
        'Chỉ xem được khi Admin phân quyền',
        `Tài khoản của bạn chưa được Admin cấp quyền xem "${modeName}".`
      );
      return;
    }
    setViewMode(mode);
  };

  // Sync active KSK config with backend API and check status
  const verifyAndSyncApi = useCallback(
    async (showNotification = false) => {
      setApiStatus((prev) => ({ ...prev, checking: true }));
      const startTime = performance.now();
      try {
        await fetch('/api/ksk/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            activeConfigId: configId,
            activeKskConfig: effectiveConfig,
          }),
        });

        const token = encodeKskConfigToken(effectiveConfig);
        const res = await fetch(
          `/api/ksk/script?configId=${encodeURIComponent(configId)}&c=${encodeURIComponent(token)}`,
          {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
          }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const elapsed = Math.round(performance.now() - startTime);

        if (data && data.ok && data.script) {
          setApiStatus({
            online: true,
            checking: false,
            latencyMs: elapsed,
            totalRequests: Number(data.totalRequests) || 1,
            configName: data.configName || effectiveConfig.presetName || 'KSK v4.2',
            payloadLength: String(data.script).length,
          });
          if (showNotification) {
            showToast(
              'success',
              'API Khám bệnh hoạt động tốt (200 OK)',
              `Đã nhận phản hồi JS KSK v4.2 (${(String(data.script).length / 1024).toFixed(1)} KB) sau ${elapsed}ms.`
            );
          }
        } else {
          throw new Error('Dữ liệu API không hợp lệ');
        }
      } catch {
        setApiStatus((prev) => ({
          ...prev,
          online: false,
          checking: false,
        }));
        if (showNotification) {
          showToast(
            'error',
            'Không thể kết nối API',
            'Vui lòng kiểm tra lại kết nối mạng hoặc máy chủ API.'
          );
        }
      }
    },
    [configId, effectiveConfig, showToast]
  );

  useEffect(() => {
    verifyAndSyncApi(false);
  }, [verifyAndSyncApi]);

  const getActiveModeTitle = () => {
    switch (viewMode) {
      case 'api_loader':
        return '1. Code Gọi API (GET API Loader)';
      case 'obfuscated':
        return '2. Mã hóa (Cũ - Đã phân quyền)';
      case 'raw':
        return '3. Mã gốc (Cũ - Đã phân quyền)';
    }
  };

  const handleCopy = async () => {
    if (!hasAnyCodeAccess || !isModePermitted(viewMode)) {
      showToast('warning', 'Chưa được phân quyền', 'Bạn cần được Admin phân quyền để sao chép mã này.');
      return;
    }
    try {
      await navigator.clipboard.writeText(finalScriptOutput);
      setCopiedScript(true);
      showToast(
        'success',
        `Đã sao chép: ${getActiveModeTitle()}`,
        'Dán (Ctrl+V) vào F12 Console trên màn hình Khám bệnh HIS để thực thi.'
      );
      setTimeout(() => setCopiedScript(false), 2500);
    } catch {
      showToast('error', 'Lỗi clipboard', 'Không thể sao chép tự động.');
    }
  };

  const handleCopyApiUrl = async () => {
    if (!canApiSystem) {
      showToast('warning', 'Chưa được phân quyền', 'Bạn cần được Admin cấp quyền Hệ Thống API Khám Bệnh.');
      return;
    }
    try {
      await navigator.clipboard.writeText(apiEndpointUrl);
      setCopiedApiUrl(true);
      showToast('info', 'Đã sao chép API Endpoint', 'Đã lưu đường dẫn GET API vào bộ nhớ tạm.');
      setTimeout(() => setCopiedApiUrl(false), 2000);
    } catch {
      showToast('error', 'Lỗi clipboard', 'Không thể sao chép đường dẫn API.');
    }
  };

  const handleDownload = () => {
    if (!hasAnyCodeAccess || !isModePermitted(viewMode)) {
      showToast('warning', 'Chưa được phân quyền', 'Bạn cần được Admin phân quyền để tải file mã này.');
      return;
    }
    const blob = new Blob([finalScriptOutput], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const modeTag = viewMode === 'api_loader' ? 'API_Loader' : viewMode === 'raw' ? 'Raw' : 'Obfuscated';
    link.download = `HIS_Kham_KSK_${modeTag}_v4.2_${Date.now()}.js`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Đã tải file .js', 'File kịch bản Khám bệnh đã được lưu về máy.');
  };

  const sampleCases = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => {
      const h =
        Math.floor(Math.random() * (config.chieuCaoMax - config.chieuCaoMin + 1)) +
        config.chieuCaoMin;
      const w =
        Math.floor(Math.random() * (config.canNangMax - config.canNangMin + 1)) +
        config.canNangMin;
      const bmi = (w / ((h / 100) * (h / 100))).toFixed(1);
      return {
        id: i + 1,
        h,
        w,
        bmi,
        ha: `${config.haCao}/${config.haThap}`,
        mach: config.mach,
        pl: config.phanLoaiKetLuan,
      };
    });
  }, [config]);

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Top Category Sub-Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-white border border-slate-200/90 rounded-2xl shadow-2xs">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setKskCategory('adult')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              kskCategory === 'adult'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Stethoscope className="w-4 h-4" />
            <span>Script từ 18 tuổi trở lên</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                kskCategory === 'adult'
                  ? 'bg-emerald-700 text-white'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              v4.2
            </span>
          </button>

          <button
            onClick={() => setKskCategory('child')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              kskCategory === 'child'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Baby className="w-4 h-4" />
            <span>Script từ 6 đến 18 tuổi</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold ${
                kskCategory === 'child'
                  ? 'bg-amber-700 text-white'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              SẮP RA MẮT
            </span>
          </button>
        </div>

        <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500 font-medium px-2 font-mono">
          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            GET /api/ksk/script
          </span>
          <span>·</span>
          <span>
            Cập nhật JS: <strong className="text-slate-800">{JS_UPDATED_DATE}</strong>
          </span>
        </div>
      </div>

      {/* RENDER CATEGORY 2.1: KHÁM TRẺ EM 6 - 18 TUỔI (SẮP RA MẮT) */}
      {kskCategory === 'child' ? (
        <div className="flex-1 bg-white border border-slate-200/90 rounded-2xl shadow-2xs p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-5 max-w-4xl mx-auto w-full">
            <div className="p-5 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-mono text-amber-800 font-bold">
                <span>SẮP RA MẮT</span>
                <span>·</span>
                <span>Dự kiến: 10/2026</span>
              </div>

              <h2 className="text-base sm:text-lg font-black text-amber-950 tracking-tight flex items-center gap-2">
                <Baby className="w-5 h-5 text-amber-600" />
                Script Khám Sức Khỏe Từ 6 Đến 18 Tuổi
              </h2>

              <p className="text-xs text-amber-900 leading-relaxed">
                Tự động điền Phiếu KSK dưới 18 tuổi theo Thông tư 32/2023/TT-BYT (Khám học đường &
                nhập học).
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <h4 className="font-bold text-slate-900">1. Thị Lực Học Đường</h4>
                <p className="text-[11px] text-slate-500">Khúc xạ 10/10, tầm soát cận/loạn thị.</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <h4 className="font-bold text-slate-900">2. Cột Sống & Thể Lực</h4>
                <p className="text-[11px] text-slate-500">
                  BMI theo tuổi, kiểm tra cong vẹo cột sống.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <h4 className="font-bold text-slate-900">3. Răng Hàm Mặt</h4>
                <p className="text-[11px] text-slate-500">
                  Khám răng học đường & phân loại dinh dưỡng.
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                <h4 className="font-bold text-slate-900">4. Xuất Báo Cáo Excel</h4>
                <p className="text-[11px] text-slate-500">
                  Tự động mở phiếu dưới 18T & xuất Excel 2 sheet.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600">
                Hiện tại vui lòng sử dụng <strong>Script từ 18 tuổi trở lên (v4.2)</strong>.
              </span>
              <button
                onClick={() => setKskCategory('adult')}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-bold cursor-pointer shrink-0 text-xs"
              >
                Mở Script ≥18T →
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* RENDER CATEGORY 2.2: SCRIPT TỪ 18 TUỔI TRỞ LÊN */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 flex-1 min-h-0">
          {/* Left Column */}
          <div className="xl:col-span-5 flex flex-col gap-3">
            {/* Card 1: Hệ Thống API Khám Bệnh (Permission: kskApiSystem) */}
            <div className="bg-white border border-emerald-200/90 rounded-2xl shadow-2xs p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                      canApiSystem
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    {canApiSystem ? <Server className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h3 className="text-xs font-bold text-slate-900">
                        Hệ Thống API Khám Bệnh
                      </h3>
                      {canApiSystem ? (
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                            apiStatus.online
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              apiStatus.online ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          {apiStatus.online ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Đã khóa quyền
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Cung cấp 1 đoạn code gọi GET API lấy JS Khám bệnh
                    </p>
                  </div>
                </div>

                {canApiSystem && (
                  <button
                    onClick={() => verifyAndSyncApi(true)}
                    disabled={apiStatus.checking}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition-all cursor-pointer disabled:opacity-50"
                    title="Kiểm tra kết nối GET API"
                  >
                    <RefreshCw
                      className={`w-3 h-3 ${apiStatus.checking ? 'animate-spin text-emerald-600' : ''}`}
                    />
                    <span>Test API</span>
                  </button>
                )}
              </div>

              {canApiSystem ? (
                <>
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-slate-600 flex items-center gap-1">
                        <Globe className="w-3 h-3 text-emerald-600" /> Endpoint GET JS Khám bệnh:
                      </span>
                      <button
                        onClick={handleCopyApiUrl}
                        className="text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer flex items-center gap-1"
                      >
                        {copiedApiUrl ? (
                          <>
                            <Check className="w-3 h-3" /> Đã chép URL
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" /> Chép URL
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono text-[10px] text-slate-700 bg-white px-2 py-1.5 rounded-lg border border-slate-200 truncate select-all">
                      GET {apiEndpointUrl}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-1.5 rounded-xl bg-emerald-50/60 border border-emerald-100">
                      <span className="text-[9px] text-slate-500 block">Phản hồi API</span>
                      <strong className="text-xs font-mono text-emerald-700">
                        {apiStatus.latencyMs !== null ? `${apiStatus.latencyMs} ms` : '200 OK'}
                      </strong>
                    </div>
                    <div className="p-1.5 rounded-xl bg-blue-50/60 border border-blue-100">
                      <span className="text-[9px] text-slate-500 block">Kích thước JS</span>
                      <strong className="text-xs font-mono text-blue-700">
                        {apiStatus.payloadLength
                          ? `${(apiStatus.payloadLength / 1024).toFixed(1)} KB`
                          : '~18.4 KB'}
                      </strong>
                    </div>
                    <div className="p-1.5 rounded-xl bg-purple-50/60 border border-purple-100">
                      <span className="text-[9px] text-slate-500 block">Chế độ thực thi</span>
                      <strong className="text-[11px] font-mono text-purple-700">Auto-Run</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Tài khoản của bạn chưa được Admin cấp quyền sử dụng <strong>Hệ Thống API Khám Bệnh</strong>.
                  </span>
                </div>
              )}
            </div>

            {/* Card 2: Thông Số Khám Đồng Bộ Vào API (Permission: kskSyncParams) */}
            <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs p-3.5 space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                      canSyncParams
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                        : 'bg-slate-100 text-slate-400 border-slate-200'
                    }`}
                  >
                    {canSyncParams ? (
                      <Stethoscope className="w-4 h-4" />
                    ) : (
                      <Lock className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">
                      Thông Số Khám Đồng Bộ Vào API
                    </h3>
                    <p className="text-[10px] text-slate-500">
                      API tự động trả về JS theo cấu hình đang chọn
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 font-bold">
                  {canSyncParams ? 'TT32' : 'Đã khóa'}
                </span>
              </div>

              {canSyncParams ? (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Chiều cao:
                      </span>
                      <strong className="text-slate-800 text-xs font-mono tabular-nums">
                        {config.chieuCaoMin} - {config.chieuCaoMax} cm
                      </strong>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Cân nặng:
                      </span>
                      <strong className="text-slate-800 text-xs font-mono tabular-nums">
                        {config.canNangMin} - {config.canNangMax} kg
                      </strong>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Huyết áp / Mạch:
                      </span>
                      <strong className="text-slate-800 text-xs font-mono tabular-nums">
                        {config.haCao}/{config.haThap} • {config.mach} bpm
                      </strong>
                    </div>

                    <div className="p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-[10px] text-slate-400 font-semibold block">
                        Phân loại KSK:
                      </span>
                      <strong className="text-emerald-700 text-xs font-bold">
                        {config.phanLoaiKetLuan}
                      </strong>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 text-[11px]">
                        Mô phỏng 5 ca ngẫu nhiên từ API:
                      </span>
                      <span className="text-[9px] text-slate-400 font-mono">Auto BMI</span>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100 text-slate-600 font-semibold">
                          <tr>
                            <th className="py-1 px-2">#</th>
                            <th className="py-1 px-2">Cao</th>
                            <th className="py-1 px-2">Nặng</th>
                            <th className="py-1 px-2">BMI</th>
                            <th className="py-1 px-2">HA</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white font-mono tabular-nums text-slate-700">
                          {sampleCases.map((s) => (
                            <tr key={s.id}>
                              <td className="py-1 px-2 font-bold text-slate-400">#{s.id}</td>
                              <td className="py-1 px-2">{s.h} cm</td>
                              <td className="py-1 px-2">{s.w} kg</td>
                              <td className="py-1 px-2 font-bold text-blue-600">{s.bmi}</td>
                              <td className="py-1 px-2">{s.ha}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Tài khoản của bạn chưa được Admin cấp quyền xem <strong>Thông Số Khám Đồng Bộ Vào API</strong>.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Code Generator (API Loader + Legacy Obfuscated & Raw) */}
          <div className="xl:col-span-7 flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
            <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
                  <Code2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-bold text-slate-900">
                      Script Khám Sức Khỏe ≥18 Tuổi (v4.2)
                    </h3>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold">
                      {getActiveModeTitle()}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Code Gọi API & Giữ nguyên Mã hóa / Mã gốc cũ (xem khi được Admin phân quyền)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  disabled={!hasAnyCodeAccess}
                  className="flex items-center gap-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {copiedScript ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedScript ? 'Đã chép Script!' : 'Sao chép Script'}</span>
                </button>

                <button
                  onClick={handleDownload}
                  disabled={!hasAnyCodeAccess}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                  title="Tải file .js"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* 3 Script Modes Selector: 1. Code Gọi API | 2. Mã hóa (Cũ) | 3. Mã gốc (Cũ) */}
            <div className="p-2.5 bg-slate-50 border-b border-slate-200/80 space-y-2">
              <div className="flex items-center justify-between text-[11px] px-0.5">
                <span className="font-bold text-slate-700">
                  Chọn loại Script Khám bệnh (Code API & Giữ Mã hóa / Mã gốc cũ):
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Phân quyền theo tài khoản
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                {/* 1. Code Gọi API */}
                <button
                  type="button"
                  onClick={() => handleSelectViewMode('api_loader')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-1.5 ${
                    viewMode === 'api_loader' && canApiSystem
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : canApiSystem
                      ? 'bg-white hover:bg-emerald-50/50 text-slate-800 border-emerald-200'
                      : 'bg-slate-100/70 text-slate-400 border-slate-200/80'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold flex items-center gap-1 truncate">
                      {canApiSystem ? (
                        <Server className="w-3 h-3 shrink-0" />
                      ) : (
                        <Lock className="w-3 h-3 shrink-0 text-amber-600" />
                      )}
                      <span className="truncate">1. Code Gọi API</span>
                    </div>
                    <div
                      className={`text-[10px] truncate mt-0.5 ${
                        viewMode === 'api_loader' && canApiSystem
                          ? 'text-emerald-100'
                          : 'text-slate-500'
                      }`}
                    >
                      1 đoạn code GET API chạy JS
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      viewMode === 'api_loader' && canApiSystem
                        ? 'bg-white/20 text-white'
                        : canApiSystem
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {canApiSystem ? 'API' : 'Cần quyền'}
                  </span>
                </button>

                {/* 2. Mã hóa (Cũ) - Chỉ xem được khi Admin phân quyền */}
                <button
                  type="button"
                  onClick={() => handleSelectViewMode('obfuscated')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-1.5 ${
                    viewMode === 'obfuscated' && canViewObfuscated
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : canViewObfuscated
                      ? 'bg-white hover:bg-blue-50/50 text-slate-800 border-blue-200'
                      : 'bg-slate-100/70 text-slate-400 border-slate-200/80'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold flex items-center gap-1 truncate">
                      <Lock
                        className={`w-3 h-3 shrink-0 ${!canViewObfuscated ? 'text-amber-600' : ''}`}
                      />
                      <span className="truncate">2. Mã hóa (Cũ)</span>
                    </div>
                    <div
                      className={`text-[10px] truncate mt-0.5 ${
                        viewMode === 'obfuscated' && canViewObfuscated
                          ? 'text-blue-100'
                          : 'text-slate-500'
                      }`}
                    >
                      Chỉ xem khi Admin phân quyền
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      viewMode === 'obfuscated' && canViewObfuscated
                        ? 'bg-white/20 text-white'
                        : canViewObfuscated
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {canViewObfuscated ? 'Đã duyệt' : 'Cần quyền'}
                  </span>
                </button>

                {/* 3. Mã gốc (Cũ) - Chỉ xem được khi Admin phân quyền */}
                <button
                  type="button"
                  onClick={() => handleSelectViewMode('raw')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-1.5 ${
                    viewMode === 'raw' && canViewRaw
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : canViewRaw
                      ? 'bg-white hover:bg-indigo-50/50 text-slate-800 border-indigo-200'
                      : 'bg-slate-100/70 text-slate-400 border-slate-200/80'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold flex items-center gap-1 truncate">
                      {canViewRaw ? (
                        <Eye className="w-3 h-3 shrink-0" />
                      ) : (
                        <Lock className="w-3 h-3 shrink-0 text-amber-600" />
                      )}
                      <span className="truncate">3. Mã gốc (Cũ)</span>
                    </div>
                    <div
                      className={`text-[10px] truncate mt-0.5 ${
                        viewMode === 'raw' && canViewRaw ? 'text-indigo-100' : 'text-slate-500'
                      }`}
                    >
                      Chỉ xem khi Admin phân quyền
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                      viewMode === 'raw' && canViewRaw
                        ? 'bg-white/20 text-white'
                        : canViewRaw
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {canViewRaw ? 'Đã duyệt' : 'Cần quyền'}
                  </span>
                </button>
              </div>
            </div>

            <div className="px-3 py-1.5 bg-emerald-50/60 border-b border-emerald-100/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-emerald-950 font-medium">
                <Zap className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {viewMode === 'api_loader'
                    ? 'Luồng chạy: Dán vào F12 Console → GET /api/ksk/script → Tải JS KSK v4.2 → Tự động khám'
                    : 'Quy trình: Tiếp nhận → #kham → Phiếu 18T → Tab 1..4 → #luu → Xuất Excel'}
                </span>
              </div>
              <span className="font-mono text-[10px] font-bold text-emerald-700 shrink-0 tabular-nums flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Tối đa: {config.maxCases} ca
              </span>
            </div>

            <div className="flex-1 flex flex-col bg-slate-950 min-h-[360px] max-h-[calc(100vh-385px)] overflow-hidden font-mono text-xs">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 select-none">
                <span className="text-emerald-400">
                  {getActiveModeTitle()} · ({effectiveConfig.presetName})
                </span>
                <span>Console F12</span>
              </div>

              <pre className="flex-1 p-3 text-slate-200 overflow-auto text-[11px] leading-relaxed select-all">
                <code>{finalScriptOutput}</code>
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
