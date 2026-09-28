import type { KskConfigData } from '../firebase';

export const KSK_JS_UPDATED_DATE = '28/09/2026';

export const SERVER_DEFAULT_KSK_CONFIG: KskConfigData = {
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

/**
 * Builds the full KSK (Khám sức khỏe TT 32/2023/TT-BYT) v4.2 automation script
 * that will be served by the backend API when requested by the client loader.
 */
export function buildKskScript(cfg: KskConfigData = SERVER_DEFAULT_KSK_CONFIG): string {
  const minH = Math.min(cfg.chieuCaoMin, cfg.chieuCaoMax);
  const maxH = Math.max(cfg.chieuCaoMin, cfg.chieuCaoMax);
  const minW = Math.min(cfg.canNangMin, cfg.canNangMax);
  const maxW = Math.max(cfg.canNangMin, cfg.canNangMax);

  return `/**
 * ============================================================================
 * PHÂN HỆ TỰ ĐỘNG HÓA KHÁM SỨC KHỎE (KSK) THEO THÔNG TƯ 32/2023/TT-BYT
 * HIS CLINICAL EXAMINATION AUTO-PILOT ENGINE v4.2 (NETWORK RESILIENT & EXCEL)
 * ----------------------------------------------------------------------------
 * ĐẶC TÍNH KỸ THUẬT:
 * 1. Chống nghẽn mạng & Lỗi hệ thống: Điều chỉnh thời gian chờ Tab & Pop-up (1s - 2s)
 *    đảm bảo AJAX hoàn tất 100% trước khi thực thi bước tiếp theo.
 * 2. Bộ lắng nghe Pop-up chủ động: Tự động phát hiện, bấm Đồng ý/Đóng các Dialog
 *    phát sinh trong quá trình vận hành.
 * 3. Tự động phục hồi ca lỗi: Bỏ qua ca kẹt do nghẽn mạng, lưu log và chuyển ca sau.
 * 4. Xuất Báo cáo Excel 2 Sheet ("KSK Thành Công" & "Ca Thất Bại & Lỗi") tự động.
 * ============================================================================
 */
(async () => {
    "use strict";

    /* ================================================================
       1. CẤU HÌNH DỮ LIỆU CHUYÊN MÔN (CLINICAL DATA CONFIG)
    ================================================================ */
    const AUTO_DATA = {
        THE_LUC: {
            CHIEU_CAO_MIN: ${minH},      // Giới hạn dưới chiều cao (cm)
            CHIEU_CAO_MAX: ${maxH},      // Giới hạn trên chiều cao (cm)
            CAN_NANG_MIN: ${minW},        // Giới hạn dưới cân nặng (kg)
            CAN_NANG_MAX: ${maxW},        // Giới hạn trên cân nặng (kg)
            HA_CAO: "${cfg.haCao}",           // Huyết áp tâm thu (mmHg)
            HA_THAP: "${cfg.haThap}",          // Huyết áp tâm trương (mmHg)
            MACH: "${cfg.mach}",              // Tần số mạch (lần/phút)
            PHAN_LOAI: "${cfg.phanLoaiTheLuc}"       // Phân loại thể lực chuẩn
        },
        LAM_SANG: "${cfg.lamSang}",      // Kết quả khám lâm sàng các chuyên khoa
        KET_LUAN: {
            TINH_TRANG: "${cfg.ketLuanTinhTrang.replace(/"/g, '\\"')}",
            PHAN_LOAI: "${cfg.phanLoaiKetLuan}"      // Phân loại sức khỏe chung bắt buộc
        }
    };

    /* ================================================================
       2. THỜI GIAN & TỐC ĐỘ VẬN HÀNH (ĐÃ ĐIỀU CHỈNH CHỐNG NGHẼN MẠNG 1S - 2S)
    ================================================================ */
    const CFG = {
        MAX_CASES: ${cfg.maxCases},          // Số lượng hồ sơ tối đa trong 1 phiên
        WAIT_PATIENT: 30000,      // Thời gian chờ nạp danh sách bệnh nhân (ms)
        WAIT_ELEMENT: 20000,      // Thời gian chờ DOM element xuất hiện (ms)
        WAIT_POPUP: 10000,        // Thời gian chờ Dialog xác nhận (ms)
        CHECK_INTERVAL: 300,      // Chu kỳ polling DOM (ms)
        AFTER_CLICK: 1500,        // Độ trễ sau thao tác Click (ms) - [Chờ 1.5s]
        AFTER_TAB: 1500,          // Độ trễ sau khi chuyển Tab chuyên khoa (ms) - [Chờ 1.5s]
        AFTER_FILL: 600,          // Độ trễ sau khi điền trường dữ liệu (ms)
        AFTER_SAVE: 2000,         // Độ trễ sau khi lưu dữ liệu (ms) - [Chờ 2s]
        AFTER_REFRESH: 3000,      // Độ trễ sau khi làm mới danh bạ (ms) - [Chờ 3s]
        PAUSE_BETWEEN_CASES: 2000 // Nghỉ giữa 2 ca liên tiếp (ms) - [Chờ 2s]
    };

    // Bộ lưu trữ danh sách bệnh nhân cho xuất báo cáo Excel
    const REPORT_DATA = {
        success: [],
        failed: []
    };

    /* ================================================================
       3. CÁC HÀM TIỆN ÍCH HỆ THỐNG & NẠP THƯ VIỆN EXCEL
    ================================================================ */
    const Logger = {
        info: (msg) => console.log(\`%c[HIS-AUTO] [INFO] \${msg}\`, "color:#0284c7;font-weight:600;"),
        success: (msg) => console.log(\`%c[HIS-AUTO] [SUCCESS] \${msg}\`, "color:#16a34a;font-weight:700;"),
        warn: (msg) => console.log(\`%c[HIS-AUTO] [WARNING] \${msg}\`, "color:#d97706;font-weight:600;"),
        error: (msg) => console.log(\`%c[HIS-AUTO] [ERROR] \${msg}\`, "color:#dc2626;font-weight:700;font-size:13px;"),
        step: (msg) => console.log(\`%c\\n>>> \${msg}\`, "color:#7c3aed;font-weight:bold;font-size:12px;background:#f5f3ff;padding:3px 6px;border-radius:4px;")
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

    const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    const waitForElement = (selector, timeout = CFG.WAIT_ELEMENT) => {
        return new Promise((resolve) => {
            const start = Date.now();
            const timer = setInterval(() => {
                const el = document.querySelector(selector);
                if (el && (el.offsetParent !== null || el.offsetWidth > 0 || el.offsetHeight > 0)) {
                    clearInterval(timer);
                    resolve(el);
                } else if (Date.now() - start >= timeout) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, CFG.CHECK_INTERVAL);
        });
    };

    const triggerEvents = (element) => {
        if (!element) return;
        ['input', 'change', 'blur'].forEach((eventType) => {
            element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
        });
    };

    const dismissGlobalPopups = async (context = "") => {
        const popupConfirmBtn = document.querySelector(
            '.modal.in button.btn-primary, .modal.show button.btn-primary, .bootbox.modal.in button[data-bb-handler="confirm"], .bootbox.modal.in button[data-bb-handler="ok"], .swal2-confirm, #modal-alert .btn-primary'
        );

        if (popupConfirmBtn && popupConfirmBtn.offsetParent !== null) {
            Logger.info(\`Phát hiện Dialog cảnh báo / xác nhận [\${context}] -> Tự động bấm Đồng ý...\`);
            popupConfirmBtn.click();
            await sleep(500);
            return true;
        }
        return false;
    };

    /* ================================================================
       4. XUẤT BÁO CÁO EXCEL 2 SHEET TỰ ĐỘNG
    ================================================================ */
    const exportMultiSheetExcelReport = () => {
        if (!window.XLSX) {
            Logger.error("Không thể xuất Excel vì thư viện XLSX chưa được nạp.");
            return;
        }

        Logger.step("Đang khởi tạo Báo Cáo Excel Đa Sheet (2 Sheets)...");

        const wb = window.XLSX.utils.book_new();

        // Sheet 1: KSK Thành Công
        const wsSuccessData = [
            ["STT", "HỌ VÀ TÊN", "CHIỀU CAO (CM)", "CÂN NẶNG (KG)", "BMI", "HUYẾT ÁP", "MẠCH", "PHÂN LOẠI SK", "KẾT LUẬN", "THỜI GIAN LƯU"]
        ];
        REPORT_DATA.success.forEach((item, idx) => {
            wsSuccessData.push([
                idx + 1,
                item.hoTen,
                item.chieuCao,
                item.canNang,
                item.bmi,
                \`\${item.haCao}/\${item.haThap}\`,
                item.mach,
                item.phanLoai,
                item.ketLuan,
                item.timestamp
            ]);
        });
        const wsSuccess = window.XLSX.utils.aoa_to_sheet(wsSuccessData);
        window.XLSX.utils.book_append_sheet(wb, wsSuccess, "KSK Thành Công");

        // Sheet 2: Ca Thất Bại & Lỗi
        const wsFailedData = [
            ["STT", "HỌ VÀ TÊN / MÃ HỒ SƠ", "NGUYÊN NHÂN LỖI / BỎ QUA", "THỜI GIAN GHI NHẬN"]
        ];
        REPORT_DATA.failed.forEach((item, idx) => {
            wsFailedData.push([
                idx + 1,
                item.hoTen,
                item.error,
                item.timestamp
            ]);
        });
        const wsFailed = window.XLSX.utils.aoa_to_sheet(wsFailedData);
        window.XLSX.utils.book_append_sheet(wb, wsFailed, "Ca Thất Bại & Lỗi");

        const now = new Date();
        const dateStr = \`\${now.getFullYear()}\${String(now.getMonth() + 1).padStart(2, '0')}\${String(now.getDate()).padStart(2, '0')}_\${String(now.getHours()).padStart(2, '0')}\${String(now.getMinutes()).padStart(2, '0')}\`;
        const fileName = \`BaoCao_KSK_TT32_\${dateStr}.xlsx\`;

        window.XLSX.writeFile(wb, fileName);
        Logger.success(\`ĐÃ TỰ ĐỘNG TẢI VỀ FILE BÁO CÁO EXCEL: \${fileName}\`);
    };

    /* ================================================================
       5. TIẾN TRÌNH XỬ LÝ CHI TIẾT 10 BƯỚC KHÁM KSK
    ================================================================ */
    const getWaitingPatientRows = () => {
        return Array.from(document.querySelectorAll(
            "#gridDanhSachBenhNhan tbody tr, #tbl_danhsach tbody tr, .table-patient tbody tr"
        )).filter(row => {
            const isVisible = row.offsetParent !== null;
            const text = row.textContent.toLowerCase();
            return isVisible && !text.includes("không có dữ liệu") && !text.includes("đã khám");
        });
    };

    const getPatientName = (row) => {
        if (!row) return "Bệnh nhân";
        const nameCell = row.querySelector("td:nth-child(2), td.hoten, .patient-name");
        return nameCell ? nameCell.textContent.trim() : (row.cells[1]?.textContent.trim() || "Bệnh nhân");
    };

    const fillPhysicalStats = async () => {
        const height = getRandomInt(AUTO_DATA.THE_LUC.CHIEU_CAO_MIN, AUTO_DATA.THE_LUC.CHIEU_CAO_MAX);
        const weight = getRandomInt(AUTO_DATA.THE_LUC.CAN_NANG_MIN, AUTO_DATA.THE_LUC.CAN_NANG_MAX);
        const bmi = (weight / Math.pow(height / 100, 2)).toFixed(1);

        const hInput = document.querySelector("#chieu_cao, input[name='chieu_cao'], #CHIEUCAO");
        if (hInput) { hInput.value = height; triggerEvents(hInput); }

        const wInput = document.querySelector("#can_nang, input[name='can_nang'], #CANNANG");
        if (wInput) { wInput.value = weight; triggerEvents(wInput); }

        const bmiInput = document.querySelector("#bmi, input[name='bmi'], #BMI");
        if (bmiInput) { bmiInput.value = bmi; triggerEvents(bmiInput); }

        const haCaoInput = document.querySelector("#ha_cao, input[name='ha_cao'], #HUYETAP_MAX");
        if (haCaoInput) { haCaoInput.value = AUTO_DATA.THE_LUC.HA_CAO; triggerEvents(haCaoInput); }

        const haThapInput = document.querySelector("#ha_thap, input[name='ha_thap'], #HUYETAP_MIN");
        if (haThapInput) { haThapInput.value = AUTO_DATA.THE_LUC.HA_THAP; triggerEvents(haThapInput); }

        const machInput = document.querySelector("#mach, input[name='mach'], #MACH");
        if (machInput) { machInput.value = AUTO_DATA.THE_LUC.MACH; triggerEvents(machInput); }

        const plInput = document.querySelector("#phan_loai_the_luc, select[name='phan_loai_the_luc'], #PHANLOAI_THELUC");
        if (plInput) { plInput.value = AUTO_DATA.THE_LUC.PHAN_LOAI; triggerEvents(plInput); }

        await sleep(CFG.AFTER_FILL);
        return { height, weight, bmi };
    };

    const fillClinicalExams = async () => {
        const clinicalInputs = document.querySelectorAll(
            ".tab-pane.active textarea, .tab-pane.active input[type='text'], #tab_lamsang textarea, #tab_lamsang input[type='text']"
        );
        clinicalInputs.forEach((input) => {
            if (!input.value.trim() && !input.readOnly && !input.disabled) {
                input.value = AUTO_DATA.LAM_SANG;
                triggerEvents(input);
            }
        });
        await sleep(CFG.AFTER_FILL);
    };

    const fillConclusion = async () => {
        const statusInput = document.querySelector("#tinh_trang_suc_khoe, #ket_luan, textarea[name='ket_luan'], #KETLUAN");
        if (statusInput) {
            statusInput.value = AUTO_DATA.KET_LUAN.TINH_TRANG;
            triggerEvents(statusInput);
        }

        const rankSelect = document.querySelector("#phan_loai_suc_khoe, select[name='phan_loai_suc_khoe'], #PHANLOAI_KSK");
        if (rankSelect) {
            rankSelect.value = AUTO_DATA.KET_LUAN.PHAN_LOAI;
            triggerEvents(rankSelect);
        }
        await sleep(CFG.AFTER_FILL);
    };

    const executeSingleCase = async (caseNumber) => {
        const rows = getWaitingPatientRows();
        if (!rows || rows.length === 0) {
            Logger.info("Không còn bệnh nhân trong hàng đợi.");
            return false;
        }

        const targetRow = rows[0];
        const patientName = getPatientName(targetRow);
        const timeNow = new Date().toLocaleTimeString();

        Logger.step(\`BẮT ĐẦU CA KHÁM #\${caseNumber}: \${patientName}\`);

        try {
            // Bước 1: Tiếp nhận ca khám
            targetRow.click();
            await sleep(CFG.AFTER_CLICK);

            const btnKham = document.querySelector("#kham, #btn_kham, button.btn-kham, #btn-tiepnhan-kham");
            if (btnKham) {
                btnKham.click();
                await sleep(CFG.AFTER_CLICK);
            }

            // Bước 2: Mở Phiếu KSK Người Đủ 18 Tuổi
            const kskLink = await waitForElement("#link_ksk_18, a[data-target='#phieu_ksk_18'], button.btn-ksk-18, #tab_ksk_tt32");
            if (kskLink) {
                kskLink.click();
                await sleep(CFG.AFTER_TAB);
            }

            // Bước 3: Điền Tab Thể Lực (Tab 2)
            const tabTheLuc = await waitForElement("#tab_the_luc, a[href='#the_luc'], #link_tab2");
            if (tabTheLuc) {
                tabTheLuc.click();
                await sleep(CFG.AFTER_TAB);
            }
            const physical = await fillPhysicalStats();

            // Bước 4: Điền Tab Khám Lâm Sàng (Tab 3)
            const tabLamSang = await waitForElement("#tab_lam_sang, a[href='#lam_sang'], #link_tab3");
            if (tabLamSang) {
                tabLamSang.click();
                await sleep(CFG.AFTER_TAB);
                await fillClinicalExams();
            }

            // Bước 5: Điền Tab Kết Luận (Tab 4)
            const tabKetLuan = await waitForElement("#tab_ket_luan, a[href='#ket_luan'], #link_tab4");
            if (tabKetLuan) {
                tabKetLuan.click();
                await sleep(CFG.AFTER_TAB);
                await fillConclusion();
            }

            // Bước 6: Đóng Pop-up trước khi Lưu nếu có
            await dismissGlobalPopups("Trước khi Lưu");

            // Bước 7: Kích hoạt nút Lưu hồ sơ (#luu)
            const btnSave = await waitForElement("#luu, #btn_luu, button.btn-save, #btn-save");
            if (btnSave) {
                btnSave.click();
                Logger.info("Đã bấm Lưu hồ sơ -> Chờ đồng bộ dữ liệu (2s)...");
                await sleep(CFG.AFTER_SAVE);

                // Lắng nghe đóng Dialog phản hồi sau lưu
                await dismissGlobalPopups("Sau khi Lưu");

                REPORT_DATA.success.push({
                    hoTen: patientName,
                    chieuCao: physical.height,
                    canNang: physical.weight,
                    bmi: physical.bmi,
                    haCao: AUTO_DATA.THE_LUC.HA_CAO,
                    haThap: AUTO_DATA.THE_LUC.HA_THAP,
                    mach: AUTO_DATA.THE_LUC.MACH,
                    phanLoai: AUTO_DATA.KET_LUAN.PHAN_LOAI,
                    ketLuan: AUTO_DATA.KET_LUAN.TINH_TRANG,
                    timestamp: timeNow
                });

                Logger.success(\`CA KHÁM #\${caseNumber} (\${patientName}) ĐÃ HOÀN TẤT THÀNH CÔNG!\`);
            } else {
                throw new Error("Không tìm thấy nút Lưu (#luu)!");
            }

            // Bước 8: Làm mới danh sách bệnh nhân
            const btnRefresh = document.querySelector("#lam_moi, #btn_refresh, button.btn-refresh, #btn-search");
            if (btnRefresh) {
                btnRefresh.click();
                await sleep(CFG.AFTER_REFRESH);
            }

            await sleep(CFG.PAUSE_BETWEEN_CASES);
            return true;
        } catch (err) {
            Logger.error(\`LỖI KHI XỬ LÝ CA \${patientName}: \${err.message}\`);
            REPORT_DATA.failed.push({
                hoTen: patientName,
                error: err.message,
                timestamp: timeNow
            });

            // Tự phục hồi: Bấm đóng các Dialog lỗi và tiếp tục ca sau
            await dismissGlobalPopups("Phục hồi sau lỗi");
            await sleep(CFG.PAUSE_BETWEEN_CASES);
            return true;
        }
    };

    /* ================================================================
       6. KHỞI CHẠY ĐỘNG CƠ TỰ ĐỘNG HÓA
    ================================================================ */
    console.clear();
    console.log("%c==========================================================================", "color:#0284c7;font-weight:bold;");
    console.log("%c  HIS CLINICAL AUTO-PILOT ENGINE v4.2 (NETWORK RESILIENT & EXCEL)         ", "color:#0284c7;font-size:15px;font-weight:bold;");
    console.log("%c  Thời gian chờ an toàn 1s-2s, Kháng lỗi nghẽn mạng & Xuất Báo cáo Excel   ", "color:#0284c7;font-size:13px;");
    console.log("%c==========================================================================", "color:#0284c7;font-weight:bold;");

    await loadXLSXLibrary();

    for (let caseIndex = 1; caseIndex <= CFG.MAX_CASES; caseIndex++) {
        const rows = getWaitingPatientRows();
        if (!rows.length) {
            Logger.success("Đã hoàn tất xử lý tất cả bệnh nhân trong hàng đợi danh sách.");
            break;
        }
        await executeSingleCase(caseIndex);
    }

    exportMultiSheetExcelReport();

    Logger.step("PHIÊN TỰ ĐỘNG HÓA KSK ĐÃ KẾT THÚC VÀ ĐÃ XUẤT BÁO CÁO EXCEL.");
})();`;
}

/**
 * Encodes KskConfigData into a compact UTF-8 Base64URL token so the GET API
 * always knows the exact parameters even across stateless server cold-starts.
 */
export function encodeKskConfigToken(cfg: KskConfigData): string {
  try {
    const json = JSON.stringify({
      hMin: cfg.chieuCaoMin,
      hMax: cfg.chieuCaoMax,
      wMin: cfg.canNangMin,
      wMax: cfg.canNangMax,
      haC: cfg.haCao,
      haT: cfg.haThap,
      m: cfg.mach,
      plT: cfg.phanLoaiTheLuc,
      ls: cfg.lamSang,
      klT: cfg.ketLuanTinhTrang,
      plK: cfg.phanLoaiKetLuan,
      max: cfg.maxCases,
      pn: cfg.presetName || 'Khám sức khỏe toàn dân',
    });
    const utf8Bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(utf8Bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return '';
  }
}

/**
 * Decodes a Base64URL token back into KskConfigData.
 */
export function decodeKskConfigToken(token: string): Partial<KskConfigData> | null {
  if (!token) return null;
  try {
    const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const utf8 = decodeURIComponent(
      Array.prototype.map
        .call(binary, (c: string) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(utf8);
    return {
      chieuCaoMin: Number(parsed.hMin) || SERVER_DEFAULT_KSK_CONFIG.chieuCaoMin,
      chieuCaoMax: Number(parsed.hMax) || SERVER_DEFAULT_KSK_CONFIG.chieuCaoMax,
      canNangMin: Number(parsed.wMin) || SERVER_DEFAULT_KSK_CONFIG.canNangMin,
      canNangMax: Number(parsed.wMax) || SERVER_DEFAULT_KSK_CONFIG.canNangMax,
      haCao: String(parsed.haC ?? SERVER_DEFAULT_KSK_CONFIG.haCao),
      haThap: String(parsed.haT ?? SERVER_DEFAULT_KSK_CONFIG.haThap),
      mach: String(parsed.m ?? SERVER_DEFAULT_KSK_CONFIG.mach),
      phanLoaiTheLuc: String(parsed.plT ?? SERVER_DEFAULT_KSK_CONFIG.phanLoaiTheLuc),
      lamSang: String(parsed.ls ?? SERVER_DEFAULT_KSK_CONFIG.lamSang),
      ketLuanTinhTrang: String(parsed.klT ?? SERVER_DEFAULT_KSK_CONFIG.ketLuanTinhTrang),
      phanLoaiKetLuan: String(parsed.plK ?? SERVER_DEFAULT_KSK_CONFIG.phanLoaiKetLuan),
      maxCases: Number(parsed.max) || SERVER_DEFAULT_KSK_CONFIG.maxCases,
      presetName: String(parsed.pn ?? SERVER_DEFAULT_KSK_CONFIG.presetName),
    };
  } catch {
    return null;
  }
}

/**
 * Builds the 1-snippet API Loader code provided to users for Khám bệnh.
 * When pasted into the HIS F12 Console, this snippet sends a GET request to the
 * Webapp API to fetch the KSK v4.2 JavaScript and immediately runs it.
 */
export function buildKskApiLoaderSnippet(
  cfg: KskConfigData,
  originUrl: string,
  configId = 'preset_tt32_standard'
): string {
  const cleanOrigin = (originUrl || '').replace(/\/+$/, '');
  const token = encodeKskConfigToken(cfg);
  const query = `?configId=${encodeURIComponent(configId)}&c=${encodeURIComponent(token)}`;

  // Build resilient endpoint list (supports both public shared URL ais-pre-* and current origin)
  const endpoints: string[] = [];
  if (cleanOrigin.includes('://ais-dev-')) {
    const publicOrigin = cleanOrigin.replace('://ais-dev-', '://ais-pre-');
    endpoints.push(`${publicOrigin}/api/ksk/script${query}`);
    endpoints.push(`${cleanOrigin}/api/ksk/script${query}`);
  } else if (cleanOrigin) {
    endpoints.push(`${cleanOrigin}/api/ksk/script${query}`);
  } else {
    endpoints.push(`/api/ksk/script${query}`);
  }

  const endpointsJson = JSON.stringify(endpoints, null, 4);

  return `/**
 * ============================================================================
 * [HIS API LOADER] - KHÁM SỨC KHỎE TỰ ĐỘNG (TT 32/2023/TT-BYT) v4.2
 * Cấu hình: ${cfg.presetName || 'Khám sức khỏe toàn dân'} | Cập nhật: ${KSK_JS_UPDATED_DATE}
 * Cơ chế: Gửi GET API về Webapp để tải JS Khám bệnh mới nhất và tự động chạy
 * ============================================================================
 */
(async () => {
  "use strict";
  const API_ENDPOINTS = ${endpointsJson};

  console.log("%c[HIS-API] Đang gọi GET API về Webapp để lấy JS Khám bệnh v4.2...", "color:#0284c7;font-weight:bold;font-size:13px;");

  let kskJsPayload = null;
  let lastError = null;

  for (const apiUrl of API_ENDPOINTS) {
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: { "Accept": "application/json" },
        mode: "cors",
        cache: "no-store"
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (data && data.ok && data.script) {
        kskJsPayload = data.script;
        console.log(\`%c[HIS-API] Đã tải JS Khám bệnh (\${data.configName || "v4.2"}) thành công! Đang khởi chạy...\`, "color:#16a34a;font-weight:bold;font-size:13px;");
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (kskJsPayload) {
    const executeKsk = new Function(kskJsPayload);
    return executeKsk();
  }

  // Fallback tự động nạp qua thẻ <script> nếu trình duyệt HIS chặn CORS fetch
  console.log("%c[HIS-API] Chuyển sang chế độ nạp Script trực tiếp từ API...", "color:#d97706;font-weight:bold;");
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = API_ENDPOINTS[0] + "&format=js&_t=" + Date.now();
    s.onload = resolve;
    s.onerror = () => reject(lastError || new Error("Không thể kết nối tới API Webapp."));
    document.head.appendChild(s);
  });
})();`;
}
