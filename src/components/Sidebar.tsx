import React from 'react';
import {
  Activity,
  UserCheck,
  Sliders,
  LogOut,
  Layers,
  UserPlus,
  Stethoscope,
  ChevronRight,
  X,
  Lock,
} from 'lucide-react';
import {
  UserProfile,
  AppConfiguration,
  isSuperAdminUser,
  getEffectivePermissions,
  canUserSetupOrChangeWard,
  JS_UPDATED_DATE,
} from '../firebase';

export type ActiveTabType = 'reception' | 'ksk' | 'configs' | 'users';

interface SidebarProps {
  currentUser: UserProfile;
  activeTab: ActiveTabType;
  setActiveTab: (tab: ActiveTabType) => void;
  activeConfig: AppConfiguration;
  allConfigs: AppConfiguration[];
  onSelectConfig: (config: AppConfiguration) => void;
  onLogout: () => void;
  onOpenLocationSetup: () => void;
  pendingUsersCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  activeConfig,
  allConfigs,
  onSelectConfig,
  onLogout,
  onOpenLocationSetup,
  pendingUsersCount,
  isOpenMobile,
  onCloseMobile,
}) => {
  const isSuperAdmin = isSuperAdminUser(currentUser);
  const isClinicalAdmin = currentUser.role === 'admin';
  const perms = getEffectivePermissions(currentUser);
  const canEditWard = canUserSetupOrChangeWard(currentUser);

  const navItems = [
    {
      id: 'reception' as ActiveTabType,
      label: '1. Tiếp Nhận BHYT',
      sublabel: 'Excel, BHYT & CV30',
      version: 'v3.8',
      icon: UserPlus,
      color: 'text-blue-600',
      activeBg: 'bg-blue-600 text-white font-semibold shadow-xs',
      inactiveHover: 'hover:bg-slate-100 text-slate-700',
      allowed: perms.tabReception,
    },
    {
      id: 'ksk' as ActiveTabType,
      label: '2. Khám Sức Khỏe',
      sublabel: 'Script ≥18T & 6-18T',
      version: 'TT32',
      icon: Stethoscope,
      color: 'text-emerald-600',
      activeBg: 'bg-emerald-600 text-white font-semibold shadow-xs',
      inactiveHover: 'hover:bg-slate-100 text-slate-700',
      allowed: perms.tabKsk,
    },
  ];

  const superAdminNavItems = [
    {
      id: 'configs' as ActiveTabType,
      label: 'Đa Cấu Hình',
      sublabel: 'Tiếp nhận & Khám bệnh',
      icon: Sliders,
      color: 'text-purple-600',
      activeBg: 'bg-purple-600 text-white font-semibold shadow-xs',
      inactiveHover: 'hover:bg-slate-100 text-slate-700',
      allowed: perms.tabConfigs,
    },
    {
      id: 'users' as ActiveTabType,
      label: 'Duyệt & Phân Quyền',
      sublabel: 'Phân quyền chi tiết',
      badge: pendingUsersCount > 0 ? pendingUsersCount : undefined,
      icon: UserCheck,
      color: 'text-indigo-600',
      activeBg: 'bg-indigo-600 text-white font-semibold shadow-xs',
      inactiveHover: 'hover:bg-slate-100 text-slate-700',
      allowed: perms.tabUsers,
    },
  ].filter((item) => item.allowed);

  const handleNavClick = (tabId: ActiveTabType) => {
    setActiveTab(tabId);
    onCloseMobile();
  };

  const getRoleBadge = () => {
    if (isSuperAdmin) {
      return { label: 'SUPER ADMIN', className: 'bg-purple-100 text-purple-800' };
    }
    if (isClinicalAdmin) {
      return { label: 'ADMIN', className: 'bg-indigo-100 text-indigo-800' };
    }
    return { label: 'USER', className: 'bg-blue-100 text-blue-800' };
  };

  const roleBadge = getRoleBadge();

  return (
    <>
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed top-0 left-0 bottom-0 z-50 w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col">
          {/* Logo & Brand */}
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-slate-900 tracking-tight">HIS Automation</span>
                  <span className="text-[10px] font-mono font-bold text-blue-600">v4.2</span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono">JS: {JS_UPDATED_DATE}</p>
              </div>
            </div>

            <button
              onClick={onCloseMobile}
              className="p-1 text-slate-400 hover:text-slate-600 lg:hidden cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Active Preset Switcher */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Layers className="w-3 h-3 text-blue-600" /> Cấu hình đang chọn
              </span>
              <span className="text-[10px] font-mono font-semibold text-slate-500">{allConfigs.length} mẫu</span>
            </div>

            <div className="relative">
              <select
                value={activeConfig.id}
                onChange={(e) => {
                  const found = allConfigs.find((c) => c.id === e.target.value);
                  if (found) onSelectConfig(found);
                }}
                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs appearance-none truncate pr-6"
              >
                {allConfigs.map((cfg) => (
                  <option key={cfg.id} value={cfg.id}>
                    {cfg.name} {cfg.isDefault ? '★' : ''}
                  </option>
                ))}
              </select>
              <ChevronRight className="w-3 h-3 text-slate-400 absolute right-2 top-2.5 pointer-events-none rotate-90" />
            </div>
          </div>

          {/* Navigation Links List */}
          <div className="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-270px)]">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Nghiệp Vụ Lâm Sàng
            </div>

            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer group ${
                    !item.allowed
                      ? 'bg-slate-50 text-slate-400 opacity-75'
                      : isActive
                      ? item.activeBg
                      : item.inactiveHover
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        !item.allowed
                          ? 'bg-slate-200/70 text-slate-400'
                          : isActive
                          ? 'bg-white/20 text-white'
                          : `bg-slate-100 ${item.color}`
                      }`}
                    >
                      {!item.allowed ? <Lock className="w-3.5 h-3.5" /> : <Icon className="w-4 h-4" />}
                    </div>
                    <div className="truncate">
                      <div className="text-xs font-bold truncate">{item.label}</div>
                      <div className={`text-[10px] truncate ${isActive && item.allowed ? 'text-white/80' : 'text-slate-400'}`}>
                        {!item.allowed ? 'Cần Admin phân quyền' : item.sublabel}
                      </div>
                    </div>
                  </div>

                  {!item.allowed ? (
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ml-1 bg-amber-50 text-amber-700 border border-amber-200">
                      Khóa
                    </span>
                  ) : (
                    item.version && (
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ml-1 ${
                          isActive ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.version}
                      </span>
                    )
                  )}
                </button>
              );
            })}

            {/* Management Section (Shown if Super Admin or granted tabConfigs / tabUsers) */}
            {superAdminNavItems.length > 0 && (
              <>
                <div className="pt-2 px-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-purple-700 flex items-center justify-between">
                  <span>Quản Trị Hệ Thống</span>
                  <span className="text-[9px] font-mono font-bold text-purple-700">
                    SUPER
                  </span>
                </div>

                {superAdminNavItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left transition-all cursor-pointer group ${
                        isActive ? item.activeBg : item.inactiveHover
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isActive ? 'bg-white/20 text-white' : `bg-slate-100 ${item.color}`
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold truncate">{item.label}</div>
                          <div className={`text-[10px] truncate ${isActive ? 'text-white/80' : 'text-slate-400'}`}>
                            {item.sublabel}
                          </div>
                        </div>
                      </div>

                      {item.badge !== undefined && (
                        <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 tabular-nums">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Footer User Profile, Location Setup & Logout */}
        <div className="p-2.5 border-t border-slate-100 bg-slate-50/60 space-y-2">
          <button
            type="button"
            onClick={() => {
              onOpenLocationSetup();
              onCloseMobile();
            }}
            className={`w-full p-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
              !canEditWard
                ? 'bg-slate-100 hover:bg-slate-200/70 border-slate-200 text-slate-600'
                : 'bg-emerald-50/90 hover:bg-emerald-100 border-emerald-200/90'
            }`}
          >
            <div className="min-w-0">
              <div
                className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                  !canEditWard ? 'text-slate-500' : 'text-emerald-700'
                }`}
              >
                {!canEditWard && <Lock className="w-2.5 h-2.5" />}
                <span>Xã/Phường Tiếp Nhận</span>
              </div>
              <div className="text-xs font-bold text-slate-900 truncate">
                {currentUser.wardName && currentUser.provinceName
                  ? `${currentUser.wardName}, ${currentUser.provinceName}`
                  : 'Chưa setup (Được setup 1 lần)'}
              </div>
            </div>
            <span
              className={`text-[10px] font-mono font-bold shrink-0 ${
                !canEditWard ? 'text-slate-500' : 'text-emerald-700'
              }`}
            >
              {!canEditWard ? 'Đã khóa' : currentUser.wardName ? 'Đổi' : 'Setup'}
            </span>
          </button>

          <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-2 min-w-0">
              {currentUser.photoURL ? (
                <img
                  src={currentUser.photoURL}
                  alt={currentUser.displayName}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-200 shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-lg bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U'}
                </div>
              )}
              <div className="truncate min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">
                  {currentUser.displayName || currentUser.email}
                </div>
                <div className="flex items-center gap-1">
                  <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${roleBadge.className}`}>
                    {roleBadge.label}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono truncate">{currentUser.email}</span>
                </div>
              </div>
            </div>

            <button
              onClick={onLogout}
              title="Đăng xuất"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
