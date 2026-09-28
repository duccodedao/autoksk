import React, { useState, useRef, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  Download,
  Copy,
  Check,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Search,
  Users,
  Code2,
  X,
  Plus,
  Lock,
  Eye,
  FileDown,
  FileSpreadsheet,
  MapPin,
} from 'lucide-react';
import {
  ReceptionConfigData,
  UserProfile,
  JS_UPDATED_DATE,
  getEffectivePermissions,
  canUserSetupOrChangeWard,
} from '../firebase';
import { obfuscateScript } from '../utils/obfuscate';

export interface PatientRecord {
  id: string;
  hoTen: string;
  cccd: string;
  ngaySinh: string;
  status: 'valid' | 'invalid_cccd' | 'invalid_dob' | 'missing_name' | 'missing_cccd' | 'missing_dob';
  statusMessage: string;
}

export type ReceptionScriptMode =
  | 'default_obfuscated'
  | 'default_raw'
  | 'ward_obfuscated'
  | 'ward_raw';

interface ReceptionTabProps {
  config: ReceptionConfigData;
  currentUser: UserProfile;
  isAdmin?: boolean;
  canViewRawCode?: boolean;
  onOpenLocationSetup: () => void;
  showToast: (type: 'success' | 'error' | 'warning' | 'info', title: string, message: string) => void;
}

export function buildReceptionScript(
  patients: PatientRecord[],
  cfg: ReceptionConfigData,
  customWardName?: string
): string {
  const queueJson = JSON.stringify(
    patients.map((p) => ({
      hoTen: (p.hoTen || '').trim().toUpperCase(),
      cccd: (p.cccd || '').trim(),
      ngaySinh: (p.ngaySinh || '').trim(),
    })),
    null,
    8
  );

  const targetWardText = customWardName ? customWardName : cfg.targetWardText || 'Phường Hiệp Thành';

  return `/**
 * ============================================================================
 * PHÂN HỆ TỰ ĐỘNG HÓA TIẾP NHẬN BỆNH NHÂN KSK & XUẤT BÁO CÁO EXCEL
 * HIS ADMISSION & AUTOMATIC EXCEL REPORTING ENGINE (v3.8)
 * ----------------------------------------------------------------------------
 * ĐẶC TÍNH KỸ THUẬT:
 * 1. Tự phát hiện & Đóng Pop-up sau khi Lưu hồ sơ (Post-Save Popup Sentinel).
 * 2. Chọn duy nhất Option "${targetWardText}" tại mục Địa chỉ (CV30) (#maxa_cu_tru)
 *    và đồng bộ giao diện Select2; KHÔNG can thiệp/chỉnh sửa ô #diachi.
 * 3. Tra cứu BHYT 3x Retry: Tự động Enter ngày sinh tối đa 3 lần thử.
 * 4. Bỏ qua ca không BHYT: Chỉ Lưu ca tra cứu thành công BHYT.
 * 5. Tự động xuất Báo cáo Excel 2 Sheet ("Thành công" & "Thất bại") sau khi
 *    xử lý xong toàn bộ danh sách.
 * ============================================================================
 */
(async () => {
    "use strict";

    /* ================================================================
       1. CẤU HÌNH DỮ LIỆU & THỜI GIAN VẬN HÀNH (ENGINE CONFIG)
    ================================================================ */
    const AUTO_DATA = {
        DEFAULT_ICD: "${cfg.defaultIcd}",               // Mã ICD-10 mặc định
        DEFAULT_REASON: "${cfg.defaultReason}",              // Lý do vào viện
        TARGET_WARD_TEXT: "${targetWardText}", // Option chọn tại Địa chỉ (CV30)
        VALID_CCCD_LENGTH: ${cfg.validCccdLength},              // Số ký tự CCCD chuẩn
        MAX_BHYT_RETRIES: ${cfg.maxBhytRetries},                 // Số lần Enter tối đa thử tra cứu BHYT
        RETRY_INTERVAL: ${cfg.retryInterval}                // Thời gian chờ phản hồi BHYT (ms)
    };

    const CFG = {
        PAUSE_BETWEEN_STEPS: ${cfg.pauseBetweenSteps},           // Độ trễ an toàn giữa các thao tác DOM (ms)
        PAUSE_BETWEEN_CASES: ${cfg.pauseBetweenCases},          // Độ trễ chuyển giao giữa 2 ca tiếp nhận (ms)
        WAIT_POPUP_AFTER_SAVE: ${cfg.waitPopupAfterSave}         // Thời gian lắng nghe Pop-up sau khi Lưu (ms)
    };

    // Mảng lưu trữ kết quả đầu ra cho báo cáo Excel
    const REPORT_DATA = {
        success: [],
        failed: []
    };

    /* ================================================================
       2. HỆ THỐNG GHI LOG & TIỆN ÍCH HỆ THỐNG (SYSTEM UTILITIES)
    ================================================================ */
    const Logger = {
        info: (msg) => console.log(\`%c[HIS-ADMISSION] [INFO] \${msg}\`, "color:#0284c7;font-weight:600;"),
        success: (msg) => console.log(\`%c[HIS-ADMISSION] [SUCCESS] \${msg}\`, "color:#16a34a;font-weight:700;"),
        warn: (msg) => console.log(\`%c[HIS-ADMISSION] [WARNING] \${msg}\`, "color:#d97706;font-weight:600;"),
        error: (msg) => console.log(\`%c[HIS-ADMISSION] [ERROR] \${msg}\`, "color:#dc2626;font-weight:700;font-size:13px;"),
        step: (msg) => console.log(\`%c\\n>>> \${msg}\`, "color:#7c3aed;font-weight:bold;font-size:12px;background:#f5f3ff;padding:3px 6px;border-radius:4px;")
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const triggerEvents = (element) => {
        if (!element) return;
        ['input', 'change', 'blur'].forEach((eventType) => {
            element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
        });
    };

    /* ================================================================
       3. NẠP THƯ VIỆN EXCEL (SHEETJS) TỰ ĐỘNG
    ================================================================ */
    const loadXLSXLibrary = () => {
        return new Promise((resolve) => {
            if (window.XLSX) {
                resolve(window.XLSX);
                return;
            }
            Logger.info("Đang nạp thư viện xuất Excel SheetJS (CDN)...");
            const script = document.createElement("script");
            script.src = "https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js";
            script.onload = () => {
                Logger.success("Nạp thư viện Excel thành công!");
                resolve(window.XLSX);
            };
            script.onerror = () => {
                Logger.error("Không thể tải thư viện XLSX từ CDN.");
                resolve(null);
            };
            document.head.appendChild(script);
        });
    };

    /* ================================================================
       4. BỘ LẮNG NGHE & TỰ ĐỘNG ĐÓNG POP-UP SAU LƯU (POST-SAVE POPUP SENTINEL)
    ================================================================ */
    const handlePostSavePopups = async () => {
        Logger.info("Đang chủ động lắng nghe Pop-up thông báo / trùng lặp sau khi bấm Lưu...");
        const startTime = Date.now();
        let popupDismissed = false;

        while (Date.now() - startTime < CFG.WAIT_POPUP_AFTER_SAVE) {
            const popupConfirmBtn = document.querySelector(
                '.modal.in button.btn-primary, .modal.show button.btn-primary, .bootbox.modal.in button[data-bb-handler="confirm"], .bootbox.modal.in button[data-bb-handler="ok"], .swal2-confirm, #modal-alert .btn-primary'
            );

            if (popupConfirmBtn && popupConfirmBtn.offsetParent !== null) {
                Logger.info("Phát hiện Pop-up sau khi Lưu -> Tự động kích hoạt nút Xác nhận / Đồng ý...");
                popupConfirmBtn.click();
                popupDismissed = true;
                await sleep(500);
            }

            const genericCloseBtn = document.querySelector(
                '.modal.in button.close, .modal.show button.close, .bootbox.modal.in button.bootbox-close-button'
            );
            if (genericCloseBtn && genericCloseBtn.offsetParent !== null && !popupDismissed) {
                Logger.info("Phát hiện Dialog cảnh báo phụ -> Tự động đóng...");
                genericCloseBtn.click();
                await sleep(400);
            }

            await sleep(250);
        }

        if (popupDismissed) {
            Logger.success("Đã hoàn tất xử lý Pop-up sau Lưu.");
        }
    };

    /* ================================================================
       5. CHỌN DUY NHẤT OPTION "${targetWardText}" TẠI ĐỊA CHỈ CV30
    ================================================================ */
    const selectTargetWardOption = () => {
        const selectElem = document.querySelector("#maxa_cu_tru");
        if (!selectElem) {
            Logger.warn("Không tìm thấy thẻ chọn Địa chỉ (CV30) (#maxa_cu_tru).");
            return false;
        }

        let targetOption = Array.from(selectElem.options).find(
            (opt) => opt.text.trim().toLowerCase() === AUTO_DATA.TARGET_WARD_TEXT.toLowerCase()
        );

        if (!targetOption) {
            targetOption = Array.from(selectElem.options).find(
                (opt) => opt.text.trim().toLowerCase().includes(AUTO_DATA.TARGET_WARD_TEXT.toLowerCase())
            );
        }

        if (targetOption) {
            selectElem.value = targetOption.value;
            triggerEvents(selectElem);

            if (window.$ && $(selectElem).data('select2')) {
                $(selectElem).trigger('change.select2');
            }

            const select2Rendered = document.querySelector("#select2-maxa_cu_tru-container");
            if (select2Rendered) {
                select2Rendered.textContent = targetOption.text;
                select2Rendered.title = targetOption.text;
            }

            Logger.success(\`Đã chọn chính xác Option Địa chỉ (CV30): "\${targetOption.text}" (Value: \${targetOption.value})\`);
            return true;
        } else {
            Logger.warn(\`Không tìm thấy Option "\${AUTO_DATA.TARGET_WARD_TEXT}" trong danh sách Địa chỉ (CV30).\`);
            return false;
        }
    };

    /* ================================================================
       6. TRA CỨU BHYT CHUYÊN SÂU 3X RETRY (ENTER TRÊN Ô NGÀY SINH)
    ================================================================ */
    const executeInsuranceLookup = async (dobValue) => {
        const dobInput = document.querySelector("#ngay_sinh, #NAMSINH, input[name='ngay_sinh']");
        if (!dobInput) {
            Logger.error("Không tìm thấy trường Ngày sinh để kích hoạt tra cứu BHYT!");
            return false;
        }

        const bhytField = document.querySelector("#so_bhyt, #SO_BHYT, input[name='so_bhyt'], #mabhyt");

        for (let attempt = 1; attempt <= AUTO_DATA.MAX_BHYT_RETRIES; attempt++) {
            Logger.info(\`Tra cứu BHYT (Lần thử \${attempt}/\${AUTO_DATA.MAX_BHYT_RETRIES}): Gửi sự kiện ENTER vào ô Ngày sinh...\`);

            dobInput.focus();
            dobInput.value = dobValue;
            triggerEvents(dobInput);

            const enterKeyEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            dobInput.dispatchEvent(enterKeyEvent);

            const keyupEvent = new KeyboardEvent('keyup', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            dobInput.dispatchEvent(keyupEvent);

            await sleep(AUTO_DATA.RETRY_INTERVAL);

            const currentBhyt = bhytField ? bhytField.value.trim() : "";
            if (currentBhyt && currentBhyt.length >= 10) {
                Logger.success(\`Tra cứu BHYT THÀNH CÔNG! Số thẻ BHYT ghi nhận: \${currentBhyt}\`);
                return { success: true, bhyt: currentBhyt };
            }

            const errorBadge = document.querySelector(".text-danger, .error-message, .toast-error");
            if (errorBadge && errorBadge.textContent.includes("Không tìm thấy thông tin")) {
                Logger.warn(\`Cổng BHYT phản hồi: \${errorBadge.textContent.trim()}\`);
            }
        }

        const finalBhyt = bhytField ? bhytField.value.trim() : "";
        if (finalBhyt && finalBhyt.length >= 10) {
            return { success: true, bhyt: finalBhyt };
        }

        Logger.error(\`Tra cứu BHYT THẤT BẠI sau \${AUTO_DATA.MAX_BHYT_RETRIES} lần thử.\`);
        return { success: false, bhyt: "" };
    };

    /* ================================================================
       7. ĐIỀN CÁC TRƯỜNG DỮ LIỆU CƠ BẢN
    ================================================================ */
    const fillBasicFields = async (patient) => {
        // Họ và tên
        const nameInput = document.querySelector("#ho_ten, #HOTEN, input[name='ho_ten']");
        if (nameInput) {
            nameInput.value = patient.hoTen;
            triggerEvents(nameInput);
        }

        // Số CCCD
        const cccdInput = document.querySelector("#so_cccd, #CMND, #SO_CCCD, input[name='so_cccd']");
        if (cccdInput) {
            cccdInput.value = patient.cccd;
            triggerEvents(cccdInput);
        }

        // Ngày sinh
        const dobInput = document.querySelector("#ngay_sinh, #NAMSINH, input[name='ngay_sinh']");
        if (dobInput) {
            dobInput.value = patient.ngaySinh;
            triggerEvents(dobInput);
        }

        // Mã ICD-10
        const icdInput = document.querySelector("#ma_icd, #ICD10, #ma_benh");
        if (icdInput) {
            icdInput.value = AUTO_DATA.DEFAULT_ICD;
            triggerEvents(icdInput);
        }

        // Lý do vào viện
        const reasonInput = document.querySelector("#ly_do_kham, #LYDOKHAM, #ly_do_vao_vien");
        if (reasonInput) {
            reasonInput.value = AUTO_DATA.DEFAULT_REASON;
            triggerEvents(reasonInput);
        }

        await sleep(CFG.PAUSE_BETWEEN_STEPS);
    };

    /* ================================================================
       8. XUẤT BÁO CÁO EXCEL 2 SHEET TỰ ĐỘNG
    ================================================================ */
    const exportMultiSheetExcelReport = () => {
        if (!window.XLSX) {
            Logger.error("Không thể xuất Excel vì thư viện XLSX chưa được tải.");
            return;
        }

        Logger.step("Đang khởi tạo Báo Cáo Excel Đa Sheet (2 Sheets)...");

        const wb = window.XLSX.utils.book_new();

        // Sheet 1: Thành công
        const wsSuccessData = [
            ["STT", "HỌ VÀ TÊN", "SỐ CCCD", "NGÀY SINH", "SỐ THẺ BHYT", "ĐỊA CHỈ CV30", "MÃ ICD-10", "TRẠNG THÁI", "THỜI GIAN LƯU"]
        ];
        REPORT_DATA.success.forEach((item, idx) => {
            wsSuccessData.push([
                idx + 1,
                item.hoTen,
                item.cccd,
                item.ngaySinh,
                item.bhyt || "N/A",
                item.ward || AUTO_DATA.TARGET_WARD_TEXT,
                item.icd || AUTO_DATA.DEFAULT_ICD,
                "Đã lưu thành công",
                item.timestamp
            ]);
        });
        const wsSuccess = window.XLSX.utils.aoa_to_sheet(wsSuccessData);
        window.XLSX.utils.book_append_sheet(wb, wsSuccess, "Tiếp Nhận Thành Công");

        // Sheet 2: Thất bại & Bỏ qua
        const wsFailedData = [
            ["STT", "HỌ VÀ TÊN", "SỐ CCCD", "NGÀY SINH", "NGUYÊN NHÂN THẤT BẠI / BỎ QUA", "THỜI GIAN GHI NHẬN"]
        ];
        REPORT_DATA.failed.forEach((item, idx) => {
            wsFailedData.push([
                idx + 1,
                item.hoTen,
                item.cccd,
                item.ngaySinh,
                item.reason,
                item.timestamp
            ]);
        });
        const wsFailed = window.XLSX.utils.aoa_to_sheet(wsFailedData);
        window.XLSX.utils.book_append_sheet(wb, wsFailed, "Hồ Sơ Bỏ Qua & Lỗi");

        const now = new Date();
        const dateStr = \`\${now.getFullYear()}\${String(now.getMonth() + 1).padStart(2, '0')}\${String(now.getDate()).padStart(2, '0')}_\${String(now.getHours()).padStart(2, '0')}\${String(now.getMinutes()).padStart(2, '0')}\`;
        const fileName = \`BaoCao_TiepNhan_BHYT_\${dateStr}.xlsx\`;

        window.XLSX.writeFile(wb, fileName);
        Logger.success(\`ĐÃ TỰ ĐỘNG TẢI VỀ FILE BÁO CÁO EXCEL: \${fileName}\`);
    };

    /* ================================================================
       9. TIẾN TRÌNH XỬ LÝ TỪNG HỒ SƠ BỆNH NHÂN (PATIENT DISPATCHER)
    ================================================================ */
    const PATIENT_QUEUE = ${queueJson};

    console.clear();
    console.log("%c==========================================================================", "color:#0284c7;font-weight:bold;");
    console.log("%c  HIS ADMISSION & AUTOMATIC EXCEL REPORTING ENGINE (v3.8)                 ", "color:#0284c7;font-size:15px;font-weight:bold;");
    console.log("%c  Tự phát hiện & Đóng Pop-up, Tra cứu BHYT 3x Retry, Xuất Excel 2 Sheet    ", "color:#0284c7;font-size:13px;");
    console.log("%c==========================================================================", "color:#0284c7;font-weight:bold;");

    await loadXLSXLibrary();

    for (let i = 0; i < PATIENT_QUEUE.length; i++) {
        const patient = PATIENT_QUEUE[i];
        const indexStr = \`#\${i + 1}/\${PATIENT_QUEUE.length}\`;
        const timeNow = new Date().toLocaleTimeString();

        Logger.step(\`BẮT ĐẦU XỬ LÝ HỒ SƠ \${indexStr}: \${patient.hoTen} - CCCD: \${patient.cccd}\`);

        // 1. Kiểm tra tính hợp lệ của CCCD
        if (!patient.cccd || patient.cccd.replace(/\\D/g, '').length !== AUTO_DATA.VALID_CCCD_LENGTH) {
            Logger.warn(\`CCCD không đúng \${AUTO_DATA.VALID_CCCD_LENGTH} chữ số -> BỎ QUA ca này theo quy định.\`);
            REPORT_DATA.failed.push({
                ...patient,
                reason: \`Số CCCD không hợp lệ (\${patient.cccd})\`,
                timestamp: timeNow
            });
            await sleep(CFG.PAUSE_BETWEEN_CASES);
            continue;
        }

        // 2. Kích hoạt nút Tiếp Nhận Mới (#moi / #tiepnhan)
        const btnNew = document.querySelector("#moi, #btn_moi, #btn-new, button.btn-new");
        if (btnNew) {
            btnNew.click();
            await sleep(CFG.PAUSE_BETWEEN_STEPS);
        }

        // 3. Điền thông tin cơ bản
        await fillBasicFields(patient);

        // 4. Chọn Option "${targetWardText}" tại Địa chỉ CV30
        selectTargetWardOption();

        // 5. Tra cứu BHYT (3x Retry)
        const bhytResult = await executeInsuranceLookup(patient.ngaySinh);

        if (!bhytResult.success) {
            Logger.warn(\`Không tra cứu được thông tin BHYT hợp lệ -> BỎ QUA ca này, KHÔNG LƯU.\`);
            REPORT_DATA.failed.push({
                ...patient,
                reason: "Không tìm thấy thông tin BHYT hợp lệ từ Cổng giám định",
                timestamp: timeNow
            });
            await sleep(CFG.PAUSE_BETWEEN_CASES);
            continue;
        }

        // 6. Kích hoạt nút Lưu hồ sơ (#luu / #btn_luu)
        const btnSave = document.querySelector("#luu, #btn_luu, button.btn-save, #btn-save");
        if (btnSave) {
            Logger.info("Kích hoạt nút LƯU hồ sơ (#luu)...");
            btnSave.click();
            await sleep(CFG.PAUSE_BETWEEN_STEPS);

            // 7. Lắng nghe và đóng Pop-up phát sinh sau khi Lưu
            await handlePostSavePopups();

            REPORT_DATA.success.push({
                ...patient,
                bhyt: bhytResult.bhyt,
                ward: AUTO_DATA.TARGET_WARD_TEXT,
                icd: AUTO_DATA.DEFAULT_ICD,
                timestamp: timeNow
            });

            Logger.success(\`HỒ SƠ \${indexStr} ĐÃ ĐƯỢC LƯU THÀNH CÔNG!\`);
        } else {
            Logger.error("Không tìm thấy nút Lưu (#luu) trên giao diện HIS!");
            REPORT_DATA.failed.push({
                ...patient,
                reason: "Không tìm thấy nút Lưu (#luu) trên giao diện",
                timestamp: timeNow
            });
        }

        await sleep(CFG.PAUSE_BETWEEN_CASES);
    }

    // 8. Tự động xuất file Báo Cáo Excel sau khi hoàn tất toàn bộ danh sách
    exportMultiSheetExcelReport();

    Logger.step(\`TIẾN TRÌNH TIẾP NHẬN HOÀN TẤT. THÀNH CÔNG: \${REPORT_DATA.success.length} | BỎ QUA/LỖI: \${REPORT_DATA.failed.length}\`);
})();`;
}

export const ReceptionTab: React.FC<ReceptionTabProps> = ({
  config,
  currentUser,
  canViewRawCode = false,
  isAdmin = false,
  onOpenLocationSetup,
  showToast,
}) => {
  const [patients, setPatients] = useState<PatientRecord[]>([]);

  const hasCustomWardSetup = Boolean(currentUser?.wardName && currentUser?.provinceName);
  const perms = getEffectivePermissions(currentUser);
  const canEditWard = canUserSetupOrChangeWard(currentUser);

  const canImportExcel = perms.receptionImportExcel;
  const canExportExcel = perms.receptionExportExcel;

  const canTab1 = perms.receptionTab1_Obfuscated;
  const canTab2 = perms.receptionTab2_Raw;
  const canTab3 = perms.receptionTab3_WardObfuscated;
  const canTab4 = perms.receptionTab4_WardRaw;
  const hasAnyScriptTabAllowed = canTab1 || canTab2 || canTab3 || canTab4;

  const isModePermitted = (mode: ReceptionScriptMode): boolean => {
    switch (mode) {
      case 'default_obfuscated':
        return canTab1;
      case 'default_raw':
        return canTab2;
      case 'ward_obfuscated':
        return canTab3;
      case 'ward_raw':
        return canTab4;
    }
  };

  const [copiedAll, setCopiedAll] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [scriptMode, setScriptMode] = useState<ReceptionScriptMode>(
    hasCustomWardSetup && canTab3 ? 'ward_obfuscated' : 'default_obfuscated'
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automatically switch to custom ward mode when user saves their ward setup
  useEffect(() => {
    if (currentUser?.wardName && currentUser?.provinceName) {
      setScriptMode((prev) => {
        if (prev === 'default_raw' && canTab4) return 'ward_raw';
        if (prev === 'default_obfuscated' && canTab3) return 'ward_obfuscated';
        return prev;
      });
    }
  }, [currentUser?.wardCode, currentUser?.provinceCode, canTab3, canTab4]);

  // Ensure current scriptMode is always one of the permitted tabs
  useEffect(() => {
    if (!isModePermitted(scriptMode)) {
      if (hasCustomWardSetup && canTab3) setScriptMode('ward_obfuscated');
      else if (canTab1) setScriptMode('default_obfuscated');
      else if (canTab3) setScriptMode('ward_obfuscated');
      else if (canTab2) setScriptMode('default_raw');
      else if (canTab4) setScriptMode('ward_raw');
    }
  }, [canTab1, canTab2, canTab3, canTab4, scriptMode, hasCustomWardSetup]);

  // 1. Default Script (Phường Hiệp Thành)
  const defaultRawScript = useMemo(() => {
    return buildReceptionScript(patients, config);
  }, [patients, config]);

  // 2. Custom Ward Script (Chỉ thay đổi TARGET_WARD_TEXT theo Xã/Phường đã setup)
  const customWardRawScript = useMemo(() => {
    return buildReceptionScript(
      patients,
      config,
      currentUser?.wardName || config.targetWardText || 'Phường Hiệp Thành'
    );
  }, [patients, config, currentUser?.wardName]);

  const finalScriptOutput = useMemo(() => {
    if (!hasAnyScriptTabAllowed) {
      return '// Tài khoản của bạn chưa được Admin cấp quyền xem Script Tiếp nhận BHYT (v3.8).';
    }
    switch (scriptMode) {
      case 'default_raw':
        if (canTab2) return defaultRawScript;
        return obfuscateScript(
          defaultRawScript,
          `HIS ADMISSION ENGINE v3.8 - JS UPDATED: ${JS_UPDATED_DATE}`
        );
      case 'ward_obfuscated':
        return obfuscateScript(
          customWardRawScript,
          `HIS ADMISSION ENGINE v3.8 [${(currentUser?.wardName || 'Phường Hiệp Thành').toUpperCase()}] - JS UPDATED: ${JS_UPDATED_DATE}`
        );
      case 'ward_raw':
        if (canTab4) return customWardRawScript;
        return obfuscateScript(
          customWardRawScript,
          `HIS ADMISSION ENGINE v3.8 [${(currentUser?.wardName || 'Phường Hiệp Thành').toUpperCase()}] - JS UPDATED: ${JS_UPDATED_DATE}`
        );
      case 'default_obfuscated':
      default:
        return obfuscateScript(
          defaultRawScript,
          `HIS ADMISSION ENGINE v3.8 - JS UPDATED: ${JS_UPDATED_DATE}`
        );
    }
  }, [
    scriptMode,
    canTab2,
    canTab4,
    hasAnyScriptTabAllowed,
    defaultRawScript,
    customWardRawScript,
    currentUser?.wardName,
  ]);

  const handleSelectScriptMode = (targetMode: ReceptionScriptMode) => {
    if (!isModePermitted(targetMode)) {
      showToast(
        'warning',
        'Chưa được Admin phân quyền',
        'Tài khoản của bạn chưa được Admin cấp quyền sử dụng tab mã này.'
      );
      return;
    }

    if ((targetMode === 'ward_obfuscated' || targetMode === 'ward_raw') && !hasCustomWardSetup) {
      showToast(
        'info',
        'Thiết lập Tỉnh/Thành phố & Xã/Phường',
        'Hãy chọn Tỉnh/Thành phố và Xã/Phường (được setup 1 lần duy nhất) để hệ thống tự động điền vào code Tiếp nhận.'
      );
      onOpenLocationSetup();
    }

    setScriptMode(targetMode);
  };

  const getActiveModeLabel = () => {
    switch (scriptMode) {
      case 'default_obfuscated':
        return 'Mã hóa (Mặc định Phường Hiệp Thành)';
      case 'default_raw':
        return 'Mã gốc (Phường Hiệp Thành · Admin duyệt)';
      case 'ward_obfuscated':
        return `Mã hóa (Đã thay đổi xã phường: ${currentUser?.wardName || 'Phường Hiệp Thành'})`;
      case 'ward_raw':
        return `Mã theo xã phường (${currentUser?.wardName || 'Phường Hiệp Thành'} · Admin duyệt)`;
    }
  };

  const filteredPatients = useMemo(() => {
    if (!searchTerm.trim()) return patients;
    const term = searchTerm.toLowerCase();
    return patients.filter(
      (p) =>
        p.hoTen.toLowerCase().includes(term) ||
        p.cccd.includes(term) ||
        p.ngaySinh.includes(term)
    );
  }, [patients, searchTerm]);

  const validCount = patients.filter((p) => p.status === 'valid').length;
  const invalidCount = patients.length - validCount;

  const handleCopy = async () => {
    if (!hasAnyScriptTabAllowed || !isModePermitted(scriptMode)) {
      showToast('warning', 'Chưa được phân quyền', 'Bạn chưa được cấp quyền sao chép Script này.');
      return;
    }
    try {
      await navigator.clipboard.writeText(finalScriptOutput);
      setCopiedAll(true);
      showToast(
        'success',
        `Đã sao chép: ${getActiveModeLabel()}`,
        'Mở Console F12 trên màn hình Tiếp nhận HIS và dán (Ctrl+V) để thực thi.'
      );
      setTimeout(() => setCopiedAll(false), 2500);
    } catch {
      showToast('error', 'Lỗi clipboard', 'Không thể sao chép tự động.');
    }
  };

  const handleDownload = () => {
    if (!hasAnyScriptTabAllowed || !isModePermitted(scriptMode)) {
      showToast('warning', 'Chưa được phân quyền', 'Bạn chưa được cấp quyền tải về Script này.');
      return;
    }
    const blob = new Blob([finalScriptOutput], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const suffix =
      scriptMode === 'ward_obfuscated' || scriptMode === 'ward_raw'
        ? `_${currentUser?.wardCode || 'CustomWard'}`
        : '_HiepThanh';
    link.download = `HIS_TiepNhan_BHYT_v3.8${suffix}_${Date.now()}.js`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('success', 'Đã tải file .js', 'File kịch bản đã được lưu về máy.');
  };

  const handleDownloadTemplate = () => {
    if (!canExportExcel) {
      showToast(
        'warning',
        'Chưa được phân quyền Xuất Excel',
        'Tài khoản của bạn cần được Admin cấp quyền Xuất Excel trong Danh Sách Bệnh Nhân Tiếp Nhận.'
      );
      return;
    }
    const wsData = [
      ['Họ và tên', 'Số CCCD (12 số)', 'Ngày sinh (dd/mm/yyyy)'],
      ['SƠN LÝ HỒNG ĐỨC', '095203006561', '15/08/1995'],
      ['NGUYỄN VĂN AN', '079201004812', '20/11/1992'],
      ['TRẦN THỊ MAI', '083199002134', '05/04/1999'],
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Mau_TiepNhan');
    XLSX.writeFile(wb, 'Mau_DanhSach_TiepNhan_HIS.xlsx');
    showToast('success', 'Đã tải file mẫu', 'Mở file Excel và điền danh sách bệnh nhân.');
  };

  const handleExportPatientsExcel = () => {
    if (!canExportExcel) {
      showToast(
        'warning',
        'Chưa được phân quyền Xuất Excel',
        'Tài khoản của bạn cần được Admin cấp quyền Xuất Excel trong Danh Sách Bệnh Nhân Tiếp Nhận.'
      );
      return;
    }
    if (patients.length === 0) {
      showToast('warning', 'Danh sách trống', 'Chưa có bệnh nhân nào trong danh sách để xuất Excel.');
      return;
    }
    const wsData: any[][] = [
      ['STT', 'Họ và tên', 'Số CCCD (12 số)', 'Ngày sinh (dd/mm/yyyy)', 'Trạng thái'],
    ];
    patients.forEach((p, idx) => {
      wsData.push([
        idx + 1,
        p.hoTen,
        p.cccd,
        p.ngaySinh,
        p.status === 'valid' ? 'Hợp lệ' : p.statusMessage,
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'DanhSach_TiepNhan');
    XLSX.writeFile(wb, `DanhSach_BenhNhan_TiepNhan_${Date.now()}.xlsx`);
    showToast(
      'success',
      'Xuất Excel thành công',
      `Đã xuất ${patients.length} hồ sơ bệnh nhân ra file Excel.`
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canImportExcel) {
      showToast(
        'warning',
        'Chưa được phân quyền Nhập Excel',
        'Tài khoản của bạn cần được Admin cấp quyền Nhập Excel.'
      );
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (json.length < 2) {
          showToast('error', 'File trống', 'File Excel không có dữ liệu hàng.');
          return;
        }

        const newRecords: PatientRecord[] = [];
        for (let i = 1; i < json.length; i++) {
          const row = json[i];
          if (!row || !row.length) continue;
          const hoTen = String(row[0] || '').trim();
          const cccd = String(row[1] || '').trim().replace(/\D/g, '');
          const ngaySinh = String(row[2] || '').trim();

          if (!hoTen && !cccd) continue;

          newRecords.push({
            id: `p_${Date.now()}_${i}`,
            hoTen,
            cccd,
            ngaySinh,
            status: cccd.length === 12 ? 'valid' : 'invalid_cccd',
            statusMessage: cccd.length === 12 ? 'Hợp lệ' : 'CCCD không đủ 12 chữ số',
          });
        }

        setPatients(newRecords);
        showToast('success', 'Nạp dữ liệu Excel thành công', `Đã nhập ${newRecords.length} hồ sơ bệnh nhân.`);
      } catch {
        showToast('error', 'Lỗi đọc file', 'Không thể giải mã file Excel.');
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addEmptyRow = () => {
    if (!canImportExcel) {
      showToast(
        'warning',
        'Chưa được phân quyền Nhập / Chỉnh sửa',
        'Tài khoản của bạn cần được Admin cấp quyền Nhập Excel để chỉnh sửa danh sách.'
      );
      return;
    }
    setPatients([
      ...patients,
      {
        id: `p_${Date.now()}`,
        hoTen: '',
        cccd: '',
        ngaySinh: '',
        status: 'valid',
        statusMessage: 'Hợp lệ',
      },
    ]);
  };

  const isUsingCustomWard = scriptMode === 'ward_obfuscated' || scriptMode === 'ward_raw';
  const displayedProvince = isUsingCustomWard
    ? currentUser?.provinceName || 'Cà Mau'
    : 'Cà Mau';
  const displayedWard = isUsingCustomWard
    ? currentUser?.wardName || config.targetWardText || 'Phường Hiệp Thành'
    : config.targetWardText || 'Phường Hiệp Thành';

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 flex-1 min-h-0">
      {/* Left Column: Data Grid & Patient Table (xl:col-span-6) */}
      <div className="xl:col-span-6 flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Compact Header & Metrics Bar */}
        <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900">Danh Sách Bệnh Nhân Tiếp Nhận</h3>
              <span className="text-[10px] text-slate-500">Nhập từ Excel hoặc sửa trực tiếp</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[11px] tabular-nums">
            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
              Tổng: {patients.length}
            </span>
            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
              ✓ {validCount}
            </span>
            {invalidCount > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold border border-amber-200">
                ⚠ {invalidCount}
              </span>
            )}
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="p-2 border-b border-slate-100 flex flex-wrap items-center justify-between gap-1.5 bg-white">
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[200px]">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx, .xls, .csv"
              className="hidden"
            />
            <button
              onClick={() => {
                if (!canImportExcel) {
                  showToast(
                    'warning',
                    'Chưa được phân quyền Nhập Excel',
                    'Vui lòng liên hệ Admin để được cấp quyền Nhập Excel.'
                  );
                  return;
                }
                fileInputRef.current?.click();
              }}
              className={`flex items-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 ${
                canImportExcel
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-100 text-slate-400 border border-slate-200'
              }`}
              title={canImportExcel ? 'Nạp danh sách từ file Excel' : 'Đã khóa quyền Nhập Excel'}
            >
              {canImportExcel ? <Upload className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
              <span>Nạp Excel</span>
            </button>

            <button
              onClick={handleExportPatientsExcel}
              className={`flex items-center gap-1 py-1.5 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer shrink-0 border ${
                canExportExcel
                  ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                  : 'bg-slate-100 text-slate-400 border-slate-200'
              }`}
              title={canExportExcel ? 'Xuất danh sách hiện tại ra file Excel' : 'Đã khóa quyền Xuất Excel'}
            >
              {canExportExcel ? (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Lock className="w-3.5 h-3.5" />
              )}
              <span>Xuất Excel</span>
            </button>

            <button
              onClick={addEmptyRow}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                canImportExcel
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  : 'bg-slate-50 text-slate-400 border border-slate-200'
              }`}
            >
              {canImportExcel ? <Plus className="w-3.5 h-3.5" /> : <Lock className="w-3 h-3" />}
              <span>Thêm dòng</span>
            </button>

            <button
              onClick={handleDownloadTemplate}
              title={canExportExcel ? 'Tải file mẫu Excel chuẩn' : 'Đã khóa quyền Xuất/Tải mẫu Excel'}
              className={`py-1.5 px-2 border rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1 shrink-0 ${
                canExportExcel
                  ? 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                  : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}
            >
              {canExportExcel ? (
                <FileDown className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Lock className="w-3 h-3" />
              )}
              <span className="hidden sm:inline">Mẫu Excel</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Filter Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm nhanh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-32 sm:w-40 pl-7 pr-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 top-2 pointer-events-none" />
            </div>

            {patients.length > 0 && canImportExcel && (
              <button
                onClick={() => setPatients([])}
                title="Xóa tất cả danh sách"
                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* High-density Patients Editable Table */}
        <div className="flex-1 overflow-auto max-h-[calc(100vh-250px)] min-h-[380px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/90 text-slate-600 font-semibold sticky top-0 z-10 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2 px-2.5 w-10 text-center">#</th>
                <th className="py-2 px-2">Họ và Tên</th>
                <th className="py-2 px-2 w-32">Số CCCD (12 số)</th>
                <th className="py-2 px-2 w-28">Ngày sinh</th>
                <th className="py-2 px-2 w-20 text-center">Trạng thái</th>
                <th className="py-2 px-2 w-8 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 text-xs">
                    {searchTerm ? 'Không tìm thấy bệnh nhân phù hợp.' : 'Chưa có dữ liệu. Hãy bấm "Nạp Excel" hoặc "Thêm dòng".'}
                  </td>
                </tr>
              ) : (
                filteredPatients.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-blue-50/40 transition-colors group">
                    <td className="py-1.5 px-2.5 text-center font-mono text-[11px] text-slate-400 font-bold tabular-nums">
                      {idx + 1}
                    </td>
                    <td className="py-1 px-2">
                      <input
                        type="text"
                        value={p.hoTen}
                        placeholder="HỌ VÀ TÊN..."
                        onChange={(e) => {
                          const updated = [...patients];
                          const realIdx = patients.findIndex((item) => item.id === p.id);
                          if (realIdx !== -1) {
                            updated[realIdx].hoTen = e.target.value.toUpperCase();
                            setPatients(updated);
                          }
                        }}
                        className="w-full px-2 py-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent focus:border-blue-400 rounded text-xs font-bold text-slate-800"
                      />
                    </td>
                    <td className="py-1 px-2">
                      <input
                        type="text"
                        value={p.cccd}
                        placeholder="095203006561"
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          const updated = [...patients];
                          const realIdx = patients.findIndex((item) => item.id === p.id);
                          if (realIdx !== -1) {
                            updated[realIdx].cccd = val;
                            updated[realIdx].status = val.length === 12 ? 'valid' : 'invalid_cccd';
                            updated[realIdx].statusMessage = val.length === 12 ? 'Hợp lệ' : 'CCCD chưa đủ 12 số';
                            setPatients(updated);
                          }
                        }}
                        className="w-full px-2 py-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent focus:border-blue-400 rounded text-xs font-mono font-semibold text-slate-800 tabular-nums"
                      />
                    </td>
                    <td className="py-1 px-2">
                      <input
                        type="text"
                        value={p.ngaySinh}
                        placeholder="15/08/1995"
                        onChange={(e) => {
                          const updated = [...patients];
                          const realIdx = patients.findIndex((item) => item.id === p.id);
                          if (realIdx !== -1) {
                            updated[realIdx].ngaySinh = e.target.value;
                            setPatients(updated);
                          }
                        }}
                        className="w-full px-2 py-1 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent focus:border-blue-400 rounded text-xs font-mono text-slate-800 tabular-nums"
                      />
                    </td>
                    <td className="py-1 px-2 text-center">
                      {p.status === 'valid' ? (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 font-mono">
                          <CheckCircle2 className="w-3 h-3" /> OK
                        </span>
                      ) : (
                        <span
                          title={p.statusMessage}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 font-mono"
                        >
                          <AlertTriangle className="w-3 h-3" /> Lỗi
                        </span>
                      )}
                    </td>
                    <td className="py-1 px-2 text-center">
                      <button
                        onClick={() => setPatients(patients.filter((item) => item.id !== p.id))}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition-opacity p-0.5 cursor-pointer"
                        title="Xóa dòng"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right Column: Code Generator & 4 Script Modes (xl:col-span-6) */}
      <div className="xl:col-span-6 flex flex-col bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Compact Header with Copy & Download */}
        <div className="p-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-bold text-slate-900">Script Tiếp nhận BHYT (v3.8)</h3>
                <span className="text-[10px] font-mono text-blue-700 font-semibold">
                  · 4 Chế độ Mã
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                Cập nhật JS: {JS_UPDATED_DATE} · Dán vào F12 Console
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpenLocationSetup}
              className={`flex items-center gap-1 py-1.5 px-2.5 border rounded-lg text-xs font-bold transition-all cursor-pointer ${
                !canEditWard
                  ? 'bg-slate-100 text-slate-600 border-slate-200'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
              title={
                !canEditWard
                  ? 'Đã khóa thay đổi Xã/Phường (Chỉ setup được 1 lần duy nhất - Cần Admin phân quyền)'
                  : 'Thiết lập Tỉnh/Thành phố, Xã/Phường theo danh mục chuẩn'
              }
            >
              {!canEditWard ? (
                <Lock className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>
                {!canEditWard
                  ? 'Đã khóa đổi Xã/Phường'
                  : hasCustomWardSetup
                  ? 'Đổi Xã/Phường'
                  : 'Setup Xã/Phường (1 lần)'}
              </span>
            </button>

            <button
              onClick={handleCopy}
              disabled={!hasAnyScriptTabAllowed}
              className="flex items-center gap-1 py-1.5 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              {copiedAll ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedAll ? 'Đã chép!' : 'Sao chép Script'}</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={!hasAnyScriptTabAllowed}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all cursor-pointer disabled:opacity-50"
              title="Tải file .js"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4 Script Modes Selector Grid */}
        <div className="p-2.5 bg-slate-50 border-b border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between text-[11px] px-0.5">
            <span className="font-bold text-slate-700">
              Chọn loại Script Tiếp nhận BHYT (Phân quyền 4 tab):
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {hasCustomWardSetup
                ? `Đã setup: ${currentUser.wardName}, ${currentUser.provinceName}`
                : 'Chưa setup xã/phường (Mặc định: Phường Hiệp Thành)'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {/* 1. Mã hóa (Mặc định Phường Hiệp Thành) */}
            <button
              type="button"
              onClick={() => handleSelectScriptMode('default_obfuscated')}
              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                scriptMode === 'default_obfuscated' && canTab1
                  ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : canTab1
                  ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
                  : 'bg-slate-100/70 text-slate-400 border-slate-200/80'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold flex items-center gap-1 truncate">
                  <Lock className={`w-3 h-3 shrink-0 ${!canTab1 ? 'text-amber-600' : ''}`} />
                  <span className="truncate">1. Mã hóa</span>
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    scriptMode === 'default_obfuscated' && canTab1 ? 'text-blue-100' : 'text-slate-500'
                  }`}
                >
                  Code mặc định Phường Hiệp Thành
                </div>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  scriptMode === 'default_obfuscated' && canTab1
                    ? 'bg-white/20 text-white'
                    : canTab1
                    ? 'bg-slate-100 text-slate-600'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {canTab1 ? 'Mặc định' : 'Cần quyền'}
              </span>
            </button>

            {/* 2. Mã gốc (Chỉ được admin duyệt xem) */}
            <button
              type="button"
              onClick={() => handleSelectScriptMode('default_raw')}
              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                scriptMode === 'default_raw' && canTab2
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : canTab2
                  ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200'
                  : 'bg-slate-100/70 text-slate-400 border-slate-200/80'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold flex items-center gap-1 truncate">
                  {canTab2 ? (
                    <Eye className="w-3 h-3 shrink-0" />
                  ) : (
                    <Lock className="w-3 h-3 shrink-0 text-amber-600" />
                  )}
                  <span className="truncate">2. Mã gốc</span>
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    scriptMode === 'default_raw' && canTab2 ? 'text-indigo-100' : 'text-slate-500'
                  }`}
                >
                  Chỉ được admin duyệt xem
                </div>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  scriptMode === 'default_raw' && canTab2
                    ? 'bg-white/20 text-white'
                    : canTab2
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {canTab2 ? 'Đã duyệt' : 'Cần quyền'}
              </span>
            </button>

            {/* 3. Mã hóa (đã thay đổi xã phường) */}
            <button
              type="button"
              onClick={() => handleSelectScriptMode('ward_obfuscated')}
              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                scriptMode === 'ward_obfuscated' && canTab3
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : canTab3
                  ? 'bg-white hover:bg-emerald-50/60 text-slate-800 border-emerald-200'
                  : 'bg-slate-100/70 text-slate-400 border-slate-200/80'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold flex items-center gap-1 truncate">
                  {canTab3 ? (
                    <MapPin className="w-3 h-3 shrink-0" />
                  ) : (
                    <Lock className="w-3 h-3 shrink-0 text-amber-600" />
                  )}
                  <span className="truncate">3. Mã hóa (đã thay đổi xã phường)</span>
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    scriptMode === 'ward_obfuscated' && canTab3 ? 'text-emerald-100' : 'text-slate-500'
                  }`}
                >
                  {hasCustomWardSetup
                    ? `${currentUser.wardName}, ${currentUser.provinceName}`
                    : 'Bấm để tự động điền Tỉnh/TP, Xã/Phường'}
                </div>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  scriptMode === 'ward_obfuscated' && canTab3
                    ? 'bg-white/20 text-white'
                    : canTab3
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {canTab3 ? 'Xã/Phường' : 'Cần quyền'}
              </span>
            </button>

            {/* 4. Mã theo xã phường (đã thay đổi xã phường/Chỉ được admin duyệt xem) */}
            <button
              type="button"
              onClick={() => handleSelectScriptMode('ward_raw')}
              className={`p-2 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-2 ${
                scriptMode === 'ward_raw' && canTab4
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : canTab4
                  ? 'bg-white hover:bg-purple-50/60 text-slate-800 border-purple-200'
                  : 'bg-slate-100/70 text-slate-400 border-slate-200/80'
              }`}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold flex items-center gap-1 truncate">
                  {canTab4 ? (
                    <Eye className="w-3 h-3 shrink-0" />
                  ) : (
                    <Lock className="w-3 h-3 shrink-0 text-amber-600" />
                  )}
                  <span className="truncate">4. Mã theo xã phường</span>
                </div>
                <div
                  className={`text-[10px] truncate mt-0.5 ${
                    scriptMode === 'ward_raw' && canTab4 ? 'text-purple-100' : 'text-slate-500'
                  }`}
                >
                  Đã thay đổi xã phường / Chỉ được admin duyệt xem
                </div>
              </div>
              <span
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded shrink-0 ${
                  scriptMode === 'ward_raw' && canTab4
                    ? 'bg-white/20 text-white'
                    : canTab4
                    ? 'bg-purple-50 text-purple-700'
                    : 'bg-amber-50 text-amber-700'
                }`}
              >
                {canTab4 ? 'Đã duyệt' : 'Cần quyền'}
              </span>
            </button>
          </div>
        </div>

        {/* Compact Preset & Active Location Specs Strip */}
        <div className="px-3 py-1.5 bg-blue-50/50 border-b border-blue-100/70 flex flex-wrap items-center justify-between gap-1 text-[11px]">
          <div className="flex flex-wrap items-center gap-2 text-slate-700">
            <span className="font-semibold text-emerald-900">
              CV30 (TARGET_WARD_TEXT): <strong className="font-bold text-emerald-950">"{displayedWard}"</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">
              Tỉnh/TP (để biết): <strong className="font-semibold text-slate-700">{displayedProvince}</strong>
            </span>
            <span className="text-slate-300">·</span>
            <span>
              ICD: <strong className="font-mono font-bold text-slate-900">{config.defaultIcd}</strong>
            </span>
          </div>

          <span className="font-mono text-[10px] font-bold text-blue-700">
            {isUsingCustomWard ? 'Chỉ đổi Xã/Phường trong JS' : 'Mặc định Hiệp Thành'}
          </span>
        </div>

        {/* Terminal Code Viewer */}
        <div className="flex-1 flex flex-col bg-slate-950 min-h-[360px] max-h-[calc(100vh-360px)] overflow-hidden font-mono text-xs">
          <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 select-none">
            <span className="text-emerald-400 truncate">{getActiveModeLabel()}</span>
            <span className="shrink-0 ml-2 tabular-nums">{patients.length} ca</span>
          </div>

          <pre className="flex-1 p-3 text-slate-200 overflow-auto text-[11px] leading-relaxed select-all">
            <code>{finalScriptOutput}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
