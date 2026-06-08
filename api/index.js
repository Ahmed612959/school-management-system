// index.js - Cloudflare Workers version
// يحتوي على جميع الوظائف الأصلية مع تعديلات لتناسب Cloudflare Workers

// استيراد المكتبات التي تعمل مع Cloudflare Workers
import { MongoClient } from 'mongodb';
import { compare, hash } from 'bcryptjs';
import jwt from '@tsndr/cloudflare-worker-jwt';

// دوال التشفير البديلة لـ crypto (لأن crypto في Cloudflare مختلف)
async function hashPassword(password) {
    return await hash(password, 10);
}

async function verifyPassword(password, hash) {
    return await compare(password, hash);
}

// توليد رمز عشوائي
function generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// معالج الطلبات الرئيسي
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': 'https://school-system-fiv.vercel.app',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
            'Access-Control-Allow-Credentials': 'true'
        };

        // Handle preflight
        if (method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // الاتصال بقاعدة البيانات
        let db = null;
        let client = null;
        
        if (env.MONGODB_URI) {
            try {
                client = new MongoClient(env.MONGODB_URI);
                await client.connect();
                db = client.db();
            } catch (err) {
                console.error('MongoDB connection error:', err);
            }
        }

        // دوال مساعدة للتحقق من التوكن
        async function verifyToken(request) {
            const cookieHeader = request.headers.get('Cookie');
            let token = null;
            
            if (cookieHeader) {
                const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
                token = cookies.authToken;
            }
            
            if (!token) {
                const authHeader = request.headers.get('Authorization');
                token = authHeader?.split(' ')[1];
            }
            
            if (!token) return null;
            
            try {
                const decoded = await jwt.verify(token, env.JWT_SECRET || 'default-secret');
                if (decoded && typeof decoded.payload === 'object') {
                    return decoded.payload;
                }
                return null;
            } catch (error) {
                return null;
            }
        }

        function setAuthCookie(token) {
            return `authToken=${token}; HttpOnly; Secure; SameSite=Lax; Max-Age=86400; Path=/`;
        }

        // ====================== Test endpoint ======================
        if (path === '/api/test' && method === 'GET') {
            return new Response(JSON.stringify({
                status: 'ok',
                mongodb_status: db ? 'connected' : 'disconnected',
                message: 'API is working on Cloudflare Workers!'
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // ====================== التحقق من توفر اسم المستخدم ======================
        if (path === '/api/check-username' && method === 'GET') {
            try {
                const username = url.searchParams.get('username');
                if (!username || username.length < 3) {
                    return new Response(JSON.stringify({ available: false }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                if (!db) {
                    return new Response(JSON.stringify({ available: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                const existingAdmin = await db.collection('admins').findOne({ username: username.toLowerCase() });
                const existingStudent = await db.collection('students').findOne({ username: username.toLowerCase() });
                
                const available = !existingAdmin && !existingStudent;
                return new Response(JSON.stringify({ available }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ available: true }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== تسجيل طالب جديد ======================
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
                
                const existingUser = await db.collection('students').findOne({ username: username.toLowerCase() });
                if (existingUser) {
                    return new Response(JSON.stringify({ error: 'اسم المستخدم موجود مسبقاً' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                const existingCode = await db.collection('students').findOne({ studentCode });
                if (existingCode) {
                    return new Response(JSON.stringify({ error: 'رقم الجلوس موجود مسبقاً' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                const hashedPassword = await hashPassword(password);
                
                const student = {
                    fullName,
                    username: username.toLowerCase(),
                    password: hashedPassword,
                    grade,
                    studentCode,
                    role: 'student',
                    profile: { phone: phone || '', parentName: parentName || '', parentId: parentId || '' },
                    failedAttempts: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                await db.collection('students').insertOne(student);
                
                return new Response(JSON.stringify({ success: true, message: 'تم إنشاء الحساب بنجاح' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في إنشاء الحساب: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== تسجيل الدخول ======================
        if (path === '/api/login' && method === 'POST') {
            try {
                const body = await request.json();
                const { username, password } = body;
                
                if (!username || !password) {
                    return new Response(JSON.stringify({ error: 'جميع الحقول مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                if (!db) {
                    if (username === 'demo' && password === 'demo123') {
                        const token = await jwt.sign(
                            { id: 'demo', username: 'demo', type: 'student', fullName: 'طالب تجريبي', studentCode: '12345' },
                            env.JWT_SECRET || 'default-secret',
                            { expiresIn: '24h' }
                        );
                        const csrfToken = generateRandomString(32);
                        return new Response(JSON.stringify({
                            success: true,
                            csrfToken: csrfToken,
                            user: { username: 'demo', fullName: 'طالب تجريبي', type: 'student', id: '12345' }
                        }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': setAuthCookie(token), ...corsHeaders } });
                    }
                    return new Response(JSON.stringify({ error: 'بيانات غير صحيحة (وضع تجريبي: استخدم demo/demo123)' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                let user = await db.collection('admins').findOne({ username: username.toLowerCase() });
                let userType = 'admin';
                
                if (!user) {
                    user = await db.collection('students').findOne({ username: username.toLowerCase() });
                    userType = 'student';
                }
                
                if (!user) {
                    return new Response(JSON.stringify({ error: 'بيانات غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
                    const remainingMinutes = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
                    return new Response(JSON.stringify({ error: `الحساب مقفل مؤقتاً. حاول مرة أخرى بعد ${remainingMinutes} دقيقة` }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                const isMatch = await verifyPassword(password, user.password);
                
                if (!isMatch) {
                    const failedAttempts = (user.failedAttempts || 0) + 1;
                    let lockedUntil = null;
                    if (failedAttempts >= 5) {
                        lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
                    }
                    await db.collection(userType === 'admin' ? 'admins' : 'students').updateOne(
                        { _id: user._id },
                        { $set: { failedAttempts, lockedUntil } }
                    );
                    return new Response(JSON.stringify({ error: 'بيانات غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                await db.collection(userType === 'admin' ? 'admins' : 'students').updateOne(
                    { _id: user._id },
                    { $set: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() } }
                );
                
                const token = await jwt.sign(
                    { id: user._id.toString(), username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode },
                    env.JWT_SECRET || 'default-secret',
                    { expiresIn: '24h' }
                );
                
                const csrfToken = generateRandomString(32);
                
                return new Response(JSON.stringify({
                    success: true,
                    csrfToken: csrfToken,
                    user: {
                        username: user.username,
                        fullName: user.fullName,
                        type: userType,
                        id: user.studentCode || user._id.toString()
                    }
                }), { headers: { 'Content-Type': 'application/json', 'Set-Cookie': setAuthCookie(token), ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في السيرفر: ' + error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== التحقق من الجلسة ======================
        if (path === '/api/verify-session' && method === 'GET') {
            const user = await verifyToken(request);
            if (!user) {
                return new Response(JSON.stringify({ valid: false }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            return new Response(JSON.stringify({ valid: true, user }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        }

        // ====================== تسجيل الخروج ======================
        if (path === '/api/logout' && method === 'POST') {
            return new Response(JSON.stringify({ success: true }), { 
                headers: { 
                    'Content-Type': 'application/json', 
                    'Set-Cookie': 'authToken=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
                    ...corsHeaders 
                } 
            });
        }

        // ====================== APIs الخاصة بالطلاب ======================
        if (path.startsWith('/api/student/by-code/') && method === 'GET') {
            const user = await verifyToken(request);
            if (!user) {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            try {
                const studentCode = path.split('/').pop();
                const student = await db.collection('students').findOne({ studentCode }, { projection: { password: 0 } });
                if (!student) {
                    return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                return new Response(JSON.stringify(student), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في جلب بيانات الطالب' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== جلب الطلاب (للأدمن) ======================
        if (path === '/api/admin/students' && method === 'GET') {
            const user = await verifyToken(request);
            if (!user || user.type !== 'admin') {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            try {
                const students = await db.collection('students').find({}, { projection: { password: 0 } }).toArray();
                return new Response(JSON.stringify(students), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في جلب الطلاب' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== الإشعارات ======================
        if (path === '/api/notifications' && method === 'GET') {
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            try {
                const notifications = await db.collection('notifications').find({}).sort({ createdAt: -1 }).toArray();
                return new Response(JSON.stringify(notifications), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        if (path === '/api/notifications' && method === 'POST') {
            const user = await verifyToken(request);
            if (!user || user.type !== 'admin') {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            try {
                const body = await request.json();
                const { text, date } = body;
                if (!text || text.trim() === '') {
                    return new Response(JSON.stringify({ error: 'نص الإشعار مطلوب' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                const newNotification = {
                    text: text.trim(),
                    date: date || new Date().toLocaleString('ar-EG'),
                    createdAt: new Date()
                };
                const result = await db.collection('notifications').insertOne(newNotification);
                return new Response(JSON.stringify({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: { ...newNotification, _id: result.insertedId } }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في إضافة الإشعار' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== المخالفات ======================
        if (path === '/api/violations' && method === 'GET') {
            const user = await verifyToken(request);
            if (!user || user.type !== 'admin') {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            if (!db) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            try {
                const violations = await db.collection('violations').find({}).sort({ createdAt: -1 }).toArray();
                return new Response(JSON.stringify(violations), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        if (path === '/api/violations' && method === 'POST') {
            const user = await verifyToken(request);
            if (!user || user.type !== 'admin') {
                return new Response(JSON.stringify({ error: 'غير مصرح' }), { status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            try {
                const body = await request.json();
                const { studentId, type, reason, penalty, parentSummons, date } = body;
                if (!studentId || !reason || !penalty) {
                    return new Response(JSON.stringify({ error: 'جميع الحقول مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                const student = await db.collection('students').findOne({ studentCode: studentId });
                if (!student) {
                    return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                const newViolation = {
                    studentId, type: type || 'behavior', reason, penalty,
                    parentSummons: parentSummons || false,
                    date: date || new Date().toLocaleString('ar-EG'),
                    createdAt: new Date()
                };
                const result = await db.collection('violations').insertOne(newViolation);
                return new Response(JSON.stringify({ success: true, message: 'تم إضافة المخالفة بنجاح', violation: { ...newViolation, _id: result.insertedId } }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في إضافة المخالفة' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== DeepSeek AI ======================
        if (path === '/api/gemini' && method === 'POST') {
            try {
                const body = await request.json();
                const { prompt, userId = request.headers.get('CF-Connecting-IP') || 'anonymous' } = body;
                
                if (!prompt || prompt.trim() === '') {
                    return new Response(JSON.stringify({ error: 'الرسالة مطلوبة' }), { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                // ردود الطوارئ
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
• مراقبة العلامات الحيوية
• إعطاء الأدوية حسب الوصفات الطبية
• التثقيف الصحي للمرضى وأسرهم
• التعاون مع الفريق الطبي

هل تريد معلومات عن مجال معين؟`;
                    }
                    
                    return `📚 **أنا هنا لمساعدتك!**

🎯 **يمكنك سؤالي عن:**
• الرعاية التلطيفية (Palliative Care)
• الموت الدماغي (Brain Death)
• التمريض الجراحي والباطني
• النتائج والدرجات

كيف أقدر أساعدك أكثر اليوم؟`;
                }
                
                const reply = getFallbackResponse(prompt);
                return new Response(JSON.stringify({ reply }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ reply: getFallbackResponse('') }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== APIs خاصة بولي الأمر ======================
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
                
                const student = await db.collection('students').findOne({ 'profile.parentId': parentId });
                
                if (!student) {
                    return new Response(JSON.stringify({ error: 'رقم بطاقة ولي الأمر غير صحيح' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                const expectedPassword = student.studentCode.slice(-7);
                
                if (password !== expectedPassword) {
                    return new Response(JSON.stringify({ error: 'كلمة المرور غير صحيحة' }), { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                
                return new Response(JSON.stringify({
                    success: true,
                    studentId: student._id.toString(),
                    studentName: student.fullName,
                    studentCode: student.studentCode,
                    parentName: student.profile?.parentName || 'ولي الأمر'
                }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في السيرفر' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        if (path.startsWith('/api/parent/student/') && path.includes('/results') && method === 'GET') {
            try {
                const studentCode = path.split('/')[4];
                if (!db) {
                    return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                const student = await db.collection('students').findOne({ studentCode }, { projection: { subjects: 1, fullName: 1, studentCode: 1 } });
                if (!student) {
                    return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), { status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                return new Response(JSON.stringify({
                    fullName: student.fullName,
                    studentCode: student.studentCode,
                    subjects: student.subjects || []
                }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في جلب النتائج' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        if (path.startsWith('/api/parent/student/') && path.includes('/attendance') && method === 'GET') {
            try {
                const studentCode = path.split('/')[4];
                if (!db) {
                    return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                const attendance = await db.collection('attendance').find({ studentCode }).sort({ date: -1 }).toArray();
                const present = attendance.filter(a => a.status === 'present').length;
                const absent = attendance.filter(a => a.status === 'absent').length;
                const late = attendance.filter(a => a.status === 'late').length;
                const total = attendance.length;
                const percentage = total > 0 ? (present / total) * 100 : 0;
                
                return new Response(JSON.stringify({
                    present, absent, late, total,
                    percentage: percentage.toFixed(1),
                    records: attendance
                }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: 'خطأ في جلب الحضور' }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        if (path.startsWith('/api/parent/student/') && path.includes('/violations') && method === 'GET') {
            try {
                const studentCode = path.split('/')[4];
                if (!db) {
                    return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                const violations = await db.collection('violations').find({ studentId: studentCode }).sort({ date: -1 }).toArray();
                return new Response(JSON.stringify(violations), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // ====================== إنشاء مدير تجريبي ======================
        if (path === '/api/create-test-admin' && method === 'POST') {
            if (!db) {
                return new Response(JSON.stringify({ error: 'قاعدة البيانات غير متصلة' }), { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
            try {
                const existingAdmin = await db.collection('admins').findOne({ username: 'admin' });
                if (existingAdmin) {
                    return new Response(JSON.stringify({ message: 'المدير موجود مسبقاً', username: 'admin', password: 'admin123' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
                }
                const hashedPassword = await hashPassword('admin123');
                await db.collection('admins').insertOne({ fullName: 'مدير النظام', username: 'admin', password: hashedPassword, createdAt: new Date() });
                return new Response(JSON.stringify({ message: 'تم إنشاء المدير بنجاح', username: 'admin', password: 'admin123' }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            } catch (error) {
                return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
            }
        }

        // Default response for unmatched routes
        return new Response(JSON.stringify({ error: 'API endpoint not found' }), { 
            status: 404, 
            headers: { 'Content-Type': 'application/json', ...corsHeaders } 
        });
    }
};
