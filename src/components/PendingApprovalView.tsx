import React from 'react';
import {
  Clock,
  ShieldAlert,
  LogOut,
  RefreshCw,
  Mail,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';
import { UserProfile, ADMIN_EMAIL } from '../firebase';

interface PendingApprovalViewProps {
  userProfile: UserProfile;
  onRefresh: () => void;
  onLogout: () => void;
  isChecking: boolean;
}

export const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({
  userProfile,
  onRefresh,
  onLogout,
  isChecking,
}) => {
  const isRejected = userProfile.status === 'rejected';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/60 rounded-3xl border border-slate-200/80 text-center space-y-6">
          {/* Status Icon */}
          <div className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg">
            {isRejected ? (
              <div className="w-16 h-16 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-200">
                <XCircle className="w-8 h-8 stroke-[2.2]" />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200 animate-pulse">
                <Clock className="w-8 h-8 stroke-[2.2]" />
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              {isRejected ? 'Tài Khoản Đã Bị Từ Chối' : 'Đang Chờ Quản Trị Viên Phê Duyệt'}
            </h2>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              {isRejected
                ? 'Rất tiếc, yêu cầu truy cập của bạn vào hệ thống HIS Automation Suite đã bị từ chối hoặc thu hồi.'
                : 'Tài khoản của bạn đã được ghi nhận. Để bảo mật dữ liệu y tế, bạn cần được Quản trị viên (Admin) phê duyệt trước khi bắt đầu sử dụng.'}
            </p>
          </div>

          {/* User Information Card */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 text-left space-y-2">
            <div className="flex items-center gap-3">
              {userProfile.photoURL ? (
                <img
                  src={userProfile.photoURL}
                  alt={userProfile.displayName}
                  className="w-10 h-10 rounded-full border border-slate-300 object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm">
                  {userProfile.displayName ? userProfile.displayName[0].toUpperCase() : 'U'}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-900 truncate">{userProfile.displayName || 'Người dùng'}</p>
                <p className="text-[11px] text-slate-500 truncate">{userProfile.email}</p>
              </div>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${
                  isRejected
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {isRejected ? 'Đã từ chối' : 'Chờ duyệt'}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 space-y-1">
              <div>
                <span className="font-medium text-slate-700">Thời gian đăng ký:</span>{' '}
                {new Date(userProfile.createdAt).toLocaleString('vi-VN')}
              </div>
              <div>
                <span className="font-medium text-slate-700">Admin phụ trách duyệt:</span>{' '}
                <span className="font-mono text-blue-700 font-semibold">{ADMIN_EMAIL}</span>
              </div>
            </div>
          </div>

          {/* Contact Admin Notice */}
          <div className="flex items-start gap-2 p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-left text-xs text-blue-800">
            <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Vui lòng liên hệ với Quản trị viên qua email{' '}
              <strong className="underline">{ADMIN_EMAIL}</strong> để được cấp quyền kích hoạt tài khoản nhanh nhất.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={onRefresh}
              disabled={isChecking}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái'}</span>
            </button>
            <button
              onClick={onLogout}
              className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
