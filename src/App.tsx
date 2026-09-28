/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import {
  auth,
  googleProvider,
  db,
  ADMIN_EMAIL,
  JS_UPDATED_DATE,
  UserProfile,
  UserRole,
  UserPermissions,
  isSuperAdminUser,
  getEffectivePermissions,
  canUserSetupOrChangeWard,
  FULL_USER_PERMISSIONS,
  AppConfiguration,
  INITIAL_PRESET_CONFIGS,
} from './firebase';
import {
  AdminTotpConfig,
  DEFAULT_ADMIN_TOTP_CONFIG,
  verifyTotpToken,
} from './utils/totp';
import {
  DeviceNetworkInfo,
  LockedDeviceRecord,
  MAX_LOGIN_FAILED_ATTEMPTS,
  fetchClientNetworkInfo,
  getOrCreateDeviceId,
  getLocalDeviceLockState,
  setLocalDeviceLockState,
} from './utils/deviceSecurity';
import { Sidebar, ActiveTabType } from './components/Sidebar';
import { Header } from './components/Header';
import { LoginView } from './components/LoginView';
import { PendingApprovalView } from './components/PendingApprovalView';
import { ReceptionTab } from './components/ReceptionTab';
import { KskTab } from './components/KskTab';
import { UserManagementView } from './components/UserManagementView';
import { ConfigManagementView } from './components/ConfigManagementView';
import { LocationSetupModal, UserLocationSelection } from './components/LocationSetupModal';
import { CheckCircle2, AlertTriangle, Info, X, Lock } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [otpLoginLoading, setOtpLoginLoading] = useState(false);
  const [otpLoginError, setOtpLoginError] = useState<string | null>(null);
  const [totpConfig, setTotpConfig] = useState<AdminTotpConfig>(DEFAULT_ADMIN_TOTP_CONFIG);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  // App Navigation & Tabs with Sidetab
  const [activeTab, setActiveTab] = useState<ActiveTabType>('reception');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Location & Ward Setup Modal
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [promptedUid, setPromptedUid] = useState<string | null>(null);

  // Configurations from Firestore
  const [configs, setConfigs] = useState<AppConfiguration[]>(INITIAL_PRESET_CONFIGS);
  const [activeConfig, setActiveConfig] = useState<AppConfiguration>(INITIAL_PRESET_CONFIGS[0]);

  // Users for Super Admin Management
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  // Device & Network Telemetry + Security Lockout State
  const initialLock = getLocalDeviceLockState();
  const [networkInfo, setNetworkInfo] = useState<DeviceNetworkInfo | null>(null);
  const [failedAttempts, setFailedAttempts] = useState<number>(initialLock.failedAttempts);
  const [isDeviceLocked, setIsDeviceLocked] = useState<boolean>(initialLock.locked);
  const [deviceLockedAt, setDeviceLockedAt] = useState<string | null>(initialLock.lockedAt);
  const [lockedDevices, setLockedDevices] = useState<LockedDeviceRecord[]>([]);

  // Toast Notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 0. Collect client IP Wifi, Device IP, and Address + Listen to Device Lock status in Firestore
  useEffect(() => {
    const deviceId = getOrCreateDeviceId();
    fetchClientNetworkInfo()
      .then((info) => {
        setNetworkInfo(info);
      })
      .catch(() => {});

    const lockDocRef = doc(db, 'locked_devices', deviceId);
    const unsubLock = onSnapshot(
      lockDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as LockedDeviceRecord;
          const attempts = Number(data.failedAttempts) || 0;
          const locked = Boolean(data.locked || attempts >= MAX_LOGIN_FAILED_ATTEMPTS);
          const lockedAt = data.lockedAt || null;
          setFailedAttempts(attempts);
          setIsDeviceLocked(locked);
          setDeviceLockedAt(lockedAt);
          setLocalDeviceLockState({
            failedAttempts: attempts,
            locked,
            lockedAt,
          });
        }
      },
      () => {}
    );

    return () => unsubLock();
  }, []);

  const recordFailedLoginAttempt = async (reason: string) => {
    const net = networkInfo || (await fetchClientNetworkInfo());
    if (!networkInfo) setNetworkInfo(net);

    const nextAttempts = failedAttempts + 1;
    const willLock = nextAttempts >= MAX_LOGIN_FAILED_ATTEMPTS;
    const nowIso = new Date().toISOString();
    const nextLockedAt = willLock ? deviceLockedAt || nowIso : null;

    setFailedAttempts(nextAttempts);
    setIsDeviceLocked(willLock);
    setDeviceLockedAt(nextLockedAt);
    setLocalDeviceLockState({
      failedAttempts: nextAttempts,
      locked: willLock,
      lockedAt: nextLockedAt,
    });

    const lockPayload: LockedDeviceRecord = {
      deviceId: net.deviceId,
      ipWifi: net.ipWifi,
      deviceIp: net.deviceIp,
      networkAddress: net.networkAddress,
      userAgent: net.userAgent,
      failedAttempts: nextAttempts,
      locked: willLock,
      lockedAt: nextLockedAt || nowIso,
      reason,
    };

    try {
      await setDoc(doc(db, 'locked_devices', net.deviceId), lockPayload);
    } catch {
      // ignore firestore write error if offline
    }

    if (willLock) {
      showToast(
        'error',
        'Thiết bị đã bị khóa & cấm truy cập',
        `Bạn đã nhập sai quá ${MAX_LOGIN_FAILED_ATTEMPTS} lần. Thiết bị (${net.ipWifi}) đã bị vô hiệu hóa.`
      );
    }
  };

  // 1. Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      setAuthLoading(true);
      const net = await fetchClientNetworkInfo();
      setNetworkInfo(net);

      if (!fbUser) {
        // Check if Admin logged in via 2FA OTP session
        try {
          const savedOtpAdmin = localStorage.getItem('his_admin_otp_session');
          if (savedOtpAdmin) {
            const parsedAdmin = JSON.parse(savedOtpAdmin) as UserProfile;
            if (parsedAdmin && parsedAdmin.uid) {
              setCurrentUser({
                ...parsedAdmin,
                ipWifi: net.ipWifi,
                deviceIp: net.deviceIp,
                networkAddress: net.networkAddress,
                deviceId: net.deviceId,
              });
              setAuthLoading(false);
              return;
            }
          }
        } catch {
          // Ignore localStorage parse error
        }
        setCurrentUser(null);
        setPromptedUid(null);
        setAuthLoading(false);
        return;
      }

      const email = fbUser.email || '';
      const isRootSuperAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

      try {
        const userRef = doc(db, 'users', fbUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          const profile = userSnap.data() as UserProfile;
          const syncedTelemetry = {
            ipWifi: net.ipWifi,
            deviceIp: net.deviceIp,
            networkAddress: net.networkAddress,
            deviceId: net.deviceId,
            updatedAt: new Date().toISOString(),
          };
          // Ensure root super admin always has super_admin role, approved status, and raw code access
          if (
            isRootSuperAdmin &&
            (profile.role !== 'super_admin' || profile.status !== 'approved' || !profile.canViewRawCode)
          ) {
            const updatedProfile: UserProfile = {
              ...profile,
              ...syncedTelemetry,
              role: 'super_admin',
              status: 'approved',
              canViewRawCode: true,
            };
            await updateDoc(userRef, {
              ...syncedTelemetry,
              role: 'super_admin',
              status: 'approved',
              canViewRawCode: true,
            });
            setCurrentUser(updatedProfile);
          } else {
            await updateDoc(userRef, syncedTelemetry).catch(() => {});
            setCurrentUser({
              ...profile,
              ...syncedTelemetry,
            });
          }
        } else {
          // New User Registration with full IP Wifi, Device IP & Address
          const newProfile: UserProfile = {
            uid: fbUser.uid,
            email: email,
            displayName: fbUser.displayName || email.split('@')[0],
            photoURL: fbUser.photoURL || '',
            role: isRootSuperAdmin ? 'super_admin' : 'user',
            status: isRootSuperAdmin ? 'approved' : 'pending',
            canViewRawCode: isRootSuperAdmin ? true : false,
            ipWifi: net.ipWifi,
            deviceIp: net.deviceIp,
            networkAddress: net.networkAddress,
            deviceId: net.deviceId,
            failedLoginAttempts: 0,
            deviceLocked: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            requestedAt: new Date().toISOString(),
          };
          await setDoc(userRef, newProfile);
          setCurrentUser(newProfile);
        }
      } catch (err: any) {
        console.error('Error fetching user profile:', err);
        if (isRootSuperAdmin) {
          setCurrentUser({
            uid: fbUser.uid,
            email: email,
            displayName: fbUser.displayName || 'Super Admin',
            photoURL: fbUser.photoURL || '',
            role: 'super_admin',
            status: 'approved',
            canViewRawCode: true,
            ipWifi: net.ipWifi,
            deviceIp: net.deviceIp,
            networkAddress: net.networkAddress,
            deviceId: net.deviceId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 1a. Realtime listener on Firestore settings/admin_totp (syncs 2FA Authenticator config with Backend API)
  useEffect(() => {
    const totpRef = doc(db, 'settings', 'admin_totp');
    const unsub = onSnapshot(
      totpRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<AdminTotpConfig>;
          const merged: AdminTotpConfig = {
            ...DEFAULT_ADMIN_TOTP_CONFIG,
            ...data,
          };
          setTotpConfig(merged);
          fetch('/api/auth/totp/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(merged),
          }).catch(() => {});
        } else {
          // Initialize default 2FA config in Firestore if not created yet
          setDoc(totpRef, DEFAULT_ADMIN_TOTP_CONFIG).catch(() => {});
        }
      },
      () => {}
    );
    return () => unsub();
  }, []);

  // 1b. Realtime listener on current user's profile document (for live approval, role, raw code & ward updates)
  useEffect(() => {
    if (!currentUser?.uid) return;
    const userRef = doc(db, 'users', currentUser.uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserProfile;
          setCurrentUser(data);
        }
      },
      () => {}
    );
    return () => unsub();
  }, [currentUser?.uid]);

  // 1c. Automatically prompt for Location Permission & Province/Ward setup after login + admin approval
  useEffect(() => {
    if (!currentUser) return;
    const isSuper = isSuperAdminUser(currentUser);
    const isApproved =
      currentUser.status === 'approved' || isSuper || currentUser.role === 'admin';

    if (
      isApproved &&
      (!currentUser.provinceCode || !currentUser.wardCode) &&
      promptedUid !== currentUser.uid
    ) {
      setPromptedUid(currentUser.uid);
      setIsLocationModalOpen(true);
    }
  }, [currentUser, promptedUid]);

  // Ensure user stays on an allowed tab according to their granular permissions
  useEffect(() => {
    if (!currentUser) return;
    const perms = getEffectivePermissions(currentUser);
    const isTabAllowed =
      (activeTab === 'reception' && perms.tabReception) ||
      (activeTab === 'ksk' && perms.tabKsk) ||
      (activeTab === 'configs' && perms.tabConfigs) ||
      (activeTab === 'users' && perms.tabUsers);

    if (!isTabAllowed) {
      if (perms.tabReception) setActiveTab('reception');
      else if (perms.tabKsk) setActiveTab('ksk');
      else if (perms.tabConfigs) setActiveTab('configs');
      else if (perms.tabUsers) setActiveTab('users');
    }
  }, [currentUser, activeTab]);

  // 2. Realtime listener for Firestore Configurations
  useEffect(() => {
    const isSuper = isSuperAdminUser(currentUser);
    if (!currentUser || (currentUser.status !== 'approved' && !isSuper && currentUser.role !== 'admin')) {
      return;
    }

    const configsRef = collection(db, 'configurations');
    const unsubscribe = onSnapshot(
      configsRef,
      async (snapshot) => {
        if (snapshot.empty) {
          if (isSuper) {
            for (const preset of INITIAL_PRESET_CONFIGS) {
              await setDoc(doc(db, 'configurations', preset.id), preset);
            }
          }
          setConfigs(INITIAL_PRESET_CONFIGS);
          setActiveConfig(INITIAL_PRESET_CONFIGS[0]);
        } else {
          const loadedConfigs: AppConfiguration[] = [];
          for (const docSnap of snapshot.docs) {
            const data = docSnap.data() as AppConfiguration;
            // Migrate old preset name to "Khám sức khỏe toàn dân" if needed
            if (
              data.id === 'preset_tt32_standard' &&
              data.name.includes('Khám Tuyển Dụng')
            ) {
              const updatedData: AppConfiguration = {
                ...data,
                name: 'Khám sức khỏe toàn dân',
                kskConfig: {
                  ...data.kskConfig,
                  presetName: 'Khám sức khỏe toàn dân',
                },
              };
              loadedConfigs.push(updatedData);
              if (isSuper) {
                updateDoc(doc(db, 'configurations', data.id), {
                  name: 'Khám sức khỏe toàn dân',
                  'kskConfig.presetName': 'Khám sức khỏe toàn dân',
                }).catch(() => {});
              }
            } else {
              loadedConfigs.push(data);
            }
          }
          setConfigs(loadedConfigs);

          // Update active configuration
          const defaultCfg = loadedConfigs.find((c) => c.isDefault) || loadedConfigs[0];
          setActiveConfig((prev) => {
            const stillExists = loadedConfigs.find((c) => c.id === prev.id);
            return stillExists || defaultCfg;
          });
        }
      },
      (err) => {
        console.warn('Configs snapshot error or fallback to defaults:', err);
        setConfigs(INITIAL_PRESET_CONFIGS);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // 2b. Sync active configuration & presets to Backend KSK Script API (/api/ksk/sync)
  useEffect(() => {
    if (!activeConfig) return;
    fetch('/api/ksk/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeConfigId: activeConfig.id,
        activeKskConfig: {
          ...activeConfig.kskConfig,
          presetName: activeConfig.name,
        },
        configs,
      }),
    }).catch(() => {});
  }, [activeConfig, configs]);

  // 3. Realtime listener for Users List (Super Admin or Users with tabUsers permission)
  useEffect(() => {
    const perms = getEffectivePermissions(currentUser);
    if (!currentUser || (!isSuperAdminUser(currentUser) && !perms.tabUsers)) {
      return;
    }

    setUsersLoading(true);
    const usersRef = collection(db, 'users');
    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const loadedUsers: UserProfile[] = [];
        snapshot.forEach((docSnap) => {
          loadedUsers.push(docSnap.data() as UserProfile);
        });
        setUsersList(loadedUsers);
        setUsersLoading(false);
      },
      (err) => {
        console.error('Users snapshot error:', err);
        setUsersLoading(false);
      }
    );

    const lockedRef = collection(db, 'locked_devices');
    const unsubLocked = onSnapshot(
      lockedRef,
      (snap) => {
        const items: LockedDeviceRecord[] = [];
        snap.forEach((d) => items.push(d.data() as LockedDeviceRecord));
        setLockedDevices(items);
      },
      () => {}
    );

    return () => {
      unsubscribe();
      unsubLocked();
    };
  }, [currentUser]);

  // Handlers
  const handleGoogleLogin = async () => {
    setLoginLoading(true);
    setLoginError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const net = networkInfo || (await fetchClientNetworkInfo());
      const signedEmail = (cred.user?.email || '').toLowerCase();
      const isRootSuper = signedEmail === ADMIN_EMAIL.toLowerCase();

      // Clear local & Firestore OTP brute-force lockout upon valid Google authentication
      setFailedAttempts(0);
      setIsDeviceLocked(false);
      setDeviceLockedAt(null);
      setLocalDeviceLockState({ failedAttempts: 0, locked: false, lockedAt: null });
      await setDoc(doc(db, 'locked_devices', net.deviceId), {
        deviceId: net.deviceId,
        ipWifi: net.ipWifi,
        deviceIp: net.deviceIp,
        networkAddress: net.networkAddress,
        userAgent: net.userAgent,
        failedAttempts: 0,
        locked: false,
        lockedAt: '',
        reason: isRootSuper ? 'Unlocked via Super Admin Google Login' : 'Verified via Google OAuth',
      }).catch(() => {});

      if (cred.user?.uid && isRootSuper) {
        await updateDoc(doc(db, 'users', cred.user.uid), {
          deviceLocked: false,
          failedLoginAttempts: 0,
          deviceLockedAt: '',
        }).catch(() => {});
      }

      showToast('success', 'Đăng nhập thành công', 'Chào mừng đến với HIS Automation Suite.');
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        setLoginError('Cửa sổ đăng nhập Google đã được đóng. Bạn có thể bấm đăng nhập lại bất cứ lúc nào.');
        return;
      }
      if (code === 'auth/popup-blocked') {
        setLoginError('Trình duyệt đang chặn cửa sổ Popup. Vui lòng cho phép Popup trên trình duyệt để đăng nhập Google.');
        return;
      }
      console.warn('Google login warning:', code || err?.message);
      await recordFailedLoginAttempt(`Google OAuth Error: ${code || err?.message || 'failed'}`);
      setLoginError('Không thể xác thực tài khoản Google. Vui lòng thử lại.');
      showToast('error', 'Đăng nhập thất bại', 'Vui lòng thử lại hoặc chọn tài khoản Google khác.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('his_admin_otp_session');
      await signOut(auth);
      setCurrentUser(null);
      showToast('info', 'Đã đăng xuất', 'Phiên làm việc đã kết thúc.');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleOtpLogin = async (otpCode: string) => {
    if (isDeviceLocked || failedAttempts >= MAX_LOGIN_FAILED_ATTEMPTS) {
      setOtpLoginError('Thiết bị đã bị khóa và cấm truy cập do nhập sai quá 5 lần.');
      return;
    }
    setOtpLoginLoading(true);
    setOtpLoginError(null);
    try {
      if (!totpConfig.enabled) {
        setOtpLoginError('Chức năng đăng nhập nhanh bằng mã OTP hiện đang bị tắt bởi Admin.');
        return;
      }

      let isVerified = false;
      try {
        const res = await fetch('/api/auth/totp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: otpCode,
            fallbackSecret: totpConfig.secret,
          }),
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          isVerified = true;
        } else if (res.status === 401 || res.status === 403) {
          // Double check locally against Firestore totpConfig.secret in case of server sync lag
          const localValid = await verifyTotpToken(otpCode, totpConfig.secret, 1, 30);
          if (localValid && totpConfig.enabled) {
            isVerified = true;
          } else {
            await recordFailedLoginAttempt('Nhập sai Mã OTP 2FA Admin');
            const nextCount = failedAttempts + 1;
            const remain = Math.max(0, MAX_LOGIN_FAILED_ATTEMPTS - nextCount);
            setOtpLoginError(
              remain > 0
                ? `Mã OTP không chính xác! Bạn đã sai ${nextCount}/${MAX_LOGIN_FAILED_ATTEMPTS} lần (Còn ${remain} lần thử).`
                : `Thiết bị đã bị khóa do nhập sai mã OTP quá ${MAX_LOGIN_FAILED_ATTEMPTS} lần!`
            );
            return;
          }
        }
      } catch {
        // Fallback to Web Crypto TOTP verification if API fetch fails
        isVerified = await verifyTotpToken(otpCode, totpConfig.secret, 1, 30);
      }

      if (!isVerified) {
        await recordFailedLoginAttempt('Nhập sai Mã OTP 2FA Admin');
        const nextCount = failedAttempts + 1;
        const remain = Math.max(0, MAX_LOGIN_FAILED_ATTEMPTS - nextCount);
        setOtpLoginError(
          remain > 0
            ? `Mã OTP không chính xác! Bạn đã sai ${nextCount}/${MAX_LOGIN_FAILED_ATTEMPTS} lần (Còn ${remain} lần thử).`
            : `Thiết bị đã bị khóa do nhập sai mã OTP quá ${MAX_LOGIN_FAILED_ATTEMPTS} lần!`
        );
        showToast('error', 'Xác thực 2FA thất bại', 'Mã OTP 6 số không đúng hoặc đã hết hạn.');
        return;
      }

      // Reset failed attempts upon valid Admin OTP verification
      const net = networkInfo || (await fetchClientNetworkInfo());
      setFailedAttempts(0);
      setIsDeviceLocked(false);
      setDeviceLockedAt(null);
      setLocalDeviceLockState({ failedAttempts: 0, locked: false, lockedAt: null });
      await setDoc(doc(db, 'locked_devices', net.deviceId), {
        deviceId: net.deviceId,
        ipWifi: net.ipWifi,
        deviceIp: net.deviceIp,
        networkAddress: net.networkAddress,
        userAgent: net.userAgent,
        failedAttempts: 0,
        locked: false,
        lockedAt: '',
        reason: 'Cleared by valid Admin OTP',
      }).catch(() => {});

      // Build or load Super Admin profile
      const adminOtpUid = 'admin_otp_super';
      let otpAdminProfile: UserProfile = {
        uid: adminOtpUid,
        email: ADMIN_EMAIL,
        displayName: 'Admin Toàn Quyền (2FA OTP)',
        photoURL: '',
        role: 'super_admin',
        status: 'approved',
        canViewRawCode: true,
        permissions: { ...FULL_USER_PERMISSIONS },
        ipWifi: net.ipWifi,
        deviceIp: net.deviceIp,
        networkAddress: net.networkAddress,
        deviceId: net.deviceId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      try {
        const existingRef = doc(db, 'users', adminOtpUid);
        const existingSnap = await getDoc(existingRef);
        if (existingSnap.exists()) {
          const existingData = existingSnap.data() as UserProfile;
          otpAdminProfile = {
            ...existingData,
            uid: adminOtpUid,
            email: ADMIN_EMAIL,
            role: 'super_admin',
            status: 'approved',
            canViewRawCode: true,
            permissions: { ...FULL_USER_PERMISSIONS },
            updatedAt: new Date().toISOString(),
          };
        } else {
          await setDoc(existingRef, otpAdminProfile);
        }
      } catch {
        // Continue with in-memory Super Admin profile if Firestore read fails
      }

      localStorage.setItem('his_admin_otp_session', JSON.stringify(otpAdminProfile));
      setCurrentUser(otpAdminProfile);
      showToast(
        'success',
        'Đăng nhập Admin (2FA OTP) thành công',
        'Đã kích hoạt phiên Super Admin (Toàn quyền hệ thống).'
      );
    } finally {
      setOtpLoginLoading(false);
    }
  };

  const handleSaveTotpConfig = async (newTotpCfg: AdminTotpConfig) => {
    try {
      await setDoc(doc(db, 'settings', 'admin_totp'), newTotpCfg);
      await fetch('/api/auth/totp/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTotpCfg),
      }).catch(() => {});
      setTotpConfig(newTotpCfg);
      showToast(
        'success',
        'Đã lưu cấu hình 2FA Authenticator',
        'Khóa bảo mật OTP Admin đã được đồng bộ lên hệ thống.'
      );
    } catch (err) {
      console.error('Save TOTP config error:', err);
      showToast('error', 'Lỗi lưu cấu hình 2FA', 'Không thể cập nhật cấu hình 2FA lên hệ thống.');
    }
  };

  const handleRefreshStatus = async () => {
    if (!auth.currentUser) return;
    setIsCheckingStatus(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const profile = userSnap.data() as UserProfile;
        setCurrentUser(profile);
        if (profile.status === 'approved') {
          showToast('success', 'Tài khoản đã được duyệt!', 'Bạn có thể bắt đầu sử dụng hệ thống.');
        } else {
          showToast('info', 'Trạng thái hiện tại', 'Tài khoản vẫn đang chờ Super Admin duyệt.');
        }
      }
    } catch (err) {
      showToast('error', 'Lỗi kiểm tra', 'Không thể kết nối máy chủ.');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  // User Location & Ward Setup Handler (Enforces 1-time setup lock unless Admin grants canChangeWard)
  const handleSaveUserLocation = async (selection: UserLocationSelection) => {
    if (!currentUser) return;
    if (!canUserSetupOrChangeWard(currentUser)) {
      showToast(
        'warning',
        'Đã vô hiệu hóa thay đổi Xã/Phường',
        'Bạn chỉ được thiết lập Xã/Phường 1 lần duy nhất. Vui lòng liên hệ Admin phân quyền để thay đổi.'
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const isSuper = isSuperAdminUser(currentUser);
    const currentPerms = getEffectivePermissions(currentUser);

    // After saving location once, automatically lock `canChangeWard` to false for non-super-admins
    // so they cannot change it again unless Admin re-enables `canChangeWard`
    const nextPermissions: UserPermissions = {
      ...currentPerms,
      canChangeWard: isSuper ? true : false,
    };

    const locationPayload: Record<string, any> = {
      provinceCode: selection.provinceCode,
      provinceName: selection.provinceName,
      wardCode: selection.wardCode,
      wardName: selection.wardName,
      wardSetupCount: (currentUser.wardSetupCount || 0) + 1,
      permissions: nextPermissions,
      locationUpdatedAt: nowIso,
      updatedAt: nowIso,
    };
    if (typeof selection.latitude === 'number') {
      locationPayload.latitude = selection.latitude;
    }
    if (typeof selection.longitude === 'number') {
      locationPayload.longitude = selection.longitude;
    }

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, locationPayload);
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              ...locationPayload,
            }
          : null
      );
      showToast(
        'success',
        'Đã lưu Xã/Phường (Đã khóa sau 1 lần setup)',
        `Đã áp dụng "${selection.wardName}" vào Code Tiếp nhận BHYT. Chức năng đổi Xã/Phường đã được khóa.`
      );
    } catch (err) {
      console.error('Save user location error:', err);
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              ...locationPayload,
            }
          : null
      );
      showToast(
        'info',
        'Đã áp dụng Xã/Phường trên phiên hiện tại',
        `Đang áp dụng: ${selection.wardName}, ${selection.provinceName}.`
      );
    }
  };

  const handleRequestOpenLocationModal = () => {
    if (!canUserSetupOrChangeWard(currentUser)) {
      showToast(
        'warning',
        'Chỉ được setup Xã/Phường 1 lần duy nhất',
        'Chức năng thay đổi Xã/Phường đã bị vô hiệu hóa sau lần setup đầu tiên. Chỉ thay đổi được khi Admin phân quyền.'
      );
    }
    setIsLocationModalOpen(true);
  };

  const handleSelectTab = (targetTab: ActiveTabType) => {
    const perms = getEffectivePermissions(currentUser);
    const allowed =
      (targetTab === 'reception' && perms.tabReception) ||
      (targetTab === 'ksk' && perms.tabKsk) ||
      (targetTab === 'configs' && perms.tabConfigs) ||
      (targetTab === 'users' && perms.tabUsers);

    if (!allowed) {
      showToast(
        'warning',
        'Chưa được Admin phân quyền',
        'Tài khoản của bạn chưa được cấp quyền truy cập vào Tab này.'
      );
      return;
    }
    setActiveTab(targetTab);
  };

  // Super Admin User Management Handlers
  const handleApproveUser = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'approved',
        approvedAt: new Date().toISOString(),
        approvedBy: currentUser?.email || ADMIN_EMAIL,
        updatedAt: new Date().toISOString(),
      });
      showToast('success', 'Đã duyệt người dùng', 'Tài khoản đã có thể truy cập hệ thống.');
    } catch (err) {
      showToast('error', 'Lỗi phê duyệt', 'Không thể cập nhật trạng thái người dùng.');
    }
  };

  const handleRejectUser = async (userId: string) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        status: 'rejected',
        updatedAt: new Date().toISOString(),
      });
      showToast('warning', 'Đã khóa tài khoản', 'Tài khoản này sẽ không thể truy cập hệ thống.');
    } catch (err) {
      showToast('error', 'Lỗi cập nhật', 'Không thể khóa tài khoản.');
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: new Date().toISOString(),
      });
      const roleName =
        newRole === 'super_admin'
          ? 'Super Admin (Toàn quyền)'
          : newRole === 'admin'
          ? 'Admin (Chỉ Nghiệp Vụ Lâm Sàng)'
          : 'User';
      showToast('success', 'Đã cập nhật vai trò', `Vai trò mới: ${roleName}`);
    } catch (err) {
      showToast('error', 'Lỗi phân quyền', 'Không thể thay đổi vai trò người dùng.');
    }
  };

  const handleToggleRawCodePermission = async (user: UserProfile) => {
    const nextVal = !user.canViewRawCode;
    const currentPerms = getEffectivePermissions(user);
    const updatedPerms: UserPermissions = {
      ...currentPerms,
      receptionTab2_Raw: nextVal,
      receptionTab4_WardRaw: nextVal,
      kskViewRaw: nextVal,
    };
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        canViewRawCode: nextVal,
        permissions: updatedPerms,
        updatedAt: new Date().toISOString(),
      });
      showToast(
        'success',
        nextVal ? 'Đã cấp quyền Xem Mã Gốc' : 'Đã thu hồi quyền Xem Mã Gốc',
        `Tài khoản ${user.email} ${nextVal ? 'được phép xem mã gốc.' : 'chỉ xem bản mã hóa.'}`
      );
    } catch (err) {
      showToast('error', 'Lỗi phân quyền', 'Không thể cập nhật quyền xem mã gốc.');
    }
  };

  const handleUpdateUserPermissions = async (
    userId: string,
    newPermissions: UserPermissions
  ) => {
    const hasAnyRaw = Boolean(
      newPermissions.receptionTab2_Raw ||
        newPermissions.receptionTab4_WardRaw ||
        newPermissions.kskViewRaw
    );
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        permissions: newPermissions,
        canViewRawCode: hasAnyRaw,
        updatedAt: new Date().toISOString(),
      });
      showToast(
        'success',
        'Đã lưu phân quyền tài khoản',
        'Các thiết lập phân quyền chi tiết đã được áp dụng ngay lập tức.'
      );
    } catch (err) {
      console.error('Update permissions error:', err);
      showToast('error', 'Lỗi lưu phân quyền', 'Không thể cập nhật phân quyền lên hệ thống.');
    }
  };

  const handleToggleUserDeviceLock = async (user: UserProfile) => {
    const currentlyLocked = Boolean(user.deviceLocked || (user.failedLoginAttempts || 0) >= 5);
    const nextLocked = !currentlyLocked;
    const nowIso = new Date().toISOString();

    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        deviceLocked: nextLocked,
        failedLoginAttempts: nextLocked ? 5 : 0,
        deviceLockedAt: nextLocked ? nowIso : '',
        updatedAt: nowIso,
      });

      if (user.deviceId) {
        await setDoc(doc(db, 'locked_devices', user.deviceId), {
          deviceId: user.deviceId,
          ipWifi: user.ipWifi || '',
          deviceIp: user.deviceIp || user.deviceId,
          networkAddress: user.networkAddress || '',
          userAgent: '',
          failedAttempts: nextLocked ? 5 : 0,
          locked: nextLocked,
          lockedAt: nextLocked ? nowIso : '',
          reason: nextLocked ? 'Khóa thiết bị bởi Admin' : 'Mở khóa bởi Admin',
          targetEmail: user.email,
        });
      }

      showToast(
        nextLocked ? 'warning' : 'success',
        nextLocked ? 'Đã khóa thiết bị người dùng' : 'Đã mở khóa thiết bị',
        nextLocked
          ? `Thiết bị của ${user.email} (${user.ipWifi || 'IP'}) đã bị cấm truy cập.`
          : `Thiết bị của ${user.email} đã được mở khóa và reset số lần sai về 0.`
      );
    } catch (err) {
      console.error('Toggle user device lock error:', err);
      showToast('error', 'Lỗi thao tác thiết bị', 'Không thể cập nhật trạng thái khóa thiết bị.');
    }
  };

  const handleUnlockBannedDevice = async (deviceId: string) => {
    try {
      await setDoc(
        doc(db, 'locked_devices', deviceId),
        {
          deviceId,
          failedAttempts: 0,
          locked: false,
          lockedAt: '',
          reason: 'Unlocked by Admin',
        },
        { merge: true }
      );

      // Also unlock any user associated with this deviceId
      const matchingUsers = usersList.filter((u) => u.deviceId === deviceId);
      for (const u of matchingUsers) {
        await updateDoc(doc(db, 'users', u.uid), {
          deviceLocked: false,
          failedLoginAttempts: 0,
          deviceLockedAt: '',
          updatedAt: new Date().toISOString(),
        }).catch(() => {});
      }

      showToast(
        'success',
        'Đã mở khóa thiết bị',
        `Thiết bị ${deviceId} đã được mở khóa và reset bộ đếm nhập sai về 0.`
      );
    } catch (err) {
      console.error('Unlock banned device error:', err);
      showToast('error', 'Lỗi mở khóa', 'Không thể mở khóa thiết bị.');
    }
  };

  const handleRefreshUsers = async () => {
    setUsersLoading(true);
    try {
      const usersRef = collection(db, 'users');
      onSnapshot(usersRef, (snap) => {
        const loaded: UserProfile[] = [];
        snap.forEach((docSnap) => loaded.push(docSnap.data() as UserProfile));
        setUsersList(loaded);
        setUsersLoading(false);
      });
      showToast('info', 'Đã làm mới', 'Danh sách người dùng đã được cập nhật.');
    } catch {
      setUsersLoading(false);
    }
  };

  // Super Admin Config Management Handlers
  const handleSaveConfig = async (cfg: AppConfiguration) => {
    try {
      await setDoc(doc(db, 'configurations', cfg.id), {
        ...cfg,
        updatedAt: new Date().toISOString(),
      });
      showToast('success', 'Đã lưu cấu hình', `Cấu hình "${cfg.name}" đã được cập nhật.`);
    } catch (err) {
      showToast('error', 'Lỗi lưu cấu hình', 'Không thể lưu dữ liệu cấu hình lên Firebase.');
    }
  };

  const handleDeleteConfig = async (configId: string) => {
    try {
      await deleteDoc(doc(db, 'configurations', configId));
      showToast('info', 'Đã xóa cấu hình', 'Cấu hình đã được xóa khỏi hệ thống.');
    } catch (err) {
      showToast('error', 'Lỗi xóa cấu hình', 'Không thể xóa cấu hình.');
    }
  };

  const handleSetDefaultConfig = async (configId: string) => {
    try {
      for (const cfg of configs) {
        const userRef = doc(db, 'configurations', cfg.id);
        await updateDoc(userRef, { isDefault: cfg.id === configId });
      }
      showToast('success', 'Cấu hình mặc định', 'Đã thiết lập cấu hình mặc định cho hệ thống.');
    } catch (err) {
      showToast('error', 'Lỗi thiết lập', 'Không thể cập nhật cấu hình mặc định.');
    }
  };

  // Loading Screen
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-slate-600">Đang khởi tạo HIS Automation Suite...</span>
        </div>
      </div>
    );
  }

  // Not Logged In (or Non-Admin Device is Locked)
  if (!currentUser || (!isSuperAdminUser(currentUser) && (isDeviceLocked || currentUser.deviceLocked))) {
    return (
      <LoginView
        onLoginWithGoogle={handleGoogleLogin}
        onLoginWithOtp={handleOtpLogin}
        totpEnabled={totpConfig.enabled}
        isLoading={loginLoading}
        isOtpLoading={otpLoginLoading}
        error={loginError}
        otpError={otpLoginError}
        networkInfo={networkInfo}
        failedAttempts={Math.max(failedAttempts, currentUser?.failedLoginAttempts || 0)}
        isDeviceLocked={Boolean(isDeviceLocked || currentUser?.deviceLocked)}
        deviceLockedAt={deviceLockedAt || currentUser?.deviceLockedAt}
      />
    );
  }

  const isSuperAdmin = isSuperAdminUser(currentUser);
  const currentPerms = getEffectivePermissions(currentUser);
  const canViewRawCode = Boolean(
    isSuperAdmin ||
      currentUser.canViewRawCode ||
      currentPerms.receptionTab2_Raw ||
      currentPerms.receptionTab4_WardRaw ||
      currentPerms.kskViewRaw
  );
  const canEditWard = canUserSetupOrChangeWard(currentUser);

  // Logged In But Pending / Rejected
  if (currentUser.status !== 'approved' && !isSuperAdmin && currentUser.role !== 'admin') {
    return (
      <PendingApprovalView
        userProfile={currentUser}
        onRefresh={handleRefreshStatus}
        onLogout={handleLogout}
        isChecking={isCheckingStatus}
      />
    );
  }

  const pendingUsersCount = usersList.filter((u) => u.status === 'pending').length;

  return (
    <div className="min-h-screen bg-slate-50/90 text-slate-800 flex flex-col lg:flex-row selection:bg-blue-600 selection:text-white font-sans antialiased">
      {/* Location & Province/Ward Setup Modal */}
      <LocationSetupModal
        isOpen={isLocationModalOpen}
        initialProvinceCode={currentUser.provinceCode}
        initialWardCode={currentUser.wardCode}
        isFirstTimeSetup={!currentUser.provinceCode || !currentUser.wardCode}
        canEditLocation={canEditWard}
        onSaveLocation={handleSaveUserLocation}
        onClose={() => setIsLocationModalOpen(false)}
      />

      {/* Toast Notification Stack */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`p-4 rounded-2xl border shadow-lg backdrop-blur-md pointer-events-auto flex items-start gap-3 transition-all animate-in slide-in-from-bottom-3 duration-200 ${
              toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900'
                : toast.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-900'
                : toast.type === 'warning'
                ? 'bg-amber-50/95 border-amber-200 text-amber-900'
                : 'bg-blue-50/95 border-blue-200 text-blue-900'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
            {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />}

            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-bold leading-tight">{toast.title}</h4>
              <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">{toast.message}</p>
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Sidetab / Sidebar Navigation */}
      <Sidebar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={handleSelectTab}
        activeConfig={activeConfig}
        allConfigs={configs}
        onSelectConfig={(cfg) => {
          setActiveConfig(cfg);
          showToast('info', 'Đã chuyển cấu hình', `Đang áp dụng: ${cfg.name}`);
        }}
        onLogout={handleLogout}
        onOpenLocationSetup={handleRequestOpenLocationModal}
        pendingUsersCount={pendingUsersCount}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Container (Padded left on Desktop for Sidebar) */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 transition-all duration-200 bg-slate-100/70 min-h-screen">
        {/* Top Header */}
        <Header
          activeTab={activeTab}
          activeConfig={activeConfig}
          currentUser={currentUser}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenLocationSetup={handleRequestOpenLocationModal}
        />

        {/* Page Content Body */}
        <main className="flex-1 p-2.5 sm:p-3.5 w-full flex flex-col min-w-0">
          {!currentPerms.tabReception &&
            !currentPerms.tabKsk &&
            !currentPerms.tabConfigs &&
            !currentPerms.tabUsers && (
              <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                  <Lock className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Tài khoản chưa được cấp quyền truy cập Tab
                </h3>
                <p className="text-xs text-slate-500 max-w-md">
                  Vui lòng liên hệ Quản trị viên (Admin / Super Admin) để được phân quyền truy cập các chức năng nghiệp vụ.
                </p>
              </div>
            )}

          {activeTab === 'reception' && currentPerms.tabReception && (
            <ReceptionTab
              config={activeConfig.receptionConfig}
              currentUser={currentUser}
              canViewRawCode={canViewRawCode}
              isAdmin={isSuperAdmin}
              onOpenLocationSetup={handleRequestOpenLocationModal}
              showToast={showToast}
            />
          )}

          {activeTab === 'ksk' && currentPerms.tabKsk && (
            <KskTab
              config={activeConfig.kskConfig}
              currentUser={currentUser}
              configId={activeConfig.id}
              configName={activeConfig.name}
              canViewRawCode={canViewRawCode}
              isAdmin={isSuperAdmin}
              showToast={showToast}
            />
          )}

          {activeTab === 'configs' && currentPerms.tabConfigs && (
            <ConfigManagementView
              configs={configs}
              activeConfigId={activeConfig.id}
              onSelectConfig={(cfg) => {
                setActiveConfig(cfg);
                showToast('info', 'Đã chọn cấu hình', `Áp dụng: ${cfg.name}`);
              }}
              onSaveConfig={handleSaveConfig}
              onDeleteConfig={handleDeleteConfig}
              onSetDefaultConfig={handleSetDefaultConfig}
              isSuperAdmin={isSuperAdmin}
              totpConfig={totpConfig}
              onSaveTotpConfig={handleSaveTotpConfig}
              showToast={showToast}
              isLoading={false}
            />
          )}

          {activeTab === 'users' && currentPerms.tabUsers && (
            <UserManagementView
              users={usersList}
              currentAdminEmail={currentUser.email}
              onApproveUser={handleApproveUser}
              onRejectUser={handleRejectUser}
              onChangeRole={handleChangeRole}
              onToggleRawCodePermission={handleToggleRawCodePermission}
              onUpdateUserPermissions={handleUpdateUserPermissions}
              onToggleUserDeviceLock={handleToggleUserDeviceLock}
              lockedDevices={lockedDevices}
              onUnlockBannedDevice={handleUnlockBannedDevice}
              onRefreshUsers={handleRefreshUsers}
              isLoading={usersLoading}
            />
          )}
        </main>

        {/* Compact Footer */}
        <footer className="border-t border-slate-200/80 bg-white/90 py-2 px-3 sm:px-4 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <div>
            <strong>HIS Automation Suite</strong> · Tự động hóa Tiếp nhận & KSK
          </div>
          <div className="flex items-center gap-3 font-mono">
            <span>
              Xã/Phường:{' '}
              <strong className="text-emerald-700 font-sans">
                {currentUser.wardName
                  ? `${currentUser.wardName}, ${currentUser.provinceName}`
                  : 'Phường Hiệp Thành (Mặc định)'}
              </strong>
            </span>
            <span>
              Cấu hình: <strong className="text-blue-700 font-sans">{activeConfig.name}</strong>
            </span>
            <span>
              JS: <strong className="text-slate-700">{JS_UPDATED_DATE}</strong>
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
