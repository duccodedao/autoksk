import React, { useState } from 'react';
import {
  Search,
  CheckCircle2,
  XCircle,
  Shield,
  Clock,
  UserCheck,
  UserX,
  RefreshCw,
  Sliders,
  Lock,
  Unlock,
  MapPin,
  FileSpreadsheet,
  Code2,
  Server,
  Layers,
  X,
  Check,
  Eye,
} from 'lucide-react';
import {
  UserProfile,
  UserRole,
  UserPermissions,
  ADMIN_EMAIL,
  getEffectivePermissions,
  FULL_USER_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
} from '../firebase';

interface UserManagementViewProps {
  users: UserProfile[];
  currentAdminEmail: string;
  onApproveUser: (userId: string) => Promise<void>;
  onRejectUser: (userId: string) => Promise<void>;
  onChangeRole: (userId: string, newRole: UserRole) => Promise<void>;
  onToggleRawCodePermission: (user: UserProfile) => Promise<void>;
  onUpdateUserPermissions: (userId: string, permissions: UserPermissions) => Promise<void>;
  onRefreshUsers: () => Promise<void>;
  isLoading: boolean;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  currentAdminEmail,
  onApproveUser,
  onRejectUser,
  onChangeRole,
  onUpdateUserPermissions,
  onRefreshUsers,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Selected user for Granular Permission Modal
  const [editingPermUser, setEditingPermUser] = useState<UserProfile | null>(null);
  const [draftPerms, setDraftPerms] = useState<UserPermissions>(DEFAULT_USER_PERMISSIONS);
  const [savingPerms, setSavingPerms] = useState(false);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const pendingCount = users.filter((u) => u.status === 'pending').length;
  const approvedCount = users.filter((u) => u.status === 'approved').length;
  const rejectedCount = users.filter((u) => u.status === 'rejected').length;

  const handleApprove = async (userId: string) => {
    try {
      setActionLoadingId(userId);
      await onApproveUser(userId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleReject = async (userId: string) => {
    try {
      setActionLoadingId(userId);
      await onRejectUser(userId);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRoleSelect = async (userId: string, role: UserRole) => {
    try {
      setActionLoadingId(userId);
      await onChangeRole(userId, role);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickToggleWardLock = async (user: UserProfile) => {
    const currentPerms = getEffectivePermissions(user);
    const updatedPerms: UserPermissions = {
      ...currentPerms,
      canChangeWard: !currentPerms.canChangeWard,
    };
    try {
      setActionLoadingId(user.uid);
      await onUpdateUserPermissions(user.uid, updatedPerms);
    } finally {
      setActionLoadingId(null);
    }
  };

  const openPermissionsModal = (user: UserProfile) => {
    setEditingPermUser(user);
    setDraftPerms(getEffectivePermissions(user));
  };

  const toggleDraftPerm = (key: keyof UserPermissions) => {
    setDraftPerms((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleSavePermissionsModal = async () => {
    if (!editingPermUser) return;
    setSavingPerms(true);
    try {
      await onUpdateUserPermissions(editingPermUser.uid, draftPerms);
      setEditingPermUser(null);
    } finally {
      setSavingPerms(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Granular Permission Configuration Modal */}
      {editingPermUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 my-auto">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center border border-white/25 shrink-0">
                  <Sliders className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold leading-tight">
                    Phân Quyền Chi Tiết: {editingPermUser.displayName || editingPermUser.email}
                  </h3>
                  <p className="text-[11px] text-indigo-100 font-mono mt-0.5">
                    {editingPermUser.email} · Vai trò: {editingPermUser.role.toUpperCase()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setEditingPermUser(null)}
                className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Presets Bar */}
            <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-600">Thiết lập nhanh:</span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDraftPerms({ ...FULL_USER_PERMISSIONS })}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  ✓ Cấp Full Tất Cả Quyền
                </button>
                <button
                  type="button"
                  onClick={() => setDraftPerms({ ...DEFAULT_USER_PERMISSIONS })}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-[11px] font-semibold cursor-pointer"
                >
                  Mặc định Nhân viên
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraftPerms((prev) => ({
                      ...prev,
                      receptionTab2_Raw: true,
                      receptionTab4_WardRaw: true,
                      kskViewObfuscated: true,
                      kskViewRaw: true,
                    }))
                  }
                  className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold cursor-pointer"
                >
                  + Mở khóa Mã gốc & Mã KSK cũ
                </button>
              </div>
            </div>

            {/* Modal Body: 6 Permission Groups */}
            <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto text-xs">
              {/* Group 1: Truy cập Tab */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-slate-900 border-b border-slate-200/80 pb-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>1. Phân Quyền Truy Cập Tab</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-blue-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.tabReception}
                      onChange={() => toggleDraftPerm('tabReception')}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Tab 1: Tiếp Nhận BHYT (v3.8)</div>
                      <div className="text-[10px] text-slate-500">Truy cập màn hình Tiếp nhận BHYT</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-blue-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.tabKsk}
                      onChange={() => toggleDraftPerm('tabKsk')}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Tab 2: Khám Sức Khỏe (TT32)</div>
                      <div className="text-[10px] text-slate-500">Truy cập màn hình Khám bệnh KSK</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-purple-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.tabConfigs}
                      onChange={() => toggleDraftPerm('tabConfigs')}
                      className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Tab 3: Đa Cấu Hình</div>
                      <div className="text-[10px] text-slate-500">Quản lý cấu hình Tiếp nhận & Khám bệnh</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-indigo-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.tabUsers}
                      onChange={() => toggleDraftPerm('tabUsers')}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Tab 4: Duyệt & Phân Quyền User</div>
                      <div className="text-[10px] text-slate-500">Quản lý phê duyệt và phân quyền</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Group 2: Danh Sách Bệnh Nhân Tiếp Nhận: Nhập/Xuất Excel */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-slate-900 border-b border-slate-200/80 pb-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>2. Danh Sách Bệnh Nhân Tiếp Nhận: Nhập / Xuất Excel</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.receptionImportExcel}
                      onChange={() => toggleDraftPerm('receptionImportExcel')}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Nhập Excel & Chỉnh sửa danh sách</div>
                      <div className="text-[10px] text-slate-500">
                        Cho phép Nạp file Excel, thêm dòng, sửa & xóa bệnh nhân
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.receptionExportExcel}
                      onChange={() => toggleDraftPerm('receptionExportExcel')}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Xuất Excel & Tải file Mẫu Excel</div>
                      <div className="text-[10px] text-slate-500">
                        Cho phép Xuất danh sách bệnh nhân ra Excel & tải Mẫu Excel
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Group 3: Script Tiếp nhận BHYT (v3.8): Phân quyền 4 tab */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-slate-900 border-b border-slate-200/80 pb-2">
                  <Code2 className="w-4 h-4 text-blue-600" />
                  <span>3. Script Tiếp Nhận BHYT (v3.8): Phân Quyền 4 Tab Mã</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-blue-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.receptionTab1_Obfuscated}
                      onChange={() => toggleDraftPerm('receptionTab1_Obfuscated')}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">1. Mã hóa (Mặc định Hiệp Thành)</div>
                      <div className="text-[10px] text-slate-500">Xem & chép bản mã hóa mặc định</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-indigo-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.receptionTab2_Raw}
                      onChange={() => toggleDraftPerm('receptionTab2_Raw')}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">2. Mã gốc (Mặc định Hiệp Thành)</div>
                      <div className="text-[10px] text-slate-500">Chỉ được Admin duyệt xem mã gốc</div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.receptionTab3_WardObfuscated}
                      onChange={() => toggleDraftPerm('receptionTab3_WardObfuscated')}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">3. Mã hóa (Đã thay đổi xã/phường)</div>
                      <div className="text-[10px] text-slate-500">
                        Xem & chép bản mã hóa theo xã/phường đã setup
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-purple-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.receptionTab4_WardRaw}
                      onChange={() => toggleDraftPerm('receptionTab4_WardRaw')}
                      className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">4. Mã theo xã/phường (Mã gốc)</div>
                      <div className="text-[10px] text-slate-500">
                        Mã gốc đã đổi xã/phường (Chỉ Admin duyệt xem)
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Group 4: Thay đổi Xã/Phường */}
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2.5">
                <div className="flex items-center justify-between border-b border-amber-200/70 pb-2">
                  <div className="flex items-center gap-2 font-bold text-amber-950">
                    <MapPin className="w-4 h-4 text-amber-600" />
                    <span>4. Quyền Thay Đổi Xã / Phường</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold text-amber-800">
                    {editingPermUser.wardName
                      ? `Đã setup 1 lần: ${editingPermUser.wardName}, ${editingPermUser.provinceName}`
                      : 'Chưa setup lần đầu'}
                  </span>
                </div>

                <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-amber-200 cursor-pointer hover:border-amber-400">
                  <input
                    type="checkbox"
                    checked={draftPerms.canChangeWard}
                    onChange={() => toggleDraftPerm('canChangeWard')}
                    className="w-4 h-4 accent-amber-600 rounded cursor-pointer"
                  />
                  <div>
                    <div className="font-bold text-slate-900">
                      Cho phép thay đổi lại Xã/Phường (Mở khóa sau lần setup đầu tiên)
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Mặc định user chỉ setup được 1 lần duy nhất rồi tự động vô hiệu hóa. Bật quyền
                      này để cho phép user thay đổi sang Xã/Phường khác.
                    </div>
                  </div>
                </label>
              </div>

              {/* Group 5: Hệ Thống API Khám Bệnh & Thông Số Khám Đồng Bộ Vào API */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-slate-900 border-b border-slate-200/80 pb-2">
                  <Server className="w-4 h-4 text-emerald-600" />
                  <span>5. Hệ Thống API Khám Bệnh & Thông Số Khám Đồng Bộ Vào API</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.kskApiSystem}
                      onChange={() => toggleDraftPerm('kskApiSystem')}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Hệ Thống API Khám Bệnh</div>
                      <div className="text-[10px] text-slate-500">
                        Xem trạng thái API, Endpoint URL & sử dụng 1 đoạn Code Gọi API
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.kskSyncParams}
                      onChange={() => toggleDraftPerm('kskSyncParams')}
                      className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">Thông Số Khám Đồng Bộ Vào API</div>
                      <div className="text-[10px] text-slate-500">
                        Xem chi tiết thông số sinh hiệu & bảng mô phỏng 5 ca ngẫu nhiên
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Group 6: Giữ Mã hóa, và Mã gốc Khám bệnh cũ */}
              <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/30 space-y-2.5">
                <div className="flex items-center gap-2 font-bold text-indigo-950 border-b border-indigo-200/70 pb-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <span>
                    6. Giữ Mã Hóa & Mã Gốc Khám Bệnh Cũ (User chỉ xem được khi Admin phân quyền)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-indigo-200 cursor-pointer hover:border-indigo-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.kskViewObfuscated}
                      onChange={() => toggleDraftPerm('kskViewObfuscated')}
                      className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">2. Mã hóa Khám bệnh (Cũ)</div>
                      <div className="text-[10px] text-slate-500">
                        Cho phép xem & sao chép toàn bộ Script KSK v4.2 bản Mã hóa cũ
                      </div>
                    </div>
                  </label>

                  <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white border border-indigo-200 cursor-pointer hover:border-indigo-400">
                    <input
                      type="checkbox"
                      checked={draftPerms.kskViewRaw}
                      onChange={() => toggleDraftPerm('kskViewRaw')}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                    <div>
                      <div className="font-bold text-slate-800">3. Mã gốc Khám bệnh (Cũ)</div>
                      <div className="text-[10px] text-slate-500">
                        Cho phép xem & sao chép toàn bộ Script KSK v4.2 bản Mã gốc cũ
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setEditingPermUser(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              >
                Đóng
              </button>

              <button
                type="button"
                onClick={handleSavePermissionsModal}
                disabled={savingPerms}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{savingPerms ? 'Đang lưu phân quyền...' : 'Lưu Phân Quyền Tài Khoản'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Banner & Stats */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-200">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Hệ Thống Phân Quyền Chi Tiết & Duyệt Người Dùng
                </h2>
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500 text-white">
                    {pendingCount} chờ duyệt
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Phân quyền: Truy cập Tab · Nhập/Xuất Excel · 4 Tab Tiếp nhận · Đổi Xã/Phường (khóa sau 1 lần) · API KSK & Mã hóa/Mã gốc cũ
              </p>
            </div>
          </div>

          <button
            onClick={onRefreshUsers}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50 self-start md:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-blue-50/80 border-blue-400'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="text-[11px] font-semibold text-slate-500 block">Tất cả</span>
            <span className="text-base font-black text-slate-900 tabular-nums">{users.length}</span>
          </button>

          <button
            onClick={() => setStatusFilter('pending')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'pending'
                ? 'bg-amber-50/80 border-amber-400'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="text-[11px] font-semibold text-amber-700 block">Chờ duyệt</span>
            <span className="text-base font-black text-amber-900 tabular-nums">{pendingCount}</span>
          </button>

          <button
            onClick={() => setStatusFilter('approved')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'approved'
                ? 'bg-emerald-50/80 border-emerald-400'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="text-[11px] font-semibold text-emerald-700 block">Đã duyệt</span>
            <span className="text-base font-black text-emerald-900 tabular-nums">{approvedCount}</span>
          </button>

          <button
            onClick={() => setStatusFilter('rejected')}
            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
              statusFilter === 'rejected'
                ? 'bg-rose-50/80 border-rose-400'
                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <span className="text-[11px] font-semibold text-rose-700 block">Đã khóa</span>
            <span className="text-base font-black text-rose-900 tabular-nums">{rejectedCount}</span>
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Tìm email hoặc tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="text-xs text-slate-500 tabular-nums">
            Hiển thị <strong className="text-slate-800">{filteredUsers.length}</strong> / {users.length} tài khoản
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                <th className="py-2.5 px-3">Người dùng</th>
                <th className="py-2.5 px-3">Xã/Phường & Khóa Đổi</th>
                <th className="py-2.5 px-3">Vai trò</th>
                <th className="py-2.5 px-3">Trạng thái</th>
                <th className="py-2.5 px-3">Tóm tắt Phân Quyền</th>
                <th className="py-2.5 px-3 text-center">Cấu hình Quyền</th>
                <th className="py-2.5 px-3 text-right">Duyệt / Khóa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Không tìm thấy tài khoản nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const isRootOwner = u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
                  const isCurrent = u.email.toLowerCase() === currentAdminEmail.toLowerCase();
                  const isActionLoading = actionLoadingId === u.uid;
                  const effectiveRole: UserRole = isRootOwner ? 'super_admin' : u.role;
                  const uPerms = getEffectivePermissions(u);
                  const hasSetupWardOnce = Boolean(u.wardCode && u.provinceCode);

                  const receptionTabsCount = [
                    uPerms.receptionTab1_Obfuscated,
                    uPerms.receptionTab2_Raw,
                    uPerms.receptionTab3_WardObfuscated,
                    uPerms.receptionTab4_WardRaw,
                  ].filter(Boolean).length;

                  return (
                    <tr key={u.uid} className="hover:bg-slate-50/70 transition-colors">
                      {/* User Info */}
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {u.photoURL ? (
                            <img
                              src={u.photoURL}
                              alt={u.displayName}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-lg border border-slate-200 object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                              {u.displayName ? u.displayName[0].toUpperCase() : 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">
                              {u.displayName || 'Chưa cập nhật'}
                            </div>
                            <div className="font-mono text-[10px] text-slate-500 truncate">
                              {u.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Ward Setup & 1-Time Lock Toggle */}
                      <td className="py-2.5 px-3 text-xs">
                        <div className="space-y-1">
                          {hasSetupWardOnce ? (
                            <div className="font-bold text-slate-900">
                              {u.wardName}{' '}
                              <span className="font-normal text-slate-500">({u.provinceName})</span>
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400">
                              Chưa setup lần đầu (Được setup 1 lần)
                            </div>
                          )}

                          {effectiveRole !== 'super_admin' && hasSetupWardOnce && (
                            <button
                              type="button"
                              onClick={() => handleQuickToggleWardLock(u)}
                              disabled={isActionLoading}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                uPerms.canChangeWard
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              }`}
                              title="Bấm để Mở khóa hoặc Khóa quyền thay đổi lại Xã/Phường"
                            >
                              {uPerms.canChangeWard ? (
                                <>
                                  <Unlock className="w-2.5 h-2.5" /> Đang mở cho đổi Xã/Phường
                                </>
                              ) : (
                                <>
                                  <Lock className="w-2.5 h-2.5" /> Đã khóa sau 1 lần (Bấm mở)
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Role Selector */}
                      <td className="py-2.5 px-3">
                        {isRootOwner ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-purple-800 font-mono">
                            <Shield className="w-3 h-3 text-purple-600" /> Super Admin (Gốc)
                          </span>
                        ) : (
                          <select
                            value={effectiveRole}
                            disabled={isActionLoading || isCurrent}
                            onChange={(e) => handleRoleSelect(u.uid, e.target.value as UserRole)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer focus:outline-none ${
                              effectiveRole === 'super_admin'
                                ? 'bg-purple-50 text-purple-800 border-purple-200'
                                : effectiveRole === 'admin'
                                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            <option value="super_admin">Super Admin (Toàn quyền)</option>
                            <option value="admin">Admin (Lâm Sàng)</option>
                            <option value="user">User (Nhân viên)</option>
                          </select>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3">
                        {u.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Đã duyệt
                          </span>
                        )}
                        {u.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                            <Clock className="w-3.5 h-3.5" /> Chờ duyệt
                          </span>
                        )}
                        {u.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700">
                            <XCircle className="w-3.5 h-3.5" /> Đã khóa
                          </span>
                        )}
                      </td>

                      {/* Permission Summary Badges */}
                      <td className="py-2.5 px-3">
                        {effectiveRole === 'super_admin' ? (
                          <span className="text-[10px] font-bold text-purple-700 font-mono bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            Toàn quyền hệ thống (Full)
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono">
                              Tiếp nhận: {receptionTabsCount}/4 mã
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono">
                              Excel:{' '}
                              {uPerms.receptionImportExcel && uPerms.receptionExportExcel
                                ? 'Nhập/Xuất'
                                : uPerms.receptionImportExcel
                                ? 'Chỉ Nhập'
                                : uPerms.receptionExportExcel
                                ? 'Chỉ Xuất'
                                : 'Khóa'}
                            </span>
                            {(uPerms.kskViewObfuscated || uPerms.kskViewRaw) && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono">
                                Mã KSK cũ: Mở
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Granular Permission Button */}
                      <td className="py-2.5 px-3 text-center">
                        {effectiveRole === 'super_admin' ? (
                          <span className="text-[10px] font-mono text-slate-400">Mặc định</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openPermissionsModal(u)}
                            disabled={isActionLoading}
                            className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Phân quyền</span>
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        {isRootOwner ? (
                          <span className="text-[10px] font-mono text-slate-400">Owner</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {u.status !== 'approved' && (
                              <button
                                onClick={() => handleApprove(u.uid)}
                                disabled={isActionLoading}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Duyệt
                              </button>
                            )}

                            {u.status !== 'rejected' && (
                              <button
                                onClick={() => handleReject(u.uid)}
                                disabled={isActionLoading}
                                className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              >
                                <UserX className="w-3 h-3" /> {u.status === 'approved' ? 'Khóa' : 'Từ chối'}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
