// ====================== إعدادات السيرفر ======================
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : '';

let currentUser = null;
let timerInterval = null;
let currentExam = null;

// ====================== دوال مساعدة ======================
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
    
    Toastify({
        text: message,
        duration: 4000,
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

// ====================== API Request ======================
async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...options.headers },
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

// ====================== تنسيق الوقت ======================
function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' + secs : secs}`;
}

// ====================== تشغيل المؤقت ======================
function startTimer(durationSeconds, examCode) {
    let timeLeft = durationSeconds;
    const timerElement = document.getElementById('timer');
    
    timerInterval = setInterval(() => {
        timeLeft--;
        timerElement.textContent = `الوقت المتبقي: ${formatTime(timeLeft)}`;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            timerElement.textContent = 'انتهى الوقت!';
            submitExam(examCode);
        }
    }, 1000);
}

// ====================== بناء نموذج الأسئلة ======================
function buildQuestionsForm(exam) {
    const examForm = document.getElementById('exam-form');
    if (!examForm) return;
    
    examForm.innerHTML = exam.questions.map((q, index) => {
        let inputHtml = '';
        
        if (q.type === 'multiple' && q.options) {
            inputHtml = `
                <div class="options">
                    ${q.options.map(opt => `
                        <div class="option">
                            <input type="radio" name="q${index}" value="${opt.replace(/"/g, '&quot;')}" id="q${index}_${opt.replace(/\s/g, '')}">
                            <label for="q${index}_${opt.replace(/\s/g, '')}">${opt}</label>
                        </div>
                    `).join('')}
                </div>
            `;
        } else if (q.type === 'truefalse') {
            inputHtml = `
                <div class="options">
                    <div class="option">
                        <input type="radio" name="q${index}" value="true" id="q${index}_true">
                        <label for="q${index}_true">✅ صح</label>
                    </div>
                    <div class="option">
                        <input type="radio" name="q${index}" value="false" id="q${index}_false">
                        <label for="q${index}_false">❌ خطأ</label>
                    </div>
                </div>
            `;
        } else if (q.type === 'essay') {
            inputHtml = `
                <div class="essay-answer">
                    <textarea name="q${index}" rows="5" placeholder="اكتب إجابتك هنا..."></textarea>
                </div>
            `;
        } else if (q.type === 'list') {
            inputHtml = `
                <div class="list-answers">
                    ${[1, 2, 3, 4, 5].map(n => `
                        <div class="list-item">
                            <span>${n}.</span>
                            <input type="text" name="q${index}_${n}" placeholder="الإجابة ${n}">
                        </div>
                    `).join('')}
                </div>
            `;
        }
        
        return `
            <div class="question">
                <div class="question-text">
                    <i class="fas fa-question-circle"></i>
                    سؤال ${index + 1}: ${q.text}
                </div>
                ${inputHtml}
            </div>
        `;
    }).join('');
}

// ====================== جلب بيانات الاختبار ======================
async function loadExam(examCode) {
    try {
        const response = await apiRequest(`/api/exams/${encodeURIComponent(examCode)}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'كود الاختبار غير صحيح');
        }
        
        const exam = await response.json();
        currentExam = exam;
        
        // عرض عنوان الاختبار
        document.getElementById('exam-title').textContent = exam.name;
        
        // بناء الأسئلة
        buildQuestionsForm(exam);
        
        // إخفاء قسم الكود وعرض الاختبار
        document.getElementById('exam-access').style.display = 'none';
        document.getElementById('exam-container').style.display = 'block';
        
        // تشغيل المؤقت
        startTimer(exam.duration * 60, examCode);
        
        showToast('تم تحميل الاختبار بنجاح!', 'success');
        
    } catch (error) {
        console.error('خطأ في تحميل الاختبار:', error);
        showToast(error.message || 'فشل تحميل الاختبار', 'error');
    }
}

// ====================== حساب النتيجة ======================
function calculateScore(exam, answers) {
    let correctCount = 0;
    
    exam.questions.forEach((question, index) => {
        const userAnswer = answers[index];
        if (!userAnswer) return;
        
        if (question.type === 'multiple' || question.type === 'truefalse') {
            if (userAnswer === question.correctAnswer) {
                correctCount++;
            }
        } else if (question.type === 'essay') {
            // تقييم تقريبي للمقالي (يمكن تحسينه)
            if (userAnswer && userAnswer.length > 20) {
                correctCount += 0.7;
            } else if (userAnswer && userAnswer.length > 0) {
                correctCount += 0.3;
            }
        } else if (question.type === 'list') {
            // تقييم القوائم
            const correctList = question.correctAnswers || [];
            let matchCount = 0;
            if (Array.isArray(userAnswer)) {
                userAnswer.forEach((ans, i) => {
                    if (correctList[i] && ans.toLowerCase().trim() === correctList[i].toLowerCase()) {
                        matchCount++;
                    }
                });
            }
            correctCount += matchCount / correctList.length;
        }
    });
    
    const percentage = (correctCount / exam.questions.length) * 100;
    return Math.round(percentage * 10) / 10;
}

// ====================== جمع الإجابات ======================
function collectAnswers(exam) {
    const answers = [];
    const form = document.getElementById('exam-form');
    
    exam.questions.forEach((question, index) => {
        if (question.type === 'multiple' || question.type === 'truefalse') {
            const selected = document.querySelector(`input[name="q${index}"]:checked`);
            answers.push(selected ? selected.value : '');
        } else if (question.type === 'essay') {
            const textarea = document.querySelector(`textarea[name="q${index}"]`);
            answers.push(textarea ? textarea.value : '');
        } else if (question.type === 'list') {
            const listAnswers = [];
            for (let i = 1; i <= 5; i++) {
                const input = document.querySelector(`input[name="q${index}_${i}"]`);
                if (input && input.value.trim()) {
                    listAnswers.push(input.value.trim());
                }
            }
            answers.push(listAnswers);
        }
    });
    
    return answers;
}

// ====================== إرسال الاختبار ======================
async function submitExam(examCode) {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    if (!currentExam) {
        showToast('حدث خطأ في البيانات', 'error');
        return;
    }
    
    const answers = collectAnswers(currentExam);
    const score = calculateScore(currentExam, answers);
    
    try {
        // حفظ النتيجة في السيرفر
        const response = await apiRequest(`/api/exams/${examCode}/submit`, {
            method: 'POST',
            body: JSON.stringify({
                studentId: currentUser?.username || currentUser?.studentCode,
                answers: answers
            })
        });
        
        if (response.ok) {
            showToast(`🎉 تم حفظ النتيجة! درجتك: ${score}%`, 'success');
        } else {
            showToast(`⚠️ تم حساب النتيجة: ${score}% (لم يتم الحفظ في السيرفر)`, 'warning');
        }
        
    } catch (error) {
        console.error('خطأ في حفظ النتيجة:', error);
        showToast(`📊 نتيجتك: ${score}% (تم الحفظ محلياً)`, 'info');
    }
    
    // إعادة تعيين الصفحة
    setTimeout(() => {
        document.getElementById('exam-container').style.display = 'none';
        document.getElementById('exam-access').style.display = 'block';
        document.getElementById('exam-code').value = '';
        document.getElementById('exam-form').innerHTML = '';
    }, 2000);
}

// ====================== بناء النافبار ======================
function buildBottomNav() {
    const navBar = document.getElementById('bottomNav');
    if (!navBar) return;
    
    const isAdmin = currentUser && (currentUser.type === 'admin' || currentUser.role === 'admin');
    
    const navItems = [
        { href: 'Home.html', icon: 'fas fa-home', label: 'الرئيسية' },
        { href: 'exams.html', icon: 'fas fa-book', label: 'الاختبارات', active: true },
        { href: 'profile.html', icon: 'fas fa-user', label: 'ملفي' }
       
    ];
    
    if (isAdmin) {
        navItems.push({ href: 'admin.html', icon: 'fas fa-chalkboard-user', label: 'التحكم' });
    }
    
    navBar.innerHTML = navItems.map(item => `
        <a href="${item.href}" class="nav-item ${item.active ? 'active' : ''}">
            <i class="${item.icon}"></i>
            <span>${item.label}</span>
        </a>
    `).join('');
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

// ====================== تهيئة الصفحة ======================
document.addEventListener('DOMContentLoaded', () => {
    currentUser = getLoggedInUser();
    
    if (!currentUser) {
        showToast('يرجى تسجيل الدخول أولاً', 'warning');
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
        return;
    }
    
    buildBottomNav();
    
    // نموذج إدخال كود الاختبار
    const examAccessForm = document.getElementById('exam-access-form');
    if (examAccessForm) {
        examAccessForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const examCode = document.getElementById('exam-code').value.trim();
            if (!examCode) {
                showToast('أدخل كود الاختبار أولاً', 'error');
                return;
            }
            await loadExam(examCode);
        });
    }
    
    // زر إرسال الاختبار
    const submitExamBtn = document.getElementById('submit-exam');
    if (submitExamBtn) {
        submitExamBtn.addEventListener('click', async () => {
            const examCode = document.getElementById('exam-code').value.trim();
            if (!examCode || !currentExam) {
                showToast('لا يوجد اختبار نشط', 'error');
                return;
            }
            
            if (confirm('هل أنت متأكد من إرسال الإجابات؟ لا يمكنك التعديل بعد الإرسال')) {
                await submitExam(examCode);
            }
        });
    }
});