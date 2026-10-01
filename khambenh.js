async function autoKSK() {
    console.clear();

    window.isAutoKSKRunning = true;

    const existingBtn = document.getElementById('btn-stop-ksk');
    if (existingBtn) existingBtn.remove();
    
    // TỰ ĐỘNG TẢI THƯ VIỆN EXCELJS
    if (!window.ExcelJS) {
        console.log("%c[HỆ THỐNG]%c Đang tải thư viện xuất Excel...", "background: #0055ff; color: #ffffff; font-weight: bold; padding: 2px 6px;", "color: #0055ff; font-weight: bold;");
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    const LOG_STYLE = {
        TITLE: "background: #00d2d3; color: #000000; font-weight: bold; padding: 5px 12px; border-radius: 4px; font-size: 14px;",
        HEADER: "background: #2e86de; color: #ffffff; font-weight: bold; padding: 4px 10px; border-radius: 3px;",
        STEP: "background: #10ac84; color: #ffffff; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
        TEXT: "color: #000000; font-weight: bold;",
        INFO: "background: #ff9f43; color: #000000; font-weight: bold; padding: 2px 6px; border-radius: 3px;",
        WAIT: "background: #9b59b6; color: #ffffff; font-weight: bold; padding: 3px 8px; border-radius: 3px;",
        SUCCESS: "background: #10ac84; color: #ffffff; font-weight: bold; padding: 3px 8px; border-radius: 3px;",
        ERROR: "background: #ee5253; color: #ffffff; font-weight: bold; padding: 3px 8px; border-radius: 3px;"
    };

    // Lấy thời gian thiết bị định dạng [DD/MM/YYYY HH:mm]
    const getDeviceTimeStr = () => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `[${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}]`;
    };

    const logStep = (prefix, message, style = LOG_STYLE.STEP) => {
        console.log(`%c${getDeviceTimeStr()} ${prefix}%c ${message}`, style, LOG_STYLE.TEXT);
    };

    console.log(`%c 🏥 Sơn Lý Hồng Đức | Đang khám tự động 📊 `, LOG_STYLE.TITLE);

    const DELAY = {
        STEP_PAUSE: 1200,
        INPUT_WAIT: 300
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const getRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // HÀM CHỜ SANG PHÚT MỚI KHI BỊ TRÙNG PHÚT VỚI CA TRƯỚC
    const waitUntilDifferentMinute = async (targetMinute, reasonMsg = "") => {
        logStep('[ĐỜI PHÚT MỚI]', `⏳ ${reasonMsg} Đang đợi đồng hồ nhảy sang phút mới (khác phút ${targetMinute})...`, LOG_STYLE.WAIT);

        while (true) {
            const currentMinute = new Date().getMinutes();
            if (currentMinute !== targetMinute) {
                logStep('[THỜI GIAN HỢP LỆ]', `🟢 Đã sang phút mới (${getDeviceTimeStr()})! Thực hiện bấm 'Khám' ngay lập tức.`, LOG_STYLE.SUCCESS);
                break;
            }
            await sleep(1000);
        }
    };

    const waitForElement = (selector, timeout = 6000) => new Promise((resolve) => {
        const start = Date.now();
        const timer = setInterval(() => {
            const el = document.querySelector(selector);
            if (el && (el.offsetWidth > 0 || el.offsetHeight > 0 || el.offsetParent !== null)) {
                clearInterval(timer);
                resolve(el);
            } else if (Date.now() - start > timeout) {
                clearInterval(timer);
                resolve(null);
            }
        }, 300);
    });

    // XỬ LÝ POP-UP LỖI TRÙNG GIỜ KHÁM
    const handleDuplicateTimeErrorPopup = async () => {
        const jconfirmBox = document.querySelector('.jconfirm-box.jconfirm-type-red, .jconfirm-box');
        if (jconfirmBox && jconfirmBox.offsetWidth > 0 && jconfirmBox.offsetHeight > 0) {
            const boxText = jconfirmBox.innerText || "";
            if (boxText.includes("Dữ liệu không hợp lệ") || boxText.includes("Trùng giờ khám")) {
                logStep('[CẢNH BÁO POP-UP]', '🔴 Phát hiện lỗi "Trùng giờ khám / Dữ liệu không hợp lệ"!', LOG_STYLE.ERROR);
                const okBtn = jconfirmBox.querySelector('.jconfirm-buttons button, .btn-default') || jconfirmBox.querySelector('.jconfirm-closeIcon');
                if (okBtn) {
                    okBtn.click();
                    logStep('[POP-UP]', 'Đã nhấn tắt Pop-up thông báo lỗi.', LOG_STYLE.INFO);
                    await sleep(800);
                }
                return true;
            }
        }
        return false;
    };

    const switchTabSafe = async (tabSelector, targetContentSelector, tabName = "") => {
        logStep('[TAB]', `Chuyển sang: ${tabName}`);
        const tabEl = await waitForElement(tabSelector, 5000);
        if (!tabEl) return false;

        tabEl.click();
        if (window.jQuery) window.jQuery(tabSelector).trigger('click');
        await sleep(800);

        if (targetContentSelector) {
            const contentEl = await waitForElement(targetContentSelector, 4000);
            if (!contentEl) {
                tabEl.click();
                await sleep(1000);
            }
        }
        await sleep(DELAY.STEP_PAUSE);
        return true;
    };

    const setValueSafe = async (selector, val) => {
        const el = await waitForElement(selector, 3000);
        if (!el) return false;
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
        await sleep(DELAY.INPUT_WAIT);
        return true;
    };

    const handlePopupOk = async (maxWaitMs = 3000) => {
        const start = Date.now();
        while (Date.now() - start < maxWaitMs) {
            const isDupError = await handleDuplicateTimeErrorPopup();
            if (isDupError) return 'DUPLICATE_ERROR';

            const btnOk = document.querySelector('#popup_ok, button[id*="popup_ok"], .ui-dialog-buttonpane button');
            if (btnOk && (btnOk.offsetWidth > 0 || btnOk.offsetHeight > 0)) {
                logStep('[POP-UP]', `Phát hiện thông báo ➔ Bấm 'Đồng ý'`, LOG_STYLE.INFO);
                btnOk.click();
                await sleep(1000);
                return true;
            }
            await sleep(300);
        }
        return false;
    };

    const saveAndAcceptPopup = async (stepName) => {
        logStep('[LƯU]', `💾 ${stepName}...`);
        const btnLuu = await waitForElement('#tt32_mau2luuthongtin', 4000);
        if (btnLuu) {
            btnLuu.click();
            await sleep(800);
            return await handlePopupOk(3000);
        }
        return false;
    };

    const closeExamForm = async () => {
        logStep('[ĐÓNG]', `✖️ Đang đóng phiếu khám...`);
        let btnClose = document.querySelector('.ui-dialog-titlebar-close, .ui-icon-closethick, button.close');
        if (btnClose) {
            btnClose.click();
            await sleep(1000);
        }
        const openDialog = document.querySelector('.ui-dialog:not([style*="display: none"])');
        if (openDialog) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            await sleep(1000);
        }
    };

    const successData = [];
    const failedData = [];
    let totalProcessed = 0;
    
    // BIẾN LƯU PHÚT BẤM "KHÁM" CỦA CA TRƯỚC
    let previousKhamMinute = null;

    // VÒNG LẶP KHÁM LIÊN TỤC
    while (true) {
        console.log(`\n%c 🔄 BẮT ĐẦU CA KHÁM THỨ ${totalProcessed + 1} %c`, LOG_STYLE.HEADER, "background: transparent;");

        // BƯỚC 1: Bấm "Làm mới" và kiểm tra danh sách
        let patientRows = [];
        let retryCount = 0;
        const MAX_RETRIES = 5;

        while (retryCount < MAX_RETRIES) {
            retryCount++;
            logStep('[LÀM MỚI]', `Bước 1: Bấm 'Làm mới' danh sách (Lần ${retryCount}/${MAX_RETRIES})...`);
            
            const btnLamMoi = await waitForElement('#lammoi', 4000);
            if (btnLamMoi) btnLamMoi.click();
            await sleep(1200);

            patientRows = Array.from(document.querySelectorAll('tr.jqgrow')).filter(row => row.offsetParent !== null);
            if (patientRows.length > 0) break;

            logStep('[THÔNG BÁO]', `Không thấy bệnh nhân. Thử lại sau 1.5s...`, LOG_STYLE.INFO);
        }

        if (patientRows.length === 0) {
            console.log("\n%c 🎉 HẾT BỆNH NHÂN (ĐÃ THỬ LÀM MỚI 5 LẦN)! TỰ ĐỘNG XUẤT EXCEL VÀ KẾT THÚC. %c", LOG_STYLE.TITLE, "background: transparent;");
            break;
        }

        const targetRow = patientRows[0];
        
        const nameCell = targetRow.querySelector('td[aria-describedby*="TEN_BENH_NHAN"]');
        const patientName = nameCell ? nameCell.textContent.trim() : 'Chưa rõ tên';

        const timeCell = targetRow.querySelector('td[aria-describedby*="TG_KHAM"], td[aria-describedby*="GIO_KHAM"], td[aria-describedby*="THOI_GIAN"]');
        const currentExamTime = timeCell ? timeCell.textContent.trim() : '';

        const caseStartTime = Date.now();

        logStep('[BƯỚC 2]', `Chọn bệnh nhân: ${patientName} | Giờ khám ghi nhận: [${currentExamTime || 'Không có'}]`);
        targetRow.click();
        await sleep(800);

        let currentRecord = {
            stt: totalProcessed + 1,
            ten: patientName,
            gioKham: currentExamTime,
            chieuCao: '',
            canNang: '',
            haCao: '',
            haThap: '',
            mach: '',
            phanLoaiTL: '',
            chuyenKhoa: 'Loại I',
            phanLoaiTongQuat: '',
            thoiGian: '',
            lyDoLoi: ''
        };

        try {
            // KIỂM TRA: NẾU TRÙNG PHÚT BẤM "KHÁM" VỚI CA TRƯỚC -> MỚI PHẢI CHỜ SANG PHÚT MỚI
            if (previousKhamMinute !== null) {
                const currentMinuteNow = new Date().getMinutes();
                if (currentMinuteNow === previousKhamMinute) {
                    await waitUntilDifferentMinute(
                        previousKhamMinute, 
                        `Phút hiện tại (${currentMinuteNow}) trùng với phút bấm 'Khám' của ca trước!`
                    );
                } else {
                    logStep('[XÁC NHẬN THỜI GIAN]', `🟢 Đã khác phút bấm 'Khám' của ca trước (${currentMinuteNow} khác ${previousKhamMinute}) ➔ Bấm 'Khám' ngay.`, LOG_STYLE.INFO);
                }
            }

            let clickKhamSuccess = false;

            // BƯỚC 3: Bấm nút "Khám"
            while (!clickKhamSuccess) {
                logStep('[BƯỚC 3]', `Bấm nút 'Khám'...`);
                
                const btnKham = await waitForElement('#kham', 4000);
                if (btnKham) btnKham.click();
                await sleep(1000);

                // Cập nhật lại phút bấm "Khám"
                previousKhamMinute = new Date().getMinutes();

                // Kiểm tra Pop-up lỗi trùng giờ nếu có
                const isDupError = await handleDuplicateTimeErrorPopup();
                if (isDupError) {
                    await waitUntilDifferentMinute(previousKhamMinute, "Dính lỗi trùng giờ khám từ hệ thống!");
                } else {
                    clickKhamSuccess = true;
                }
            }

            // BƯỚC 4: Chọn mẫu KSK đủ 18
            logStep('[BƯỚC 4]', `Chọn 'KSK đủ 18 tuổi'...`);
            const btnKSK18 = await waitForElement('#khamsuckhoetheodoituongdu18', 4000);
            if (btnKSK18) btnKSK18.click();
            await sleep(1200);

            // BƯỚC 5 & 6: LƯU 1
            await saveAndAcceptPopup("Lần 1 - Thông tin chung");

            // BƯỚC 7: Tab Thể lực
            await switchTabSafe('#tt32_mau2ksk_tab2', '#tt32_mau2chieucao', "Khám Thể Lực");

            // BƯỚC 8-11: Nhập Thể lực
            currentRecord.chieuCao = getRandom(150, 180);
            currentRecord.canNang = getRandom(40, 70);
            currentRecord.haCao = getRandom(110, 130);
            currentRecord.haThap = getRandom(70, 80);
            currentRecord.mach = getRandom(65, 90);
            currentRecord.phanLoaiTL = 'Loại I';

            logStep('[BƯỚC 8-11]', `Chỉ số: Cao ${currentRecord.chieuCao}cm, Nặng ${currentRecord.canNang}kg, HA ${currentRecord.haCao}/${currentRecord.haThap}, Mạch ${currentRecord.mach} l/p`);

            await setValueSafe('#tt32_mau2chieucao', currentRecord.chieuCao);
            await setValueSafe('#tt32_mau2cannang', currentRecord.canNang);
            await setValueSafe('#tt32_mau2kskhuyetapcao', currentRecord.haCao);
            await setValueSafe('#tt32_mau2kskhuyetapthap', currentRecord.haThap);
            await setValueSafe('#tt32_mau2kskmach', currentRecord.mach);
            await setValueSafe('#tt32_mau2phanloaitheluc', currentRecord.phanLoaiTL);

            // BƯỚC 12 & 13: LƯU 2
            await saveAndAcceptPopup("Lần 2 - Thể lực");

            // BƯỚC 14: Tab Lâm sàng & 10 chuyên khoa
            await switchTabSafe('#tt32_mau2ksk_tab3', '#tt32_mau2tuanhoanphanloai', "Khám Lâm Sàng");
            logStep('[BƯỚC 14]', `Điền 10 chuyên khoa (Loại I)...`);

            const clinicalSelectIds = [
                '#tt32_mau2tuanhoanphanloai', '#tt32_mau2hohapphanloai', '#tt32_mau2tieuhoaphanloai',
                '#tt32_mau2thantietnieuphanloai', '#tt32_mau2noitietphanloai', '#tt32_mau2coxuongkhopphanloai',
                '#tt32_mau2thankinhphanloai', '#tt32_mau2tamthanphanloai', '#tt32_mau2ngoaikhoaphanloai',
                '#tt32_mau2ngkdalieuphanloai'
            ];
            for (const id of clinicalSelectIds) {
                await setValueSafe(id, 'Loại I');
            }

            // BƯỚC 15: LƯU 3
            await saveAndAcceptPopup("Lần 3 - Khám Lâm sàng");

            // BƯỚC 16: Tab Tổng kết
            await switchTabSafe('#tt32_mau2ksk_tab4', '#tt32_mau2suckhoabinhthuong', "Cận lâm sàng - Tổng kết");

            // BƯỚC 17: Phân loại tổng quát
            currentRecord.phanLoaiTongQuat = 'Loại I';
            logStep('[BƯỚC 17]', `Phân loại sức khỏe tổng quát: Loại I`);
            await setValueSafe('#tt32_mau2suckhoabinhthuong', currentRecord.phanLoaiTongQuat);

            // BƯỚC 18: LƯU 4
            await saveAndAcceptPopup("Lần 4 - Tổng kết");

            // BƯỚC 19: Đóng Phiếu
            await closeExamForm();

            // BƯỚC 20: LƯU NGOÀI CÙNG (HOÀN TẤT CA)
            logStep('[BƯỚC 20]', `💾 Nhấn 'Lưu' (Bước cuối)...`);
            const btnLuuCuoi = await waitForElement('#luu', 4000);
            if (btnLuuCuoi) btnLuuCuoi.click();
            await sleep(1000);

            await handleDuplicateTimeErrorPopup();

            totalProcessed++;

            const caseEndTime = Date.now();
            const durationInSeconds = ((caseEndTime - caseStartTime) / 1000).toFixed(1);
            currentRecord.thoiGian = `${durationInSeconds}s`;

            successData.push(currentRecord);

            logStep('[THÀNH CÔNG]', `Hoàn thành ca khám ${patientName}! Phút bấm 'Khám': [${previousKhamMinute}]`, LOG_STYLE.SUCCESS);

            // Không cần chờ 15 giây nữa, tiếp tục ngay ca sau
            await sleep(1000);

        } catch (err) {
            logStep('[THẤT BẠI]', `Lỗi ca khám: ${err.message}. Chuyển sang ca tiếp theo...`, LOG_STYLE.ERROR);
            currentRecord.lyDoLoi = err.message || "Giao diện không phản hồi";
            failedData.push(currentRecord);
            await closeExamForm();
            await sleep(1500);
        }
    }

    // XUẤT EXCEL
    async function exportToExcel() {
        console.log("\n%c 📊 ĐANG XUẤT FILE EXCEL BÁO CÁO... ", LOG_STYLE.TITLE);

        const workbook = new ExcelJS.Workbook();
        
        // 1. SHEET THÀNH CÔNG
        const sheetSuccess = workbook.addWorksheet('Thành công');
        sheetSuccess.columns = [
            { header: 'STT', key: 'stt', width: 8 },
            { header: 'Họ và Tên Bệnh Nhân', key: 'ten', width: 25 },
            { header: 'Giờ khám ghi nhận', key: 'gioKham', width: 18 },
            { header: 'Chiều cao (cm)', key: 'chieuCao', width: 15 },
            { header: 'Cân nặng (kg)', key: 'canNang', width: 15 },
            { header: 'Huyết áp cao', key: 'haCao', width: 15 },
            { header: 'Huyết áp thấp', key: 'haThap', width: 15 },
            { header: 'Mạch (lần/phút)', key: 'mach', width: 18 },
            { header: 'Phân loại thể lực', key: 'phanLoaiTL', width: 18 },
            { header: 'Phân loại chuyên khoa', key: 'chuyenKhoa', width: 22 },
            { header: 'Sức khỏe tổng quát', key: 'phanLoaiTongQuat', width: 22 },
            { header: 'Thời gian khám', key: 'thoiGian', width: 15 }
        ];

        sheetSuccess.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        sheetSuccess.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '107C41' } };
        successData.forEach(item => sheetSuccess.addRow(item));

        // 2. SHEET THẤT BẠI
        const sheetFailed = workbook.addWorksheet('Thất bại');
        sheetFailed.columns = [
            { header: 'STT', key: 'stt', width: 8 },
            { header: 'Họ và Tên Bệnh Nhân', key: 'ten', width: 25 },
            { header: 'Giờ khám ghi nhận', key: 'gioKham', width: 18 },
            { header: 'Lý do thất bại / Lỗi phát sinh', key: 'lyDoLoi', width: 45 },
            { header: 'Thời gian ngắt', key: 'thoiGian', width: 15 }
        ];

        sheetFailed.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        sheetFailed.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C00000' } };
        failedData.forEach(item => sheetFailed.addRow(item));

        // TẢI FILE EXCEL
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const now = new Date();
        const dateStr = `${now.getDate()}_${now.getMonth() + 1}_${now.getFullYear()}_${now.getHours()}h${now.getMinutes()}m`;
        link.download = `Bao_Cao_Kham_Suc_Khoe_${dateStr}.xlsx`;
        link.click();

        logStep('[HOÀN TẤT]', `File Excel đã được tải xuống thành công: Bao_Cao_Kham_Suc_Khoe_${dateStr}.xlsx`, LOG_STYLE.SUCCESS);
    }

    await exportToExcel();
}

autoKSK();
