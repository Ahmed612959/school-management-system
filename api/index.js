// api/index.js - نسخة Cloudflare Workers كاملة
import { MongoClient } from 'mongodb';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// متغيرات البيئة (تضاف في Cloudflare Dashboard)
const JWT_SECRET = process.env.JWT_SECRET || 'mysecret';
const MONGODB_URI = process.env.MONGODB_URI;

// اتصال قاعدة البيانات
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  
  if (!MONGODB_URI) {
    console.warn('⚠️ MONGODB_URI not set');
    return null;
  }
  
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  cachedDb = client.db('school-system');
  return cachedDb;
}

// دوال مساعدة
async function hashPassword(password) {
  return await bcrypt.hash(password, 10);
}

async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
  'Access-Control-Allow-Credentials': 'true',
};

// ====================== دوال الذاكرة والذكاء للشات بوت ======================
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

function getConversationContext(userId) {
  const history = conversationHistory.get(userId) || [];
  let context = '';
  if (history.length > 0) {
    context += '\n【آخر المحادثات】\n';
    history.slice(-6).forEach(msg => {
      context += `${msg.role === 'user' ? '👤 الطالب' : '🤖 المساعد'}: ${msg.content.substring(0, 100)}\n`;
    });
  }
  return context;
}

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

📌 **متى نبدأ؟**
من لحظة تشخيص المرض الخطير، بالتزامن مع العلاج.`;
  }
  
  if (p.includes('brain death') || p.includes('موت دماغي')) {
    return `🧠 **الموت الدماغي (Brain Death)**

📌 **التعريف:**
التوقف الكامل والنهائي لوظائف الدماغ بأكمله.

📌 **المعايير التشخيصية:**
• غيبوبة عميقة بدون استجابة
• انعدام التنفس التلقائي تماماً
• اختفاء ردود أفعال جذع الدماغ
• ثبوت النتائج بعد 6-24 ساعة`;
  }
  
  if (p.includes('تمريض') || p.includes('nursing')) {
    return `🩺 **التمريض - مهنة إنسانية نبيلة**

📌 **المهام الأساسية للممرض:**
• تقديم الرعاية المباشرة للمرضى
• مراقبة العلامات الحيوية
• إعطاء الأدوية حسب الوصفات الطبية
• التثقيف الصحي للمرضى وأسرهم
• التعاون مع الفريق الطبي

📌 **صفات الممرض الناجح:**
• 🤝 التعاطف والصبر
• 🔍 الدقة والانتباه
• 💪 العمل تحت الضغط
• 🗣️ مهارات تواصل ممتازة`;
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

كيف أقدر أساعدك أكثر اليوم؟`;
}

// ====================== المعالج الرئيسي ======================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // OPTIONS request (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // ====================== API Routes ======================
    
    // Test endpoint
    if (path === '/api/test' && request.method === 'GET') {
      return new Response(JSON.stringify({ 
        status: 'ok', 
        message: 'API is working on Cloudflare Workers!',
        mongodb: MONGODB_URI ? 'configured' : 'not set'
      }), { 
        headers: { 'Content-Type': 'application/json', ...corsHeaders } 
      });
    }
    
    // ====================== شات بوت ======================
    if (path === '/api/gemini' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { prompt, userId = 'anonymous' } = body;
        
        if (!prompt || prompt.trim() === '') {
          return new Response(JSON.stringify({ error: 'الرسالة مطلوبة' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const conversationContext = getConversationContext(userId);
        const reply = getFallbackResponse(prompt);
        saveConversationContext(userId, prompt, reply);
        
        return new Response(JSON.stringify({ reply }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ reply: getFallbackResponse('') }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    
    // مسح ذاكرة الشات بوت
    if (path === '/api/gemini/clear-memory' && request.method === 'POST') {
      const userId = 'anonymous';
      conversationHistory.delete(userId);
      importantFacts.delete(userId);
      return new Response(JSON.stringify({ success: true, message: '✅ تم مسح ذاكرة المحادثة' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // التحقق من توفر اسم المستخدم
    if (path === '/api/check-username' && request.method === 'GET') {
      const username = url.searchParams.get('username');
      const db = await connectToDatabase();
      
      if (!db) {
        return new Response(JSON.stringify({ available: true }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const existing = await db.collection('students').findOne({ username });
      
      return new Response(JSON.stringify({ available: !existing }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // تسجيل طالب جديد
    if (path === '/api/students/register' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { fullName, username, password, grade, studentCode, phone, parentName, parentId } = body;
        
        const db = await connectToDatabase();
        
        if (!db) {
          return new Response(JSON.stringify({ success: true, message: 'تم إنشاء الحساب بنجاح (وضع تجريبي)' }), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const existingUser = await db.collection('students').findOne({ username });
        if (existingUser) {
          return new Response(JSON.stringify({ error: 'اسم المستخدم موجود مسبقاً' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const existingCode = await db.collection('students').findOne({ studentCode });
        if (existingCode) {
          return new Response(JSON.stringify({ error: 'رقم الجلوس موجود مسبقاً' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const hashedPassword = await hashPassword(password);
        
        await db.collection('students').insertOne({
          fullName,
          username,
          password: hashedPassword,
          grade,
          studentCode,
          role: 'student',
          profile: { phone, parentName, parentId },
          createdAt: new Date()
        });
        
        return new Response(JSON.stringify({ success: true, message: 'تم إنشاء الحساب بنجاح' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    
    // تسجيل الدخول
    if (path === '/api/login' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { username, password } = body;
        
        const db = await connectToDatabase();
        
        if (!db) {
          if (username === 'demo' && password === 'demo123') {
            return new Response(JSON.stringify({
              success: true,
              csrfToken: uuidv4(),
              user: { username: 'demo', fullName: 'طالب تجريبي', type: 'student', id: '12345' }
            }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
          }
          return new Response(JSON.stringify({ error: 'بيانات غير صحيحة' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        let user = await db.collection('admins').findOne({ username });
        let userType = 'admin';
        
        if (!user) {
          user = await db.collection('students').findOne({ username });
          userType = 'student';
        }
        
        if (!user) {
          return new Response(JSON.stringify({ error: 'بيانات غير صحيحة' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const isValid = await verifyPassword(password, user.password);
        
        if (!isValid) {
          return new Response(JSON.stringify({ error: 'بيانات غير صحيحة' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
        
        const token = jwt.sign(
          { id: user._id, username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode },
          JWT_SECRET,
          { expiresIn: '24h' }
        );
        
        return new Response(JSON.stringify({
          success: true,
          csrfToken: uuidv4(),
          user: {
            username: user.username,
            fullName: user.fullName,
            type: userType,
            id: user.studentCode || user._id
          }
        }), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
        
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
    }
    
    // جلب جميع الطلاب (للأدمن)
    if (path === '/api/admin/students' && request.method === 'GET') {
      const db = await connectToDatabase();
      
      if (!db) {
        return new Response(JSON.stringify([]), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const students = await db.collection('students').find({}).toArray();
      // إزالة كلمة المرور من الاستجابة
      const safeStudents = students.map(s => {
        const { password, ...rest } = s;
        return rest;
      });
      
      return new Response(JSON.stringify(safeStudents), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // جلب طالب برقم الجلوس
    if (path.startsWith('/api/student/by-code/') && request.method === 'GET') {
      const studentCode = path.split('/').pop();
      const db = await connectToDatabase();
      
      if (db) {
        const student = await db.collection('students').findOne({ studentCode });
        if (student) {
          const { password, ...rest } = student;
          return new Response(JSON.stringify(rest), {
            headers: { 'Content-Type': 'application/json', ...corsHeaders }
          });
        }
      }
      
      return new Response(JSON.stringify({ error: 'الطالب غير موجود' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }
    
    // جلب الإشعارات
    if (path === '/api/notifications' && request.method === 'GET') {
      return new Response(JSON.stringify([
        { text: '📢 مرحباً بكم في الفصل الدراسي الجديد', date: new Date().toLocaleString('ar-EG') },
        { text: '📚 سيتم بدء الاختبارات الأسبوع المقبل', date: new Date().toLocaleString('ar-EG') }
      ]), { headers: { 'Content-Type': 'application/json', ...corsHeaders } });
    }
    
    // ====================== ملفات ثابتة ======================
    // قائمة الملفات المسموحة
    const staticFiles = ['/', '/index.html', '/login.html', '/signup.html', '/Home.html', '/profile.html', '/exams.html', '/chatbot.html', '/file-library.html', '/admin.html', '/Home.css', '/login.css', '/admin.css', '/profile.css', '/exams.css', '/Home.js', '/profile.js', '/exams.js', '/chatbot.js', '/admin.js', '/auth.js', '/crypto-js.js', '/logo.png'];
    
    if (staticFiles.includes(path) || path.endsWith('.html') || path.endsWith('.css') || path.endsWith('.js') || path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.ico')) {
      let filePath = path === '/' ? '/index.html' : path;
      
      try {
        const file = await fetch(new URL(`../public${filePath}`, import.meta.url));
        let contentType = 'text/html';
        if (filePath.endsWith('.css')) contentType = 'text/css';
        if (filePath.endsWith('.js')) contentType = 'application/javascript';
        if (filePath.endsWith('.png')) contentType = 'image/png';
        if (filePath.endsWith('.jpg')) contentType = 'image/jpeg';
        if (filePath.endsWith('.ico')) contentType = 'image/x-icon';
        
        return new Response(file.body, {
          headers: { 'Content-Type': contentType }
        });
      } catch (e) {
        return new Response('File not found', { status: 404 });
      }
    }
    
    // 404
    return new Response('Page not found', { status: 404 });
  }
};