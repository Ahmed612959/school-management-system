// parent-login.js - تسجيل دخول ولي الأمر

const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : '';

function showToast(message, type = 'success') {
    const colors = {
        success: 'linear-gradient(135deg, #2d6a4f, #1b4d3b)',
        error: 'linear-gradient(135deg, #b91c1c, #991b1b)',
        info: 'linear-gradient(135deg, #d97706, #b45309)'
    };
    
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
}

async function parentLogin(parentId, password) {
    try {
        const response = await fetch(`${BASE_URL}/api/parent/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                parentId: parentId,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // حفظ بيانات الجلسة
            sessionStorage.setItem('parentData', JSON.stringify({
                parentId: parentId,
                studentId: data.studentId,
                studentName: data.studentName,
                studentCode: data.studentCode,
                parentName: data.parentName,
                type: 'parent'
            }));
            
            showToast('✅ تم تسجيل الدخول بنجاح! جاري التحويل...', 'success');
            
            setTimeout(() => {
                window.location.href = 'parent-dashboard.html';
            }, 1500);
        } else {
            showToast(data.error || '❌ رقم البطاقة أو كلمة المرور غير صحيحة', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('❌ خطأ في الاتصال بالسيرفر', 'error');
    }
}

// التعامل مع إرسال النموذج
document.getElementById('parent-login-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const parentId = document.getElementById('parentId')?.value.trim();
    const password = document.getElementById('password')?.value;
    
    if (!parentId || parentId.length < 10) {
        showToast('⚠️ يرجى إدخال رقم بطاقة ولي الأمر الصحيح (10-14 رقم)', 'error');
        return;
    }
    
    if (!password || password.length < 5) {
        showToast('⚠️ يرجى إدخال كلمة المرور الصحيحة', 'error');
        return;
    }
    
    parentLogin(parentId, password);
});

// منع إدخال أحرف في رقم البطاقة
document.getElementById('parentId')?.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 14);
});