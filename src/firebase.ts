import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const db = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const ADMIN_EMAIL = 'sonlyhongduc@gmail.com';
export const JS_UPDATED_DATE = '28/09/2026';

export type UserRole = 'super_admin' | 'admin' | 'user';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export interface UserPermissions {
  // 1. Truy cập Tab
  tabReception: boolean;
  tabKsk: boolean;
  tabConfigs: boolean;
  tabUsers: boolean;

  // 2. Danh Sách Bệnh Nhân Tiếp Nhận: Nhập / Xuất Excel
  receptionImportExcel: boolean;
  receptionExportExcel: boolean;

  // 3. Script Tiếp nhận BHYT (v3.8): Phân quyền 4 tab
  receptionTab1_Obfuscated: boolean;
  receptionTab2_Raw: boolean;
  receptionTab3_WardObfuscated: boolean;
  receptionTab4_WardRaw: boolean;

  // 4. Thay đổi Xã/Phường (Mặc định chỉ setup 1 lần duy nhất, sau đó vô hiệu hóa; bật quyền này để cho phép đổi lại)
  canChangeWard: boolean;

  // 5. Hệ Thống API Khám Bệnh & Thông Số Khám Đồng Bộ Vào API
  kskApiSystem: boolean;
  kskSyncParams: boolean;

  // 6. Giữ Mã hóa, và Mã gốc Khám bệnh cũ (User chỉ xem được khi Admin phân quyền)
  kskViewObfuscated: boolean;
  kskViewRaw: boolean;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  status: 'approved' | 'pending' | 'rejected';
  canViewRawCode?: boolean; // Quyền xem mã nguồn gốc không mã hóa
  permissions?: Partial<UserPermissions>;
  wardSetupCount?: number;
  provinceCode?: string;
  provinceName?: string;
  wardCode?: string;
  wardName?: string;
  latitude?: number;
  longitude?: number;
  locationUpdatedAt?: string;
  ipWifi?: string;
  networkAddress?: string;
  deviceIp?: string;
  deviceId?: string;
  failedLoginAttempts?: number;
  deviceLocked?: boolean;
  deviceLockedAt?: string;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
  requestedAt?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export function isSuperAdminUser(user?: UserProfile | null): boolean {
  if (!user) return false;
  return user.role === 'super_admin' || user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export const FULL_USER_PERMISSIONS: UserPermissions = {
  tabReception: true,
  tabKsk: true,
  tabConfigs: true,
  tabUsers: true,
  receptionImportExcel: true,
  receptionExportExcel: true,
  receptionTab1_Obfuscated: true,
  receptionTab2_Raw: true,
  receptionTab3_WardObfuscated: true,
  receptionTab4_WardRaw: true,
  canChangeWard: true,
  kskApiSystem: true,
  kskSyncParams: true,
  kskViewObfuscated: true,
  kskViewRaw: true,
};

export const DEFAULT_USER_PERMISSIONS: UserPermissions = {
  tabReception: true,
  tabKsk: true,
  tabConfigs: false,
  tabUsers: false,
  receptionImportExcel: true,
  receptionExportExcel: true,
  receptionTab1_Obfuscated: true,
  receptionTab2_Raw: false,
  receptionTab3_WardObfuscated: true,
  receptionTab4_WardRaw: false,
  canChangeWard: false,
  kskApiSystem: true,
  kskSyncParams: true,
  kskViewObfuscated: false,
  kskViewRaw: false,
};

export function getEffectivePermissions(user?: UserProfile | null): UserPermissions {
  if (!user) {
    return {
      tabReception: false,
      tabKsk: false,
      tabConfigs: false,
      tabUsers: false,
      receptionImportExcel: false,
      receptionExportExcel: false,
      receptionTab1_Obfuscated: false,
      receptionTab2_Raw: false,
      receptionTab3_WardObfuscated: false,
      receptionTab4_WardRaw: false,
      canChangeWard: false,
      kskApiSystem: false,
      kskSyncParams: false,
      kskViewObfuscated: false,
      kskViewRaw: false,
    };
  }

  if (isSuperAdminUser(user)) {
    return { ...FULL_USER_PERMISSIONS };
  }

  const legacyRaw = Boolean(user.canViewRawCode);
  const p = user.permissions || {};

  return {
    tabReception: p.tabReception ?? true,
    tabKsk: p.tabKsk ?? true,
    tabConfigs: p.tabConfigs ?? false,
    tabUsers: p.tabUsers ?? false,

    receptionImportExcel: p.receptionImportExcel ?? true,
    receptionExportExcel: p.receptionExportExcel ?? true,

    receptionTab1_Obfuscated: p.receptionTab1_Obfuscated ?? true,
    receptionTab2_Raw: p.receptionTab2_Raw ?? legacyRaw,
    receptionTab3_WardObfuscated: p.receptionTab3_WardObfuscated ?? true,
    receptionTab4_WardRaw: p.receptionTab4_WardRaw ?? legacyRaw,

    canChangeWard: p.canChangeWard ?? false,

    kskApiSystem: p.kskApiSystem ?? true,
    kskSyncParams: p.kskSyncParams ?? true,

    kskViewObfuscated: p.kskViewObfuscated ?? false,
    kskViewRaw: p.kskViewRaw ?? legacyRaw,
  };
}

/**
 * Checks if a user can setup or change their Province / Ward:
 * - Super Admin: Always allowed
 * - First time setup (!user.wardCode || !user.provinceCode): Allowed 1 time
 * - Already setup once: Disabled unless Admin granted `permissions.canChangeWard`
 */
export function canUserSetupOrChangeWard(user?: UserProfile | null): boolean {
  if (!user) return false;
  if (isSuperAdminUser(user)) return true;
  const hasSetupOnce = Boolean(user.wardCode && user.provinceCode);
  if (!hasSetupOnce) return true;
  const perms = getEffectivePermissions(user);
  return Boolean(perms.canChangeWard);
}

export interface ReceptionConfigData {
  defaultIcd: string;
  defaultReason: string;
  targetWardText: string;
  validCccdLength: number;
  maxBhytRetries: number;
  retryInterval: number;
  pauseBetweenSteps: number;
  pauseBetweenCases: number;
  waitPopupAfterSave: number;
}

// 2.1 Cấu hình khám trẻ em & học sinh 6 - 18 tuổi (Sắp ra mắt)
export interface KskChildConfigData {
  ageGroup: string; // '6-18'
  isComingSoon: boolean;
  chieuCaoMin: number;
  chieuCaoMax: number;
  canNangMin: number;
  canNangMax: number;
  thiLucMatPhai: string;
  thiLucMatTrai: string;
  phanLoaiDinhDuong: string;
  ketLuanHocDuong: string;
  congVeoCotsong: string;
  rangHamMat: string;
}

// 2.2 Cấu hình khám người lớn từ 18 tuổi trở lên (Hiện tại đang triển khai)
export interface KskConfigData {
  chieuCaoMin: number;
  chieuCaoMax: number;
  canNangMin: number;
  canNangMax: number;
  haCao: string;
  haThap: string;
  mach: string;
  phanLoaiTheLuc: string;
  lamSang: string;
  ketLuanTinhTrang: string;
  phanLoaiKetLuan: string;
  maxCases: number;
  presetName?: string;
}

export interface AppConfiguration {
  id: string;
  name: string;
  description: string;
  isDefault?: boolean;
  // 1. Cấu hình Tiếp nhận
  receptionConfig: ReceptionConfigData;
  // 2. Cấu hình Khám bệnh (2.2 Đang triển khai & 2.1 Sắp ra mắt)
  kskConfig: KskConfigData;
  kskChildConfig?: KskChildConfigData;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_RECEPTION_CONFIG: ReceptionConfigData = {
  defaultIcd: 'Z00.0',
  defaultReason: 'ksk',
  targetWardText: 'Phường Hiệp Thành',
  validCccdLength: 12,
  maxBhytRetries: 3,
  retryInterval: 1500,
  pauseBetweenSteps: 400,
  pauseBetweenCases: 2500,
  waitPopupAfterSave: 2000,
};

export const DEFAULT_KSK_CHILD_CONFIG: KskChildConfigData = {
  ageGroup: '6-18',
  isComingSoon: true,
  chieuCaoMin: 120,
  chieuCaoMax: 165,
  canNangMin: 25,
  canNangMax: 55,
  thiLucMatPhai: '10/10',
  thiLucMatTrai: '10/10',
  phanLoaiDinhDuong: 'Bình thường (BMI theo tuổi)',
  ketLuanHocDuong: 'Đủ điều kiện sức khỏe học tập và tham gia các hoạt động thể chất trường học.',
  congVeoCotsong: 'Không gù vẹo',
  rangHamMat: 'Không sâu răng, khớp cắn chuẩn',
};

export const DEFAULT_KSK_CONFIG: KskConfigData = {
  chieuCaoMin: 160,
  chieuCaoMax: 170,
  canNangMin: 50,
  canNangMax: 70,
  haCao: '120',
  haThap: '80',
  mach: '78',
  phanLoaiTheLuc: 'Loại I',
  lamSang: 'Bình thường',
  ketLuanTinhTrang: 'Hiện tại chưa phát hiện bệnh lý bất thường. Đủ điều kiện sức khỏe làm việc.',
  phanLoaiKetLuan: 'Loại I',
  maxCases: 1000,
  presetName: 'Khám sức khỏe toàn dân',
};

export const INITIAL_PRESET_CONFIGS: AppConfiguration[] = [
  {
    id: 'preset_tt32_standard',
    name: 'Khám sức khỏe toàn dân',
    description: 'Cấu hình chuẩn theo Thông tư 32/2023/TT-BYT đối tượng đủ 18 tuổi. Sinh hiệu chuẩn, kết luận đủ điều kiện làm việc Loại I.',
    isDefault: true,
    receptionConfig: { ...DEFAULT_RECEPTION_CONFIG },
    kskConfig: { ...DEFAULT_KSK_CONFIG },
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'preset_driver_license',
    name: 'Khám Sức Khỏe Lái Xe (Hạng B2/C/D/E)',
    description: 'Cấu hình chuyên biệt cho hồ sơ thi & đổi bằng lái xe. Thể lực chuẩn, phân loại đủ điều kiện lái xe cơ giới.',
    isDefault: false,
    receptionConfig: {
      ...DEFAULT_RECEPTION_CONFIG,
      defaultReason: 'khám lái xe',
    },
    kskConfig: {
      ...DEFAULT_KSK_CONFIG,
      chieuCaoMin: 162,
      chieuCaoMax: 175,
      canNangMin: 52,
      canNangMax: 72,
      ketLuanTinhTrang: 'Đủ điều kiện sức khỏe lái xe cơ giới theo quy định hiện hành.',
      presetName: 'Khám Sức Khỏe Lái Xe (Hạng B2/C/D/E)',
    },
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'preset_periodic_corporate',
    name: 'Khám Sức Khỏe Định Kỳ Doanh Nghiệp',
    description: 'Cấu hình xử lý khối lượng lớn cho các công ty, xí nghiệp, KCN. Tiếp nhận và khám nhanh đồng loạt.',
    isDefault: false,
    receptionConfig: {
      ...DEFAULT_RECEPTION_CONFIG,
      defaultReason: 'ksk định kỳ công ty',
    },
    kskConfig: {
      ...DEFAULT_KSK_CONFIG,
      ketLuanTinhTrang: 'Hiện tại chưa phát hiện bệnh lý nghề nghiệp hoặc bất thường. Sức khỏe Loại I.',
      presetName: 'Khám Sức Khỏe Định Kỳ Doanh Nghiệp',
    },
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'preset_student_admission',
    name: 'Khám Sức Khỏe Nhập Học Học Sinh / Sinh Viên',
    description: 'Dành cho đối tượng tân sinh viên, học sinh các trường đại học, cao đẳng, trung cấp.',
    isDefault: false,
    receptionConfig: {
      ...DEFAULT_RECEPTION_CONFIG,
      defaultReason: 'khám nhập học',
    },
    kskConfig: {
      ...DEFAULT_KSK_CONFIG,
      chieuCaoMin: 155,
      chieuCaoMax: 172,
      canNangMin: 46,
      canNangMax: 68,
      ketLuanTinhTrang: 'Đủ sức khỏe học tập và rèn luyện tại cơ sở đào tạo.',
      presetName: 'Khám Sức Khỏe Nhập Học Học Sinh / Sinh Viên',
    },
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
];
