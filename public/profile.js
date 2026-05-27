// ====================== إعدادات السيرفر ======================
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : '';

let currentUser = null;
let userData = null;
let isAdminUser = false;

// ====================== دوال مساعدة ======================
function getCsrfToken() {
    return sessionStorage.getItem('csrfToken');
}

function getLoggedInUser() {
    const user = sessionStorage.getItem('userData');
    if (user) return JSON.parse(user);
    
    const oldUser = localStorage.getItem('loggedInUser');
    if (oldUser) {
        const parsed = JSON.parse(oldUser);
        sessionStorage.setItem('userData', JSON.stringify(parsed));
        return parsed;
    }
    return null;
}

function showToast(message, type = 'success') {
    const colors = {
        success: 'linear-gradient(135deg, #2d6a4f, #1b4d3b)',
        error: 'linear-gradient(135deg, #b91c1c, #991b1b)',
        info: 'linear-gradient(135deg, #d97706, #b45309)',
        warning: 'linear-gradient(135deg, #f59e0b, #d97706)'
    };
    
    if (typeof Toastify !== 'undefined') {
        Toastify({
            text: message,
            duration: 3000,
            gravity: 'top',
            position: 'center',
            style: {
                background: colors[type] || colors.success,
                fontFamily: 'Tajawal, sans-serif',
                borderRadius: '50px',
                padding: '12px 24px',
                direction: 'rtl',
                fontWeight: '600',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            },
            stopOnFocus: true
        }).showToast();
    } else {
        alert(message);
    }
}

// ====================== API Request ======================
async function apiRequest(endpoint, options = {}) {
    const csrfToken = getCsrfToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    
    if (csrfToken && options.method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method)) {
        headers['X-CSRF-Token'] = csrfToken;
    }
    
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers,
        credentials: 'include'
    });
    
    if (response.status === 401) {
        sessionStorage.clear();
        localStorage.removeItem('loggedInUser');
        showToast('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        throw new Error('انتهت الجلسة');
    }
    
    return response;
}

// ====================== جلب بيانات الطالب (API مخصص للطلاب) ======================
async function fetchStudentDataFromServer() {
    // الطريقة الصحيحة: استخدام API جلب الطالب برقم الجلوس
    if (currentUser.studentCode) {
        console.log('📡 جلب بيانات الطالب من /api/student/by-code/', currentUser.studentCode);
        const response = await apiRequest(`/api/student/by-code/${currentUser.studentCode}`);
        if (response.ok) {
            const student = await response.json();
            console.log('✅ تم جلب بيانات الطالب:', student);
            return student;
        }
    }
    
    // محاولة بديلة: استخدام username
    if (currentUser.username) {
        console.log('📡 محاولة جلب بيانات الطالب بالاسم:', currentUser.username);
        // ملاحظة: هذا الAPI يتطلب أدمن، لذا قد يفشل
        try {
            const response = await apiRequest(`/api/student/by-username/${currentUser.username}`);
            if (response.ok) {
                return await response.json();
            }
        } catch (e) {
            console.log('⚠️ فشل جلب البيانات بالاسم');
        }
    }
    
    return null;
}

// ====================== جلب بيانات الأدمن ======================
async function fetchAdminDataFromServer() {
    console.log('📡 جلب بيانات الأدمن...');
    const response = await apiRequest('/api/admins');
    if (response.ok) {
        const admins = await response.json();
        return admins.find(a => a.username === currentUser.username);
    }
    return null;
}

// ====================== جلب بيانات المستخدم ======================
async function fetchUserData() {
    currentUser = getLoggedInUser();
    
    if (!currentUser) {
        showToast('يرجى تسجيل الدخول أولاً', 'error');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return false;
    }
    
    console.log('👤 المستخدم الحالي:', currentUser);
    console.log('📌 نوع المستخدم:', currentUser.type);
    
    isAdminUser = currentUser.type === 'admin' || currentUser.role === 'admin';
    
    try {
        if (isAdminUser) {
            // للأدمن - استخدام API الأدمن
            userData = await fetchAdminDataFromServer();
        } else {
            // للطالب - استخدام API الطالب
            userData = await fetchStudentDataFromServer();
        }
        
        // إذا فشل جلب البيانات من السيرفر، استخدم البيانات المحلية
        if (!userData) {
            console.log('⚠️ استخدام البيانات المحلية كبديل');
            userData = currentUser;
        } else {
            console.log('✅ تم جلب البيانات بنجاح من السيرفر');
        }
        
        // تحديث التخزين المحلي
        sessionStorage.setItem('userData', JSON.stringify(userData));
        if (!isAdminUser) {
            localStorage.setItem('loggedInUser', JSON.stringify(userData));
        }
        
        displayUserData();
        updateProgress();
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في جلب البيانات:', error);
        userData = currentUser;
        displayUserData();
        updateProgress();
        return true;
    }
}

// ====================== عرض بيانات المستخدم ======================
function displayUserData() {
    if (!userData) return;
    
    isAdminUser = userData.type === 'admin' || userData.role === 'admin';
    
    // عرض الاسم
    const userNameElem = document.getElementById('userName');
    if (userNameElem) userNameElem.textContent = userData.fullName || userData.username;
    
    document.getElementById('fullName').value = userData.fullName || '';
    document.getElementById('username').value = userData.username || '';
    
    const userTypeBadge = document.getElementById('userTypeBadge');
    const studentCodeElem = document.getElementById('studentCode');
    const userGradeElem = document.getElementById('userGrade');
    const avatarIcon = document.querySelector('.profile-avatar i');
    
    if (isAdminUser) {
        // عرض بيانات الأدمن
        userTypeBadge.innerHTML = '<i class="fas fa-crown"></i><span>مدير النظام</span>';
        userTypeBadge.style.background = '#f59e0b';
        studentCodeElem.textContent = 'مدير';
        userGradeElem.textContent = 'جميع الصفوف';
        avatarIcon.className = 'fas fa-user-shield';
        
        const parentNameGroup = document.getElementById('parentNameGroup');
        const parentIdGroup = document.getElementById('parentIdGroup');
        if (parentNameGroup) parentNameGroup.style.display = 'none';
        if (parentIdGroup) parentIdGroup.style.display = 'none';
    } else {
        // عرض بيانات الطالب
        userTypeBadge.innerHTML = '<i class="fas fa-graduation-cap"></i><span>طالب</span>';
        userTypeBadge.style.background = '#1a4f6e';
        
        const studentCode = userData.studentCode || 'غير محدد';
        studentCodeElem.textContent = studentCode;
        
        const gradeMap = { 'first': 'الأول', 'second': 'الثاني', 'third': 'الثالث' };
        const gradeValue = userData.grade ? gradeMap[userData.grade] : 'غير محدد';
        userGradeElem.textContent = gradeValue;
        
        avatarIcon.className = 'fas fa-user-graduate';
        
        const parentNameGroup = document.getElementById('parentNameGroup');
        const parentIdGroup = document.getElementById('parentIdGroup');
        if (parentNameGroup) parentNameGroup.style.display = 'block';
        if (parentIdGroup) parentIdGroup.style.display = 'block';
    }
    
    // عرض الصف
    const gradeInput = document.getElementById('grade');
    if (gradeInput) {
        if (!isAdminUser) {
            const gradeMap = { 'first': 'الصف الأول', 'second': 'الصف الثاني', 'third': 'الصف الثالث' };
            gradeInput.value = userData.grade ? gradeMap[userData.grade] : '-';
        } else {
            gradeInput.value = 'مدير النظام';
        }
    }
    
    // عرض بيانات البروفايل
    const profile = userData.profile || {};
    document.getElementById('phone').value = profile.phone || '';
    document.getElementById('parentName').value = profile.parentName || '';
    document.getElementById('parentId').value = profile.parentId || '';
    
    console.log('✅ تم عرض البيانات');
}

// ====================== حساب نسبة اكتمال الملف ======================
function updateProgress() {
    const profile = userData?.profile || {};
    let fields = isAdminUser ? ['phone'] : ['phone', 'parentName', 'parentId'];
    let completed = fields.filter(f => profile[f] && profile[f].trim() !== '').length;
    const percentage = Math.round((completed / fields.length) * 100);
    
    const progressFill = document.getElementById('progressFill');
    const progressPercent = document.getElementById('progressPercent');
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressPercent) progressPercent.textContent = `${percentage}%`;
    return percentage;
}

// ====================== حفظ التغييرات ======================
async function saveProfile(event) {
    event.preventDefault();
    
    const updatedProfile = { 
        phone: document.getElementById('phone').value.trim() 
    };
    
    if (!isAdminUser) {
        updatedProfile.parentName = document.getElementById('parentName').value.trim();
        updatedProfile.parentId = document.getElementById('parentId').value.trim();
    }
    
    try {
        let endpoint = isAdminUser 
            ? `/api/admins/${userData.username}` 
            : `/api/students/${userData.studentCode}`;
        
        console.log('📤 حفظ إلى:', endpoint);
        showToast('جاري حفظ البيانات...', 'info');
        
        const response = await apiRequest(endpoint, {
            method: 'PUT',
            body: JSON.stringify({ profile: updatedProfile })
        });
        
        if (response.ok) {
            if (!userData.profile) userData.profile = {};
            userData.profile = { ...userData.profile, ...updatedProfile };
            
            if (currentUser) {
                currentUser.profile = userData.profile;
                sessionStorage.setItem('userData', JSON.stringify(currentUser));
                if (!isAdminUser) {
                    localStorage.setItem('loggedInUser', JSON.stringify(currentUser));
                }
            }
            
            const percentage = updateProgress();
            if (percentage === 100) {
                showToast('🎉 مبروك! ملفك الشخصي مكتمل 100%', 'success');
            } else {
                showToast('✅ تم حفظ التغييرات بنجاح', 'success');
            }
        } else {
            const error = await response.json();
            console.error('❌ فشل الحفظ:', error);
            showToast(error.error || 'فشل حفظ البيانات', 'error');
        }
    } catch (error) {
        console.error('❌ خطأ:', error);
        showToast('خطأ في الاتصال بالسيرفر', 'error');
    }
}

// ====================== التحقق من الجلسة ======================
async function verifySession() {
    try {
        const response = await apiRequest('/api/verify-session');
        return response.ok;
    } catch {
        return currentUser !== null;
    }
}

// ====================== تسجيل الخروج ======================
window.logout = async function() {
    if (confirm('هل تريد تسجيل الخروج؟')) {
        try {
            await fetch(`${BASE_URL}/api/logout`, { method: 'POST', credentials: 'include' });
        } catch(e) {}
        sessionStorage.clear();
        localStorage.removeItem('loggedInUser');
        window.location.href = 'login.html';
    }
};

// ====================== بناء النافبار ======================
function buildBottomNav() {
    const navBar = document.getElementById('bottomNav');
    if (!navBar) return;
    
    const isAdmin = currentUser && (currentUser.type === 'admin' || currentUser.role === 'admin');
    const navItems = [
        { href: 'Home.html', icon: 'fas fa-home', label: 'الرئيسية' },
        { href: 'exams.html', icon: 'fas fa-book', label: 'الاختبارات' },
        { href: 'profile.html', icon: 'fas fa-user', label: 'ملفي', active: true }
        
    ];
    if (isAdmin) navItems.push({ href: 'admin.html', icon: 'fas fa-chalkboard-user', label: 'التحكم' });
    
    navBar.innerHTML = navItems.map(item => `
        <a href="${item.href}" class="nav-item ${item.active ? 'active' : ''}">
            <i class="${item.icon}"></i>
            <span>${item.label}</span>
        </a>
    `).join('');
}

// ====================== تهيئة الصفحة ======================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 بدء تحميل صفحة الملف الشخصي');
    
    currentUser = getLoggedInUser();
    if (!currentUser) {
        showToast('يرجى تسجيل الدخول أولاً', 'warning');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }
    
    const isValid = await verifySession();
    if (!isValid) {
        showToast('انتهت صلاحية الجلسة', 'warning');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }
    
    await fetchUserData();
    buildBottomNav();
    
    const profileForm = document.getElementById('profileForm');
    if (profileForm) profileForm.addEventListener('submit', saveProfile);
    
    const firstName = userData?.fullName?.split(' ')[0] || userData?.username || 'بطل';
    setTimeout(() => showToast(`مرحباً بك يا ${firstName} 👋`, 'success'), 500);
});