import React, { useState } from 'react';
import {
  Sliders,
  Plus,
  Copy,
  Trash2,
  Check,
  Star,
  Settings,
  Edit3,
  Save,
  RotateCcw,
  Sparkles,
  FileText,
  Activity,
  Layers,
  MapPin,
  Stethoscope,
  UserPlus,
  Users,
  Clock,
  ShieldCheck,
  Lock,
  Baby,
  Calendar,
  ChevronRight,
  AlertCircle,
  Eye
} from 'lucide-react';
import {
  AppConfiguration,
  DEFAULT_RECEPTION_CONFIG,
  DEFAULT_KSK_CONFIG,
  DEFAULT_KSK_CHILD_CONFIG,
  ReceptionConfigData,
  KskConfigData,
  KskChildConfigData,
} from '../firebase';
import { AdminTotpConfig } from '../utils/totp';
import { AdminTotpSetupCard } from './AdminTotpSetupCard';

interface ConfigManagementViewProps {
  configs: AppConfiguration[];
  activeConfigId: string;
  onSelectConfig: (config: AppConfiguration) => void;
  onSaveConfig: (config: AppConfiguration) => Promise<void>;
  onDeleteConfig: (configId: string) => Promise<void>;
  onSetDefaultConfig: (configId: string) => Promise<void>;
  isSuperAdmin?: boolean;
  totpConfig: AdminTotpConfig;
  onSaveTotpConfig: (newTotpConfig: AdminTotpConfig) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
  isLoading: boolean;
}

export const ConfigManagementView: React.FC<ConfigManagementViewProps> = ({
  configs,
  activeConfigId,
  onSelectConfig,
  onSaveConfig,
  onDeleteConfig,
  onSetDefaultConfig,
  isSuperAdmin = false,
  totpConfig,
  onSaveTotpConfig,
  showToast,
  isLoading,
}) => {
  const [editingConfig, setEditingConfig] = useState<AppConfiguration | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [activeEditorTab, setActiveEditorTab] = useState<'reception' | 'ksk_adult' | 'ksk_child'>('reception');
  const [filterType, setFilterType] = useState<'all' | 'reception' | 'ksk'>('all');

  const startCreateNew = () => {
    const newConfig: AppConfiguration = {
      id: `custom_cfg_${Date.now()}`,
      name: 'Cấu hình Y tế & Tiếp nhận Mới',
      description: 'Cấu hình tùy biến Xã/Phường Tiếp nhận BHYT và Thông số Khám bệnh TT32.',
      isDefault: false,
      receptionConfig: { ...DEFAULT_RECEPTION_CONFIG },
      kskConfig: { ...DEFAULT_KSK_CONFIG },
      kskChildConfig: { ...DEFAULT_KSK_CHILD_CONFIG },
      createdBy: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingConfig(newConfig);
    setIsCreatingNew(true);
    setActiveEditorTab('reception');
  };

  const handleDuplicate = (src: AppConfiguration) => {
    const duplicated: AppConfiguration = {
      ...src,
      id: `custom_cfg_${Date.now()}`,
      name: `${src.name} (Bản sao)`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingConfig(duplicated);
    setIsCreatingNew(true);
  };

  const handleSave = async () => {
    if (!editingConfig) return;
    await onSaveConfig(editingConfig);
    setEditingConfig(null);
    setIsCreatingNew(false);
  };

  // Quick Ward Suggestions
  const wardSuggestions = [
    'Phường Hiệp Thành',
    'Phường Chánh Mỹ',
    'Phường Phú Cường',
    'Phường Định Hòa',
    'Phường Phú Lợi',
    'Phường Phú Hòa',
    'Phường Phú Thọ',
    'Phường Tân An',
    'Phường Tương Bình Hiệp',
    'Phường Hiệp An',
    'Phường Chánh Nghĩa',
    'Xã An Tây',
    'Xã An Điền',
    'Xã Phú An',
  ];

  return (
    <div className="space-y-4 max-w-full">
      {/* Top Banner / Actions */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">Quản Lý Đa Cấu Hình</h2>
                <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                  SUPER ADMIN
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                <strong>1. Tiếp nhận BHYT (Xã/Phường)</strong> · <strong>2. Khám bệnh (Script ≥18T & 6-18T)</strong>
              </p>
            </div>
          </div>

          <button
            onClick={startCreateNew}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer shrink-0 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo cấu hình mới</span>
          </button>
        </div>
      </div>

      {/* Admin 2FA Authenticator Setup Card (Only visible to Super Admin, hidden from guests/users) */}
      {isSuperAdmin && (
        <AdminTotpSetupCard
          totpConfig={totpConfig}
          onSaveTotpConfig={onSaveTotpConfig}
          showToast={showToast}
        />
      )}

      {/* Configuration Editor Modal/Card */}
      {editingConfig && (
        <div className="bg-white border-2 border-purple-400 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
                <Edit3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">
                  {isCreatingNew ? 'Thêm Cấu Hình Hệ Thống Mới' : `Chỉnh Sửa: ${editingConfig.name}`}
                </h3>
                <p className="text-[10px] text-slate-500">Thiết lập tham số chi tiết cho Tiếp nhận và Khám bệnh</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingConfig(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isLoading ? 'Đang lưu...' : 'Lưu Thay Đổi'}</span>
              </button>
            </div>
          </div>

          {/* General Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 p-3 bg-slate-50/70 rounded-xl border border-slate-200/80">
            <div className="md:col-span-6 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">Tên hiển thị cấu hình *</label>
              <input
                type="text"
                value={editingConfig.name}
                onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="VD: Khám sức khỏe toàn dân - Phường Hiệp Thành..."
              />
            </div>
            <div className="md:col-span-6 space-y-1">
              <label className="text-[11px] font-bold text-slate-700 block">Mô tả / Ghi chú mục đích</label>
              <input
                type="text"
                value={editingConfig.description}
                onChange={(e) => setEditingConfig({ ...editingConfig, description: e.target.value })}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
                placeholder="Ghi chú đối tượng áp dụng..."
              />
            </div>
          </div>

          {/* Editor Category Tabs (1. Tiếp Nhận | 2.1 Khám 6-18T | 2.2 Khám ≥18T) */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
            <button
              onClick={() => setActiveEditorTab('reception')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeEditorTab === 'reception'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>1. Cấu hình Tiếp nhận</span>
            </button>

            <button
              onClick={() => setActiveEditorTab('ksk_adult')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeEditorTab === 'ksk_adult'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span>2.2 Script từ 18 tuổi trở lên</span>
            </button>

            <button
              onClick={() => setActiveEditorTab('ksk_child')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeEditorTab === 'ksk_child'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              <Baby className="w-3.5 h-3.5" />
              <span>2.1 Script từ 6 đến 18 tuổi</span>
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-mono font-bold">
                SOON
              </span>
            </button>
          </div>

          {/* TAB 1: CẤU HÌNH TIẾP NHẬN BỆNH NHÂN */}
          {activeEditorTab === 'reception' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              {/* Highlighted Ward/Commune Setting */}
              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-blue-700" />
                    <label className="text-xs font-bold text-blue-950">
                      Tùy chỉnh Tên Xã / Phường tại mục Địa chỉ (CV30) *
                    </label>
                  </div>
                  <span className="text-[10px] font-mono text-blue-700 font-semibold">Thẻ chọn #maxa_cu_tru</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={editingConfig.receptionConfig.targetWardText}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          targetWardText: e.target.value,
                        },
                      })
                    }
                    className="sm:col-span-8 px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="VD: Phường Hiệp Thành, Phường Chánh Mỹ..."
                  />

                  <div className="sm:col-span-4 flex items-center text-[11px] text-slate-600 bg-white/80 px-2.5 py-1.5 rounded-lg border border-blue-100">
                    <span>Động cơ sẽ tự động chọn đúng Option này và đồng bộ Select2.</span>
                  </div>
                </div>

                {/* Quick Ward Suggestion Pills */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500 font-medium">Gợi ý nhanh:</span>
                  {wardSuggestions.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() =>
                        setEditingConfig({
                          ...editingConfig,
                          receptionConfig: {
                            ...editingConfig.receptionConfig,
                            targetWardText: w,
                          },
                        })
                      }
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all cursor-pointer ${
                        editingConfig.receptionConfig.targetWardText === w
                          ? 'bg-blue-600 text-white font-bold'
                          : 'bg-white hover:bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Other Reception Settings */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Mã ICD-10 Mặc định</label>
                  <input
                    type="text"
                    value={editingConfig.receptionConfig.defaultIcd}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          defaultIcd: e.target.value,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Lý do vào viện</label>
                  <input
                    type="text"
                    value={editingConfig.receptionConfig.defaultReason}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          defaultReason: e.target.value,
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Độ dài CCCD chuẩn</label>
                  <input
                    type="number"
                    value={editingConfig.receptionConfig.validCccdLength}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          validCccdLength: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Số lần Enter thử BHYT</label>
                  <input
                    type="number"
                    value={editingConfig.receptionConfig.maxBhytRetries}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          maxBhytRetries: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              {/* Timing & Delays */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50/50 rounded-xl border border-slate-200 text-xs">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-600 block">Thời gian chờ BHYT (ms)</label>
                  <input
                    type="number"
                    value={editingConfig.receptionConfig.retryInterval}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          retryInterval: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-600 block">Nghỉ giữa 2 ca tiếp nhận (ms)</label>
                  <input
                    type="number"
                    value={editingConfig.receptionConfig.pauseBetweenCases}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          pauseBetweenCases: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-slate-600 block">Thời gian lắng nghe Pop-up (ms)</label>
                  <input
                    type="number"
                    value={editingConfig.receptionConfig.waitPopupAfterSave}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        receptionConfig: {
                          ...editingConfig.receptionConfig,
                          waitPopupAfterSave: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2.2: CẤU HÌNH KHÁM BỆNH NGƯỜI LỚN (≥ 18 TUỔI) */}
          {activeEditorTab === 'ksk_adult' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-950 font-bold">
                    Cấu hình áp dụng cho Phiếu Khám Sức Khỏe Đối Tượng Đủ 18 Tuổi (Thông tư 32/2023/TT-BYT)
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px] font-bold font-mono">
                  ACTIVE v4.2
                </span>
              </div>

              {/* Physical Stats Ranges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Chiều cao Min (cm)</label>
                  <input
                    type="number"
                    value={editingConfig.kskConfig.chieuCaoMin}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, chieuCaoMin: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Chiều cao Max (cm)</label>
                  <input
                    type="number"
                    value={editingConfig.kskConfig.chieuCaoMax}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, chieuCaoMax: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Cân nặng Min (kg)</label>
                  <input
                    type="number"
                    value={editingConfig.kskConfig.canNangMin}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, canNangMin: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Cân nặng Max (kg)</label>
                  <input
                    type="number"
                    value={editingConfig.kskConfig.canNangMax}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, canNangMax: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>
              </div>

              {/* Vitals & Classification */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Huyết áp cao (Tâm thu)</label>
                  <input
                    type="text"
                    value={editingConfig.kskConfig.haCao}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, haCao: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Huyết áp thấp (Tâm trương)</label>
                  <input
                    type="text"
                    value={editingConfig.kskConfig.haThap}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, haThap: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Tần số Mạch (lần/phút)</label>
                  <input
                    type="text"
                    value={editingConfig.kskConfig.mach}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, mach: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Phân loại KSK chung</label>
                  <select
                    value={editingConfig.kskConfig.phanLoaiKetLuan}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, phanLoaiKetLuan: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-emerald-700"
                  >
                    <option value="Loại I">Loại I (Rất khỏe)</option>
                    <option value="Loại II">Loại II (Khỏe)</option>
                    <option value="Loại III">Loại III (Trung bình)</option>
                    <option value="Loại IV">Loại IV (Yếu)</option>
                    <option value="Loại V">Loại V (Rất yếu)</option>
                  </select>
                </div>
              </div>

              {/* Text Conclusions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Khám lâm sàng các chuyên khoa</label>
                  <input
                    type="text"
                    value={editingConfig.kskConfig.lamSang}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, lamSang: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                    placeholder="Bình thường / Chưa phát hiện bệnh..."
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Số ca tối đa trong 1 phiên</label>
                  <input
                    type="number"
                    value={editingConfig.kskConfig.maxCases}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, maxCases: Number(e.target.value) },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                  />
                </div>

                <div className="sm:col-span-2 space-y-1">
                  <label className="text-[11px] font-semibold text-slate-700 block">Kết luận tình trạng sức khỏe</label>
                  <textarea
                    rows={2}
                    value={editingConfig.kskConfig.ketLuanTinhTrang}
                    onChange={(e) =>
                      setEditingConfig({
                        ...editingConfig,
                        kskConfig: { ...editingConfig.kskConfig, ketLuanTinhTrang: e.target.value },
                      })
                    }
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2.1: CẤU HÌNH KHÁM BỆNH TRẺ EM & HỌC SINH (6 - 18 TUỔI) - COMING SOON */}
          {activeEditorTab === 'ksk_child' && (
            <div className="space-y-4 animate-in fade-in duration-100">
              <div className="p-4 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                    <Baby className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-xs font-bold text-amber-950">
                        Phân Hệ Khám Sức Khỏe Học Sinh / Trẻ Em (6 - 18 Tuổi)
                      </h4>
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-white font-mono text-[9px] font-bold">
                        SẮP RA MẮT
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900 mt-0.5">
                      Theo Thông tư 32/2023/TT-BYT đối tượng học sinh & người chưa đủ 18 tuổi.
                    </p>
                  </div>
                </div>

                <span className="text-[11px] font-semibold text-amber-800 bg-white/80 px-3 py-1.5 rounded-xl border border-amber-200 shrink-0">
                  Lộ trình: Tháng 10/2026
                </span>
              </div>

              {/* Child Health Specifications Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">
                    Thị Lực Học Đường
                  </span>
                  <p className="text-xs font-bold text-slate-800">Khám khúc xạ Mắt Phải (10/10) • Mắt Trái (10/10)</p>
                  <span className="text-[10px] text-slate-400">Tự động phát hiện tật khúc xạ học đường</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">
                    Cột Sống & Thể Lực
                  </span>
                  <p className="text-xs font-bold text-slate-800">Không gù vẹo • Chiều cao 120-165 cm</p>
                  <span className="text-[10px] text-slate-400">Đánh giá BMI theo biểu đồ tuổi nhi khoa</span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">
                    Răng Hàm Mặt & Dinh Dưỡng
                  </span>
                  <p className="text-xs font-bold text-slate-800">Răng bình thường • Thể lực đạt chuẩn</p>
                  <span className="text-[10px] text-slate-400">Kết luận đủ sức khỏe học tập</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-amber-50/50 border border-amber-200 text-xs text-amber-900 leading-relaxed">
                ℹ️ <strong>Lưu ý:</strong> Khi phân hệ này chính thức phát hành, kịch bản tự động sẽ tự động nhận diện và mở <strong>Phiếu KSK Học Sinh / Người Dưới 18 Tuổi</strong> trên hệ thống HIS. Các thông số trên đã sẵn sàng để tích hợp vào cơ sở dữ liệu.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preset List Grid */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" />
            <h3 className="text-xs font-bold text-slate-900">Danh Sách Cấu Hình Đang Lưu Trữ ({configs.length})</h3>
          </div>

          {/* Quick Filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer text-[11px] ${
                filterType === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tất cả ({configs.length})
            </button>
            <button
              onClick={() => setFilterType('reception')}
              className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer text-[11px] ${
                filterType === 'reception' ? 'bg-white text-blue-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1. Tiếp Nhận (Xã/Phường)
            </button>
            <button
              onClick={() => setFilterType('ksk')}
              className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer text-[11px] ${
                filterType === 'ksk' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              2. Khám KSK (≥18T & 6-18T)
            </button>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {configs.map((cfg) => {
            const isActive = cfg.id === activeConfigId;
            return (
              <div
                key={cfg.id}
                className={`p-3.5 rounded-xl border transition-all space-y-3 flex flex-col justify-between ${
                  isActive
                    ? 'border-purple-500 bg-purple-50/20 ring-1 ring-purple-400/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                {/* Header */}
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-slate-900">{cfg.name}</span>
                      {cfg.isDefault && (
                        <span className="px-1.5 py-0.2 bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold rounded flex items-center gap-0.5">
                          <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" /> Mặc định
                        </span>
                      )}
                      {isActive && (
                        <span className="px-1.5 py-0.2 bg-purple-600 text-white text-[9px] font-bold rounded font-mono">
                          ĐANG CHẠY
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingConfig(cfg);
                          setIsCreatingNew(false);
                          setActiveEditorTab('reception');
                        }}
                        title="Chỉnh sửa cấu hình"
                        className="p-1 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDuplicate(cfg)}
                        title="Nhân bản cấu hình"
                        className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      {!cfg.isDefault && configs.length > 1 && (
                        <button
                          onClick={() => onDeleteConfig(cfg.id)}
                          title="Xóa cấu hình"
                          className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                    {cfg.description || 'Chưa có mô tả chi tiết.'}
                  </p>
                </div>

                {/* Specs Badges for 2 Types */}
                <div className="space-y-1.5 pt-1 border-t border-slate-100 text-xs">
                  {/* Type 1: Reception */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-blue-50/50 border border-blue-100/70 text-[11px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="text-slate-600">1. Tiếp nhận (CV30):</span>
                      <strong className="text-blue-950 font-bold truncate">
                        "{cfg.receptionConfig.targetWardText}"
                      </strong>
                    </div>
                    <span className="font-mono text-[10px] text-blue-700 shrink-0 ml-1">
                      ICD: {cfg.receptionConfig.defaultIcd}
                    </span>
                  </div>

                  {/* Type 2: Clinical KSK */}
                  <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/50 border border-emerald-100/70 text-[11px]">
                    <div className="flex items-center gap-1.5 truncate">
                      <Stethoscope className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-slate-600">2. Khám ≥18T:</span>
                      <strong className="text-emerald-950 font-bold truncate">
                        {cfg.kskConfig.chieuCaoMin}-{cfg.kskConfig.chieuCaoMax}cm • {cfg.kskConfig.canNangMin}-{cfg.kskConfig.canNangMax}kg
                      </strong>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-700 shrink-0 ml-1">
                      {cfg.kskConfig.phanLoaiKetLuan}
                    </span>
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  {!cfg.isDefault && (
                    <button
                      onClick={() => onSetDefaultConfig(cfg.id)}
                      className="text-[10px] text-slate-500 hover:text-amber-600 font-semibold cursor-pointer flex items-center gap-1"
                    >
                      <Star className="w-3 h-3" /> Đặt làm mặc định
                    </button>
                  )}
                  {cfg.isDefault && <div />}

                  <button
                    onClick={() => onSelectConfig(cfg)}
                    disabled={isActive}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-purple-100 text-purple-800 cursor-default font-mono'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                    }`}
                  >
                    {isActive ? '✓ Đang áp dụng' : 'Áp dụng cấu hình'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
