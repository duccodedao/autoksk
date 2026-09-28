import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  KeyRound,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Eye,
  EyeOff,
  QrCode,
  Lock,
  PowerOff,
  Power,
  X,
} from 'lucide-react';
import {
  AdminTotpConfig,
  buildOtpAuthUri,
  cleanBase32Secret,
  generateRandomBase32Secret,
  verifyTotpToken,
} from '../utils/totp';

interface AdminTotpSetupCardProps {
  totpConfig: AdminTotpConfig;
  onSaveTotpConfig: (newConfig: AdminTotpConfig) => Promise<void>;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

type CardFlowMode = 'idle' | 'verify_otp_to_change_key' | 'setup_qr';

export const AdminTotpSetupCard: React.FC<AdminTotpSetupCardProps> = ({
  totpConfig,
  onSaveTotpConfig,
  showToast,
}) => {
  // When 2FA is already enabled, start in 'idle' mode (hidden details, only showing Turn Off / Change Key)
  const [flowMode, setFlowMode] = useState<CardFlowMode>(
    totpConfig.enabled ? 'idle' : 'setup_qr'
  );

  const [pendingSecret, setPendingSecret] = useState<string>(totpConfig.secret);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  // OTP inputs
  const [verifyCurrentOtp, setVerifyCurrentOtp] = useState<string>('');
  const [confirmSetupOtp, setConfirmSetupOtp] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Sync flowMode if totpConfig.enabled changes externally
  useEffect(() => {
    setPendingSecret(totpConfig.secret);
    if (totpConfig.enabled) {
      setFlowMode('idle');
    }
  }, [totpConfig.enabled, totpConfig.secret]);

  // Generate QR code only when in 'setup_qr' mode
  useEffect(() => {
    if (flowMode !== 'setup_qr') {
      setQrDataUrl('');
      return;
    }
    const cleaned = cleanBase32Secret(pendingSecret);
    if (!cleaned) {
      setQrDataUrl('');
      return;
    }
    const uri = buildOtpAuthUri(
      cleaned,
      totpConfig.accountName || 'Admin Toàn Quyền',
      totpConfig.issuer || 'Auto KSK - HIS Suite'
    );
    QRCode.toDataURL(uri, {
      width: 200,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [flowMode, pendingSecret, totpConfig.accountName, totpConfig.issuer]);

  // Disable 2FA immediately when clicking "Tắt 2FA"
  const handleDisable2FA = async () => {
    setIsSubmitting(true);
    try {
      await onSaveTotpConfig({
        ...totpConfig,
        enabled: false,
        updatedAt: new Date().toISOString(),
      });
      setFlowMode('idle');
      showToast(
        'info',
        'Đã tắt 2FA Authenticator',
        'Chức năng đăng nhập nhanh bằng mã OTP đã được vô hiệu hóa.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 1 of Change Key: Verify existing OTP before allowing key change
  const handleVerifyCurrentOtpForKeyChange = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedCode = verifyCurrentOtp.replace(/\D/g, '');
    if (cleanedCode.length !== 6) {
      showToast('warning', 'Thiếu mã OTP', 'Vui lòng nhập đủ 6 chữ số OTP hiện tại để xác thực.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isValid = await verifyTotpToken(cleanedCode, totpConfig.secret, 1, 30);
      if (!isValid) {
        showToast(
          'error',
          'Xác thực OTP thất bại',
          'Mã OTP hiện tại không chính xác hoặc đã hết hạn. Không thể đổi khóa.'
        );
        return;
      }

      // Generate a fresh secret key for the new setup
      const newSecret = generateRandomBase32Secret(32);
      setPendingSecret(newSecret);
      setVerifyCurrentOtp('');
      setConfirmSetupOtp('');
      setFlowMode('setup_qr');
      showToast(
        'success',
        'Xác thực OTP thành công',
        'Đã tạo khóa 2FA mới. Hãy quét mã QR mới và nhập OTP xác nhận để hoàn tất đổi khóa.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Activate 2FA or Save Changed Key (requires matching 6-digit OTP from the QR code)
  const handleConfirmAndEnable2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedSecret = cleanBase32Secret(pendingSecret);
    if (cleanedSecret.length < 16) {
      showToast('error', 'Khóa không hợp lệ', 'Khóa Base32 phải có ít nhất 16 ký tự.');
      return;
    }

    const cleanedCode = confirmSetupOtp.replace(/\D/g, '');
    if (cleanedCode.length !== 6) {
      showToast(
        'warning',
        'Nhập mã OTP xác nhận',
        'Vui lòng nhập 6 chữ số OTP từ ứng dụng Authenticator sau khi quét QR để bật 2FA.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const isValid = await verifyTotpToken(cleanedCode, cleanedSecret, 1, 30);
      if (!isValid) {
        showToast(
          'error',
          'Mã OTP không khớp',
          'Mã 6 số không khớp với khóa QR hiện tại. Vui lòng quét lại mã QR trên điện thoại.'
        );
        return;
      }

      await onSaveTotpConfig({
        enabled: true,
        secret: cleanedSecret,
        issuer: totpConfig.issuer || 'Auto KSK - HIS Suite',
        accountName: totpConfig.accountName || 'Admin Toàn Quyền',
        updatedAt: new Date().toISOString(),
        updatedBy: 'sonlyhongduc@gmail.com',
      });

      setConfirmSetupOtp('');
      // Immediately hide QR & configuration after enabling 2FA
      setFlowMode('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(cleanBase32Secret(pendingSecret));
      setCopiedSecret(true);
      showToast('success', 'Đã sao chép khóa Secret', 'Dán khóa này vào ứng dụng Authenticator.');
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      showToast('error', 'Lỗi sao chép', 'Không thể sao chép tự động.');
    }
  };

  return (
    <div className="bg-white border border-purple-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
      {/* Compact Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              totpConfig.enabled
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            <KeyRound className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                Xác Thực 2FA Authenticator (Admin Toàn Quyền)
              </h3>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md font-mono border ${
                  totpConfig.enabled
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}
              >
                {totpConfig.enabled ? 'ĐANG BẬT 2FA' : 'ĐANG TẮT'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {totpConfig.enabled
                ? 'Cấu hình 2FA đã được kích hoạt và ẩn bảo mật. Bạn có thể tắt 2FA hoặc xác thực OTP để đổi khóa mới.'
                : 'Bật 2FA Authenticator để cho phép đăng nhập nhanh quyền Super Admin bằng mã OTP 6 số.'}
            </p>
          </div>
        </div>

        {/* Actions when 2FA is ENABLED: Only show "Đổi khóa" (requires OTP) and "Tắt 2FA" */}
        {totpConfig.enabled ? (
          <div className="flex items-center gap-2 shrink-0">
            {flowMode === 'idle' && (
              <button
                type="button"
                onClick={() => {
                  setVerifyCurrentOtp('');
                  setFlowMode('verify_otp_to_change_key');
                }}
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-all cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Đổi khóa 2FA</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDisable2FA}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-2xs cursor-pointer"
            >
              <PowerOff className="w-3.5 h-3.5" />
              <span>Tắt 2FA</span>
            </button>
          </div>
        ) : (
          /* Actions when 2FA is DISABLED */
          <div className="flex items-center gap-2 shrink-0">
            {flowMode !== 'setup_qr' ? (
              <button
                type="button"
                onClick={() => {
                  setPendingSecret(totpConfig.secret || generateRandomBase32Secret(32));
                  setConfirmSetupOtp('');
                  setFlowMode('setup_qr');
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition-all shadow-2xs cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Thiết lập & Bật 2FA</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setFlowMode('idle')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 border border-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Đóng</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* STEP 1 FOR KEY CHANGE: Verify existing OTP before showing new QR */}
      {flowMode === 'verify_otp_to_change_key' && (
        <form
          onSubmit={handleVerifyCurrentOtpForKeyChange}
          className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950">
                Xác thực mã OTP hiện tại để đổi khóa 2FA
              </h4>
              <p className="text-[11px] text-amber-800">
                Nhập 6 chữ số OTP từ ứng dụng Authenticator hiện tại của bạn để mở khóa tạo mã QR mới.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={verifyCurrentOtp}
              onChange={(e) => setVerifyCurrentOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="w-32 px-3 py-1.5 bg-white border-2 border-amber-300 focus:border-amber-600 rounded-xl font-mono text-sm font-black tracking-[0.25em] text-center text-slate-900 focus:outline-none"
            />

            <button
              type="submit"
              disabled={verifyCurrentOtp.replace(/\D/g, '').length !== 6 || isSubmitting}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Xác thực</span>
            </button>

            <button
              type="button"
              onClick={() => setFlowMode('idle')}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      {/* SETUP QR / NEW KEY PANEL (Only visible when initially turning on 2FA or after OTP verification for key change) */}
      {flowMode === 'setup_qr' && (
        <form
          onSubmit={handleConfirmAndEnable2FA}
          className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch pt-3 border-t border-slate-100"
        >
          {/* Left: QR Code Box */}
          <div className="lg:col-span-4 p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col items-center justify-center text-center space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <QrCode className="w-4 h-4 text-purple-600" />
              <span>Quét Mã QR Bằng Authenticator</span>
            </div>

            <div className="p-2.5 bg-white rounded-2xl border-2 border-purple-200 shadow-xs">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="2FA Authenticator QR Code"
                  className="w-36 h-36 object-contain"
                />
              ) : (
                <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-400">
                  Đang tạo QR...
                </div>
              )}
            </div>

            <p className="text-[10px] text-slate-500 max-w-xs leading-relaxed">
              Quét mã QR bằng <strong>Google Authenticator</strong> hoặc <strong>Authy</strong>, sau đó nhập mã 6 số vào ô bên phải để bật.
            </p>
          </div>

          {/* Right: Secret Key & OTP Confirmation */}
          <div className="lg:col-span-8 flex flex-col justify-between space-y-3">
            <div className="p-3.5 rounded-xl bg-purple-50/50 border border-purple-200/80 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-purple-950">
                  Khóa Bí Mật 2FA (Base32 Secret Key)
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowSecret((prev) => !prev)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-purple-200 text-[11px] font-semibold text-purple-800 hover:bg-purple-100 cursor-pointer"
                  >
                    {showSecret ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showSecret ? 'Ẩn khóa' : 'Hiện khóa'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-[11px] font-bold text-purple-800 hover:bg-purple-100 cursor-pointer"
                  >
                    {copiedSecret ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSecret ? 'Đã chép' : 'Sao chép'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingSecret(generateRandomBase32Secret(32));
                      setConfirmSetupOtp('');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Tạo mã QR khác</span>
                  </button>
                </div>
              </div>

              <input
                type={showSecret ? 'text' : 'password'}
                readOnly
                value={pendingSecret}
                className="w-full px-3 py-2 bg-white border border-purple-300 rounded-xl font-mono text-xs font-bold text-purple-950 tracking-wider focus:outline-none"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <label className="text-xs font-bold text-slate-800 block">
                  Nhập mã OTP 6 số từ điện thoại để xác thực & bật 2FA:
                </label>
                <span className="text-[11px] text-slate-500">
                  Sau khi bật thành công, mã QR và khóa sẽ tự động ẩn đi để bảo mật.
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={confirmSetupOtp}
                  onChange={(e) => setConfirmSetupOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-32 px-3 py-2 bg-white border-2 border-slate-300 focus:border-purple-600 rounded-xl font-mono text-sm font-black tracking-[0.25em] text-center text-slate-900 focus:outline-none"
                />

                <button
                  type="submit"
                  disabled={confirmSetupOtp.replace(/\D/g, '').length !== 6 || isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{totpConfig.enabled ? 'Lưu Khóa Mới' : 'Xác Thực & Bật 2FA'}</span>
                </button>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
