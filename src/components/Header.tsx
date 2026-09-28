import React from 'react';
import { Menu, Layers, Calendar, MapPin, Lock } from 'lucide-react';
import { ActiveTabType } from './Sidebar';
import { AppConfiguration, UserProfile, JS_UPDATED_DATE, canUserSetupOrChangeWard } from '../firebase';

interface HeaderProps {
  activeTab: ActiveTabType;
  activeConfig: AppConfiguration;
  currentUser: UserProfile;
  onOpenMobileSidebar: () => void;
  onOpenLocationSetup: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  activeConfig,
  currentUser,
  onOpenMobileSidebar,
  onOpenLocationSetup,
}) => {
  const getTabDetails = () => {
    switch (activeTab) {
      case 'reception':
        return {
          title: 'Tiếp Nhận BHYT',
          sub: 'Nạp Excel, tra BHYT 3x & tự động điền Xã/Phường CV30',
        };
      case 'ksk':
        return {
          title: 'Khám Sức Khỏe TT32',
          sub: 'Script từ 18 tuổi trở lên & Script từ 6 đến 18 tuổi',
        };
      case 'configs':
        return {
          title: 'Đa Cấu Hình',
          sub: 'Cấu hình Tiếp nhận & Khám bệnh',
        };
      case 'users':
        return {
          title: 'Duyệt Người Dùng',
          sub: 'Quản lý vai trò Super Admin, Admin, User & Quyền mã gốc',
        };
      default:
        return {
          title: 'HIS Automation',
          sub: 'Hệ thống tự động hóa HIS',
        };
    }
  };

  const details = getTabDetails();
  const hasWard = Boolean(currentUser.wardName && currentUser.provinceName);
  const canEditWard = canUserSetupOrChangeWard(currentUser);

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-3 sm:px-4 py-2 flex items-center justify-between shadow-2xs h-12">
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          onClick={onOpenMobileSidebar}
          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg lg:hidden cursor-pointer shrink-0"
          aria-label="Mở menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold text-slate-900 tracking-tight truncate">{details.title}</h2>
          <span className="text-slate-300 hidden md:inline">·</span>
          <p className="text-xs text-slate-500 hidden md:block truncate">{details.sub}</p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0 text-xs">
        <button
          type="button"
          onClick={onOpenLocationSetup}
          title={
            !canEditWard
              ? 'Đã khóa thay đổi Xã/Phường (Chỉ setup được 1 lần duy nhất - Cần Admin phân quyền để đổi)'
              : 'Thiết lập hoặc thay đổi Tỉnh/Thành phố, Xã/Phường Tiếp nhận'
          }
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
            !canEditWard
              ? 'bg-slate-100 text-slate-600 border-slate-200'
              : hasWard
              ? 'bg-emerald-50/90 hover:bg-emerald-100 text-emerald-900 border-emerald-200'
              : 'bg-amber-50/90 hover:bg-amber-100 text-amber-900 border-amber-200'
          }`}
        >
          {!canEditWard ? (
            <Lock className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          ) : (
            <MapPin className={`w-3.5 h-3.5 shrink-0 ${hasWard ? 'text-emerald-600' : 'text-amber-600'}`} />
          )}
          <span className="truncate max-w-[180px] sm:max-w-[240px]">
            {hasWard
              ? `${currentUser.wardName}, ${currentUser.provinceName}`
              : 'Setup Tỉnh/TP - Xã/Phường (1 lần)'}
          </span>
          {!canEditWard && (
            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-slate-200 text-slate-600">
              Đã khóa
            </span>
          )}
        </button>

        <span className="text-slate-300 hidden sm:inline">·</span>

        <div className="hidden sm:flex items-center gap-1.5 text-slate-600">
          <Layers className="w-3.5 h-3.5 text-blue-600" />
          <span className="font-semibold text-slate-800 truncate max-w-[140px]">{activeConfig.name}</span>
        </div>

        <span className="text-slate-300 hidden md:inline">·</span>

        <div className="hidden md:flex items-center gap-1 text-slate-500 font-mono text-[11px]">
          <Calendar className="w-3 h-3 text-emerald-600" />
          <span>JS: {JS_UPDATED_DATE}</span>
        </div>
      </div>
    </header>
  );
};
