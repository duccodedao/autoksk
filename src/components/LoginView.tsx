import React, { useState } from 'react';
import {
  Activity,
  KeyRound,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import { DeviceNetworkInfo, MAX_LOGIN_FAILED_ATTEMPTS } from '../utils/deviceSecurity';

interface LoginViewProps {
  onLoginWithGoogle: () => void;
  onLoginWithOtp: (otpCode: string) => Promise<void>;
  totpEnabled?: boolean;
  isLoading: boolean;
  isOtpLoading?: boolean;
  error?: string | null;
  otpError?: string | null;
  networkInfo?: DeviceNetworkInfo | null;
  failedAttempts?: number;
  isDeviceLocked?: boolean;
  deviceLockedAt?: string | null;
}

export const LoginView: React.FC<LoginViewProps> = ({
  onLoginWithGoogle,
  onLoginWithOtp,
  totpEnabled = true,
  isLoading,
  isOtpLoading = false,
  error,
  otpError,
  networkInfo,
  failedAttempts = 0,
  isDeviceLocked = false,
}) => {
  const [otpCode, setOtpCode] = useState('');

  const remainingAttempts = Math.max(0, MAX_LOGIN_FAILED_ATTEMPTS - failedAttempts);
  const locked = isDeviceLocked || failedAttempts >= MAX_LOGIN_FAILED_ATTEMPTS;

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked) return;
    const cleaned = otpCode.replace(/\D/g, '');
    if (cleaned.length !== 6 || isOtpLoading || !totpEnabled) return;
    await onLoginWithOtp(cleaned);
    setOtpCode('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
        {/* Simple Header */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Đăng Nhập Hệ Thống</h1>
            <p className="text-xs text-slate-500">Auto Khám Sức Khỏe & Tiếp Nhận BHYT</p>
          </div>
        </div>

        {/* Locked Notice (> 5 failed attempts) */}
        {locked && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1.5 text-xs text-rose-800">
            <div className="flex items-center gap-1.5 font-bold text-rose-700">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Thiết bị đã bị khóa mã OTP ({failedAttempts}/{MAX_LOGIN_FAILED_ATTEMPTS} lần sai)</span>
            </div>
            <p className="text-[11px] text-rose-600 leading-relaxed">
              Bạn đã nhập sai quá {MAX_LOGIN_FAILED_ATTEMPTS} lần. Vui lòng đăng nhập bằng tài khoản Google bên dưới để tiếp tục.
            </p>
          </div>
        )}

        {/* Warning when 0 < failedAttempts < 5 */}
        {!locked && failedAttempts > 0 && (
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs text-amber-800">
            <span className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Nhập sai {failedAttempts}/{MAX_LOGIN_FAILED_ATTEMPTS} lần</span>
            </span>
            <span className="font-bold">Còn {remainingAttempts} lượt</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
            {error}
          </div>
        )}

        {/* Google Login Button */}
        <button
          type="button"
          onClick={onLoginWithGoogle}
          disabled={isLoading || isOtpLoading}
          className="w-full flex items-center justify-center gap-2.5 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
          <span>{isLoading ? 'Đang đăng nhập...' : 'Đăng nhập với Google'}</span>
        </button>

        {/* Admin 2FA OTP Quick Login (Hidden if disabled or if device is locked) */}
        {totpEnabled && !locked && (
          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-600 font-semibold">
              <span className="flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-blue-600" />
                <span>Đăng nhập nhanh Admin (OTP)</span>
              </span>
            </div>

            {otpError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {otpError}
              </div>
            )}

            <form onSubmit={handleOtpSubmit} className="flex items-center gap-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Mã OTP 6 số"
                disabled={isOtpLoading || isLoading}
                className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 focus:border-blue-600 focus:bg-white rounded-xl text-center font-mono text-sm font-bold tracking-widest text-slate-900 focus:outline-none"
              />
              <button
                type="submit"
                disabled={otpCode.replace(/\D/g, '').length !== 6 || isOtpLoading || isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0"
              >
                {isOtpLoading ? '...' : 'Vào'}
              </button>
            </form>
          </div>
        )}

        {/* Minimal IP Footer */}
        {networkInfo?.ipWifi && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>IP: {networkInfo.ipWifi}</span>
            <span>{networkInfo.deviceId}</span>
          </div>
        )}
      </div>
    </div>
  );
};
