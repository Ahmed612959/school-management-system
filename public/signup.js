// ====================== إعدادات السيرفر ======================
// تحديد رابط السيرفر بناءً على بيئة التشغيل
const BASE_URL = (() => {
    // إذا كنت تعمل محلياً
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'http://localhost:3000';
    }
    // إذا كنت تعمل على Vercel أو أي استضافة أخرى
    return '';
})();

console.log('🔌 BASE_URL:', BASE_URL || 'نفس السيرفر (relative path)');

let usernameTimeout = null;

// ====================== دوال مساعدة ======================
function showToast(message, type = 'success') {
    const colors = {
        success: 'linear-gradient(135deg, #2d6a4f, #1b4d3b)',
        error: 'linear-gradient(135deg, #b91c1c, #991b1b)',
        info: 'linear-gradient(135deg, #d97706, #b45309)'
    };
    
    Toastify({
        text: message,
        duration: 3500,
        gravity: 'top',
        position: 'center',
        style: {
            background: colors[type] || colors.success,
            fontFamily: 'Tajawal, sans-serif',
            borderRadius: '50px',
            padding: '14px 28px',
            direction: 'rtl',
            fontWeight: '600',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
        },
        stopOnFocus: true
    }).showToast();
}

// ====================== اختبار الاتصال بالسيرفر ======================
async function testServerConnection() {
    try {
        const url = `${BASE_URL}/api/test`;
        console.log('🔄 اختبار الاتصال بـ:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('✅ الاتصال بالسيرفر ناجح:', data);
            return true;
        } else {
            console.error('❌ استجابة غير ناجحة:', response.status);
            return false;
        }
    } catch (error) {
        console.error('❌ فشل الاتصال بالسيرفر:', error.message);
        return false;
    }
}

// ====================== التحقق من توفر اسم المستخدم ======================
async function checkUsernameAvailability(username) {
    if (!username || username.length < 3) {
        const statusDiv = document.getElementById('usernameStatus');
        if (statusDiv) {
            statusDiv.innerHTML = '';
            statusDiv.className = 'username-status';
        }
        return false;
    }
    
    try {
        const url = `${BASE_URL}/api/check-username?username=${encodeURIComponent(username)}`;
        console.log('🔍 التحقق من اسم المستخدم:', username);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const result = await response.json();
        const statusDiv = document.getElementById('usernameStatus');
        
        if (result.available) {
            statusDiv.innerHTML = '<i class="fas fa-check-circle"></i> اسم المستخدم متاح';
            statusDiv.className = 'username-status available';
            return true;
        } else {
            statusDiv.innerHTML = '<i class="fas fa-times-circle"></i> اسم المستخدم مستخدم بالفعل';
            statusDiv.className = 'username-status unavailable';
            return false;
        }
    } catch (error) {
        console.error('خطأ في التحقق من اسم المستخدم:', error);
        const statusDiv = document.getElementById('usernameStatus');
        statusDiv.innerHTML = '<i class="fas fa-exclamation-triangle"></i> لا يمكن التحقق حالياً';
        statusDiv.className = 'username-status error';
        return true; // نسمح بالتسجيل مؤقتاً
    }
}

// ====================== التحقق من صحة البيانات ======================
function validateForm(fullName, username, password, studentCode, phone, parentName, parentId) {
    if (!fullName || fullName.trim().length < 10) {
        showToast('⚠️ الاسم الكامل يجب أن يكون 4 كلمات على الأقل', 'error');
        return false;
    }
    
    if (!username || username.length < 3 || username.length > 20) {
        showToast('⚠️ اسم المستخدم يجب أن يكون بين 3 و 20 حرفاً', 'error');
        return false;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        showToast('⚠️ اسم المستخدم يمكن أن يحتوي فقط على أحرف إنجليزية وأرقام و _', 'error');
        return false;
    }
    
    if (!password || password.length < 6) {
        showToast('⚠️ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
        return false;
    }
    
    if (!studentCode || studentCode.length < 5 || studentCode.length > 7) {
        showToast('⚠️ رقم الجلوس يجب أن يكون 5-7 أرقام', 'error');
        return false;
    }
    
    if (!phone || phone.length < 10 || phone.length > 15) {
        showToast('⚠️ رقم الهاتف غير صحيح (10-15 رقم)', 'error');
        return false;
    }
    
    if (!parentName || parentName.trim().length < 10) {
        showToast('⚠️ اسم ولي الأمر يجب أن يكون 4 كلمات على الأقل', 'error');
        return false;
    }
    
    if (!parentId || parentId.length < 10 || parentId.length > 14) {
        showToast('⚠️ رقم بطاقة ولي الأمر غير صحيح (10-14 رقم)', 'error');
        return false;
    }
    
    return true;
}

// ====================== إنشاء الحساب ======================
async function createAccount(event) {
    event.preventDefault();
    
    const fullName = document.getElementById('fullName').value.trim();
    const username = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('password').value;
    const grade = document.getElementById('grade').value;
    const studentCode = document.getElementById('studentCode').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const parentName = document.getElementById('parentName').value.trim();
    const parentId = document.getElementById('parentId').value.trim();
    
    console.log('📝 محاولة إنشاء حساب:', { fullName, username, grade, studentCode, phone });
    
    if (!validateForm(fullName, username, password, studentCode, phone, parentName, parentId)) {
        return;
    }
    
    const isAvailable = await checkUsernameAvailability(username);
    if (!isAvailable) {
        showToast('❌ اسم المستخدم غير متاح، يرجى اختيار اسم آخر', 'error');
        return;
    }
    
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري إنشاء الحساب...';
    
    try {
        const url = `${BASE_URL}/api/students/register`;
        console.log('🌐 إرسال طلب إلى:', url);
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                fullName,
                username,
                password,
                grade,
                studentCode,
                phone,
                parentName,
                parentId
            })
        });
        
        console.log('📡 حالة الاستجابة:', response.status);
        
        const result = await response.json();
        console.log('📦 نتيجة الاستجابة:', result);
        
        if (response.ok && result.success) {
            showToast('🎉 تم إنشاء الحساب بنجاح! جاري تحويلك لتسجيل الدخول...', 'success');
            
            // تنظيف النموذج
            document.getElementById('signupForm').reset();
            document.getElementById('usernameStatus').innerHTML = '';
            
            // التوجيه إلى صفحة تسجيل الدخول بعد 2 ثانية
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            showToast(result.error || '❌ فشل إنشاء الحساب، يرجى المحاولة مرة أخرى', 'error');
        }
    } catch (error) {
        console.error('🔥 خطأ في إنشاء الحساب:', error);
        showToast(`❌ خطأ في الاتصال بالسيرفر: ${error.message}`, 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// ====================== إعداد المستمعين ======================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 بدء تحميل صفحة إنشاء الحساب');
    
    // اختبار الاتصال بالسيرفر أولاً
    const isConnected = await testServerConnection();
    if (!isConnected) {
        showToast('⚠️ تحذير: لا يمكن الاتصال بالسيرفر. تأكد من تشغيل السيرفر محلياً على المنفذ 3000', 'error');
    } else {
        showToast('✅ الاتصال بالسيرفر ناجح', 'info');
    }
    
    const usernameInput = document.getElementById('username');
    const signupForm = document.getElementById('signupForm');
    
    if (usernameInput) {
        usernameInput.addEventListener('input', (e) => {
            if (usernameTimeout) clearTimeout(usernameTimeout);
            
            const username = e.target.value.trim().toLowerCase();
            const statusDiv = document.getElementById('usernameStatus');
            
            if (username.length < 3) {
                if (statusDiv) {
                    statusDiv.innerHTML = '';
                    statusDiv.className = 'username-status';
                }
                return;
            }
            
            if (statusDiv) {
                statusDiv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التحقق...';
                statusDiv.className = 'username-status checking';
            }
            
            usernameTimeout = setTimeout(async () => {
                await checkUsernameAvailability(username);
            }, 500);
        });
    }
    
    // منع الأرقام في حقول الأسماء
    const nameFields = ['fullName', 'parentName'];
    nameFields.forEach(field => {
        const input = document.getElementById(field);
        if (input) {
            input.addEventListener('input', (e) => {
                e.target.value = e.target.value.replace(/[0-9]/g, '');
            });
        }
    });
    
    // منع الحروف في رقم الجلوس
    const studentCodeInput = document.getElementById('studentCode');
    if (studentCodeInput) {
        studentCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 7);
        });
    }
    
    // تنسيق رقم الهاتف
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 15);
        });
    }
    
    // إضافة مستمع حدث النموذج
    if (signupForm) {
        signupForm.addEventListener('submit', createAccount);
    }
});