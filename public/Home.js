// Home.js - نسخة كاملة وشغالة

const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

function getCsrfToken() {
    return sessionStorage.getItem('csrfToken');
}

function getLoggedInUser() {
    const userStr = sessionStorage.getItem('userData');
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch {
        return null;
    }
}

function showToast(message, type = 'success') {
    if (typeof Toastify !== 'undefined') {
        Toastify({
            text: message,
            duration: 4000,
            gravity: "top",
            position: "right",
            backgroundColor: type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8',
            style: { fontFamily: '"Tajawal", sans-serif', fontSize: '18px', direction: 'rtl', borderRadius: '12px', padding: '16px 24px' }
        }).showToast();
    } else {
        alert(message);
    }
}

async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include'
    });
    
    if (response.status === 401) {
        window.location.href = '/login.html';
        throw new Error('انتهت الجلسة');
    }
    
    return response;
}

// المواد والدرجات
const subjectMaxGrades = {
    "اللغة العربية": 20,
    "اللغة الإنجليزية": 20,
    "علوم تطبيقية": 40,
    "طب باطنة": 20,
    "تمريض باطني جراحي": 24,
    "حاسب آلي": 20
};

const TOTAL_POSSIBLE = 144;
const orderedSubjects = ["اللغة العربية", "اللغة الإنجليزية", "علوم تطبيقية", "طب باطنة", "تمريض باطني جراحي", "حاسب آلي"];
const extraSubjectsList = ["الدين"];

function calculateStudentPercentage(student) {
    if (!student.subjects || student.subjects.length === 0) return 0;
    let totalEarned = 0;
    student.subjects.forEach(subject => {
        if (subjectMaxGrades[subject.name]) {
            totalEarned += subject.grade || 0;
        }
    });
    return (totalEarned / TOTAL_POSSIBLE) * 100;
}

function calculateStudentTotal(student) {
    if (!student.subjects) return 0;
    let total = 0;
    student.subjects.forEach(subject => {
        if (subjectMaxGrades[subject.name]) {
            total += subject.grade || 0;
        }
    });
    return total;
}

// جلب طالب برقم الجلوس
async function fetchStudentByCode(studentCode) {
    try {
        const response = await apiRequest(`/api/student/by-code/${encodeURIComponent(studentCode)}`);
        if (response.ok) {
            return await response.json();
        }
        return null;
    } catch (error) {
        console.error('خطأ في جلب الطالب:', error);
        return null;
    }
}

// جلب مخالفات طالب
async function fetchViolationsForStudent(studentId) {
    try {
        const response = await apiRequest(`/api/violations/student/${encodeURIComponent(studentId)}`);
        if (response.ok) {
            return await response.json();
        }
        return [];
    } catch (error) {
        console.error('خطأ في جلب المخالفات:', error);
        return [];
    }
}

// جلب إشعارات
async function loadNotifications() {
    try {
        const response = await fetch(`${BASE_URL}/api/notifications`);
        if (response.ok) {
            const notifications = await response.json();
            const tableBody = document.getElementById('notifications-table-body');
            if (tableBody) {
                tableBody.innerHTML = '';
                if (!notifications.length) {
                    tableBody.innerHTML = '<tr><td colspan="2">لا توجد إشعارات حاليًا</td></tr>';
                    return;
                }
                notifications.forEach(n => {
                    const row = document.createElement('tr');
                    row.innerHTML = `<td>${n.text || 'إشعار بدون نص'}</td><td>${n.date || 'غير محدد'}</td>`;
                    tableBody.appendChild(row);
                });
            }
        }
    } catch (error) {
        console.error('خطأ في تحميل الإشعارات:', error);
    }
}

// جلب إحصائيات الحضور
let attendanceStats = null;

async function fetchAttendanceStats(studentCode) {
    try {
        const response = await apiRequest(`/api/attendance/student/${studentCode}?t=${Date.now()}`);
        if (response.ok) {
            const attendanceRecords = await response.json();
            if (!attendanceRecords.length) {
                attendanceStats = null;
                return null;
            }
            const present = attendanceRecords.filter(a => a.status === 'present').length;
            const absent = attendanceRecords.filter(a => a.status === 'absent').length;
            const late = attendanceRecords.filter(a => a.status === 'late').length;
            const total = attendanceRecords.length;
            const percentage = total > 0 ? (present / total) * 100 : 0;
            const lastPresent = attendanceRecords.filter(a => a.status === 'present').sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            const lastAbsent = attendanceRecords.filter(a => a.status === 'absent').sort((a, b) => new Date(b.date) - new Date(a.date))[0];
            
            attendanceStats = {
                present, absent, late, total, percentage: percentage.toFixed(1),
                lastPresentDate: lastPresent ? formatDate(lastPresent.date) : null,
                lastAbsentDate: lastAbsent ? formatDate(lastAbsent.date) : null
            };
            return attendanceStats;
        }
        return null;
    } catch (error) {
        console.error('خطأ في جلب إحصائيات الحضور:', error);
        return null;
    }
}

function formatDate(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dateStr;
}

function renderAttendanceStats() {
    const section = document.getElementById('attendanceStatsSection');
    if (!section) return;
    const user = getLoggedInUser();
    if (!user || user.type !== 'student') {
        section.style.display = 'none';
        return;
    }
    
    if (!attendanceStats) {
        section.style.display = 'block';
        const noMsgDiv = document.getElementById('noAttendanceMessage');
        if (noMsgDiv) noMsgDiv.style.display = 'block';
        const grid = document.querySelector('.attendance-stats-grid');
        const datesDiv = document.querySelector('.attendance-dates');
        if (grid) grid.style.display = 'none';
        if (datesDiv) datesDiv.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    const noMsgDiv = document.getElementById('noAttendanceMessage');
    if (noMsgDiv) noMsgDiv.style.display = 'none';
    const grid = document.querySelector('.attendance-stats-grid');
    const datesDiv = document.querySelector('.attendance-dates');
    if (grid) grid.style.display = 'grid';
    if (datesDiv) datesDiv.style.display = 'flex';
    
    document.getElementById('presentCount').textContent = attendanceStats.present;
    document.getElementById('absentCount').textContent = attendanceStats.absent;
    document.getElementById('lateCount').textContent = attendanceStats.late;
    document.getElementById('attendancePercentage').textContent = attendanceStats.percentage + '%';
    const lastPresentSpan = document.getElementById('lastPresentDate');
    const lastAbsentSpan = document.getElementById('lastAbsentDate');
    if (lastPresentSpan) lastPresentSpan.innerHTML = attendanceStats.lastPresentDate || 'لم يتم تسجيل بعد';
    if (lastAbsentSpan) lastAbsentSpan.innerHTML = attendanceStats.lastAbsentDate || 'لم يتم تسجيل بعد';
}

// عرض لوحة التحكم للطالب المسجل نفسه
async function renderDashboard() {
    const user = getLoggedInUser();
    const dashboard = document.getElementById('dashboard');
    
    if (!dashboard || !user || user.type !== 'student') {
        if (dashboard) dashboard.style.display = 'none';
        const attendanceSection = document.getElementById('attendanceStatsSection');
        if (attendanceSection) attendanceSection.style.display = 'none';
        return;
    }
    
    const student = await fetchStudentByCode(user.id);
    if (!student) {
        dashboard.style.display = 'none';
        return;
    }
    
    dashboard.style.display = 'block';
    
    if (student.subjects && student.subjects.length > 0) {
        const percentage = calculateStudentPercentage(student);
        const total = calculateStudentTotal(student);
        const religionGrade = student.subjects?.find(s => s.name === 'الدين')?.grade || 0;
        
        document.getElementById('student-percentage').innerHTML = `📊 نسبة نجاحك: <strong>${percentage.toFixed(1)}%</strong><br>
        <small>(المجموع: ${total} / ${TOTAL_POSSIBLE})</small>`;
        document.getElementById('class-average').innerHTML = `📈 --`;
        
        let religionDiv = document.getElementById('religionDisplay');
        if (!religionDiv) {
            religionDiv = document.createElement('div');
            religionDiv.id = 'religionDisplay';
            religionDiv.style.cssText = 'margin-top: 10px; padding: 8px; background: #f0f0f0; border-radius: 8px; text-align: center;';
            const statsDiv = document.querySelector('.stats');
            if (statsDiv) statsDiv.appendChild(religionDiv);
        }
        religionDiv.innerHTML = `📖 مادة الدين: <strong>${religionGrade} / 32</strong> (خارج المجموع)`;
        
        const subjectsWithGrades = orderedSubjects.map(subjName => {
            const subject = student.subjects?.find(s => s.name === subjName);
            return { name: subjName, grade: subject ? (subject.grade || 0) : 0 };
        });
        
        const ctx = document.getElementById('gradesChart')?.getContext('2d');
        if (ctx && typeof Chart !== 'undefined') {
            if (window.gradesChart) window.gradesChart.destroy();
            window.gradesChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: subjectsWithGrades.map(s => s.name),
                    datasets: [{
                        label: 'درجاتك',
                        data: subjectsWithGrades.map(s => s.grade),
                        backgroundColor: 'rgba(212, 175, 55, 0.8)',
                        borderColor: '#d4af37',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    scales: { y: { beginAtZero: true, max: 100 } },
                    plugins: { legend: { display: false } }
                }
            });
        }
    } else {
        document.getElementById('student-percentage').innerHTML = `📊 لا توجد درجات مسجلة حتى الآن`;
        document.getElementById('class-average').innerHTML = `📈 --`;
    }
    
    if (student.studentCode) {
        await fetchAttendanceStats(student.studentCode);
        renderAttendanceStats();
    }
}

// عرض نتيجة الطالب بعد البحث
function renderStudentResult(student, studentViolations, resultBody, violationsBody) {
    if (!student.subjects || student.subjects.length === 0) {
        resultBody.innerHTML = '<tr><td colspan="4">📭 لا توجد درجات مسجلة لهذا الطالب</td></tr>';
        if (violationsBody) violationsBody.innerHTML = '<tr><td colspan="5">✅ لا توجد مخالفات</td></tr>';
        return;
    }
    
    let total = 0;
    const subjectGrades = [];
    
    orderedSubjects.forEach(subjName => {
        const subject = student.subjects.find(s => s.name === subjName);
        const grade = subject ? (subject.grade || 0) : 0;
        subjectGrades.push({ name: subjName, grade: grade, max: subjectMaxGrades[subjName] });
        total += grade;
    });
    
    extraSubjectsList.forEach(subjName => {
        const subject = student.subjects.find(s => s.name === subjName);
        const grade = subject ? (subject.grade || 0) : 0;
        subjectGrades.push({ name: `${subjName} (خارج المجموع)`, grade: grade, max: 32, isExtra: true });
    });
    
    const percentage = (total / TOTAL_POSSIBLE) * 100;
    let percentageClass = percentage >= 85 ? 'high-percentage' : (percentage >= 60 ? 'medium-percentage' : 'low-percentage');
    
    const labels = ['الاسم', 'رقم الجلوس', ...subjectGrades.map(s => s.name)];
    const values = [student.fullName, student.studentCode, ...subjectGrades.map(s => `${s.grade} / ${s.max}`)];
    
    resultBody.innerHTML = `<tr>
        <td>${labels.map((l, i) => i < labels.length - 1 ? l + '<hr>' : l).join('')}</td>
        <td>${values.map((v, i) => i < values.length - 1 ? v + '<hr>' : v).join('')}</td>
        <td>${total} / ${TOTAL_POSSIBLE}</td>
        <td class="${percentageClass}">${percentage.toFixed(1)}%</td>
    </tr>`;
    
    if (violationsBody) {
        if (studentViolations && studentViolations.length) {
            violationsBody.innerHTML = studentViolations.map(v => `<tr>
                <td>${v.type === 'warning' ? '⚠️ إنذار' : '🚫 مخالفة'}</td>
                <td>${v.reason}</td>
                <td>${v.penalty}</td>
                <td>${v.parentSummons ? '✅ نعم' : '❌ لا'}</td>
                <td>${v.date}</td>
            </tr>`).join('');
        } else {
            violationsBody.innerHTML = '<tr><td colspan="5">✅ لا توجد مخالفات مسجلة</td></tr>';
        }
    }
}

// البحث عن الطالب
function setupSearchForm() {
    const form = document.getElementById('search-form');
    if (!form) return;
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const name = document.getElementById('search-name')?.value.trim();
        const studentCode = document.getElementById('search-id')?.value.trim();
        const resultBody = document.getElementById('result-table-body');
        const violationsBody = document.getElementById('violations-table-body');
        
        if (!name || !studentCode) {
            showToast('⚠️ يرجى إدخال الاسم ورقم الجلوس معًا!', 'error');
            return;
        }
        
        showToast('🔍 جاري البحث...', 'info');
        
        try {
            const student = await fetchStudentByCode(studentCode);
            
            if (student && student.fullName.includes(name)) {
                const studentViolations = await fetchViolationsForStudent(student.studentCode);
                renderStudentResult(student, studentViolations, resultBody, violationsBody);
                showToast('✅ تم العثور على الطالب بنجاح!', 'success');
            } else {
                resultBody.innerHTML = '<tr><td colspan="4">❌ لا توجد نتيجة بهذا الاسم ورقم الجلوس!</td></tr>';
                violationsBody.innerHTML = '<tr><td colspan="5">❌ لا توجد نتيجة!</td></tr>';
                showToast('❌ الطالب غير موجود! تأكد من رقم الجلوس', 'error');
            }
        } catch (error) {
            console.error('خطأ في البحث:', error);
            resultBody.innerHTML = '<tr><td colspan="4">❌ حدث خطأ في البحث!</td></tr>';
            violationsBody.innerHTML = '<tr><td colspan="5">❌ حدث خطأ!</td></tr>';
            showToast('❌ حدث خطأ في الاتصال بالسيرفر', 'error');
        }
    });
}

// شريط التنقل
function renderNavbar() {
    const user = getLoggedInUser();
    const navBar = document.getElementById('nav-bar');
    if (!navBar) return;
    
    const links = [
        { href: 'index.html', icon: 'fa-solid fa-house', title: 'الرئيسية' },
        { href: 'Home.html', icon: 'fa-solid fa-chart-simple', title: 'النتائج' },
        { href: 'profile.html', icon: 'fa-solid fa-user', title: 'الملف الشخصي' },
        { href: 'search-monthly.html', icon: 'fa-solid fa-magnifying-glass', title: 'نتيجة الشهري' },
        { href: 'First-Gards.html', icon: 'fa-solid fa-graduation-cap', title: 'نتيجة الصف الاول' },
        { href: 'exams.html', icon: 'fa-solid fa-book-open', title: 'الاختبارات' },
        { href: 'developer.html', icon: 'fa-solid fa-microchip', title: 'عن المطور' }
    ];
    
    if (user?.type === 'admin') {
        links.push({ href: 'admin.html', icon: 'fas fa-cogs', title: 'لوحة التحكم' });
    }
    
    navBar.innerHTML = links.map(l => `<a href="${l.href}" title="${l.title}"><i class="${l.icon}"></i></a>`).join('');
}

// رسالة الترحيب
function renderWelcomeMessage() {
    const welcomeDiv = document.querySelector('.welcome-message');
    const user = getLoggedInUser();
    if (!welcomeDiv) return;
    
    if (user) {
        const name = user.fullName || user.username;
        welcomeDiv.textContent = user.type === 'admin' ? `👋 أهلًا يا قائد العمليات، ${name}! 🛠️` : `🎉 مرحبًا يا نجم، ${name}! نتايجك في انتظارك! 📚`;
    } else {
        welcomeDiv.textContent = '👋 مرحبًا بك! سجل الدخول لرؤية نتائجك';
    }
}

// التحقق من الجلسة
async function verifySession() {
    try {
        const response = await fetch(`${BASE_URL}/api/verify-session`, {
            credentials: 'include'
        });
        if (response.ok) {
            return true;
        }
    } catch (error) {
        console.error('خطأ في التحقق من الجلسة:', error);
        if (window.location.hostname === 'localhost') {
            return true;
        }
    }
    
    window.location.href = 'login.html';
    return false;
}

// تسجيل الخروج
async function logout() {
    try {
        await fetch(`${BASE_URL}/api/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (err) {}
    finally {
        sessionStorage.clear();
        window.location.href = 'login.html';
    }
}

function setupLogoutButton() {
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
}

// تشغيل التطبيق
async function init() {
    const isValid = await verifySession();
    if (!isValid) return;
    
    await loadNotifications();
    
    renderNavbar();
    renderWelcomeMessage();
    await renderDashboard();
    setupSearchForm();
    setupLogoutButton();
    
    setInterval(async () => {
        await fetch(`${BASE_URL}/api/refresh-token`, { method: 'POST', credentials: 'include' });
    }, 55 * 60 * 1000);
}

init();