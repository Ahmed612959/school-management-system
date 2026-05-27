require('dotenv').config({ path: __dirname + '/../.env' });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const pdfParse = require('pdf-parse');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();

// ====================== MIDDLEWARE ======================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

// ====================== CORS ======================
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5500',
    'https://school-system-fiv.vercel.app'
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS policy violation'), false);
        }
        return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// ====================== Helmet Security ======================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "https://pagead2.googlesyndication.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://generativelanguage.googleapis.com"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
        },
    },
}));

// ====================== Rate Limiting ======================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'لقد تجاوزت الحد المسموح من الطلبات' },
});
app.use('/api/', limiter);

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'محاولات تسجيل دخول كثيرة، حاول مرة أخرى بعد 15 دقيقة' },
});

// ====================== متغيرات البيئة ======================
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');
const MONGODB_URI = process.env.MONGODB_URI;

console.log('MONGODB_URI:', MONGODB_URI ? '✅ Found' : '❌ Not found');

// ====================== دوال التشفير ======================
async function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(32).toString('hex');
        crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
            if (err) reject(err);
            resolve(`${salt}:${derivedKey.toString('hex')}`);
        });
    });
}

async function verifyPassword(password, hash) {
    return new Promise((resolve, reject) => {
        const [salt, key] = hash.split(':');
        crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
            if (err) reject(err);
            resolve(key === derivedKey.toString('hex'));
        });
    });
}

// ====================== Session Setup ======================
let sessionStore;

if (MONGODB_URI && MONGODB_URI !== '') {
    console.log('✅ Using MongoDB for session store');
    sessionStore = MongoStore.create({ 
        mongoUrl: MONGODB_URI,
        ttl: 24 * 60 * 60
    });
} else {
    console.log('⚠️ MONGODB_URI not found, using memory store (not for production)');
    const MemoryStore = require('express-session').MemoryStore;
    sessionStore = new MemoryStore();
}

app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000,
        sameSite: 'lax'
    }
}));

// ====================== الاتصال بقاعدة البيانات ======================
if (MONGODB_URI && MONGODB_URI !== '') {
    console.log('📡 Connecting to MongoDB...');
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 60000,
        connectTimeoutMS: 30000,
    })
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));
} else {
    console.log('⚠️ No MONGODB_URI provided, running without database (demo mode)');
}

// ====================== النماذج (Schemas) ======================
let Admin, Student, Violation, Notification, Attendance, Exam, ExamResult;

if (MONGODB_URI && MONGODB_URI !== '') {
    const adminSchema = new mongoose.Schema({
        fullName: String,
        username: { type: String, unique: true },
        password: String,
        role: { type: String, default: 'admin' },
        lastLogin: Date,
        lastIP: String,
        failedAttempts: { type: Number, default: 0 },
        lockedUntil: Date,
        profile: { phone: String, email: String },
        refreshToken: String
    }, { timestamps: true });

    const studentSchema = new mongoose.Schema({
        fullName: String,
        studentCode: { type: String, required: true, unique: true },
        username: { type: String, unique: true },
        password: String,
        grade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
        semester: String,
        subjects: Array,
        role: { type: String, default: 'student' },
        lastLogin: Date,
        lastIP: String,
        profile: {
            phone: String,
            parentName: String,
            parentId: String
        },
        refreshToken: String
    }, { timestamps: true });

    const violationSchema = new mongoose.Schema({
        studentId: String,
        type: String,
        reason: String,
        penalty: String,
        parentSummons: Boolean,
        date: String
    });

    const notificationSchema = new mongoose.Schema({
        text: String,
        date: String
    }, { timestamps: true });

    const attendanceSchema = new mongoose.Schema({
        studentCode: { type: String, required: true },
        studentName: { type: String, required: true },
        date: { type: String, required: true },
        status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
        note: { type: String, default: '' },
        recordedBy: { type: String, default: '' }
    });

    const examSchema = new mongoose.Schema({
        name: { type: String, required: true },
        stage: { type: String, required: true },
        code: { type: String, required: true, unique: true },
        duration: { type: Number, required: true },
        questions: [{
            type: { type: String, required: true },
            text: { type: String, required: true },
            options: [String],
            correctAnswer: String,
            correctAnswers: [String]
        }]
    });

    const examResultSchema = new mongoose.Schema({
        examCode: { type: String, required: true },
        studentId: { type: String, required: true },
        score: { type: Number, required: true },
        completionTime: { type: Date, default: Date.now }
    });

    Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
    Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
    Violation = mongoose.models.Violation || mongoose.model('Violation', violationSchema);
    Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
    Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
    Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);
    ExamResult = mongoose.models.ExamResult || mongoose.model('ExamResult', examResultSchema);
}

// ====================== دوال مساعدة ======================
function requireDb(req, res, next) {
    if (!MONGODB_URI || MONGODB_URI === '' || mongoose.connection.readyState !== 1) {
        return res.status(503).json({ error: 'قاعدة البيانات غير متصلة حالياً' });
    }
    next();
}

// ====================== دوال الأمان ======================
function setAuthCookie(res, token) {
    res.cookie('authToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/'
    });
}

function verifyToken(req, res, next) {
    let token = req.cookies?.authToken;
    
    if (!token) {
        const authHeader = req.headers['authorization'];
        token = authHeader?.split(' ')[1];
    }
    
    if (!token) {
        return res.status(401).json({ error: 'غير مصرح. يرجى تسجيل الدخول' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'جلسة غير صالحة' });
    }
}

function isAdmin(req, res, next) {
    if (!req.user || req.user.type !== 'admin') {
        return res.status(403).json({ error: 'غير مصرح. هذه الصفحة للأدمن فقط' });
    }
    next();
}

function verifyCsrfToken(req, res, next) {
    const csrfToken = req.headers['x-csrf-token'];
    const sessionCsrf = req.session.csrfToken;
    
    if (!csrfToken || !sessionCsrf || csrfToken !== sessionCsrf) {
        return res.status(403).json({ error: 'طلب غير مصرح به' });
    }
    next();
}

// ====================== API Routes ======================

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        mongodb_status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        message: 'API is working!'
    });
});

// ====================== التحقق من توفر اسم المستخدم ======================
app.get('/api/check-username', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username || username.length < 3) {
            return res.json({ available: false });
        }
        
        if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
            return res.json({ available: true });
        }
        
        const existingAdmin = await Admin.findOne({ username: username.toLowerCase() });
        const existingStudent = await Student.findOne({ username: username.toLowerCase() });
        
        const available = !existingAdmin && !existingStudent;
        res.json({ available });
    } catch (error) {
        console.error('Error checking username:', error);
        res.json({ available: true });
    }
});

// ====================== تسجيل طالب جديد ======================
app.post('/api/students/register', async (req, res) => {
    try {
        const { fullName, username, password, grade, studentCode, phone, parentName, parentId } = req.body;
        
        if (!fullName || !username || !password || !grade || !studentCode) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
            return res.status(503).json({ error: 'قاعدة البيانات غير متصلة حالياً' });
        }
        
        const existingUser = await Student.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
        
        const existingCode = await Student.findOne({ studentCode });
        if (existingCode) {
            return res.status(400).json({ error: 'رقم الجلوس موجود مسبقاً' });
        }
        
        const hashedPassword = await hashPassword(password);
        
        const student = new Student({
            fullName,
            username: username.toLowerCase(),
            password: hashedPassword,
            grade,
            studentCode,
            role: 'student',
            profile: {
                phone: phone || '',
                parentName: parentName || '',
                parentId: parentId || ''
            }
        });
        
        await student.save();
        
        console.log(`✅ تم إنشاء حساب جديد للطالب: ${fullName} (${username})`);
        res.json({ success: true, message: 'تم إنشاء الحساب بنجاح' });
        
    } catch (error) {
        console.error('❌ خطأ في تسجيل الطالب:', error);
        res.status(500).json({ error: 'خطأ في إنشاء الحساب: ' + error.message });
    }
});

// ====================== تسجيل الدخول ======================
app.post('/api/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        const clientIP = req.ip || req.connection.remoteAddress;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }

        if (!MONGODB_URI || mongoose.connection.readyState !== 1) {
            if (username === 'demo' && password === 'demo123') {
                const token = jwt.sign(
                    { id: 'demo', username: 'demo', type: 'student', fullName: 'طالب تجريبي', studentCode: '12345' },
                    JWT_SECRET,
                    { expiresIn: '24h' }
                );
                setAuthCookie(res, token);
                const csrfToken = crypto.randomBytes(32).toString('hex');
                req.session.csrfToken = csrfToken;
                return res.json({
                    success: true,
                    csrfToken: csrfToken,
                    user: { username: 'demo', fullName: 'طالب تجريبي', type: 'student', id: '12345' }
                });
            }
            return res.status(401).json({ error: 'بيانات غير صحيحة (وضع تجريبي: استخدم demo/demo123)' });
        }

        let user = await Admin.findOne({ username: username.toLowerCase() });
        let userType = 'admin';

        if (!user) {
            user = await Student.findOne({ username: username.toLowerCase() });
            userType = 'student';
        }

        if (!user) {
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
            const remainingMinutes = Math.ceil((user.lockedUntil - new Date()) / 60000);
            return res.status(401).json({ error: `الحساب مقفل مؤقتاً. حاول مرة أخرى بعد ${remainingMinutes} دقيقة` });
        }

        const isMatch = await verifyPassword(password, user.password);
        
        if (!isMatch) {
            user.failedAttempts = (user.failedAttempts || 0) + 1;
            if (user.failedAttempts >= 5) {
                user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
            }
            await user.save();
            return res.status(401).json({ error: 'بيانات غير صحيحة' });
        }

        user.failedAttempts = 0;
        user.lockedUntil = null;
        user.lastLogin = new Date();
        user.lastIP = clientIP;
        await user.save();

        const token = jwt.sign(
            { id: user._id, username: user.username, type: userType, fullName: user.fullName, studentCode: user.studentCode },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        const refreshToken = jwt.sign(
            { id: user._id, type: 'refresh' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        user.refreshToken = refreshToken;
        await user.save();

        setAuthCookie(res, token);
        
        const csrfToken = crypto.randomBytes(32).toString('hex');
        req.session.csrfToken = csrfToken;

        res.json({
            success: true,
            csrfToken: csrfToken,
            user: {
                username: user.username,
                fullName: user.fullName,
                type: userType,
                id: user.studentCode || user._id
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'خطأ في السيرفر: ' + error.message });
    }
});

// ====================== تجديد التوكن ======================
app.post('/api/refresh-token', async (req, res) => {
    const token = req.cookies?.authToken;
    if (!token) {
        return res.status(401).json({ error: 'لا توجد جلسة' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (MONGODB_URI && mongoose.connection.readyState === 1) {
            let user = await Admin.findById(decoded.id);
            if (!user) user = await Student.findById(decoded.id);
            
            if (!user || !user.refreshToken) {
                return res.status(401).json({ error: 'جلسة غير صالحة' });
            }
        }
        
        const newToken = jwt.sign(
            { id: decoded.id, username: decoded.username, type: decoded.type, fullName: decoded.fullName, studentCode: decoded.studentCode },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        setAuthCookie(res, newToken);
        res.json({ success: true });
    } catch (error) {
        res.status(401).json({ error: 'جلسة منتهية' });
    }
});

// ====================== التحقق من الجلسة ======================
app.get('/api/verify-session', verifyToken, async (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ====================== تسجيل الخروج ======================
app.post('/api/logout', verifyToken, async (req, res) => {
    if (MONGODB_URI && mongoose.connection.readyState === 1) {
        let user = await Admin.findById(req.user.id);
        if (!user) user = await Student.findById(req.user.id);
        if (user) user.refreshToken = null;
        await user?.save();
    }
    
    req.session.destroy();
    res.clearCookie('authToken', { path: '/' });
    res.json({ success: true });
});

// ====================== APIs الخاصة بالطلاب ======================
app.get('/api/student/by-code/:studentCode', verifyToken, requireDb, async (req, res) => {
    try {
        const student = await Student.findOne({ studentCode: req.params.studentCode }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { 
        res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); 
    }
});

app.get('/api/student/by-username/:username', verifyToken, requireDb, async (req, res) => {
    try {
        const student = await Student.findOne({ username: req.params.username }).select('-password -refreshToken');
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(student);
    } catch (error) { 
        res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' }); 
    }
});

// ====================== APIs الخاصة بالاختبارات ======================
app.post('/api/exams', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { name, stage, code, duration, questions } = req.body;
        
        if (!name || !code || !duration || !questions || questions.length === 0) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة وسؤال واحد على الأقل' });
        }
        
        const existingExam = await Exam.findOne({ code });
        if (existingExam) {
            return res.status(400).json({ error: 'كود الاختبار موجود مسبقاً' });
        }
        
        const newExam = new Exam({
            name,
            stage,
            code,
            duration,
            questions
        });
        
        await newExam.save();
        console.log(`✅ تم إنشاء اختبار جديد: ${name} (${code})`);
        res.json({ success: true, message: 'تم إنشاء الاختبار بنجاح', exam: newExam });
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الاختبار:', error);
        res.status(500).json({ error: 'خطأ في إنشاء الاختبار: ' + error.message });
    }
});

app.get('/api/exams', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const exams = await Exam.find().sort({ createdAt: -1 }).select('-questions');
        res.json(exams);
    } catch (error) {
        console.error('خطأ في جلب الاختبارات:', error);
        res.status(500).json({ error: 'خطأ في جلب الاختبارات' });
    }
});

app.get('/api/exams/:code', verifyToken, async (req, res) => {
    try {
        const { code } = req.params;
        const exam = await Exam.findOne({ code });
        if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' });
        res.json(exam);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الاختبار' });
    }
});

app.delete('/api/exams/:code', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { code } = req.params;
        const deleted = await Exam.findOneAndDelete({ code });
        if (!deleted) return res.status(404).json({ error: 'الاختبار غير موجود' });
        await ExamResult.deleteMany({ examCode: code });
        res.json({ success: true, message: 'تم حذف الاختبار بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الاختبار' });
    }
});

app.post('/api/exams/:code/submit', verifyToken, async (req, res) => {
    try {
        const { code } = req.params;
        const { studentId, answers } = req.body;
        const exam = await Exam.findOne({ code });
        if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' });
        
        let correctCount = 0;
        exam.questions.forEach((question, index) => {
            const userAnswer = answers[index];
            if (question.type === 'multiple' || question.type === 'truefalse') {
                if (userAnswer === question.correctAnswer) correctCount++;
            } else if (question.type === 'essay') {
                if (userAnswer && userAnswer.length > 20) correctCount += 0.7;
                else if (userAnswer && userAnswer.length > 0) correctCount += 0.3;
            }
        });
        
        const percentage = (correctCount / exam.questions.length) * 100;
        const examResult = new ExamResult({ examCode: code, studentId: studentId || req.user.username, score: percentage });
        await examResult.save();
        res.json({ success: true, message: 'تم حفظ النتيجة', score: percentage });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حفظ النتيجة' });
    }
});

app.get('/api/exams/:code/results', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const { code } = req.params;
        const results = await ExamResult.find({ examCode: code }).sort({ completionTime: -1 });
        res.json(results);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب النتائج' });
    }
});

// ====================== الإشعارات ======================
app.get('/api/notifications', requireDb, async (req, res) => { 
    try { 
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.json(notifications); 
    } catch (error) { 
        res.status(500).json({ error: 'خطأ في جلب الإشعارات' }); 
    } 
});

app.post('/api/notifications', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { text, date } = req.body;
        if (!text || text.trim() === '') {
            return res.status(400).json({ error: 'نص الإشعار مطلوب' });
        }
        const newNotification = new Notification({ text: text.trim(), date: date || new Date().toLocaleString('ar-EG') });
        await newNotification.save();
        res.json({ success: true, message: 'تم إضافة الإشعار بنجاح', notification: newNotification });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة الإشعار' });
    }
});

app.delete('/api/notifications/:id', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Notification.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'الإشعار غير موجود' });
        res.json({ success: true, message: 'تم حذف الإشعار بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الإشعار' });
    }
});

// ====================== المخالفات ======================
app.get('/api/violations', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const violations = await Violation.find().sort({ createdAt: -1 });
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المخالفات' });
    }
});

app.get('/api/admin/violations', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const violations = await Violation.find().sort({ createdAt: -1 });
        res.json(violations);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المخالفات' });
    }
});

app.post('/api/violations', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { studentId, type, reason, penalty, parentSummons, date } = req.body;
        if (!studentId || !reason || !penalty) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        const student = await Student.findOne({ studentCode: studentId });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        
        const newViolation = new Violation({
            studentId, type, reason, penalty,
            parentSummons: parentSummons || false,
            date: date || new Date().toLocaleString('ar-EG')
        });
        await newViolation.save();
        res.json({ success: true, message: 'تم إضافة المخالفة بنجاح', violation: newViolation });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة المخالفة' });
    }
});

app.delete('/api/violations/:id', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await Violation.findByIdAndDelete(id);
        if (!deleted) return res.status(404).json({ error: 'المخالفة غير موجودة' });
        res.json({ success: true, message: 'تم حذف المخالفة بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف المخالفة' });
    }
});

// ====================== جلب الطلاب (للأدمن) ======================
app.get('/api/admin/students', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const students = await Student.find().select('-password -refreshToken');
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الطلاب' });
    }
});

app.get('/api/admins', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const admins = await Admin.find().select('-password -refreshToken');
        res.json(admins);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الأدمنز' });
    }
});

app.post('/api/admins', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { fullName, username, password } = req.body;
        if (!fullName || !username || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) {
            return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
        }
        const hashedPassword = await hashPassword(password);
        const admin = new Admin({ fullName, username, password: hashedPassword });
        await admin.save();
        res.json({ message: 'تم إضافة الأدمن بنجاح', admin: { fullName, username } });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في إضافة الأدمن' });
    }
});

app.delete('/api/admins/:username', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { username } = req.params;
        if (username === 'admin') {
            return res.status(400).json({ error: 'لا يمكن حذف المدير الرئيسي' });
        }
        const adminCount = await Admin.countDocuments();
        if (adminCount <= 1) {
            return res.status(400).json({ error: 'لا يمكن حذف آخر أدمن في النظام' });
        }
        const deleted = await Admin.findOneAndDelete({ username });
        if (!deleted) return res.status(404).json({ error: 'الأدمن غير موجود' });
        res.json({ message: 'تم حذف الأدمن بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الأدمن' });
    }
});

// ====================== تحديث بيانات الطالب والأدمن ======================
app.put('/api/students/:studentCode', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { studentCode } = req.params;
        const { profile, subjects, fullName, semester } = req.body;
        
        const updateData = {};
        if (profile !== undefined) updateData.profile = profile;
        if (subjects !== undefined) updateData.subjects = subjects;
        if (fullName !== undefined) updateData.fullName = fullName;
        if (semester !== undefined) updateData.semester = semester;
        
        const updated = await Student.findOneAndUpdate(
            { studentCode: studentCode },
            { $set: updateData },
            { new: true }
        ).select('-password -refreshToken');
        
        if (!updated) return res.status(404).json({ error: 'الطالب غير موجود' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث البيانات' });
    }
});

app.delete('/api/students/:studentCode', verifyToken, isAdmin, verifyCsrfToken, async (req, res) => {
    try {
        const { studentCode } = req.params;
        const student = await Student.findOneAndDelete({ studentCode });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        await Violation.deleteMany({ studentId: studentCode });
        res.json({ message: 'تم حذف الطالب بنجاح' });
    } catch (error) {
        res.status(500).json({ error: 'خطأ في حذف الطالب' });
    }
});

app.put('/api/admins/:username', verifyToken, isAdmin, verifyCsrfToken, requireDb, async (req, res) => {
    try {
        const { username } = req.params;
        const { profile } = req.body;
        const updated = await Admin.findOneAndUpdate(
            { username },
            { $set: { profile } },
            { new: true }
        ).select('-password -refreshToken');
        if (!updated) return res.status(404).json({ error: 'الأدمن غير موجود' });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في تحديث البيانات' });
    }
});

// ====================== جلب الطلاب حسب الصف ======================
app.get('/api/students/by-grade/:grade', verifyToken, isAdmin, requireDb, async (req, res) => {
    try {
        const { grade } = req.params;
        let gradeValue = grade;
        if (grade === 'first') gradeValue = 'first';
        else if (grade === 'second') gradeValue = 'second';
        else if (grade === 'third') gradeValue = 'third';
        else {
            return res.status(400).json({ error: 'صف غير صحيح' });
        }
        
        const students = await Student.find({ grade: gradeValue }).select('-password -refreshToken');
        res.json(students);
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الطلاب' });
    }
});

// ====================== إنشاء مدير تجريبي ======================
app.post('/api/create-test-admin', requireDb, async (req, res) => {
    try {
        const existingAdmin = await Admin.findOne({ username: 'admin' });
        if (existingAdmin) return res.json({ message: 'المدير موجود مسبقاً', username: 'admin', password: 'admin123' });
        const hashedPassword = await hashPassword('admin123');
        const admin = new Admin({ fullName: 'مدير النظام', username: 'admin', password: hashedPassword });
        await admin.save();
        res.json({ message: 'تم إنشاء المدير بنجاح', username: 'admin', password: 'admin123' });
    } catch (error) { 
        res.status(500).json({ error: error.message }); 
    }
});

// ====================== DeepSeek AI (مجاني وقوي) ======================
const DEEPSEEK_API_KEY = 'sk-d8c8ce7b4a894b3695aeb888558c539e';

// نظام تخزين المحادثات والذاكرة لكل مستخدم
let conversationHistory = new Map();
let userPreferences = new Map();
let userProgress = new Map();
let importantFacts = new Map();

// ====================== دوال الذاكرة والذكاء ======================

function saveConversationContext(userId, userMessage, botResponse) {
    if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
    }
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

// ====================== الاتصال بـ DeepSeek API ======================
async function callDeepSeek(systemPrompt, userPrompt) {
    try {
        console.log('📡 Calling DeepSeek API...');
        
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content;
            if (reply && reply.trim()) {
                console.log('✅ DeepSeek API succeeded!');
                return reply;
            } else {
                console.log('⚠️ DeepSeek returned empty response');
            }
        } else {
            const errorText = await response.text();
            console.log(`⚠️ DeepSeek API error: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        console.log('⚠️ DeepSeek API error:', error.message);
    }
    return null;
}

// ====================== ردود الطوارئ (عند فشل API) ======================
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
• مراقبة العلامات الحيوية
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

كيف أقدر أساعدك أكثر اليوم؟`;
}

// ====================== API: الدردشة ======================
app.post('/api/gemini', async (req, res) => {
    try {
        const { prompt, userId = req.user?.id || req.ip || 'anonymous' } = req.body;
        
        if (!prompt || prompt.trim() === '') {
            return res.status(400).json({ error: 'الرسالة مطلوبة' });
        }
        
        // حفظ البيانات والذاكرة
        extractImportantFacts(userId, prompt);
        updateUserPreferences(userId, prompt);
        const conversationContext = getConversationContext(userId);
        
        const systemPrompt = `أنت مساعد تعليمي ذكي لمعهد رعاية الضبعية للتمريض.

📌 تعليمات مهمة:
- رد باللغة العربية (مصري أو فصحى)
- تخصصك: التمريض، الرعاية التلطيفية، Palliative care, Brain death, Hospice care
- كن ودوداً ومفيداً ومحترفاً
- قدم إجابات دقيقة ومبسطة مع أمثلة عملية
- إذا سأل عن النتيجة: "روح على صفحة النتائج وادخل الكود بتاعك"
- استخدم السياق المقدم من المحادثات السابقة

${conversationContext ? `\n📚 **سياق المحادثة السابقة مع هذا الطالب:**\n${conversationContext}\n` : ''}

💬 **سؤال الطالب الحالي:** ${prompt}

قدم رداً مفيداً وطبيعياً وودوداً باللغة العربية:`;

        let reply = null;
        
        // محاولة الاتصال بـ DeepSeek API
        if (DEEPSEEK_API_KEY && DEEPSEEK_API_KEY !== '') {
            reply = await callDeepSeek(systemPrompt, prompt);
        }
        
        // إذا فشل DeepSeek، استخدم الردود المبرمجة
        if (!reply) {
            console.log('⚠️ DeepSeek failed, using fallback');
            reply = getFallbackResponse(prompt);
        }
        
        saveConversationContext(userId, prompt, reply);
        console.log(`📝 [${userId}] Response sent`);
        res.json({ reply: reply });
        
    } catch (error) {
        console.error('❌ Chat error:', error.message);
        res.json({ reply: getFallbackResponse(req.body.prompt) });
    }
});

// ====================== باقي APIs ======================

app.post('/api/gemini/clear-memory', verifyToken, async (req, res) => {
    const userId = req.user?.id || req.ip;
    conversationHistory.delete(userId);
    importantFacts.delete(userId);
    res.json({ success: true, message: '✅ تم مسح ذاكرة المحادثة بنجاح' });
});

app.get('/api/gemini/stats', verifyToken, async (req, res) => {
    const userId = req.user?.id || req.ip;
    res.json({
        conversationLength: (conversationHistory.get(userId) || []).length / 2,
        factsShared: (importantFacts.get(userId) || []).length,
        preferences: userPreferences.get(userId) || {},
        progress: userProgress.get(userId) || {}
    });
});

app.get('/api/gemini/tips', verifyToken, async (req, res) => {
    const userId = req.user?.id || req.ip;
    const progress = userProgress.get(userId) || {};
    let tip = '';
    
    if (progress.understandingLevel === 'مبتدئ') {
        tip = '📚 **نصيحة مخصصة لك:**\n\nأنصحك بمراجعة الأساسيات أولاً، ثم الانتقال تدريجياً للموضوعات الأعمق. خصص 30 دقيقة يومياً للمراجعة.\n\n💪 أنت قادر على التقدم بسرعة!';
    } else if (progress.understandingLevel === 'متوسط') {
        tip = '🎯 **نصيحة مخصصة لك:**\n\nأنت في الطريق الصحيح! ركز على حل التمارين والتطبيقات العملية لتعزيز فهمك.\n\n🌟 استمر بهذا المستوى الرائع!';
    } else {
        tip = '⭐ **نصيحة مخصصة لك:**\n\nمستواك ممتاز! أنصحك الآن بتدريس ما تعلمته لزملائك - هذا سيعزز فهمك أكثر.\n\n🏆 أنت قدوة لزملائك!';
    }
    res.json({ tip });
});

app.post('/api/gemini/vision', async (req, res) => {
    res.json({ reply: '🖼️ **خدمة تحليل الصور**\n\nهذه الخدمة قيد التطوير. قريباً سأتمكن من تحليل صورك وشرح محتواها!\n\n📌 في الوقت الحالي، يمكنك وصف الصورة وسأحاول مساعدتك.' });
});

app.post('/api/gemini/file', async (req, res) => {
    const { filename } = req.body;
    res.json({ reply: `📄 **تم استلام ملف: ${filename || 'الملف'}**\n\nخدمة تحليل الملفات قيد التطوير.\n\n📌 قريباً سأتمكن من:\n• قراءة ملفات PDF\n• تلخيص المستندات\n• استخراج المعلومات المهمة\n• إنشاء أسئلة من المحتوى` });
});

app.post('/api/gemini/questions', async (req, res) => {
    const { questionCount = 5, filename } = req.body;
    res.json({ reply: `📝 **طلب إنشاء ${questionCount} سؤال**\n\nمن ملف: ${filename || 'الملف'}\n\nهذه الخدمة قيد التطوير.\n\n📌 قريباً سأتمكن من إنشاء:\n• أسئلة اختيار من متعدد\n• أسئلة صح/خطأ\n• أسئلة مقالية\n\nعلى حسب المحتوى الذي ترفعه!` });
});

// ====================== APIs خاصة بولي الأمر ======================

// تسجيل دخول ولي الأمر
app.post('/api/parent/login', async (req, res) => {
    try {
        const { parentId, password } = req.body;
        
        if (!parentId || !password) {
            return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
        }
        
        // البحث عن طالب بهذا الرقم
        const student = await Student.findOne({ 'profile.parentId': parentId });
        
        if (!student) {
            return res.status(401).json({ error: 'رقم بطاقة ولي الأمر غير صحيح' });
        }
        
        // كلمة المرور هي آخر 7 أرقام من رقم جلوس الطالب
        const expectedPassword = student.studentCode.slice(-7);
        
        if (password !== expectedPassword) {
            return res.status(401).json({ error: 'كلمة المرور غير صحيحة' });
        }
        
        res.json({
            success: true,
            studentId: student._id,
            studentName: student.fullName,
            studentCode: student.studentCode,
            parentName: student.profile?.parentName || 'ولي الأمر'
        });
        
    } catch (error) {
        console.error('Parent login error:', error);
        res.status(500).json({ error: 'خطأ في السيرفر' });
    }
});

// جلب بيانات الطالب لولي الأمر
app.get('/api/parent/student/:studentCode', async (req, res) => {
    try {
        const { studentCode } = req.params;
        
        const student = await Student.findOne({ studentCode }).select('-password -refreshToken');
        
        if (!student) {
            return res.status(404).json({ error: 'الطالب غير موجود' });
        }
        
        res.json(student);
        
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب بيانات الطالب' });
    }
});

// جلب نتائج الطالب لولي الأمر
app.get('/api/parent/student/:studentCode/results', async (req, res) => {
    try {
        const { studentCode } = req.params;
        
        const student = await Student.findOne({ studentCode }).select('subjects fullName studentCode');
        
        if (!student) {
            return res.status(404).json({ error: 'الطالب غير موجود' });
        }
        
        res.json({
            fullName: student.fullName,
            studentCode: student.studentCode,
            subjects: student.subjects || []
        });
        
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب النتائج' });
    }
});

// جلب حضور الطالب لولي الأمر
app.get('/api/parent/student/:studentCode/attendance', async (req, res) => {
    try {
        const { studentCode } = req.params;
        
        const attendance = await Attendance.find({ studentCode }).sort({ date: -1 });
        
        const present = attendance.filter(a => a.status === 'present').length;
        const absent = attendance.filter(a => a.status === 'absent').length;
        const late = attendance.filter(a => a.status === 'late').length;
        const total = attendance.length;
        const percentage = total > 0 ? (present / total) * 100 : 0;
        
        res.json({
            present, absent, late, total,
            percentage: percentage.toFixed(1),
            records: attendance
        });
        
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب الحضور' });
    }
});

// جلب مخالفات الطالب لولي الأمر
app.get('/api/parent/student/:studentCode/violations', async (req, res) => {
    try {
        const { studentCode } = req.params;
        
        const violations = await Violation.find({ studentId: studentCode }).sort({ date: -1 });
        
        res.json(violations);
        
    } catch (error) {
        res.status(500).json({ error: 'خطأ في جلب المخالفات' });
    }
});

// ====================== Error Handling ======================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);
    res.status(500).json({ error: 'حدث خطأ داخلي في السيرفر' });
});

// ====================== تشغيل السيرفر ======================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Serving static files from "public" folder`);
    console.log(`📊 MongoDB URI: ${MONGODB_URI ? '✅ Set' : '❌ Not set (demo mode)'}`);
});