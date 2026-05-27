// admin.js - النسخة الكاملة النهائية (جميع الوظائف شغالة)

const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : '';

// ====================== دوال الأمان الأساسية ======================
function getCsrfToken() { 
    return sessionStorage.getItem('csrfToken'); 
}

function getLoggedInUser() { 
    const u = sessionStorage.getItem('userData'); 
    return u ? JSON.parse(u) : null; 
}

function showToast(message, type = 'success') {
    if (typeof Toastify !== 'undefined') {
        let bg = { 
            success: 'linear-gradient(135deg,#27AE60,#1E8449)', 
            error: 'linear-gradient(135deg,#E74C3C,#C0392B)', 
            info: 'linear-gradient(135deg,#3498DB,#2C81BA)', 
            warning: 'linear-gradient(135deg,#F39C12,#D68910)' 
        }[type] || '#333';
        Toastify({ 
            text: message, 
            duration: 3500, 
            gravity: 'top', 
            position: 'center', 
            style: { 
                background: bg, 
                fontSize: '15px', 
                fontFamily: '"Tajawal", sans-serif', 
                padding: '12px 20px', 
                borderRadius: '12px', 
                direction: 'rtl', 
                color: '#fff' 
            } 
        }).showToast();
    } else {
        alert(message);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ====================== API Request ======================
async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers, credentials: 'include' });
    if (response.status === 401) { 
        sessionStorage.clear(); 
        window.location.href = '/login.html'; 
        throw new Error('انتهت الجلسة'); 
    }
    if (response.status === 403) { 
        showToast('طلب غير مصرح به، يرجى تحديث الصفحة', 'error'); 
        throw new Error('CSRF token mismatch'); 
    }
    return response;
}

async function getFromServer(endpoint) { 
    try { 
        const r = await apiRequest(endpoint); 
        return r.ok ? await r.json() : []; 
    } catch (e) { 
        console.error('Error fetching from server:', e);
        return []; 
    } 
}

async function saveToServer(endpoint, data, method = 'POST') { 
    const r = await apiRequest(endpoint, { method, body: JSON.stringify(data) }); 
    if (!r.ok) throw new Error((await r.json()).error || 'فشل الحفظ'); 
    return r.json(); 
}

// ====================== التحقق من صلاحية الأدمن ======================
async function verifyAdminAccess() {
    const user = getLoggedInUser();
    if (!user || user.type !== 'admin') { 
        showToast('غير مصرح لك بالدخول!', 'error'); 
        setTimeout(() => window.location.href = 'Home.html', 1500); 
        return false; 
    }
    try { 
        await apiRequest('/api/verify-session'); 
        return true; 
    } catch (e) { 
        showToast('انتهت الجلسة', 'error'); 
        sessionStorage.clear(); 
        setTimeout(() => window.location.href = 'login.html', 1500); 
        return false; 
    }
}

window.logout = async () => { 
    if (confirm('تسجيل الخروج؟')) { 
        try { 
            await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' }); 
        } catch (e) {} 
        sessionStorage.clear(); 
        window.location.href = 'login.html'; 
    } 
};

(function preventBack() { 
    window.history.pushState(null, '', window.location.href); 
    window.onpopstate = () => window.history.pushState(null, '', window.location.href); 
})();

// ====================== تعريف الدرجات ======================
const SUBJECTS_CONFIG = { 
    "اللغة العربية": { max: 20 }, 
    "اللغة الإنجليزية": { max: 20 }, 
    "علوم تطبيقية": { max: 40 }, 
    "طب باطنة": { max: 20 }, 
    "تمريض باطني جراحي": { max: 24 }, 
    "حاسب آلي": { max: 20 }, 
    "الدين": { max: 32, isExtra: true } 
};
const TOTAL_POSSIBLE = 144;
const ORDERED_SUBJECTS = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "طب باطنة", "تمريض باطني جراحي", "حاسب آلي", "الدين"];

function calculateStudentTotal(student) { 
    if (!student.subjects) return 0; 
    let t = 0; 
    student.subjects.forEach(s => { 
        const c = SUBJECTS_CONFIG[s.name]; 
        if (c && !c.isExtra) t += s.grade || 0; 
    }); 
    return t; 
}

function calculateStudentPercentage(student) { 
    return (calculateStudentTotal(student) / TOTAL_POSSIBLE) * 100; 
}

function getStudentFormattedGrades(student) { 
    let g = {}; 
    ORDERED_SUBJECTS.forEach(n => { 
        const c = SUBJECTS_CONFIG[n]; 
        const sub = student.subjects?.find(s => s.name === n); 
        g[n] = { grade: sub?.grade || 0, max: c.max, isExtra: c.isExtra || false }; 
    }); 
    return g; 
}

function getStudentsWithGrades(list) { 
    return list.filter(s => s.subjects && s.subjects.length > 0); 
}

// ====================== متغيرات عامة ======================
let allStudents = [], studentsWithGrades = [], admins = [], violations = [];
let notifications = [];

// ====================== الإشعارات ======================
async function loadNotifications() {
    try {
        const response = await fetch(`${BASE_URL}/api/notifications`, {
            credentials: 'include'
        });
        if (response.ok) {
            notifications = await response.json();
            renderNotifications();
            console.log(`✅ تم تحميل ${notifications.length} إشعار`);
        } else {
            notifications = [];
            renderNotifications();
        }
    } catch (error) {
        console.error('Error loading notifications:', error);
        notifications = [];
        renderNotifications();
    }
}

function renderNotifications() {
    const tableBody = document.getElementById('notifications-table-body');
    if (!tableBody) return;
    
    if (!notifications || notifications.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" style="text-align:center;">📭 لا توجد إشعارات</td></tr>';
        return;
    }
    
    tableBody.innerHTML = notifications.map(notification => `
        <tr>
            <td style="text-align:right;">${escapeHtml(notification.text)}</td>
            <td style="text-align:center;">${notification.date || '-'}</td>
            <td style="text-align:center;">
                <button class="delete-btn" onclick="deleteNotification('${notification._id}')">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </td>
        </tr>
    `).join('');
}

window.addNotification = async function() {
    const text = document.getElementById('notification-text')?.value.trim();
    if (!text) {
        showToast('يرجى إدخال نص الإشعار!', 'error');
        return;
    }
    
    const date = new Date().toLocaleString('ar-EG');
    showToast('جاري إضافة الإشعار...', 'info');
    
    try {
        const csrfToken = getCsrfToken();
        const response = await fetch(`${BASE_URL}/api/notifications`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ text, date })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            await loadNotifications();
            document.getElementById('notification-text').value = '';
            showToast('✅ تم إضافة الإشعار بنجاح!', 'success');
        } else {
            showToast(data.error || 'فشل إضافة الإشعار', 'error');
        }
    } catch (error) {
        console.error('Error adding notification:', error);
        showToast('حدث خطأ أثناء إضافة الإشعار', 'error');
    }
};

window.deleteNotification = async function(id) {
    const result = await Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: 'هل أنت متأكد من حذف هذا الإشعار؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#E74C3C'
    });
    
    if (result.isConfirmed) {
        try {
            const csrfToken = getCsrfToken();
            const response = await fetch(`${BASE_URL}/api/notifications/${id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': csrfToken,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                await loadNotifications();
                showToast('🗑️ تم حذف الإشعار بنجاح.', 'success');
            } else {
                showToast(data.error || '❌ فشل حذف الإشعار', 'error');
            }
        } catch (error) {
            console.error('Error deleting notification:', error);
            showToast('حدث خطأ أثناء حذف الإشعار', 'error');
        }
    }
};

// ====================== تحميل البيانات الأساسية ======================
async function loadInitialData() {
    showToast('جاري تحميل البيانات...', 'info');
    allStudents = await getFromServer('/api/admin/students');
    admins = await getFromServer('/api/admins');
    violations = await getFromServer('/api/admin/violations');
    await loadNotifications();
    studentsWithGrades = getStudentsWithGrades(allStudents);
    renderAdmins();
    renderResults();
    renderStats();
    renderViolations();
    showToast(`✅ تم التحميل: ${allStudents.length} طالب`, 'success');
}

// ====================== عرض الإحصائيات ======================
function renderStats() {
    const sec = document.getElementById('stats-section');
    if (!sec) return;
    let total = studentsWithGrades.length;
    if (total === 0) { 
        sec.innerHTML = `<div class="stats-grid"><div class="stat-item"><i class="fas fa-info-circle"></i> لا توجد درجات مسجلة</div></div>`; 
        return; 
    }
    let sumPct = 0, topStd = null, topPct = 0;
    studentsWithGrades.forEach(s => { 
        let p = calculateStudentPercentage(s); 
        sumPct += p; 
        if (p > topPct) { topPct = p; topStd = s; } 
    });
    let avg = (sumPct / total).toFixed(1);
    let passed = studentsWithGrades.filter(s => calculateStudentPercentage(s) >= 60).length;
    sec.innerHTML = `
        <div class="stats-grid">
            <div class="stat-item"><i class="fas fa-users"></i> عدد الطلاب: ${total}</div>
            <div class="stat-item"><i class="fas fa-chart-line"></i> المتوسط: ${avg}%</div>
            <div class="stat-item"><i class="fas fa-check-circle"></i> الناجحين: ${passed}</div>
            <div class="stat-item"><i class="fas fa-times-circle"></i> الراسبين: ${total - passed}</div>
        </div>
        ${topStd ? `<div class="stats-grid" style="margin-top:15px; background:linear-gradient(135deg,#C7A252,#A07D3A); border-radius:15px; padding:15px;"><div class="stat-item" style="text-align:center; background:none;"><i class="fas fa-trophy" style="font-size:2rem; color:#fff;"></i><p style="font-weight:bold;">🏆 أعلى طالب</p><p style="font-size:1.2rem; font-weight:bold;">${escapeHtml(topStd.fullName)}</p><p>رقم الجلوس: ${topStd.studentCode}</p><p>المجموع: ${calculateStudentTotal(topStd)} / ${TOTAL_POSSIBLE}</p><p>النسبة: ${topPct.toFixed(1)}%</p></div></div>` : ''}
    `;
}

// ====================== عرض النتائج ======================
function renderResults(filter = '') {
    const tbody = document.getElementById('results-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    let filtered = [...studentsWithGrades];
    if (filter) filtered = filtered.filter(s => s.fullName?.toLowerCase().includes(filter.toLowerCase()) || s.studentCode?.toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">📭 لا توجد نتائج مسجلة</td></tr>'; 
        return; 
    }
    filtered.forEach(student => {
        let total = calculateStudentTotal(student), percentage = calculateStudentPercentage(student), grades = getStudentFormattedGrades(student);
        let subjectsHtml = '<div class="subjects-container">';
        for (let n of ORDERED_SUBJECTS) {
            let gi = grades[n];
            if (gi.isExtra) subjectsHtml += `<div class="extra-subject">📖 ${n}: <strong>${gi.grade}</strong> / ${gi.max} <small>(خارج المجموع)</small></div>`;
            else subjectsHtml += `<div class="subject-row"><span class="subject-name"><i class="fas fa-book"></i> ${n}</span><span class="subject-grade">${gi.grade} / ${gi.max}</span></div>`;
        }
        subjectsHtml += '</div>';
        let pClass = percentage >= 85 ? 'excellent' : (percentage >= 75 ? 'very-good' : (percentage >= 65 ? 'good' : (percentage >= 60 ? 'pass' : 'fail')));
        let pText = { excellent: 'ممتاز', 'very-good': 'جيد جداً', good: 'جيد', pass: 'ناجح', fail: 'راسب' }[pClass];
        let row = tbody.insertRow();
        row.innerHTML = `<td style="text-align:right;"><strong>${escapeHtml(student.fullName)}</strong><br><small>رقم الجلوس: ${student.studentCode}</small></td><td style="text-align:right;">${subjectsHtml}</td><td style="text-align:center;"><span class="total-cell">${total} / ${TOTAL_POSSIBLE}</span></td><td style="text-align:center;"><span class="percentage-cell ${pClass}">${percentage.toFixed(1)}% (${pText})</span></td><td style="text-align:center;"><button class="table-action-btn edit-action" onclick="editStudent('${student.studentCode}')" title="تعديل"><i class="fas fa-edit"></i></button><button class="table-action-btn delete-action" onclick="deleteStudent('${student.studentCode}')" title="حذف"><i class="fas fa-trash"></i></button></td>`;
    });
}

// ====================== إدارة الأدمنز ======================
function renderAdmins() { 
    const t = document.getElementById('users-table-body'); 
    if (t) t.innerHTML = admins.map(a => `<tr><td>${escapeHtml(a.fullName)}</td><td>${a.username}</td><td>${a.username !== 'admin' ? `<button class="delete-btn" onclick="deleteAdmin('${a.username}')"><i class="fas fa-trash"></i> حذف</button>` : 'رئيسي'}</td></tr>`).join(''); 
}

window.deleteAdmin = async (u) => { 
    if (u === 'admin') return showToast('لا يمكن حذف المدير الرئيسي', 'error'); 
    if (confirm('تأكيد الحذف؟')) { 
        await saveToServer(`/api/admins/${u}`, {}, 'DELETE'); 
        admins = await getFromServer('/api/admins'); 
        renderAdmins(); 
        showToast('تم الحذف', 'success'); 
    } 
};

document.getElementById('add-user-form')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    let fn = document.getElementById('admin-name').value.trim(), un = document.getElementById('admin-username').value.trim(), pw = document.getElementById('admin-password').value.trim(); 
    if (!fn || !un || !pw) return showToast('املأ جميع الحقول', 'error'); 
    await saveToServer('/api/admins', { fullName: fn, username: un, password: pw }); 
    admins = await getFromServer('/api/admins'); 
    renderAdmins(); 
    e.target.reset(); 
    showToast('تم إضافة الأدمن', 'success'); 
});

// ====================== حذف وتعديل الطالب ======================
window.deleteStudent = async (code) => { 
    if (confirm('⚠️ حذف الطالب نهائياً؟')) { 
        await saveToServer(`/api/students/${code}`, {}, 'DELETE'); 
        allStudents = await getFromServer('/api/admin/students'); 
        studentsWithGrades = getStudentsWithGrades(allStudents); 
        renderResults(); 
        renderStats(); 
        showToast('✅ تم حذف الطالب', 'success'); 
    } 
};

window.editStudent = (code) => { 
    let s = allStudents.find(st => st.studentCode === code); 
    if (s) { 
        document.getElementById('student-name').value = s.fullName; 
        document.getElementById('student-id').value = s.studentCode; 
        for (let i = 1; i <= 8; i++) document.getElementById(`subject${i}`).value = 0; 
        document.getElementById('subject9').value = 0; 
        document.getElementById('subject10').value = 0; 
        s.subjects?.forEach(sub => { 
            if (sub.name === 'مبادئ وأسس تمريض') document.getElementById('subject1').value = sub.grade;
            else if (sub.name === 'اللغة العربية') document.getElementById('subject2').value = sub.grade;
            else if (sub.name === 'اللغة الإنجليزية') document.getElementById('subject3').value = sub.grade;
            else if (sub.name === 'الفيزياء') document.getElementById('subject4').value = sub.grade;
            else if (sub.name === 'الكيمياء') document.getElementById('subject5').value = sub.grade;
            else if (sub.name === 'التشريح / علم وظائف الأعضاء') document.getElementById('subject6').value = sub.grade;
            else if (sub.name === 'التربية الدينية') document.getElementById('subject7').value = sub.grade;
            else if (sub.name === 'الكمبيوتر') document.getElementById('subject8').value = sub.grade;
            else if (sub.name === 'التاريخ') document.getElementById('subject9').value = sub.grade;
            else if (sub.name === 'الجغرافيا') document.getElementById('subject10').value = sub.grade;
        }); 
        showToast('✏️ قم بتعديل البيانات ثم اضغط حفظ', 'info'); 
        window.scrollTo(0, 0); 
    } 
};

document.getElementById('add-result-form')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    let fn = document.getElementById('student-name').value.trim(), code = document.getElementById('student-id').value.trim(), sem = document.getElementById('semester').value; 
    let subjects = [
        { name: "مبادئ وأسس تمريض", grade: parseInt(document.getElementById('subject1').value) || 0 },
        { name: "اللغة العربية", grade: parseInt(document.getElementById('subject2').value) || 0 },
        { name: "اللغة الإنجليزية", grade: parseInt(document.getElementById('subject3').value) || 0 },
        { name: "الفيزياء", grade: parseInt(document.getElementById('subject4').value) || 0 },
        { name: "الكيمياء", grade: parseInt(document.getElementById('subject5').value) || 0 },
        { name: "التشريح / علم وظائف الأعضاء", grade: parseInt(document.getElementById('subject6').value) || 0 },
        { name: "التربية الدينية", grade: parseInt(document.getElementById('subject7').value) || 0 },
        { name: "الكمبيوتر", grade: parseInt(document.getElementById('subject8').value) || 0 },
        { name: "الدين", grade: parseInt(document.getElementById('subject7').value) || 0 }
    ]; 
    if (sem === 'first') { 
        let hg = parseInt(document.getElementById('subject9').value) || 0; 
        if (hg > 0) subjects.push({ name: "التاريخ", grade: hg }); 
    } else { 
        let gg = parseInt(document.getElementById('subject10').value) || 0; 
        if (gg > 0) subjects.push({ name: "الجغرافيا", grade: gg }); 
    } 
    if (!fn || !code) return showToast('اسم الطالب ورقم الجلوس مطلوبان', 'error'); 
    let existing = allStudents.find(s => s.studentCode === code); 
    if (existing) await saveToServer(`/api/students/${code}`, { subjects, semester: sem }, 'PUT'); 
    else await saveToServer('/api/students', { fullName: fn, id: code, subjects, semester: sem }); 
    allStudents = await getFromServer('/api/admin/students'); 
    studentsWithGrades = getStudentsWithGrades(allStudents); 
    renderResults(); 
    renderStats(); 
    e.target.reset(); 
    showToast(`✅ ${existing ? 'تم تحديث' : 'تم إضافة'} ${fn}`, 'success'); 
});

// ====================== المخالفات ======================
async function renderViolations() {
    const tbody = document.getElementById('violations-table-body');
    if (!tbody) return;
    if (violations.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">📭 لا توجد إنذارات أو مخالفات مسجلة</td></tr>'; 
        return; 
    }
    tbody.innerHTML = violations.map(v => { 
        let s = allStudents.find(st => st.studentCode === v.studentId); 
        return `<tr>
            <td>${v.studentId || '-'}</td>
            <td>${s?.fullName || 'غير موجود'}</td>
            <td>${v.type === 'warning' ? '<span style="color:#F39C12;">⚠️ إنذار</span>' : '<span style="color:#E74C3C;">🚫 مخالفة</span>'}</td>
            <td style="max-width:200px; word-break:break-word;">${escapeHtml(v.reason)}</td>
            <td>${escapeHtml(v.penalty)}</td>
            <td>${v.parentSummons ? '✅ نعم' : '❌ لا'}</td>
            <td>
                <button class="edit-btn" onclick="editViolation('${v._id}')"><i class="fas fa-edit"></i> تعديل</button>
                <button class="delete-btn" onclick="deleteViolation('${v._id}')"><i class="fas fa-trash"></i> حذف</button>
            </td>
        </tr>`; 
    }).join('');
}

let editingViolationId = null;

window.editViolation = function(id) { 
    let v = violations.find(vv => vv._id === id); 
    if (v) { 
        editingViolationId = id; 
        document.getElementById('violation-student-id').value = v.studentId; 
        document.getElementById('violation-type').value = v.type; 
        document.getElementById('violation-reason').value = v.reason; 
        document.getElementById('violation-penalty').value = v.penalty; 
        document.getElementById('parent-summons').checked = v.parentSummons; 
        document.querySelector('#add-violation-form button[type="submit"]').textContent = '✏️ تحديث المخالفة'; 
        document.getElementById('cancelEditViolationBtn').style.display = 'inline-block'; 
        showToast('✏️ قم بتعديل البيانات ثم اضغط تحديث', 'info'); 
    } 
};

window.cancelEditViolation = function() { 
    editingViolationId = null; 
    document.getElementById('add-violation-form').reset(); 
    document.querySelector('#add-violation-form button[type="submit"]').textContent = '➕ إضافة إنذار/مخالفة'; 
    document.getElementById('cancelEditViolationBtn').style.display = 'none'; 
    showToast('✅ تم إلغاء التعديل', 'info'); 
};

async function sendWhatsApp(phone, studentName, type, reason, penalty) { 
    let ph = phone.replace(/[^0-9]/g, ''); 
    if (ph.startsWith('0')) ph = '20' + ph.substring(1); 
    if (!ph.startsWith('20')) ph = '20' + ph; 
    let msg = `📢 *تنبيه من معهد رعاية الضبعية*\n\n👨‍🎓 الطالب: ${studentName}\n⚠️ النوع: ${type === 'warning' ? 'إنذار' : 'مخالفة'}\n📝 السبب: ${reason}\n⚖️ العقوبة: ${penalty}\n📅 التاريخ: ${new Date().toLocaleString('ar-EG')}`; 
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank'); 
}

document.getElementById('add-violation-form')?.addEventListener('submit', async (e) => { 
    e.preventDefault(); 
    let sid = document.getElementById('violation-student-id').value.trim(), typ = document.getElementById('violation-type').value, rsn = document.getElementById('violation-reason').value.trim(), pnl = document.getElementById('violation-penalty').value.trim(), ps = document.getElementById('parent-summons').checked, pPhone = document.getElementById('parent-phone')?.value.trim(); 
    if (!sid || !rsn || !pnl) return showToast('املأ الحقول المطلوبة', 'error'); 
    let student = allStudents.find(s => s.studentCode === sid); 
    if (!student) return showToast('رقم الجلوس غير موجود', 'error'); 
    let data = { studentId: sid, type: typ, reason: rsn, penalty: pnl, parentSummons: ps, date: new Date().toLocaleString('ar-EG') }; 
    if (editingViolationId) { 
        await saveToServer(`/api/violations/${editingViolationId}`, {}, 'DELETE'); 
        await saveToServer('/api/violations', data); 
        editingViolationId = null; 
        cancelEditViolation(); 
    } else { 
        await saveToServer('/api/violations', data); 
    } 
    violations = await getFromServer('/api/admin/violations'); 
    renderViolations(); 
    e.target.reset(); 
    showToast('✅ تمت العملية', 'success'); 
    if (pPhone && pPhone.length >= 10) { 
        await sendWhatsApp(pPhone, student.fullName, typ, rsn, pnl); 
        showToast('📱 تم فتح واتساب', 'info'); 
    } 
});

window.deleteViolation = async (id) => { 
    if (confirm('⚠️ حذف المخالفة؟')) { 
        await saveToServer(`/api/violations/${id}`, {}, 'DELETE'); 
        violations = await getFromServer('/api/admin/violations'); 
        renderViolations(); 
        showToast('🗑️ تم الحذف', 'success'); 
        if (editingViolationId === id) cancelEditViolation(); 
    } 
};

// ====================== الاختبارات ======================
let questionsList = [];

function renderQuestionInputs() {
    let type = document.getElementById('question-type')?.value, cont = document.getElementById('question-inputs');
    if (!cont) return;
    
    if (type === 'multiple') {
        cont.innerHTML = `
            <div class="form-group">
                <label>📝 نص السؤال</label>
                <input type="text" id="qText" class="form-control" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;">
            </div>
            <div class="form-group">
                <label>🔘 الخيارات</label>
                <div id="optionsArea">
                    <input type="text" class="opt" placeholder="خيار 1" style="width:48%; margin:5px; padding:8px; border-radius:8px; border:1px solid #ddd;">
                    <input type="text" class="opt" placeholder="خيار 2" style="width:48%; margin:5px; padding:8px; border-radius:8px; border:1px solid #ddd;">
                    <br>
                    <input type="text" class="opt" placeholder="خيار 3" style="width:48%; margin:5px; padding:8px; border-radius:8px; border:1px solid #ddd;">
                    <input type="text" class="opt" placeholder="خيار 4" style="width:48%; margin:5px; padding:8px; border-radius:8px; border:1px solid #ddd;">
                </div>
            </div>
            <div class="form-group">
                <label>✅ الإجابة الصحيحة</label>
                <select id="correctOpt" class="form-control" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;"></select>
            </div>
        `;
        let update = () => { 
            let opts = [...document.querySelectorAll('.opt')].map(i => i.value.trim()).filter(v => v); 
            let sel = document.getElementById('correctOpt'); 
            sel.innerHTML = '<option value="">اختر الإجابة</option>' + opts.map(o => `<option value="${o}">${o}</option>`).join(''); 
        };
        document.querySelectorAll('.opt').forEach(i => i.addEventListener('input', update));
        setTimeout(update, 100);
    } else if (type === 'essay') {
        cont.innerHTML = `
            <div class="form-group">
                <label>📝 نص السؤال</label>
                <input type="text" id="qText" class="form-control" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;">
            </div>
            <div class="form-group">
                <label>📄 الإجابة النموذجية</label>
                <textarea id="essayAnswer" rows="3" class="form-control" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;"></textarea>
            </div>
        `;
    } else if (type === 'truefalse') {
        cont.innerHTML = `
            <div class="form-group">
                <label>📝 نص السؤال</label>
                <input type="text" id="qText" class="form-control" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;">
            </div>
            <div class="form-group">
                <label>✅ الإجابة الصحيحة</label>
                <select id="tfAnswer" class="form-control" style="width:100%; padding:10px; border-radius:10px; border:1px solid #ddd;">
                    <option value="true">✔️ صح</option>
                    <option value="false">❌ خطأ</option>
                </select>
            </div>
        `;
    }
}

window.addQuestion = function() {
    let type = document.getElementById('question-type').value;
    let text = document.getElementById('qText')?.value.trim();
    
    if (!text) {
        showToast('أدخل نص السؤال أولاً!', 'error');
        return;
    }
    
    let q = { type, text };
    
    if (type === 'multiple') {
        let opts = [...document.querySelectorAll('.opt')].map(i => i.value.trim()).filter(v => v);
        let cor = document.getElementById('correctOpt').value;
        if (opts.length < 2) {
            showToast('أضف خيارين على الأقل!', 'error');
            return;
        }
        if (!cor) {
            showToast('اختر الإجابة الصحيحة!', 'error');
            return;
        }
        q.options = opts;
        q.correctAnswer = cor;
    } else if (type === 'essay') {
        let ans = document.getElementById('essayAnswer')?.value.trim();
        if (!ans) {
            showToast('أدخل الإجابة النموذجية!', 'error');
            return;
        }
        q.correctAnswer = ans;
    } else if (type === 'truefalse') {
        q.correctAnswer = document.getElementById('tfAnswer').value;
    }
    
    questionsList.push(q);
    
    const questionsContainer = document.getElementById('questions-list');
    if (questionsContainer) {
        questionsContainer.innerHTML = questionsList.map((qq, idx) => `
            <div style="background:#f8f9fa; border-radius:12px; padding:15px; margin-bottom:12px; border-right:3px solid #C7A252;">
                <strong>سؤال ${idx + 1}:</strong> ${escapeHtml(qq.text)}<br>
                ${qq.options ? `<span style="color:#2D9C7C;">📌 الخيارات: ${qq.options.join(', ')}</span><br><span style="color:#C7A252;">✅ الصحيح: ${qq.correctAnswer}</span>` : ''}
                ${qq.correctAnswer && !qq.options ? `<span style="color:#C7A252;">✅ الإجابة: ${qq.correctAnswer}</span>` : ''}
                <button onclick="removeQuestion(${idx})" style="background:#E74C3C; color:white; border:none; padding:5px 12px; border-radius:20px; margin-top:10px; cursor:pointer;">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </div>
        `).join('');
    }
    
    document.getElementById('question-inputs').innerHTML = '';
    document.getElementById('qText').value = '';
    showToast('✅ تم إضافة السؤال بنجاح', 'success');
};

window.removeQuestion = function(idx) {
    questionsList.splice(idx, 1);
    const questionsContainer = document.getElementById('questions-list');
    if (questionsContainer) {
        questionsContainer.innerHTML = questionsList.map((qq, i) => `
            <div style="background:#f8f9fa; border-radius:12px; padding:15px; margin-bottom:12px; border-right:3px solid #C7A252;">
                <strong>سؤال ${i + 1}:</strong> ${escapeHtml(qq.text)}<br>
                ${qq.options ? `<span style="color:#2D9C7C;">📌 الخيارات: ${qq.options.join(', ')}</span><br><span style="color:#C7A252;">✅ الصحيح: ${qq.correctAnswer}</span>` : ''}
                ${qq.correctAnswer && !qq.options ? `<span style="color:#C7A252;">✅ الإجابة: ${qq.correctAnswer}</span>` : ''}
                <button onclick="removeQuestion(${i})" style="background:#E74C3C; color:white; border:none; padding:5px 12px; border-radius:20px; margin-top:10px; cursor:pointer;">
                    <i class="fas fa-trash"></i> حذف
                </button>
            </div>
        `).join('');
    }
    showToast('✅ تم حذف السؤال', 'success');
};

window.saveExam = async function() {
    const name = document.getElementById('exam-name')?.value.trim();
    const code = document.getElementById('exam-code')?.value.trim();
    const stage = document.getElementById('exam-stage')?.value;
    const duration = parseInt(document.getElementById('exam-duration')?.value);
    
    if (!name) {
        showToast('يرجى إدخال اسم الاختبار!', 'error');
        return;
    }
    if (!code) {
        showToast('يرجى إدخال كود الاختبار!', 'error');
        return;
    }
    if (!duration || duration < 1) {
        showToast('يرجى إدخال مدة الاختبار بالدقائق!', 'error');
        return;
    }
    if (questionsList.length === 0) {
        showToast('يرجى إضافة سؤال واحد على الأقل!', 'error');
        return;
    }
    
    const csrfToken = getCsrfToken();
    showToast('جاري حفظ الاختبار...', 'info');
    
    try {
        const response = await fetch(`${BASE_URL}/api/exams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({
                name,
                code,
                stage,
                duration,
                questions: questionsList
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showToast('✅ تم حفظ الاختبار بنجاح!', 'success');
            questionsList = [];
            document.getElementById('questions-list').innerHTML = '';
            document.getElementById('exam-name').value = '';
            document.getElementById('exam-code').value = '';
            document.getElementById('exam-duration').value = '';
            document.getElementById('exam-stage').value = 'first';
            document.getElementById('question-inputs').innerHTML = '';
            await loadExamsList();
        } else {
            showToast(data.error || '❌ فشل حفظ الاختبار', 'error');
        }
    } catch (error) {
        console.error('Error saving exam:', error);
        showToast('❌ خطأ في الاتصال بالسيرفر', 'error');
    }
};

async function loadExamsList() {
    try {
        const response = await fetch(`${BASE_URL}/api/exams`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('فشل جلب الاختبارات');
        }
        
        const exams = await response.json();
        const tbody = document.getElementById('exams-list-body');
        
        if (!tbody) return;
        
        if (!exams || exams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">📭 لا توجد اختبارات مسجلة</td></tr>';
            return;
        }
        
        tbody.innerHTML = exams.map(ex => `
            <tr>
                <td style="text-align:right;">${escapeHtml(ex.name)}</td>
                <td style="text-align:center;"><strong style="color:#0F2B3D;">${escapeHtml(ex.code)}</strong></td>
                <td style="text-align:center;">${ex.stage === 'first' ? 'الأولى ثانوي' : 'الثانية ثانوي'}</td>
                <td style="text-align:center;">${ex.duration} دقيقة</td>
                <td style="text-align:center;">${ex.questions?.length || 0}</td>
                <td style="text-align:center;">${new Date(ex.createdAt).toLocaleDateString('ar-EG')}</td>
                <td style="text-align:center;">
                    <button class="edit-btn" onclick="viewExam('${ex.code}')" style="background:#3498DB; color:white; border:none; padding:6px 12px; border-radius:20px; margin:2px; cursor:pointer;">
                        <i class="fas fa-eye"></i> عرض
                    </button>
                    <button class="delete-btn" onclick="deleteExam('${ex.code}')" style="background:#E74C3C; color:white; border:none; padding:6px 12px; border-radius:20px; margin:2px; cursor:pointer;">
                        <i class="fas fa-trash"></i> حذف
                    </button>
                </td>
             </tr>
        `).join('');
    } catch (error) {
        console.error('Error loading exams:', error);
        const tbody = document.getElementById('exams-list-body');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">❌ فشل تحميل الاختبارات</td></tr>';
        }
    }
}

window.viewExam = async function(code) {
    try {
        const response = await fetch(`${BASE_URL}/api/exams/${encodeURIComponent(code)}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('فشل جلب بيانات الاختبار');
        }
        
        const exam = await response.json();
        
        let questionsHtml = '<div style="max-height:400px; overflow-y:auto; text-align:right;">';
        exam.questions.forEach((q, i) => {
            questionsHtml += `
                <div style="background:#f8f9fa; border-radius:12px; padding:15px; margin-bottom:15px;">
                    <strong>سؤال ${i + 1}:</strong> ${escapeHtml(q.text)}<br>
                    ${q.options ? `<span style="color:#2D9C7C;">📌 الخيارات: ${q.options.join(', ')}</span><br><span style="color:#C7A252;">✅ الإجابة الصحيحة: ${q.correctAnswer === 'true' ? 'صح' : (q.correctAnswer === 'false' ? 'خطأ' : q.correctAnswer)}</span>` : ''}
                    ${q.correctAnswer && !q.options ? `<span style="color:#C7A252;">✅ الإجابة النموذجية: ${escapeHtml(q.correctAnswer)}</span>` : ''}
                </div>
            `;
        });
        questionsHtml += '</div>';
        
        Swal.fire({
            title: exam.name,
            html: `
                <div style="text-align:right;">
                    <p><strong>🔑 كود الاختبار:</strong> ${exam.code}</p>
                    <p><strong>📚 المرحلة:</strong> ${exam.stage === 'first' ? 'الأولى ثانوي' : 'الثانية ثانوي'}</p>
                    <p><strong>⏱️ المدة:</strong> ${exam.duration} دقيقة</p>
                    <p><strong>📊 عدد الأسئلة:</strong> ${exam.questions.length}</p>
                    <hr>
                    <h4>📝 الأسئلة:</h4>
                    ${questionsHtml}
                </div>
            `,
            icon: 'info',
            confirmButtonText: 'إغلاق',
            confirmButtonColor: '#C7A252',
            width: '700px'
        });
    } catch (error) {
        console.error('Error viewing exam:', error);
        showToast('خطأ في عرض بيانات الاختبار', 'error');
    }
};

window.deleteExam = async function(code) {
    const result = await Swal.fire({
        title: '⚠️ تأكيد الحذف',
        text: `هل أنت متأكد من حذف الاختبار "${code}"؟ لا يمكن التراجع!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، احذف',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: '#E74C3C'
    });
    
    if (result.isConfirmed) {
        const csrfToken = getCsrfToken();
        showToast('جاري حذف الاختبار...', 'info');
        
        try {
            const response = await fetch(`${BASE_URL}/api/exams/${encodeURIComponent(code)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                showToast('✅ تم حذف الاختبار بنجاح', 'success');
                await loadExamsList();
            } else {
                showToast(data.error || '❌ فشل حذف الاختبار', 'error');
            }
        } catch (error) {
            console.error('Error deleting exam:', error);
            showToast('❌ خطأ في الاتصال بالسيرفر', 'error');
        }
    }
};

document.getElementById('fetch-results')?.addEventListener('click', async () => {
    const code = document.getElementById('results-exam-code')?.value.trim();
    if (!code) {
        showToast('أدخل كود الاختبار أولاً!', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${BASE_URL}/api/exams/${encodeURIComponent(code)}/results`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('فشل جلب النتائج');
        }
        
        const results = await response.json();
        const container = document.getElementById('exam-results-list');
        
        if (!results || results.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px;">📭 لا توجد نتائج مسجلة لهذا الاختبار</p>';
            return;
        }
        
        container.innerHTML = `
            <div class="table-wrapper">
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="background:#1e3c4a; color:#d4af5a;">
                            <th style="padding:12px;">👨‍🎓 الطالب</th>
                            <th style="padding:12px;">📊 النتيجة</th>
                            <th style="padding:12px;">📅 التاريخ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => `
                            <tr style="border-bottom:1px solid #eee;">
                                <td style="padding:10px; text-align:center;">${escapeHtml(r.studentId)}</td>
                                <td style="padding:10px; text-align:center;"><strong style="color:#27AE60;">${r.score.toFixed(1)}%</strong></td>
                                <td style="padding:10px; text-align:center;">${new Date(r.completionTime).toLocaleString('ar-EG')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } catch (error) {
        console.error('Error fetching results:', error);
        showToast('❌ خطأ في جلب النتائج', 'error');
    }
});

document.getElementById('question-type')?.addEventListener('change', renderQuestionInputs);
document.getElementById('add-question')?.addEventListener('click', addQuestion);
document.getElementById('save-exam')?.addEventListener('click', saveExam);

// ====================== تحليل Excel ======================
window.analyzeExcel = async () => { 
    let file = document.getElementById('excel-upload').files[0]; 
    if (!file) return showToast('اختر ملف Excel', 'error'); 
    let reader = new FileReader(); 
    reader.onload = async (e) => { 
        let data = new Uint8Array(e.target.result), wb = XLSX.read(data, { type: 'array' }), rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }); 
        for (let i = 1; i < rows.length; i++) { 
            let row = rows[i]; 
            if (row[0] && row[1]) { 
                let subjects = []; 
                if (row[2]) subjects.push({ name: "اللغة العربية", grade: parseFloat(row[2]) });
                if (row[3]) subjects.push({ name: "اللغة الإنجليزية", grade: parseFloat(row[3]) });
                if (row[4]) subjects.push({ name: "علوم تطبيقية", grade: parseFloat(row[4]) });
                if (row[5]) subjects.push({ name: "طب باطنة", grade: parseFloat(row[5]) });
                if (row[6]) subjects.push({ name: "تمريض باطني جراحي", grade: parseFloat(row[6]) });
                if (row[7]) subjects.push({ name: "حاسب آلي", grade: parseFloat(row[7]) });
                let existing = allStudents.find(s => s.studentCode == row[0]); 
                if (existing) await saveToServer(`/api/students/${row[0]}`, { fullName: row[1], subjects }, 'PUT'); 
                else await saveToServer('/api/students', { fullName: row[1], id: row[0], subjects }); 
            } 
        } 
        allStudents = await getFromServer('/api/admin/students'); 
        studentsWithGrades = getStudentsWithGrades(allStudents); 
        renderResults(); 
        renderStats(); 
        showToast('تم تحليل Excel', 'success'); 
    }; 
    reader.readAsArrayBuffer(file); 
};

document.getElementById('analyze-excel')?.addEventListener('click', window.analyzeExcel);

document.getElementById('export-excel')?.addEventListener('click', () => { 
    let wsData = [["اسم الطالب", "رقم الجلوس", "المواد والدرجات", "المجموع", "النسبة"]]; 
    studentsWithGrades.forEach(s => { 
        let total = calculateStudentTotal(s), pct = calculateStudentPercentage(s), grades = getStudentFormattedGrades(s), gtxt = ''; 
        for (let [n, info] of Object.entries(grades)) gtxt += `${n}: ${info.grade}/${info.max} | `; 
        wsData.push([s.fullName, s.studentCode, gtxt, `${total}/${TOTAL_POSSIBLE}`, `${pct.toFixed(1)}%`]); 
    }); 
    let ws = XLSX.utils.aoa_to_sheet(wsData), wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, 'النتائج'); 
    XLSX.writeFile(wb, `نتائج_الطلاب_${new Date().toLocaleDateString()}.xlsx`); 
    showToast('تم التصدير', 'success'); 
});

// ====================== بحث وتصفية ======================
document.getElementById('search-input')?.addEventListener('input', e => renderResults(e.target.value));
document.getElementById('filter-select')?.addEventListener('change', e => { 
    let rows = document.querySelectorAll('#results-table-body tr'); 
    rows.forEach(row => { 
        let pctCell = row.cells[3]?.querySelector('.percentage-cell'); 
        if (pctCell) { 
            let pct = parseFloat(pctCell.innerText); 
            if (e.target.value === 'passed') row.style.display = pct >= 60 ? '' : 'none'; 
            else if (e.target.value === 'failed') row.style.display = pct < 60 ? '' : 'none'; 
            else row.style.display = ''; 
        } 
    }); 
});

// ====================== دوال مساعدة ======================
function renderAdminWelcomeMessage() { 
    let u = getLoggedInUser(), d = document.querySelector('.admin-welcome-message'); 
    if (d && u) d.textContent = `أهلًا بك يا ${u.fullName || u.username} في لوحة التحكم`; 
}

function renderNavbar() { 
    let n = document.getElementById('nav-bar'); 
    if (n) n.innerHTML = `<a href="Home.html"><i class="fas fa-home"></i> الرئيسية</a><a href="admin.html"><i class="fas fa-cogs"></i> لوحة التحكم</a><a href="#" onclick="logout()"><i class="fas fa-sign-out-alt"></i> تسجيل الخروج</a>`; 
}

window.toggleSubjects = function() { 
    let sem = document.getElementById('semester')?.value, hg = document.getElementById('history-group'), gg = document.getElementById('geography-group'); 
    if (hg && gg) { 
        hg.style.display = sem === 'first' ? 'block' : 'none'; 
        gg.style.display = sem === 'first' ? 'none' : 'block'; 
    } 
};

// ====================== بدء التشغيل ======================
(async function init() { 
    if (await verifyAdminAccess()) { 
        renderNavbar(); 
        renderAdminWelcomeMessage(); 
        await loadInitialData(); 
        await loadExamsList(); 
        renderQuestionInputs(); 
        window.toggleSubjects(); 
    } 
})();