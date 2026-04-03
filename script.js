document.addEventListener('DOMContentLoaded', () => {
    const loginPage = document.getElementById('login-page');
    const registerPage = document.getElementById('register-page');
    const membersPage = document.getElementById('members-page');
    const memberDetailPage = document.getElementById('member-detail-page');
    const financialReportPage = document.getElementById('financial-report-page');

    const loginIdInput = document.getElementById('login-id');
    const btnLogin = document.getElementById('btn-login');

    const regIdInput = document.getElementById('reg-id');
    const regDateInput = document.getElementById('reg-date');
    const regForm = document.getElementById('register-form');
    const btnCancelReg = document.getElementById('btn-cancel-reg');
    const btnBackFromRegister = document.getElementById('btn-back-from-register');
    const regImageInput = document.getElementById('reg-image');
    const imagePreview = document.getElementById('image-preview');

    const btnOpenCamera = document.getElementById('btn-open-camera');
    const btnUploadImage = document.getElementById('btn-upload-image');
    const btnCapturePhoto = document.getElementById('btn-capture-photo');
    const btnSwitchCamera = document.getElementById('btn-switch-camera');
    const cameraContainer = document.getElementById('camera-container');
    const cameraVideo = document.getElementById('camera-video');
    const cameraCanvas = document.getElementById('camera-canvas');

    let currentStream = null;
    let currentFacingMode = 'environment';

    const btnLogout = document.getElementById('btn-logout');
    const btnBackToList = document.getElementById('btn-back-to-list');
    const membersList = document.getElementById('members-list');
    const loadingMembers = document.getElementById('loading-members');

    const btnFinancialReport = document.getElementById('btn-financial-report');
    const btnBackFromFinancial = document.getElementById('btn-back-from-financial');
    const loadingFinancial = document.getElementById('loading-financial');
    const financialReportContent = document.getElementById('financial-report-content');

    let base64Image = '';
    let currentPersonId = '';

    const isNumeric13 = (val) => {
        return /^\d{13}$/.test(val);
    };

    const showPage = (pageElement) => {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
            page.classList.add('hidden');
        });
        pageElement.classList.remove('hidden');
        pageElement.classList.add('active');
    };

    const setCurrentDate = () => {
        const today = new Date();
        const formattedDate = today.toISOString().split('T')[0];
        if (regDateInput) regDateInput.value = formattedDate;
    };

    // Helper to call GAS backend API via fetch
    async function callGAS(action, params = {}, isPost = false) {
        if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL === 'YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL') {
            throw new Error('กรุณาตั้งค่า GAS_WEB_APP_URL ในไฟล์ index.html (บรรทัด script) ก่อนใช้งานเว็บแอป');
        }

        if (isPost) {
            // Using POST via plain text to bypass direct CORS Preflight blocks in Google Apps Script
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8',
                },
                body: JSON.stringify({ action: action, data: params })
            });
            return await response.json();
        } else {
            // Using GET
            const queryParams = new URLSearchParams({ action: action, ...params }).toString();
            const response = await fetch(`${GAS_WEB_APP_URL}?${queryParams}`);
            return await response.json();
        }
    }

    // LOGIN LOGIC
    btnLogin.addEventListener('click', async () => {
        const personId = loginIdInput.value.trim();
        if (!isNumeric13(personId)) {
            Swal.fire('ข้อผิดพลาด', 'กรุณากรอกรหัสบัตรประชาชน 13 หลัก ให้ถูกต้อง (เฉพาะตัวเลข)', 'error');
            return;
        }

        Swal.fire({
            title: 'กำลังตรวจสอบข้อมูล...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const result = await callGAS('checkMember', { personId: personId }, false);
            Swal.close();

            if (result.error) {
                Swal.fire('เกิดข้อผิดพลาด', result.error, 'error');
                return;
            }

            if (result.found) {
                currentPersonId = personId;
                loadMembers();
                showPage(membersPage);
            } else {
                Swal.fire({
                    title: 'ไม่พบข้อมูล',
                    text: 'คุณยังไม่ได้ลงทะเบียน กรุณาลงทะเบียนใหม่',
                    icon: 'info',
                    confirmButtonText: 'ตกลง'
                }).then(() => {
                    regIdInput.value = personId;
                    setCurrentDate();
                    showPage(registerPage);
                });
            }
        } catch (error) {
            Swal.fire('เกิดข้อผิดพลาดในการเชื่อมต่อ', error.message || String(error), 'error');
        }
    });

    // REGISTRATION LOGIC
    btnUploadImage.addEventListener('click', () => {
        stopCamera();
        cameraContainer.style.display = 'none';
        regImageInput.click();
    });

    btnOpenCamera.addEventListener('click', async () => {
        if (currentStream) {
            stopCamera();
            cameraContainer.style.display = 'none';
            return;
        }
        await startCamera();
    });

    btnSwitchCamera.addEventListener('click', async () => {
        currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
        await startCamera();
    });

    async function startCamera() {
        stopCamera();
        try {
            currentStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: currentFacingMode }
            });
            cameraVideo.srcObject = currentStream;
            cameraContainer.style.display = 'block';
            imagePreview.style.display = 'none';
            base64Image = '';
        } catch (err) {
            Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเปิดกล้องได้ กรุณาตรวจสอบสิทธิ์การเข้าถึงกล้อง', 'error');
        }
    }

    function stopCamera() {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
            currentStream = null;
        }
    }

    btnCapturePhoto.addEventListener('click', () => {
        if (!currentStream) return;
        cameraCanvas.width = cameraVideo.videoWidth;
        cameraCanvas.height = cameraVideo.videoHeight;
        const ctx = cameraCanvas.getContext('2d');

        // Mirror image if using front camera
        if (currentFacingMode === 'user') {
            ctx.translate(cameraCanvas.width, 0);
            ctx.scale(-1, 1);
        }

        ctx.drawImage(cameraVideo, 0, 0, cameraCanvas.width, cameraCanvas.height);

        base64Image = cameraCanvas.toDataURL('image/jpeg', 0.8);
        imagePreview.src = base64Image;
        imagePreview.style.display = 'block';

        stopCamera();
        cameraContainer.style.display = 'none';
    });

    regImageInput.addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function (event) {
                base64Image = event.target.result;
                imagePreview.src = base64Image;
                imagePreview.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.style.display = 'none';
            base64Image = '';
        }
    });

    btnCancelReg.addEventListener('click', () => {
        stopCamera();
        if (cameraContainer) cameraContainer.style.display = 'none';
        regForm.reset();
        imagePreview.style.display = 'none';
        base64Image = '';
        showPage(loginPage);
        loginIdInput.value = '';
    });

    if (btnBackFromRegister) {
        btnBackFromRegister.addEventListener('click', () => {
            btnCancelReg.click();
        });
    }

    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const registerDate = regDateInput ? regDateInput.value : '';
        const personId = regIdInput.value.trim();
        const name = document.getElementById('reg-name').value.trim();
        const surname = document.getElementById('reg-surname').value.trim();
        const address = document.getElementById('reg-address').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const birthdate = document.getElementById('reg-birthdate').value;
        const illness = document.getElementById('reg-illness').value.trim();
        const beneficiary = document.getElementById('reg-beneficiary').value.trim();
        const related = document.getElementById('reg-related').value.trim();

        if (!base64Image) {
            Swal.fire('ข้อผิดพลาด', 'กรุณาอัปโหลดหรือถ่ายภาพ', 'error');
            return;
        }

        const formData = {
            registerDate,
            personId,
            name,
            surname,
            address,
            phone,
            birthdate,
            illness,
            beneficiary,
            related,
            imageFile: base64Image,
            imageName: fileExtensionAndName(regImageInput.files[0] || { name: 'photo.jpg' })
        };

        Swal.fire({
            title: 'กำลังบันทึกข้อมูล...',
            text: 'และอัปโหลดรูปภาพไปยังประวัติของคุณ กรุณารอสักครู่',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        try {
            const result = await callGAS('registerMember', formData, true);
            if (result.success) {
                Swal.fire('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว', 'success').then(() => {
                    currentPersonId = personId;
                    regForm.reset();
                    imagePreview.style.display = 'none';
                    base64Image = '';
                    loadMembers();
                    showPage(membersPage);
                });
            } else {
                Swal.fire('เกิดข้อผิดพลาดจากเซิร์ฟเวอร์', result.error, 'error');
            }
        } catch (error) {
            Swal.fire('เกิดข้อผิดพลาดในการเชื่อมต่อ', error.message || String(error), 'error');
        }
    });

    function fileExtensionAndName(file) {
        if (!file) return 'image.jpg';
        return file.name || 'image.jpg';
    }

    // MEMBERS PAGE LOGIC
    btnLogout.addEventListener('click', () => {
        currentPersonId = '';
        showPage(loginPage);
        loginIdInput.value = '';
    });

    async function loadMembers() {
        loadingMembers.style.display = 'flex';
        membersList.innerHTML = '';

        try {
            const result = await callGAS('getAllMembers', {}, false);
            loadingMembers.style.display = 'none';
            if (result.success) {
                renderMembers(result.members);
            } else {
                membersList.innerHTML = `<p style="color:red">ไม่สามารถโหลดข้อมูลได้: ${result.error}</p>`;
            }
        } catch (error) {
            loadingMembers.style.display = 'none';
            membersList.innerHTML = `<p style="color:red">เกิดข้อผิดพลาดในการเชื่อมต่อ: ${error.message || String(error)}</p>`;
        }
    }

    function renderMembers(members) {
        membersList.innerHTML = '';

        if (!members || members.length === 0) {
            membersList.innerHTML = '<p style="text-align:center; color:#888;">ยังไม่มีสมาชิก</p>';
            return;
        }

        // Sort members to put the current user at the top
        members.sort((a, b) => {
            const isA = (a.personId === currentPersonId || a.id === currentPersonId);
            const isB = (b.personId === currentPersonId || b.id === currentPersonId);
            if (isA && !isB) return -1;
            if (!isA && isB) return 1;
            return 0;
        });

        members.forEach(member => {
            const defaultImage = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name + ' ' + member.surname) + '&background=f1f5f9&color=3b82f6&size=128';
            const imgSrc = member.image ? member.image : defaultImage;

            const isCurrentUser = (member.personId === currentPersonId || member.id === currentPersonId);
            const highlightStyle = isCurrentUser ? 'border-color: var(--primary-color); background-color: #f0f9ff; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);' : '';
            const badge = isCurrentUser ? '<span style="background: var(--primary-color); color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: 8px;">คุณ</span>' : '';

            const card = document.createElement('div');
            card.className = 'member-card';
            card.style.cursor = 'pointer';
            if (isCurrentUser) card.style.cssText = highlightStyle + ' cursor: pointer;';
            card.innerHTML = `
                <img src="${imgSrc}" class="member-photo" alt="Photo" onerror="this.src='${defaultImage}'">
                <div class="member-info">
                    <h3 style="display:flex; align-items:center;">${escapeHtml(member.name)} ${escapeHtml(member.surname)} ${badge}</h3>
                </div>
            `;

            card.addEventListener('click', () => {
                showMemberDetail(member);
            });

            membersList.appendChild(card);
        });
    }

    function escapeHtml(unsafe) {
        return (unsafe || '').toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    if (btnBackToList) {
        btnBackToList.addEventListener('click', () => {
            showPage(membersPage);
        });
    }

    function showMemberDetail(member) {
        const defaultImage = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(member.name + ' ' + member.surname) + '&background=f1f5f9&color=3b82f6&size=200';
        const imgSrc = member.image ? member.image : defaultImage;

        const detailContent = document.getElementById('member-detail-content');
        if (detailContent) {
            detailContent.innerHTML = `
                <img src="${imgSrc}" style="width: 150px; height: 150px; border-radius: 50%; object-fit: cover; border: 4px solid white; box-shadow: 0 4px 15px rgba(0,0,0,0.1); background: #f1f5f9; margin-bottom: 20px;" alt="Photo" onerror="this.src='${defaultImage}'">
                <h3 style="font-size: 22px; margin-bottom: 15px; color: var(--primary-color); font-weight: 500;">${escapeHtml(member.name)} ${escapeHtml(member.surname)}</h3>
                
                <div style="background: var(--card-bg); border: 1px solid var(--border-color); border-radius: 12px; padding: 20px; width: 100%; text-align: left; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                    <div style="margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">วันที่ลงทะเบียน (Register Date)</span>
                        <span style="font-size: 16px; font-weight: 500; color: var(--text-color);">${escapeHtml(member.registerDate ? new Date(member.registerDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-')}</span>
                    </div>
                    <div style="margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">รหัสบัตรประชาชน (13 หลัก)</span>
                        <span style="font-size: 16px; font-weight: 500; color: var(--text-color);">${escapeHtml(member.personId || '-')}</span>
                    </div>
                    <div style="margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">วันเดือนปีเกิด (Birthdate)</span>
                        <span style="font-size: 16px; font-weight: 500; color: var(--text-color);">${escapeHtml(member.birthdate ? new Date(member.birthdate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-')}</span>
                    </div>
                    <div style="margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">เบอร์โทรศัพท์ (Phone)</span>
                        <span style="font-size: 16px; font-weight: 500; color: var(--text-color);">${escapeHtml(member.phone || '-')}</span>
                    </div>
                    <div style="margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">โรคประจำตัว (Illness)</span>
                        <span style="font-size: 16px; font-weight: 500; color: #ef4444;">${escapeHtml(member.illness || '-')}</span>
                    </div>
                    <div style="margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">ที่อยู่ (Address)</span>
                        <span style="font-size: 15px; font-weight: 400; color: var(--text-color); line-height: 1.5;">${escapeHtml(member.address || '-')}</span>
                    </div>
                    <div style="margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">ผู้รับผลประโยชน์ (Beneficiary)</span>
                        <span style="font-size: 16px; font-weight: 500; color: var(--primary-color);">${escapeHtml(member.beneficiary || '-')}</span>
                    </div>
                    <div>
                        <span style="font-size: 13px; color: #64748b; display: block; margin-bottom: 2px;">ความเกี่ยวข้อง (Relationship)</span>
                        <span style="font-size: 15px; font-weight: 500; color: var(--text-color);">${escapeHtml(member.related || '-')}</span>
                    </div>
                </div>
            `;
        }
        showPage(memberDetailPage);
    }

    if (btnFinancialReport) {
        btnFinancialReport.addEventListener('click', () => {
            loadFinancialReport();
            showPage(financialReportPage);
        });
    }

    if (btnBackFromFinancial) {
        btnBackFromFinancial.addEventListener('click', () => {
            showPage(membersPage);
        });
    }

    async function loadFinancialReport() {
        loadingFinancial.style.display = 'flex';
        financialReportContent.innerHTML = '';

        try {
            const result = await callGAS('getFinancialReport', {}, false);
            loadingFinancial.style.display = 'none';
            if (result.success) {
                renderFinancialReport(result.data);
            } else {
                financialReportContent.innerHTML = `<p style="color:red; text-align:center;">ไม่สามารถโหลดข้อมูลได้: ${result.error}</p>`;
            }
        } catch (error) {
            loadingFinancial.style.display = 'none';
            financialReportContent.innerHTML = `<p style="color:red; text-align:center;">เกิดข้อผิดพลาดในการเชื่อมต่อ: ${error.message || String(error)}</p>`;
        }
    }

    function renderFinancialReport(data) {
        if (!data || data.length === 0) {
            financialReportContent.innerHTML = '<p style="text-align:center; color:#888; margin-top:20px;">ยังไม่มีข้อมูลการเงินในระบบ</p>';
            return;
        }

        const monthlyData = {};
        let totalIncome = 0;
        let totalOutcome = 0;

        data.forEach(item => {
            let dateObj;
            if (item.date) {
                dateObj = new Date(item.date);
            } else {
                return;
            }

            if (isNaN(dateObj.getTime())) return;

            const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            const monthLabel = dateObj.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' });

            if (!monthlyData[monthKey]) {
                monthlyData[monthKey] = { label: monthLabel, income: 0, outcome: 0, time: dateObj.getTime() };
            }
            monthlyData[monthKey].income += (Number(item.income) || 0);
            monthlyData[monthKey].outcome += (Number(item.outcome) || 0);
            
            totalIncome += (Number(item.income) || 0);
            totalOutcome += (Number(item.outcome) || 0);
        });

        const sortedMonths = Object.values(monthlyData).sort((a, b) => a.time - b.time);

        if (sortedMonths.length === 0) {
            financialReportContent.innerHTML = '<p style="text-align:center; color:#888; margin-top:20px;">ยังไม่มีข้อมูลการเงินในระบบ</p>';
            return;
        }

        let tableHtml = `
            <table class="financial-table">
                <thead>
                    <tr>
                        <th style="text-align: left;">เดือน/ปี</th>
                        <th style="text-align: right; color: #10b981;">รายรับ</th>
                        <th style="text-align: right; color: #ef4444;">รายจ่าย</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedMonths.forEach(month => {
            tableHtml += `
                <tr>
                    <td style="text-align: left; font-size: 14px;">${escapeHtml(month.label)}</td>
                    <td style="text-align: right; color: #10b981; font-weight: 500;">${month.income.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td style="text-align: right; color: #ef4444; font-weight: 500;">${month.outcome.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
            `;
        });

        const netBalance = totalIncome - totalOutcome;
        const balanceColor = netBalance >= 0 ? '#10b981' : '#ef4444';

        tableHtml += `
                </tbody>
                <tfoot>
                    <tr style="background-color: #f1f5f9; font-weight: bold;">
                        <td style="text-align: right; font-size: 14px;">รวมทั้งหมด</td>
                        <td style="text-align: right; color: #10b981;">${totalIncome.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td style="text-align: right; color: #ef4444;">${totalOutcome.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                    <tr style="background-color: #e0f2fe; font-weight: bold; font-size: 16px;">
                        <td style="text-align: right;">คงเหลือสุทธิ</td>
                        <td colspan="2" style="text-align: right; color: ${balanceColor};">${netBalance.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    </tr>
                </tfoot>
            </table>
        `;

        financialReportContent.innerHTML = tableHtml;
    }
});
