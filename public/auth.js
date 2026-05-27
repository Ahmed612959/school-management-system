// auth.js - النسخة الآمنة

function getCsrfToken() {
    return sessionStorage.getItem('csrfToken');
}

function saveCsrfToken(token) {
    sessionStorage.setItem('csrfToken', token);
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

function saveUserData(user) {
    sessionStorage.setItem('userData', JSON.stringify(user));
}

function clearSession() {
    sessionStorage.removeItem('csrfToken');
    sessionStorage.removeItem('userData');
}

// منع أدوات المطور
(function preventDevTools() {
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
            (e.ctrlKey && e.key === 'U')) {
            e.preventDefault();
            return false;
        }
    });
})();

// تسجيل الدخول
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn?.innerHTML || 'تسجيل الدخول';

        if (!username || !password) {
            alert('⚠️ يرجى إدخال اسم المستخدم وكلمة المرور!');
            return;
        }

        if (submitBtn) {
            submitBtn.innerHTML = '⏳ جاري...';
            submitBtn.disabled = true;
        }

        try {
            const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
            const response = await fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                if (data.csrfToken) saveCsrfToken(data.csrfToken);
                if (data.user) saveUserData(data.user);
                
                alert(`🎉 مرحباً ${data.user?.fullName || username}!`);
                
                if (data.user?.type === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'Home.html';
                }
            } else {
                alert(data.error || 'اسم المستخدم أو كلمة المرور غير صحيحة!');
            }
        } catch (err) {
            console.error('Login Error:', err);
            alert('❌ فشل الاتصال بالخادم! تأكد من تشغيل السيرفر');
        } finally {
            if (submitBtn) {
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        }
    });
});

// تجديد الجلسة
async function refreshSession() {
    try {
        const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        const response = await fetch(`${BASE_URL}/api/refresh-token`, {
            method: 'POST',
            credentials: 'include'
        });
        return response.ok;
    } catch {
        return false;
    }
}

// تسجيل الخروج
window.logout = async function() {
    try {
        const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
        await fetch(`${BASE_URL}/api/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch(e) {}
    
    clearSession();
    window.location.href = 'login.html';
};

// حماية الصفحات
const currentPage = window.location.pathname.split('/').pop().toLowerCase();
const protectedPages = ['home.html', 'admin.html', 'profile.html', 'search-monthly.html', 'first-gards.html', 'exams.html'];

if (protectedPages.includes(currentPage)) {
    (async function checkAuth() {
        try {
            const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';
            const response = await fetch(`${BASE_URL}/api/verify-session`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('غير مصرح');
            }
            
            const user = getLoggedInUser();
            
            if (user?.type === 'student' && currentPage === 'admin.html') {
                alert('⛔ غير مصرح لك بالدخول إلى لوحة الإدارة!');
                window.location.href = 'Home.html';
            }
        } catch (err) {
            alert('يرجى تسجيل الدخول أولاً!');
            window.location.href = 'login.html';
        }
    })();
}

setInterval(refreshSession, 55 * 60 * 1000);