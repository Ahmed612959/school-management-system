// ====================== Cloudflare Workers Configuration ======================
import { MongoClient } from 'mongodb';

// متغيرات البيئة
let cachedDb = null;

// الحصول على المتغيرات من البيئة
const JWT_SECRET = (typeof process !== 'undefined' && process.env?.JWT_SECRET) || 'my-super-secret-jwt-key-2024';
const SESSION_SECRET = (typeof process !== 'undefined' && process.env?.SESSION_SECRET) || 'my-super-secret-session-key-2024';
const MONGODB_URI = (typeof process !== 'undefined' && process.env?.MONGODB_URI) || '';

console.log('MONGODB_URI:', MONGODB_URI ? '✅ Found' : '❌ Not found');

// ====================== دوال التشفير ======================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hash) {
    const hashedInput = await hashPassword(password);
    return hashedInput === hash;
}

// ====================== توليد معرف فريد ======================
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ====================== الاتصال بقاعدة البيانات ======================
async function connectToDatabase() {
    if (cachedDb) return cachedDb;
    
    if (!MONGODB_URI || MONGODB_URI === '') {
        console.log('⚠️ No MONGODB_URI provided, running without database (demo mode)');
        return null;
    }
    
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        cachedDb = client.db('school-system');
        console.log('✅ MongoDB connected successfully');
        return cachedDb;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        return null;
    }
}

// ====================== CORS Headers ======================
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Credentials': 'true',
};

// ====================== دوال الأمان ======================
function verifyToken(request) {
    const authHeader = request.headers.get('authorization');
    let token = authHeader?.split(' ')[1];
    
    if (!token) {
        // محاولة جلب التوكن من الكوكيز
        const cookieHeader = request.headers.get('cookie');
        if (cookieHeader) {
            const match = cookieHeader.match(/authToken=([^;]+)/);
            if (match) token = match[1];
        }
    }
    
    if (!token) return null;
    
    try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        return decoded;
    } catch (error) {
        return null;
    }
}

function isAdmin(user) {
    return user && (user.type === 'admin' || user.role === 'admin');
}

// ====================== مواد الترم الأول والثاني ======================
const SUBJECTS_CONFIG = {
    "اللغة العربية": { max: 20 },
    "اللغة الإنجليزية": { max: 20 },
    "علوم تطبيقية": { max: 40 },
    "طب باطنة": { max: 20 },
    "تمريض باطني جراحي": { max: 24 },
    "حاسب آلي": { max: 20 }
};

const SUBJECTS_CONFIG_SECOND_TERM = {
    "اللغة العربية": { max: 20 },
    "اللغة الإنجليزية": { max: 20 },
    "تمريض باطني جراحي": { max: 40 },
    "صحة مجتمع": { max: 30 },
    "جراحة عامة": { max: 30 },
    "حاسب آلي": { max: 20 },
    "إحصاء": { max: 20 }
};

const TOTAL_POSSIBLE = 144;
const TOTAL_SECOND_TERM = 180;

// ====================== نظام تخزين المحادثات والذاكرة ======================
let conversationHistory = new Map();
let userPreferences = new Map();
let userProgress = new Map();
let importantFacts = new Map();

function saveConversationContext(userId, userMessage, botResponse) {
    if (!conversationHistory.has(userId)) conversationHistory.set(userId, []);
    const history = conversationHistory.get(userId);
    history.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });
    history.push({ role: 'assistant', content: botResponse, timestamp: new Date().toISOString() });
    if (history.length > 20) conversationHistory.set(userId, history.slice(-20));
}

function extractImportantFacts(userId, message) {
    const importantKeywords = ['تذكر', 'مهم', 'حقيقة', 'معلومة', 'تعلمت', 'عرفت', 'اكتشفت', 'قاعدة'];
    const lowerMessage = message.toLowerCase();
    for (let keyword of importantKeywords) {
        if (lowerMessage.includes(keyword)) {
            if (!importantFacts.has(userId)) importantFacts.set(userId, []);
            const facts = importantFacts.get(userId);
            facts.push({ fact: message, date: new Date().toISOString() });
            if (facts.length > 30) importantFacts.set(userId, facts.slice(-30));
            break;
        }
    }
}

function getConversationContext(userId) {
    const history = conversationHistory.get(userId) || [];
    const facts = importantFacts.get(userId) || [];
    const preferences = userPreferences.get(userId) || {};
    let context = '';
    if (history.length > 0) {
        context += '\n【آخر المحادثات】\n';
        history.slice(-6).forEach(msg => {
            context += `${msg.role === 'user' ? '👤 الطالب' : '🤖 المساعد'}: ${msg.content.substring(0, 100)}\n`;
        });
    }
    if (facts.length > 0) {
        context += '\n【معلومات مهمة】\n';
        facts.slice(-2).forEach(fact => context += `📌 ${fact.fact.substring(0, 80)}\n`);
    }
    if (preferences.level) context += `\n🎓 مستوى الطالب: ${preferences.level}\n`;
    return context;
}

function updateUserPreferences(userId, message) {
    let preferences = userPreferences.get(userId) || {};
    let progress = userProgress.get(userId) || {};
    const lowerMessage = message.toLowerCase();

    const levelKeywords = {
        'الأول الثانوي': ['أولى', 'اولى', 'الصف الأول', 'اول ثانوي', 'first'],
        'الثاني الثانوي': ['ثانية', 'الصف الثاني', 'تاني ثانوي', 'second'],
        'الثالث الثانوي': ['ثالثة', 'الصف الثالث', 'تالت ثانوي', 'third']
    };
    for (let [level, keywords] of Object.entries(levelKeywords)) {
        if (keywords.some(k => lowerMessage.includes(k))) preferences.level = level;
    }

    if (lowerMessage.includes('فهمت') || lowerMessage.includes('عرفت')) progress.understandingLevel = 'متقدم';
    else if (lowerMessage.includes('مش فاهم') || lowerMessage.includes('صعب')) progress.understandingLevel = 'مبتدئ';
    else if (!progress.understandingLevel) progress.understandingLevel = 'متوسط';

    userPreferences.set(userId, preferences);
    userProgress.set(userId, progress);
}

// ====================== ردود الطوارئ للشات بوت ======================
function getFallbackResponse(prompt) {
    const p = prompt.toLowerCase();

    if (p.includes('مرحب') || p.includes('السلام') || p.includes('هلا')) {
        return `👋 **وعليكم السلام ورحمة الله!**

أنا 🤖 **مساعدك الذكي في معهد رعاية الضبعية**

📚 **أقدر أساعدك في:**
• شرح الرعاية التلطيفية (Palliative Care)
• شرح الموت الدماغي (Brain Death)
• معلومات عن التمريض
• الاستعلام عن النتائج والدرجات
• رفع ملفات PDF وتحليلها
• إنشاء أسئلة امتحانات

🎯 **إيه اللي محتاج مساعدة فيه النهاردة؟**`;
    }

    if (p.includes('palliative') || p.includes('رعاية تلطيفية')) {
        return `🏥 **الرعاية التلطيفية (Palliative Care)**

📌 **تعريفها:**
نهج طبي متخصص لتحسين جودة حياة مرضى الأمراض الخطيرة.

📌 **المبادئ الأساسية:**
• تخفيف الألم والأعراض
• الدعم النفسي والاجتماعي للمريض والأسرة
• تحسين التواصل مع الفريق الطبي
• احترام رغبات المريض وقيمه

📌 **متى نبدأ؟**
من لحظة تشخيص المرض الخطير، بالتزامن مع العلاج.

هل تريد تفاصيل أكثر عن أي نقطة؟`;
    }

    if (p.includes('brain death') || p.includes('موت دماغي')) {
        return `🧠 **الموت الدماغي (Brain Death)**

📌 **التعريف:**
التوقف الكامل والنهائي لوظائف الدماغ بأكمله، بما في ذلك جذع الدماغ.

📌 **المعايير التشخيصية:**
• غيبوبة عميقة بدون استجابة
• انعدام التنفس التلقائي تماماً
• اختفاء ردود أفعال جذع الدماغ
• ثبوت النتائج بعد 6-24 ساعة

هل تريد شرح أكثر تفصيلاً؟`;
    }

    if (p.includes('تمريض') || p.includes('nursing')) {
        return `🩺 **التمريض - مهنة إنسانية نبيلة**

📌 **المهام الأساسية للممرض:**
• تقديم الرعاية المباشرة للمرضى
• مراقبة العلامات الحيوية (ضغط، نبض، حرارة، تنفس)
• إعطاء الأدوية حسب الوصفات الطبية
• التثقيف الصحي للمرضى وأسرهم
• التعاون مع الفريق الطبي

📌 **صفات الممرض الناجح:**
• 🤝 التعاطف والصبر
• 🔍 الدقة والانتباه
• 💪 العمل تحت الضغط
• 🗣️ مهارات تواصل ممتازة

هل تريد معلومات عن مجال معين؟`;
    }

    if (p.includes('نتيجة') || p.includes('درجة') || p.includes('امتحان')) {
        return `📊 **النتائج والدرجات**

للاستعلام عن نتيجتك:

1️⃣ **اذهب إلى صفحة "النتائج"** من القائمة السفلية
2️⃣ **أدخل كود الطالب الخاص بك** (رقم الجلوس)
3️⃣ **ستظهر جميع درجاتك**

إذا نسيت الكود، تواصل مع إدارة المعهد.`;
    }

    if (p.includes('شكر')) {
        return `🙏 **العفو! أنا سعيد بخدمتك**

اتمنى لك التوفيق في دراستك 🌟

في خدمتك دايماً 🤗`;
    }

    return `📚 **أنا هنا لمساعدتك!**

سؤالك: *"${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}"*

🎯 **يمكنك سؤالي عن:**
• الرعاية التلطيفية (Palliative Care)
• الموت الدماغي (Brain Death)
• التمريض الجراحي والباطني
• النتائج والدرجات
• رفع ملفات PDF للتحليل
• إنشاء أسئلة امتحانية

كيف أقدر أساعدك أكثر اليوم؟`;
}

// ====================== معالجة الطلبات ======================
async function handleRequest(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    // معالجة OPTIONS (CORS preflight)
    if (method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }
    
    const db = await connectToDatabase();
    const students = db?.collection('students');
    const admins = db?.collection('admins');
    const violations = db?.collection('violations');
    const notifications = db?.collection('notifications');
    const attendance = db?.collection('attendance');
    const exams = db?.collection('exams');
    const examResults = db?.collection('examResults');
    
    // ====================== 1. Test endpoint ======================
    if (path === '/api/test' && method === 'GET') {
        return new Response(JSON.stringify({
            status: 'ok',
            mongodb_status: db ? 'connected' : 'disconnected',
            message: 'API is working on Cloudflare Workers!'
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    
    // ====================== 2. التحقق من توفر اسم المستخدم ======================
    if (path === '/api/check-username' && method === 'GET') {
        try {
            const username = url.searchParams.get('username');
            if (!username || username.length < 3) {
                return new Response(JSON.stringify({ available: false }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify({ available: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const existingStudent = await students.findOne({ username: username.toLowerCase() });
            const existingAdmin = await admins.findOne({ username: username.toLowerCase() });
            
            return new Response(JSON.stringify({ available: !existingStudent && !existingAdmin }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ available: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 3. تسجيل طالب جديد ======================
    if (path === '/api/students/register' && method === 'POST') {
        try {
            const body = await request.json();
            const { fullName, username, password, grade, studentCode, phone, parentName, parentId } = body;
            
            if (!fullName || !username || !password || !grade || !studentCode) {
                return new Response(JSON.stringify({ error: 'جميع الحقول مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة حالياً' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const existingUser = await students.findOne({ username: username.toLowerCase() });
            if (existingUser) {
                return new Response(JSON.stringify({ error: 'اسم المستخدم موجود مسبقاً' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const existingCode = await students.findOne({ studentCode });
            if (existingCode) {
                return new Response(JSON.stringify({ error: 'رقم الجلوس موجود مسبقاً' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const hashedPassword = await hashPassword(password);
            
            const student = {
                _id: generateId(),
                fullName,
                username: username.toLowerCase(),
                password: hashedPassword,
                grade,
                studentCode,
                role: 'student',
                subjects: [],
                secondTermSubjects: [],
                semester: 'first',
                profile: { phone: phone || '', parentName: parentName || '', parentId: parentId || '' },
                createdAt: new Date(),
                lastLogin: null,
                lastIP: null,
                failedAttempts: 0,
                lockedUntil: null
            };
            
            await students.insertOne(student);
            
            return new Response(JSON.stringify({ success: true, message: 'تم إنشاء الحساب بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في إنشاء الحساب: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 4. تسجيل الدخول ======================
    if (path === '/api/login' && method === 'POST') {
        try {
            const body = await request.json();
            const { username, password } = body;
            
            if (!username || !password) {
                return new Response(JSON.stringify({ error: 'جميع الحقول مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            // وضع تجريبي بدون قاعدة بيانات
            if (!db) {
                if (username === 'demo' && password === 'demo123') {
                    const token = btoa(JSON.stringify({ id: 'demo', username: 'demo', type: 'student', fullName: 'طالب تجريبي', studentCode: '12345' }));
                    return new Response(JSON.stringify({
                        success: true,
                        csrfToken: 'demo-csrf-token',
                        user: { username: 'demo', fullName: 'طالب تجريبي', type: 'student', id: '12345' }
                    }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                return new Response(JSON.stringify({ error: 'بيانات غير صحيحة (وضع تجريبي: استخدم demo/demo123)' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            let user = await admins.findOne({ username: username.toLowerCase() });
            let userType = 'admin';
            
            if (!user) {
                user = await students.findOne({ username: username.toLowerCase() });
                userType = 'student';
            }
            
            if (!user) {
                return new Response(JSON.stringify({ error: 'بيانات غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
                return new Response(JSON.stringify({ error: 'الحساب مقفل مؤقتاً' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const isMatch = await verifyPassword(password, user.password);
            
            if (!isMatch) {
                const failedAttempts = (user.failedAttempts || 0) + 1;
                const updateData = { failedAttempts };
                if (failedAttempts >= 5) {
                    updateData.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
                }
                await (userType === 'admin' ? admins.updateOne({ _id: user._id }, { $set: updateData }) : students.updateOne({ _id: user._id }, { $set: updateData }));
                return new Response(JSON.stringify({ error: 'بيانات غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            await (userType === 'admin' ? admins.updateOne({ _id: user._id }, { $set: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() } }) : students.updateOne({ _id: user._id }, { $set: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() } }));
            
            const tokenData = { id: user._id, username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode };
            const token = btoa(JSON.stringify(tokenData));
            
            return new Response(JSON.stringify({
                success: true,
                csrfToken: 'csrf-token-' + Date.now(),
                user: { username: user.username, fullName: user.fullName, type: userType, id: user.studentCode || user._id }
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في السيرفر: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 5. التحقق من الجلسة ======================
    if (path === '/api/verify-session' && method === 'GET') {
        const user = verifyToken(request);
        if (!user) {
            return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
        return new Response(JSON.stringify({ valid: true, user }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    
    // ====================== 6. تسجيل الخروج ======================
    if (path === '/api/logout' && method === 'POST') {
        return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    
    // ====================== 7. جلب طالب برقم الجلوس ======================
    if (path.startsWith('/api/student/by-code/') && method === 'GET') {
        try {
            const studentCode = path.split('/').pop();
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const student = await students.findOne({ studentCode }, { projection: { password: 0, refreshToken: 0 } });
            if (!student) {
                return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            return new Response(JSON.stringify(student), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في جلب بيانات الطالب' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 8. جلب مخالفات طالب ======================
    if (path.startsWith('/api/violations/student/') && method === 'GET') {
        try {
            const studentId = path.split('/').pop();
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const violationsList = await violations.find({ studentId }).sort({ createdAt: -1 }).toArray();
            return new Response(JSON.stringify(violationsList), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 9. جلب الإشعارات ======================
    if (path === '/api/notifications' && method === 'GET') {
        try {
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const notificationsList = await notifications.find().sort({ createdAt: -1 }).toArray();
            return new Response(JSON.stringify(notificationsList), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 10. إضافة إشعار ======================
    if (path === '/api/notifications' && method === 'POST') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const body = await request.json();
            const { text, date } = body;
            
            if (!text || text.trim() === '') {
                return new Response(JSON.stringify({ error: 'نص الإشعار مطلوب' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const newNotification = {
                _id: generateId(),
                text: text.trim(),
                date: date || new Date().toLocaleString('ar-EG'),
                createdAt: new Date()
            };
            
            await notifications.insertOne(newNotification);
            return new Response(JSON.stringify({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: newNotification }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في إضافة الإشعار' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 11. حذف إشعار ======================
    if (path.startsWith('/api/notifications/') && method === 'DELETE') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const id = path.split('/').pop();
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            await notifications.deleteOne({ _id: id });
            return new Response(JSON.stringify({ success: true, message: 'تم حذف الإشعار بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في حذف الإشعار' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 12. جلب المخالفات (للأدمن) ======================
    if (path === '/api/violations' && method === 'GET') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const violationsList = await violations.find().sort({ createdAt: -1 }).toArray();
            return new Response(JSON.stringify(violationsList), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 13. إضافة مخالفة ======================
    if (path === '/api/violations' && method === 'POST') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const body = await request.json();
            const { studentId, type, reason, penalty, parentSummons, date } = body;
            
            if (!studentId || !reason || !penalty) {
                return new Response(JSON.stringify({ error: 'جميع الحقول مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const student = await students.findOne({ studentCode: studentId });
            if (!student) {
                return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const newViolation = {
                _id: generateId(),
                studentId,
                type,
                reason,
                penalty,
                parentSummons: parentSummons || false,
                date: date || new Date().toLocaleString('ar-EG'),
                createdAt: new Date()
            };
            
            await violations.insertOne(newViolation);
            return new Response(JSON.stringify({ success: true, message: 'تم إضافة المخالفة بنجاح', violation: newViolation }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في إضافة المخالفة' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 14. حذف مخالفة ======================
    if (path.startsWith('/api/violations/') && method === 'DELETE') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const id = path.split('/').pop();
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            await violations.deleteOne({ _id: id });
            return new Response(JSON.stringify({ success: true, message: 'تم حذف المخالفة بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في حذف المخالفة' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 15. جلب كل الطلاب (للأدمن) ======================
    if (path === '/api/admin/students' && method === 'GET') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const allStudents = await students.find({}, { projection: { password: 0, refreshToken: 0 } }).toArray();
            return new Response(JSON.stringify(allStudents), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 16. جلب الطلاب حسب الصف ======================
    if (path.startsWith('/api/students/by-grade/') && method === 'GET') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const grade = path.split('/').pop();
            let gradeValue = grade;
            if (grade === 'first') gradeValue = 'first';
            else if (grade === 'second') gradeValue = 'second';
            else if (grade === 'third') gradeValue = 'third';
            else {
                return new Response(JSON.stringify({ error: 'صف غير صحيح' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const studentsList = await students.find({ grade: gradeValue }, { projection: { password: 0, refreshToken: 0 } }).toArray();
            return new Response(JSON.stringify(studentsList), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 17. تحديث بيانات الطالب ======================
    if (path.startsWith('/api/students/') && method === 'PUT') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const studentCode = path.split('/').pop();
            const body = await request.json();
            const { profile, subjects, fullName, semester, secondTermSubjects } = body;
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const updateData = {};
            if (profile !== undefined) updateData.profile = profile;
            if (subjects !== undefined) updateData.subjects = subjects;
            if (fullName !== undefined) updateData.fullName = fullName;
            if (semester !== undefined) updateData.semester = semester;
            if (secondTermSubjects !== undefined) updateData.secondTermSubjects = secondTermSubjects;
            
            const updated = await students.findOneAndUpdate(
                { studentCode },
                { $set: updateData },
                { returnDocument: 'after' }
            );
            
            if (!updated) {
                return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const { password, refreshToken, ...studentWithoutPassword } = updated;
            return new Response(JSON.stringify(studentWithoutPassword), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في تحديث البيانات' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 18. حذف طالب ======================
    if (path.startsWith('/api/students/') && method === 'DELETE') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const studentCode = path.split('/').pop();
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            await students.deleteOne({ studentCode });
            await violations.deleteMany({ studentId: studentCode });
            return new Response(JSON.stringify({ message: 'تم حذف الطالب بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في حذف الطالب' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 19. تسجيل حضور ======================
    if (path === '/api/attendance' && method === 'POST') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const body = await request.json();
            const { studentCode, studentName, date, status, note, recordedBy } = body;
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const existing = await attendance.findOne({ studentCode, date });
            
            if (existing) {
                await attendance.updateOne(
                    { studentCode, date },
                    { $set: { status, note: note || '' } }
                );
                return new Response(JSON.stringify({ success: true, message: 'تم تحديث الحضور بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const newAttendance = {
                _id: generateId(),
                studentCode,
                studentName,
                date,
                status: status || 'present',
                note: note || '',
                recordedBy: recordedBy || 'admin',
                createdAt: new Date()
            };
            
            await attendance.insertOne(newAttendance);
            return new Response(JSON.stringify({ success: true, message: 'تم تسجيل الحضور بنجاح', attendance: newAttendance }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في تسجيل الحضور' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 20. جلب الحضور لتاريخ محدد ======================
    if (path.startsWith('/api/attendance/') && method === 'GET') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const date = path.split('/').pop();
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const attendanceList = await attendance.find({ date }).toArray();
            return new Response(JSON.stringify(attendanceList), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 21. شات بوت ======================
    if (path === '/api/gemini' && method === 'POST') {
        try {
            const body = await request.json();
            const { prompt, userId = 'anonymous' } = body;
            
            if (!prompt || prompt.trim() === '') {
                return new Response(JSON.stringify({ error: 'الرسالة مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            extractImportantFacts(userId, prompt);
            updateUserPreferences(userId, prompt);
            
            const reply = getFallbackResponse(prompt);
            saveConversationContext(userId, prompt, reply);
            
            return new Response(JSON.stringify({ reply }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ reply: 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 22. مسح ذاكرة المحادثة ======================
    if (path === '/api/gemini/clear-memory' && method === 'POST') {
        try {
            const user = verifyToken(request);
            const userId = user?.id || 'anonymous';
            conversationHistory.delete(userId);
            importantFacts.delete(userId);
            return new Response(JSON.stringify({ success: true, message: '✅ تم مسح ذاكرة المحادثة بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 23. الحصول على إحصائيات المستخدم ======================
    if (path === '/api/gemini/stats' && method === 'GET') {
        try {
            const user = verifyToken(request);
            const userId = user?.id || 'anonymous';
            
            const stats = {
                conversationLength: (conversationHistory.get(userId) || []).length / 2,
                factsShared: (importantFacts.get(userId) || []).length,
                preferences: userPreferences.get(userId) || {},
                progress: userProgress.get(userId) || {}
            };
            
            return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 24. الحصول على نصائح مخصصة ======================
    if (path === '/api/gemini/tips' && method === 'GET') {
        try {
            const user = verifyToken(request);
            const userId = user?.id || 'anonymous';
            const progress = userProgress.get(userId) || {};
            
            let tip = '';
            if (progress.understandingLevel === 'مبتدئ') {
                tip = '📚 **نصيحة مخصصة لك:**\n\nأنصحك بمراجعة الأساسيات أولاً، ثم الانتقال تدريجياً للموضوعات الأعمق. خصص 30 دقيقة يومياً للمراجعة.\n\n💪 أنت قادر على التقدم بسرعة!';
            } else if (progress.understandingLevel === 'متوسط') {
                tip = '🎯 **نصيحة مخصصة لك:**\n\nأنت في الطريق الصحيح! ركز على حل التمارين والتطبيقات العملية لتعزيز فهمك.\n\n🌟 استمر بهذا المستوى الرائع!';
            } else {
                tip = '⭐ **نصيحة مخصصة لك:**\n\nمستواك ممتاز! أنصحك الآن بتدريس ما تعلمته لزملائك - هذا سيعزز فهمك أكثر.\n\n🏆 أنت قدوة لزملائك!';
            }
            
            return new Response(JSON.stringify({ tip }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 25. APIs خاصة بولي الأمر ======================
    if (path === '/api/parent/login' && method === 'POST') {
        try {
            const body = await request.json();
            const { parentId, password } = body;
            
            if (!parentId || !password) {
                return new Response(JSON.stringify({ error: 'جميع الحقول مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const student = await students.findOne({ 'profile.parentId': parentId });
            
            if (!student) {
                return new Response(JSON.stringify({ error: 'رقم بطاقة ولي الأمر غير صحيح' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const expectedPassword = student.studentCode.slice(-7);
            
            if (password !== expectedPassword) {
                return new Response(JSON.stringify({ error: 'كلمة المرور غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            return new Response(JSON.stringify({
                success: true,
                studentId: student._id,
                studentName: student.fullName,
                studentCode: student.studentCode,
                parentName: student.profile?.parentName || 'ولي الأمر'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في السيرفر' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 26. جلب بيانات الطالب لولي الأمر ======================
    if (path.startsWith('/api/parent/student/') && method === 'GET') {
        try {
            const studentCode = path.split('/').pop();
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const student = await students.findOne({ studentCode }, { projection: { password: 0, refreshToken: 0 } });
            if (!student) {
                return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            return new Response(JSON.stringify(student), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في جلب بيانات الطالب' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 27. جلب حضور الطالب لولي الأمر ======================
    if (path.startsWith('/api/parent/student/') && path.includes('/attendance') && method === 'GET') {
        try {
            const studentCode = path.split('/')[3];
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const attendanceList = await attendance.find({ studentCode }).sort({ date: -1 }).toArray();
            
            const present = attendanceList.filter(a => a.status === 'present').length;
            const absent = attendanceList.filter(a => a.status === 'absent').length;
            const late = attendanceList.filter(a => a.status === 'late').length;
            const total = attendanceList.length;
            const percentage = total > 0 ? (present / total) * 100 : 0;
            
            return new Response(JSON.stringify({
                present, absent, late, total,
                percentage: percentage.toFixed(1),
                records: attendanceList
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في جلب الحضور' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 28. جلب مخالفات الطالب لولي الأمر ======================
    if (path.startsWith('/api/parent/student/') && path.includes('/violations') && method === 'GET') {
        try {
            const studentCode = path.split('/')[3];
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const violationsList = await violations.find({ studentId: studentCode }).sort({ date: -1 }).toArray();
            return new Response(JSON.stringify(violationsList), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 29. جلب الأدمنز ======================
    if (path === '/api/admins' && method === 'GET') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const allAdmins = await admins.find({}, { projection: { password: 0, refreshToken: 0 } }).toArray();
            return new Response(JSON.stringify(allAdmins), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 30. إنشاء مدير تجريبي ======================
    if (path === '/api/create-test-admin' && method === 'POST') {
        try {
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const existingAdmin = await admins.findOne({ username: 'admin' });
            if (existingAdmin) {
                return new Response(JSON.stringify({ message: 'المدير موجود مسبقاً', username: 'admin', password: 'admin123' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const hashedPassword = await hashPassword('admin123');
            const admin = {
                _id: generateId(),
                fullName: 'مدير النظام',
                username: 'admin',
                password: hashedPassword,
                role: 'admin',
                profile: { phone: '', email: '' },
                createdAt: new Date()
            };
            
            await admins.insertOne(admin);
            return new Response(JSON.stringify({ message: 'تم إنشاء المدير بنجاح', username: 'admin', password: 'admin123' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 31. حفظ الحضور الجماعي ======================
    if (path === '/api/attendance/bulk' && method === 'POST') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const body = await request.json();
            const { date, students: studentsList, recordedBy } = body;
            
            if (!date || !studentsList || !studentsList.length) {
                return new Response(JSON.stringify({ error: 'بيانات غير مكتملة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            let modifiedCount = 0;
            let upsertedCount = 0;
            
            for (const student of studentsList) {
                const result = await attendance.updateOne(
                    { studentCode: student.code, date },
                    {
                        $set: {
                            studentCode: student.code,
                            studentName: student.name,
                            date,
                            status: student.status,
                            note: student.note || '',
                            recordedBy: recordedBy || 'admin'
                        }
                    },
                    { upsert: true }
                );
                
                if (result.modifiedCount > 0) modifiedCount++;
                if (result.upsertedCount > 0) upsertedCount++;
            }
            
            return new Response(JSON.stringify({ success: true, message: 'تم حفظ الحضور بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في حفظ الحضور' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 32. تحديث بيانات الأدمن ======================
    if (path.startsWith('/api/admins/') && method === 'PUT') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const username = path.split('/').pop();
            const body = await request.json();
            const { profile } = body;
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const updated = await admins.findOneAndUpdate(
                { username },
                { $set: { profile } },
                { returnDocument: 'after' }
            );
            
            if (!updated) {
                return new Response(JSON.stringify({ error: 'الأدمن غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const { password, ...adminWithoutPassword } = updated;
            return new Response(JSON.stringify(adminWithoutPassword), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في تحديث البيانات' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 33. تحديث بيانات الأدمن (بدون username في المسار) ======================
    if (path === '/api/admins/update' && method === 'PUT') {
        try {
            const user = verifyToken(request);
            if (!isAdmin(user)) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const body = await request.json();
            const { username, profile } = body;
            
            if (!username) {
                return new Response(JSON.stringify({ error: 'اسم المستخدم مطلوب' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const updated = await admins.findOneAndUpdate(
                { username },
                { $set: { profile } },
                { returnDocument: 'after' }
            );
            
            if (!updated) {
                return new Response(JSON.stringify({ error: 'الأدمن غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            
            const { password, ...adminWithoutPassword } = updated;
            return new Response(JSON.stringify(adminWithoutPassword), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'خطأ في تحديث البيانات' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }
    }
    
    // ====================== 34. مسار للملفات الثابتة (اختياري) ======================
    // إذا لم يجد أي API، يعرض 404
    return new Response(JSON.stringify({ error: 'API endpoint not found' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

// ====================== تصدير المعالج لـ Cloudflare Workers ======================
export default {
    async fetch(request, env, ctx) {
        Object.assign(process.env, env);
        return handleRequest(request, env, ctx);
    }
};