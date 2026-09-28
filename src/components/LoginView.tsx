import React from 'react';
import { Activity, Lock } from 'lucide-react';

interface LoginViewProps {
  onLoginWithGoogle: () => void;
  isLoading: boolean;
  error?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginWithGoogle,
  isLoading,
  error,
}) => {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-white border border-slate-200/90 rounded-3xl shadow-xl p-8 sm:p-10 text-center space-y-6">
        {/* App Brand & Icon */}
        <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/25">
          <Activity className="w-7 h-7 stroke-[2.2]" />
        </div>

        {/* Title & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            HIS Automation Suite
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xs mx-auto">
            Hệ thống tự động hóa Tiếp nhận BHYT & Khám Sức Khỏe KSK chuẩn Thông tư 32/2023/TT-BYT.
          </p>
        </div>

        {/* Error Alert if any */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium text-left">
            {error}
          </div>
        )}

        {/* Google Login Button */}
        <div className="space-y-3 pt-2">
          <button
            onClick={onLoginWithGoogle}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white hover:bg-slate-50 border-2 border-slate-200 hover:border-blue-500 rounded-2xl text-xs sm:text-sm font-bold text-slate-800 transition-all shadow-xs hover:shadow-md cursor-pointer disabled:opacity-50 group"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{isLoading ? 'Đang xác thực...' : 'Đăng nhập với Google'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
