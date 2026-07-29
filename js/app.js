/* ============================================================
 *  NOXH App - Tra cứu căn hộ & Tính khoản vay
 * ============================================================ */

const API_URL = 'https://script.google.com/macros/s/AKfycbx03jqDpeLsq6-6C-bUxa4tsq_sRTp1nZvrVb6CqiEunHn0kopxMWyZd9v8RBoGERrPmQ/exec';

/* ============================================================
 *  1. ĐIỀU HƯỚNG TAB
 * ============================================================ */
function switchTab(tabName) {
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('hidden', panel.dataset.tab !== tabName);
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('tab-active', btn.dataset.tab === tabName);
    });
}

/* ============================================================
 *  2. HÀM TIỆN ÍCH CHUNG
 * ============================================================ */

// Toast thông báo thay cho alert mặc định (thân thiện với Mobile)
function showToast(message, type = 'error', duration = 2800) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Giới hạn tối đa 3 toast cùng lúc, đầy thì bỏ cái cũ nhất
    while (container.children.length >= 3) {
        container.removeChild(container.firstChild);
    }

    const icons = { error: '⚠️', warning: '⚠️', success: '✅', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);

    // Rung nhẹ trên điện thoại khi báo lỗi (trình duyệt không hỗ trợ sẽ bỏ qua)
    if (type === 'error' && navigator.vibrate) {
        navigator.vibrate(80);
    }

    let hideTimer;
    const dismiss = () => {
        clearTimeout(hideTimer);
        toast.classList.add('toast-hide');
        toast.addEventListener('animationend', () => toast.remove(), { once: true });
    };

    toast.addEventListener('click', dismiss); // Chạm vào toast để tắt ngay
    hideTimer = setTimeout(dismiss, duration);
}
function formatMoney(amount) {
    if (isNaN(amount)) {
        return 'N/A';
    }
    return Math.round(amount).toLocaleString('vi-VN');
}

// Sao chép số tài khoản ủng hộ vào clipboard (có fallback cho trình duyệt cũ)
const DONATE_ACCOUNT = '0960146968888';

function copyDonateAccount() {
    const done = () => showToast('Đã sao chép số tài khoản MBBank!', 'success');
    const fallback = () => {
        const textarea = document.createElement('textarea');
        textarea.value = DONATE_ACCOUNT;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            done();
        } catch (err) {
            showToast('Không sao chép được, vui lòng chép thủ công!', 'warning');
        }
        textarea.remove();
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(DONATE_ACCOUNT).then(done).catch(fallback);
    } else {
        fallback();
    }
}

// Khóa nút + hiện spinner trong CALC_DELAY_MS rồi mới chạy tính toán và mở khóa
const CALC_DELAY_MS = 2000;

function runCalcWithSpinner(btnId, loadingText, calcFn) {
    const btn = document.getElementById(btnId);
    const text = document.getElementById(`${btnId}-text`);
    const spinner = document.getElementById(`${btnId}-spinner`);
    const normalText = text.innerText;

    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    text.innerText = loadingText;
    spinner.classList.remove('hidden');

    setTimeout(() => {
        calcFn();
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        text.innerText = normalText;
        spinner.classList.add('hidden');
    }, CALC_DELAY_MS);
}

// Đọc giá trị số từ ô input có định dạng dấu chấm ngăn cách (vd: "1.200.000.000")
function parseMoneyInput(value) {
    return Number(String(value).replace(/[^\d]/g, '')) || 0;
}

// Định dạng lại ô nhập tiền ngay khi gõ (thêm dấu chấm ngăn cách hàng nghìn)
function attachMoneyFormatter(inputEl, onChange) {
    inputEl.addEventListener('input', (e) => {
        const raw = parseMoneyInput(e.target.value);
        e.target.value = raw ? raw.toLocaleString('vi-VN') : '';
        if (onChange) onChange(raw);
    });
}

/* ============================================================
 *  3. TRA CỨU CĂN HỘ
 * ============================================================ */
const searchInputEl = document.getElementById('search-input');
let isBackspace = false;

// Hỗ trợ người dùng bấm nút Enter trên bàn phím điện thoại để tìm luôn
searchInputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

// Kiểm tra xem người dùng có bấm nút xóa (Backspace) không
searchInputEl.addEventListener('keydown', (e) => {
    isBackspace = (e.key === 'Backspace');
});

// Tự động chèn dấu "-" và "." theo cú pháp E2-D.0302 khi đang gõ
searchInputEl.addEventListener('input', (e) => {
    const cursorPosition = e.target.selectionStart;
    const originalLength = e.target.value.length;

    const formatted = formatInstantCode(e.target.value);
    e.target.value = formatted;

    // Giữ vị trí con trỏ chuột chính xác
    const delta = formatted.length - originalLength;
    e.target.setSelectionRange(cursorPosition + delta, cursorPosition + delta);
});

function formatInstantCode(value) {
    // Loại bỏ các ký tự đặc biệt để lấy chuỗi thô
    const clean = value.replace(/[-.]/g, '');
    let formatted = '';

    // Cú pháp gõ: E2-D.0302
    if (clean.length > 0) {
        formatted += clean.substring(0, 2);
    }

    // Nếu gõ đủ 2 ký tự (E2) và KHÔNG phải đang nhấn xóa -> thêm luôn dấu "-"
    if (clean.length === 2 && !isBackspace) {
        formatted += '-';
    } else if (clean.length > 2) {
        formatted += '-' + clean.substring(2, 3);
    }

    // Nếu gõ đủ 3 ký tự thô (E2D) và KHÔNG phải đang nhấn xóa -> thêm luôn dấu "."
    if (clean.length === 3 && !isBackspace) {
        formatted += '.';
    } else if (clean.length > 3) {
        formatted += '.' + clean.substring(3, 12);
    }

    return formatted;
}

function getImageUrl(kyHieuCanHo) {
    // Lấy ký tự cuối cùng của ký hiệu căn hộ làm tên đơn nguyên
    const donNguyen = kyHieuCanHo.substring(kyHieuCanHo.length - 1);
    return `images/${donNguyen}.jpg`;
}

async function handleSearch() {
    const btn = document.getElementById('search-btn');
    const btnText = document.getElementById('btn-text');
    const btnSpinner = document.getElementById('btn-spinner');
    const resultContainer = document.getElementById('result-container');

    // Định dạng chuỗi nhập vào: Viết hoa, xóa khoảng trắng thừa
    const query = searchInputEl.value.trim().toUpperCase();

    if (!query) {
        showToast('Vui lòng nhập mã căn hộ cần tìm!');
        searchInputEl.focus();
        return;
    }

    // ── KHÓA NÚT & HIỂN THỊ LOADING (Tránh click spam nhiều lần) ──
    btn.disabled = true;
    btn.classList.add('opacity-75', 'cursor-not-allowed');
    btnText.innerText = 'Đang tra cứu...';
    btnSpinner.classList.remove('hidden');

    // Ẩn vùng kết quả cũ khi đang tìm kiếm
    resultContainer.classList.add('hidden');

    // Fetch dữ liệu từ API
    const result = await fetch(`${API_URL}?ma_can_ho=${query}`)
        .then(response => response.json())
        .catch(error => {
            console.error('Lỗi khi fetch dữ liệu:', error);
            showToast('Không thể kết nối máy chủ, vui lòng kiểm tra mạng và thử lại!');
            return {};
        });

    const apartment = (result && result.data) || {};

    if (apartment && Object.keys(apartment).length > 0) {
        const giaCanHo = apartment.gia_ban_ki * apartment.dien_tich_can_ho;

        // Thiết kế Thẻ Kết Quả (Card) đầy đủ thông số như ảnh scan
        resultContainer.innerHTML = `
            <div class="bg-gradient-to-br from-blue-600 to-blue-700 text-white p-5 rounded-2xl shadow-lg border border-blue-500">
                <div class="flex justify-between items-center border-b border-white/20 pb-3 mb-4">
                    <div>
                        <p class="text-[10px] uppercase font-bold tracking-widest text-blue-200">Mã Căn Hộ</p>
                        <h2 class="text-2xl font-black font-mono mt-0.5">${apartment.ma_can_ho}</h2>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full">Tòa ${apartment.toa}</span>
                    </div>
                </div>

                <!-- Lưới thông số kỹ thuật tối ưu 2 cột trên Mobile -->
                <div class="grid grid-cols-2 gap-y-3.5 gap-x-2 text-sm">
                    <div>
                        <p class="text-[11px] text-blue-200 font-medium">Tầng / Số Căn</p>
                        <p class="font-bold text-base">Tầng ${apartment.tang} — Căn ${apartment.so_can}</p>
                    </div>
                    <div>
                        <p class="text-[11px] text-blue-200 font-medium">Đơn Nguyên / Ký Hiệu</p>
                        <p class="font-bold text-base">ĐN ${apartment.don_nguyen} — ${apartment.ky_hieu_can_ho}</p>
                    </div>
                    <div class="col-span-2 border-t border-white/10 my-0.5"></div>
                    <div>
                        <p class="text-[11px] text-blue-200 font-medium">Diện Tích Căn Hộ</p>
                        <p class="font-bold text-base">${apartment.dien_tich_can_ho} m²</p>
                    </div>
                    <div>
                        <p class="text-[11px] text-blue-200 font-medium">Hệ Số Điều Chỉnh (Ki)</p>
                        <p class="font-bold text-base">${apartment.he_so_ki}</p>
                    </div>
                    <div>
                        <p class="text-[11px] text-blue-200 font-medium">Số thứ tự</p>
                        <p class="font-bold text-base">${apartment.stt}</p>
                    </div>
                    <div class="flex items-center justify-end">
                        <button onclick="prefillPrice(${apartment.gia_ban_ki / (apartment.he_so_ki || 1)}, ${apartment.he_so_ki}, ${apartment.dien_tich_can_ho})"
                                class="text-xs font-bold bg-white/15 hover:bg-white/25 border border-white/30 px-3 py-2 rounded-lg transition-all active:scale-[0.98]">
                            🧮 Tính giá theo đợt
                        </button>
                    </div>
                    <div class="col-span-2 border-t border-white/10 my-0.5"></div>
                    <div class="col-span-2 bg-white/10 p-3 rounded-xl space-y-1.5 mt-1">
                        <div class="flex justify-between items-center">
                            <span class="text-xs text-blue-100">Giá bán (gồm VAT):</span>
                            <span class="font-extrabold text-yellow-300 text-base">${formatMoney(apartment.gia_ban_ki)} đ/m²</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-xs text-blue-100">Giá căn hộ dự kiến (chưa bao gồm 2% phí bảo trì):</span>
                        </div>
                        <div class="flex justify-end items-center">
                            <span class="font-extrabold text-orange-400 text-base">${formatMoney(giaCanHo)} đ</span>
                        </div>
                        <hr>
                        <div class="flex justify-between items-center border-t border-white/10 pt-1.5">
                            <span class="text-xs text-blue-100">Vị trí căn hộ:</span>
                        </div>
                        <div class="flex justify-between items-center border-t border-white/10 pt-1.5">
                            <img src="${getImageUrl(apartment.ky_hieu_can_ho)}" class="inline-block rounded-lg" alt="Vị trí">
                        </div>
                    </div>
                </div>

                <!-- Nút chuyển nhanh sang tab tính khoản vay với giá căn này -->
                <button onclick="prefillLoan(${giaCanHo || 0})"
                        class="w-full mt-4 bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
                    💰 Tính khoản vay cho căn này
                </button>

                <div class="mt-3">
                    <span class="text-xs text-red-200">
                        ⚠️ Thông tin tham khảo: Dữ liệu này được trích xuất từ văn bản gốc phía dưới, thời điểm trích xuất thông tin có thể chưa phải là mới nhất, anh/chị chỉ sử dụng nhằm mục đích tham khảo.
                        Anh/chị vui lòng đối chiếu trên văn bản gốc được chủ đầu tư công bố.
                    </span>
                </div>
                <div>
                    <a href="https://drive.google.com/file/d/1NQzxgDTYGVBDcxJ9yi5KkKbUboD7x2uv/view" target="_blank" class="text-xs text-blue-200 hover:text-blue-100">📄 Xem chi tiết văn bản gốc tại đây</a>
                </div>
            </div>
        `;
    } else {
        // Trả về thông báo không tìm thấy định dạng Mobile thân thiện
        resultContainer.innerHTML = `
            <div class="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-center text-sm font-medium">
                ❌ Không tìm thấy mã căn hộ <span class="font-mono font-bold">[${query}]</span> hoặc chưa được cập nhật. Vui lòng kiểm tra lại!
            </div>
        `;
    }

    // ── MỞ KHÓA LẠI NÚT BẤM SAU KHI HOÀN THÀNH TRA CỨU ──
    btn.disabled = false;
    btn.classList.remove('opacity-75', 'cursor-not-allowed');
    btnText.innerText = 'Tra cứu ngay';
    btnSpinner.classList.add('hidden');

    // Hiển thị mượt mà vùng kết quả
    resultContainer.classList.remove('hidden');
    resultContainer.classList.add('fade-in');
}

/* ============================================================
 *  4. TÍNH GIÁ CĂN HỘ
 * ============================================================ */
const pricePerM2El = document.getElementById('price-per-m2');
const priceKiEl = document.getElementById('price-ki');
const priceAreaEl = document.getElementById('price-area');
const priceResultEl = document.getElementById('price-result');

// Các mức đóng theo đợt (%) tính trên tổng tiền gồm phí bảo trì
const PAYMENT_LEVELS = [5, 10, 15, 20, 25, 50];
const MAINTENANCE_RATE = 0.02; // Phí bảo trì 2%

// Định dạng tiền khi gõ vào ô giá bán trên m²
attachMoneyFormatter(pricePerM2El);

// Được gọi từ nút "Tính giá theo đợt" trên thẻ kết quả tra cứu:
// điền sẵn giá/m² gốc (giá bán ÷ Ki), hệ số Ki, diện tích rồi tính luôn
function prefillPrice(basePricePerM2, ki, area) {
    switchTab('price');
    if (basePricePerM2 > 0 && ki > 0 && area > 0) {
        pricePerM2El.value = Math.round(basePricePerM2).toLocaleString('vi-VN');
        priceKiEl.value = ki;
        priceAreaEl.value = area;
        handlePriceCalc();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handlePriceCalc() {
    const pricePerM2 = parseMoneyInput(pricePerM2El.value);
    const ki = Number(priceKiEl.value);
    const area = Number(priceAreaEl.value);

    if (!pricePerM2) {
        showToast('Vui lòng nhập giá bán trên m²!');
        pricePerM2El.focus();
        return;
    }
    if (!ki || ki <= 0) {
        showToast('Vui lòng nhập hệ số Ki hợp lệ!');
        priceKiEl.focus();
        return;
    }
    if (!area || area <= 0) {
        showToast('Vui lòng nhập diện tích hợp lệ!');
        priceAreaEl.focus();
        return;
    }

    // Ẩn kết quả cũ, quay spinner ~2s rồi mới tính và hiển thị
    priceResultEl.classList.add('hidden');
    runCalcWithSpinner('price-btn', 'Đang tính...', () => renderPriceResult(pricePerM2, ki, area));
}

// Tính toán và hiển thị kết quả giá căn hộ
function renderPriceResult(pricePerM2, ki, area) {
    const pricePerM2Ki = pricePerM2 * ki;              // Đơn giá sau hệ số Ki
    const totalPrice = pricePerM2Ki * area;             // Tổng tiền căn hộ
    const maintenanceFee = totalPrice * MAINTENANCE_RATE; // Phí bảo trì 2%
    const grandTotal = totalPrice + maintenanceFee;     // Tổng gồm bảo trì

    const levelRows = PAYMENT_LEVELS.map(p => `
        <tr>
            <td class="text-center font-bold">${p}%</td>
            <td class="text-right font-bold">${formatMoney(grandTotal * p / 100)}</td>
        </tr>
    `).join('');

    priceResultEl.innerHTML = `
        <div class="bg-gradient-to-br from-violet-600 to-purple-700 text-white p-5 rounded-2xl shadow-lg border border-violet-500">
            <div class="border-b border-white/20 pb-3 mb-4">
                <p class="text-[10px] uppercase font-bold tracking-widest text-violet-200">Kết quả tính giá căn hộ</p>
                <h2 class="text-lg font-black mt-0.5">${formatMoney(pricePerM2)} đ/m² × Ki ${ki} × ${area} m²</h2>
            </div>

            <div class="grid grid-cols-2 gap-y-3.5 gap-x-2 text-sm">
                <div>
                    <p class="text-[11px] text-violet-200 font-medium">Đơn giá sau hệ số Ki</p>
                    <p class="font-bold text-base">${formatMoney(pricePerM2Ki)} đ/m²</p>
                </div>
                <div>
                    <p class="text-[11px] text-violet-200 font-medium">Phí bảo trì (2%)</p>
                    <p class="font-bold text-base">${formatMoney(maintenanceFee)} đ</p>
                </div>

                <div class="col-span-2 bg-white/10 p-3 rounded-xl space-y-1.5 mt-1">
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-violet-100">Tổng tiền căn hộ:</span>
                        <span class="font-extrabold text-yellow-300 text-base">${formatMoney(totalPrice)} đ</span>
                    </div>
                    <div class="flex justify-between items-center border-t border-white/10 pt-1.5">
                        <span class="text-xs text-violet-100">Tổng + 2% phí bảo trì:</span>
                        <span class="font-extrabold text-orange-300 text-base">${formatMoney(grandTotal)} đ</span>
                    </div>
                </div>
            </div>

            <!-- Bảng các mức đóng theo đợt -->
            <div class="mt-4">
                <p class="text-xs font-bold text-violet-100 mb-2">📋 Số tiền từng đợt đóng (tính trên tổng gồm bảo trì)</p>
                <table class="schedule-table w-full text-xs">
                    <thead>
                        <tr class="border-b border-white/20 text-violet-200">
                            <th class="text-center">Mức đóng</th>
                            <th class="text-right">Số tiền (đ)</th>
                        </tr>
                    </thead>
                    <tbody>${levelRows}</tbody>
                </table>
            </div>

            <!-- Chuyển nhanh sang tab tính khoản vay -->
            <button onclick="prefillLoan(${totalPrice})"
                    class="w-full mt-4 bg-white/15 hover:bg-white/25 border border-white/30 text-white font-bold py-3 px-4 rounded-xl transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
                💰 Tính khoản vay với giá này
            </button>

            <div class="mt-3">
                <span class="text-xs text-violet-100/80">
                    ⚠️ Kết quả chỉ mang tính tham khảo. Số tiền và tiến độ đóng từng đợt thực tế theo thông báo của chủ đầu tư.
                </span>
            </div>
        </div>
    `;

    priceResultEl.classList.remove('hidden');
    priceResultEl.classList.add('fade-in');
}

/* ============================================================
 *  5. TÍNH KHOẢN VAY
 * ============================================================ */
const loanPriceEl = document.getElementById('loan-price');
const loanRatioEl = document.getElementById('loan-ratio');
const loanRatioLabelEl = document.getElementById('loan-ratio-label');
const loanAmountLabelEl = document.getElementById('loan-amount-label');
const loanRateEl = document.getElementById('loan-rate');
const loanYearsEl = document.getElementById('loan-years');
const loanMethodEl = document.getElementById('loan-method');
const loanResultEl = document.getElementById('loan-result');

let loanSchedule = [];          // Lịch trả nợ theo từng tháng của lần tính gần nhất

// Kỳ trả nợ thứ i (i = 0 là kỳ đầu tiên) — bắt đầu từ tháng liền sau tháng hiện tại
function getPaymentMonth(i) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
}

function formatMonth(date) {
    return `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

// Định dạng tiền khi gõ vào ô giá trị căn hộ
attachMoneyFormatter(loanPriceEl, updateLoanAmountLabel);

// Cập nhật nhãn % và số tiền vay khi kéo thanh trượt
loanRatioEl.addEventListener('input', () => updateLoanAmountLabel());

function updateLoanAmountLabel() {
    const price = parseMoneyInput(loanPriceEl.value);
    const ratio = Number(loanRatioEl.value);
    loanRatioLabelEl.innerText = `${ratio}%`;
    loanAmountLabelEl.innerText = `${formatMoney(price * ratio / 100)} đ`;
}

// Được gọi từ nút "Tính khoản vay cho căn này" trên thẻ kết quả tra cứu
function prefillLoan(price) {
    switchTab('loan');
    if (price > 0) {
        loanPriceEl.value = Math.round(price).toLocaleString('vi-VN');
        updateLoanAmountLabel();
        handleLoanCalc();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleLoanCalc() {
    const price = parseMoneyInput(loanPriceEl.value);
    const ratio = Number(loanRatioEl.value);
    const annualRate = Number(loanRateEl.value);
    const years = Number(loanYearsEl.value);
    const method = loanMethodEl.value;

    if (!price) {
        showToast('Vui lòng nhập giá trị căn hộ!');
        loanPriceEl.focus();
        return;
    }
    if (!annualRate || annualRate <= 0) {
        showToast('Vui lòng nhập lãi suất hợp lệ!');
        loanRateEl.focus();
        return;
    }
    if (!years || years <= 0 || years > 25) {
        showToast('Thời hạn vay từ 1 đến 25 năm!');
        loanYearsEl.focus();
        return;
    }

    // Ẩn kết quả cũ, quay spinner ~2s rồi mới tính và hiển thị
    loanResultEl.classList.add('hidden');
    runCalcWithSpinner('loan-btn', 'Đang tính...', () => renderLoanResult(price, ratio, annualRate, years, method));
}

// Tính toán và hiển thị kết quả khoản vay
function renderLoanResult(price, ratio, annualRate, years, method) {
    const loanAmount = price * ratio / 100;      // Số tiền vay
    const ownCapital = price - loanAmount;       // Vốn tự có
    const months = years * 12;
    const monthlyRate = annualRate / 12 / 100;

    // ── Xây lịch trả nợ theo TỪNG THÁNG, kỳ đầu là tháng hiện tại + 1 ──
    // Trả đều (niên kim): gốc + lãi cố định mỗi tháng
    const factor = Math.pow(1 + monthlyRate, months);
    const annuityPayment = loanAmount * monthlyRate * factor / (factor - 1);

    loanSchedule = [];
    let remaining = loanAmount;
    for (let i = 0; i < months; i++) {
        const interest = remaining * monthlyRate;
        const principal = (method === 'declining')
            ? loanAmount / months           // Dư nợ giảm dần: gốc chia đều mỗi tháng
            : annuityPayment - interest;    // Trả đều: phần gốc tăng dần
        remaining -= principal;
        loanSchedule.push({
            label: formatMonth(getPaymentMonth(i)),
            principal: principal,
            interest: interest,
        });
    }

    const firstPayment = loanSchedule[0].principal + loanSchedule[0].interest;
    const lastRow = loanSchedule[months - 1];
    const lastPayment = lastRow.principal + lastRow.interest;
    const totalInterest = loanSchedule.reduce((sum, r) => sum + r.interest, 0);

    const methodLabel = method === 'declining'
        ? 'Dư nợ giảm dần (trả giảm dần theo tháng)'
        : 'Trả đều hàng tháng (gốc + lãi cố định)';

    loanResultEl.innerHTML = `
        <div class="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-2xl shadow-lg border border-emerald-500">
            <div class="border-b border-white/20 pb-3 mb-4">
                <p class="text-[10px] uppercase font-bold tracking-widest text-emerald-200">Kết quả tính khoản vay</p>
                <h2 class="text-lg font-black mt-0.5">${methodLabel}</h2>
            </div>

            <div class="grid grid-cols-2 gap-y-3.5 gap-x-2 text-sm">
                <div>
                    <p class="text-[11px] text-emerald-200 font-medium">Số tiền vay (${ratio}%)</p>
                    <p class="font-bold text-base">${formatMoney(loanAmount)} đ</p>
                </div>
                <div>
                    <p class="text-[11px] text-emerald-200 font-medium">Vốn tự có (${100 - ratio}%)</p>
                    <p class="font-bold text-base">${formatMoney(ownCapital)} đ</p>
                </div>
                <div>
                    <p class="text-[11px] text-emerald-200 font-medium">Lãi suất</p>
                    <p class="font-bold text-base">${annualRate}%/năm</p>
                </div>
                <div>
                    <p class="text-[11px] text-emerald-200 font-medium">Thời hạn vay</p>
                    <p class="font-bold text-base">${years} năm (${months} tháng)</p>
                </div>

                <div class="col-span-2 bg-white/10 p-3 rounded-xl space-y-1.5 mt-1">
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-emerald-100">Trả tháng đầu (${loanSchedule[0].label}):</span>
                        <span class="font-extrabold text-yellow-300 text-base">${formatMoney(firstPayment)} đ</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-emerald-100">Trả tháng cuối (${lastRow.label}):</span>
                        <span class="font-bold text-sm">${formatMoney(lastPayment)} đ</span>
                    </div>
                    <div class="flex justify-between items-center border-t border-white/10 pt-1.5">
                        <span class="text-xs text-emerald-100">Tổng tiền lãi:</span>
                        <span class="font-bold text-sm">${formatMoney(totalInterest)} đ</span>
                    </div>
                    <div class="flex justify-between items-center">
                        <span class="text-xs text-emerald-100">Tổng gốc + lãi phải trả:</span>
                        <span class="font-extrabold text-orange-300 text-base">${formatMoney(loanAmount + totalInterest)} đ</span>
                    </div>
                </div>
            </div>

            <!-- Lịch trả nợ theo tháng, có dòng tổng kết cuối mỗi năm (bấm để xem chi tiết) -->
            <details class="mt-4">
                <summary class="text-xs font-bold text-emerald-100 cursor-pointer select-none">📋 Xem lịch trả nợ chi tiết</summary>
                <div id="schedule-container" class="overflow-x-auto max-h-80 overflow-y-auto mt-2">
                    <!-- Bảng lịch trả nợ sẽ được JS bơm vào đây -->
                </div>
            </details>

            <div class="mt-3">
                <span class="text-xs text-emerald-100/80">
                    ⚠️ Kết quả chỉ mang tính tham khảo, chưa bao gồm phí bảo hiểm, phí trả nợ trước hạn...
                    Lãi suất thực tế theo quy định của ngân hàng tại thời điểm vay.
                </span>
            </div>
        </div>
    `;

    loanResultEl.classList.remove('hidden');
    loanResultEl.classList.add('fade-in');

    // Vẽ bảng lịch trả nợ theo tháng
    renderLoanSchedule();
}

// Bảng lịch trả nợ theo tháng, cuối mỗi năm dương lịch có dòng tổng kết cả năm
function renderLoanSchedule() {
    const container = document.getElementById('schedule-container');
    if (!container || loanSchedule.length === 0) return;

    let rows = '';
    let yearPrincipal = 0;
    let yearInterest = 0;

    loanSchedule.forEach((r, i) => {
        yearPrincipal += r.principal;
        yearInterest += r.interest;

        rows += `
            <tr>
                <td class="text-center font-mono">${r.label}</td>
                <td class="text-right">${formatMoney(r.principal)}</td>
                <td class="text-right">${formatMoney(r.interest)}</td>
                <td class="text-right font-bold">${formatMoney(r.principal + r.interest)}</td>
            </tr>
        `;

        // Hết năm dương lịch (hoặc kỳ cuối cùng) -> chèn dòng tổng tiền của năm đó
        const year = r.label.slice(3); // "MM/yyyy" -> "yyyy"
        const next = loanSchedule[i + 1];
        if (!next || next.label.slice(3) !== year) {
            rows += `
                <tr class="year-total-row">
                    <td class="text-left font-bold">Năm ${year}</td>
                    <td class="text-right font-bold">${formatMoney(yearPrincipal)}</td>
                    <td class="text-right font-bold">${formatMoney(yearInterest)}</td>
                    <td class="text-right font-extrabold text-yellow-300">${formatMoney(yearPrincipal + yearInterest)}</td>
                </tr>
            `;
            yearPrincipal = 0;
            yearInterest = 0;
        }
    });

    container.innerHTML = `
        <table class="schedule-table w-full text-xs">
            <thead>
                <tr class="border-b border-white/20 text-emerald-200">
                    <th class="text-center">Tháng</th>
                    <th class="text-right">Gốc (đ)</th>
                    <th class="text-right">Lãi (đ)</th>
                    <th class="text-right">Tổng (đ)</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

/* ============================================================
 *  KHỞI TẠO
 * ============================================================ */
updateLoanAmountLabel();
switchTab('search');