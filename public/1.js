require('dotenv').config();
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Found' : '❌ Not found');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');

const app = express();

// ====================== MIDDLEWARE ======================
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ====================== دالة التشفير ======================
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// ====================== النماذج (Schemas) ======================
const adminSchema = new mongoose.Schema({
    fullName: String,
    username: { type: String, unique: true },
    password: String,
    profile: { phone: String, email: String }
});

const studentSchema = new mongoose.Schema({
    fullName: String,
    studentCode: { type: String, required: true, unique: true },
    username: { type: String, unique: true },
    password: String,
    grade: { type: String, enum: ['first', 'second', 'third'], default: 'first' },
    semester: String,
    subjects: Array,
    profile: {
        phone: String,
        parentName: String,
        parentId: String
    }
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
});

const weeklyQuizSchema = new mongoose.Schema({
    weekNumber: { type: Number, required: true },
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctIndex: { type: Number, required: true },
    winners: [{
        studentId: String,
        username: String,
        fullName: String,
        answeredAt: { type: Date, default: Date.now }
    }],
    isActive: { type: Boolean, default: true }
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

// إنشاء النماذج
const Admin = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
const Student = mongoose.models.Student || mongoose.model('Student', studentSchema);
const Violation = mongoose.models.Violation || mongoose.model('Violation', violationSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
const WeeklyQuiz = mongoose.models.WeeklyQuiz || mongoose.model('WeeklyQuiz', weeklyQuizSchema);
const Exam = mongoose.models.Exam || mongoose.model('Exam', examSchema);
const ExamResult = mongoose.models.ExamResult || mongoose.model('ExamResult', examResultSchema);

// ====================== نموذج الحضور والغياب ======================
const attendanceSchema = new mongoose.Schema({
    studentCode: { type: String, required: true },
    studentName: { type: String, required: true },
    date: { type: String, required: true },
    status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' },
    note: { type: String, default: '' },
    recordedBy: { type: String, default: '' }
});

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

// ====================== الاتصال بقاعدة البيانات ======================
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('❌ MONGODB_URI is not set in environment variables!');
} else {
    console.log('📡 Connecting to MongoDB...');
    mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 60000,
        connectTimeoutMS: 30000,
    })
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch(err => console.error('❌ MongoDB connection error:', err.message));
}

// ====================== دوال مساعدة ======================
function generateUniqueUsername(fullName, id, existingUsers) {
    let baseUsername = fullName.toLowerCase().replace(/\s+/g, '').slice(0, 10) + id.slice(-2);
    let username = baseUsername;
    let counter = 1;
    while (existingUsers.some(user => user.username === username)) {
        username = `${baseUsername}${counter}`;
        counter++;
    }
    return username;
}

function generatePassword(fullName) {
    const firstName = fullName.split(' ')[0];
    return `${firstName.charAt(0).toUpperCase() + firstName.slice(1)}1234@`;
}

// ====================== API Routes ======================

// Test endpoint
app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', mongodb_status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', message: 'API is working!' });
});

// ====================== الأدمنز ======================
app.get('/api/admins', async (req, res) => {
    try {
        const admins = await Admin.find().select('-password');
        res.json(admins);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الأدمنز' }); }
});

app.post('/api/admins', async (req, res) => {
    try {
        const { fullName, username, password } = req.body;
        const existingAdmin = await Admin.findOne({ username });
        if (existingAdmin) return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });
        const hashedPassword = hashPassword(password);
        const newAdmin = new Admin({ fullName, username, password: hashedPassword });
        await newAdmin.save();
        res.json({ message: 'تم إضافة الأدمن', admin: { fullName, username } });
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الأدمن' }); }
});

app.delete('/api/admins/:username', async (req, res) => {
    try {
        const admins = await Admin.find();
        if (admins.length <= 1) return res.status(400).json({ error: 'لا يمكن حذف آخر أدمن' });
        await Admin.deleteOne({ username: req.params.username });
        res.json({ message: 'تم حذف الأدمن' });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الأدمن' }); }
});

// ====================== الطلاب ======================
app.get('/api/students', async (req, res) => {
    try {
        const students = await Student.find().select('-password');
        res.json(students);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الطلاب' }); }
});

app.get('/api/students/by-grade/:grade', async (req, res) => {
    try {
        const { grade } = req.params;
        const students = await Student.find({ grade }).select('-password');
        res.json(students);
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب الطلاب حسب الصف' }); }
});

app.post('/api/students', async (req, res) => {
    try {
        const { fullName, id, subjects, semester } = req.body;
        const existingAdmins = await Admin.find();
        const existingStudents = await Student.find();
        const username = generateUniqueUsername(fullName, id, [...existingAdmins, ...existingStudents]);
        const originalPassword = generatePassword(fullName);
        const hashedPassword = hashPassword(originalPassword);
        
        const newStudent = new Student({
            fullName, studentCode: id, username, password: hashedPassword,
            semester: semester || 'first', subjects: subjects || [],
            profile: { phone: '', parentName: '', parentId: '' }
        });
        await newStudent.save();
        res.json({ message: 'تم إضافة الطالب', student: { fullName, username, studentCode: id, password: originalPassword } });
    } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الطالب' }); }
});

app.put('/api/students/:studentCode', async (req, res) => {
    try {
        const { fullName, username, studentCode, password, profile, subjects, semester } = req.body;
        const updateData = {};
        if (fullName !== undefined) updateData.fullName = fullName;
        if (username !== undefined) updateData.username = username;
        if (studentCode !== undefined) updateData.studentCode = studentCode;
        if (profile !== undefined) updateData.profile = profile;
        if (subjects !== undefined) updateData.subjects = subjects;
        if (semester !== undefined) updateData.semester = semester;
        if (password && password !== '********') updateData.password = hashPassword(password);
        
        const updated = await Student.findOneAndUpdate({ studentCode: req.params.studentCode }, updateData, { new: true });
        if (!updated) return res.status(404).json({ error: 'الطالب غير موجود' });
        const studentWithoutPassword = updated.toObject();
        delete studentWithoutPassword.password;
        res.json({ message: 'تم تحديث الطالب', student: studentWithoutPassword });
    } catch (error) { res.status(500).json({ error: 'فشل في التحديث: ' + error.message }); }
});

app.delete('/api/students/:studentCode', async (req, res) => {
    try {
        const student = await Student.findOneAndDelete({ studentCode: req.params.studentCode });
        if (!student) return res.status(404).json({ error: 'الطالب غير موجود' });
        await Violation.deleteMany({ studentId: req.params.studentCode });
        res.json({ message: 'تم حذف الطالب' });
    } catch (error) { res.status(500).json({ error: 'خطأ في حذف الطالب' }); }
});

// ====================== تسجيل الدخول ======================
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });

        let user = await Admin.findOne({ username: username.toLowerCase() });
        let userType = 'admin';

        if (!user) {
            user = await Student.findOne({ username: username.toLowerCase() });
            userType = 'student';
        }

        if (!user) return res.status(401).json({ error: 'بيانات غير صحيحة' });

        const hashedInputPassword = hashPassword(password);
        const isMatch = (hashedInputPassword === user.password);
        if (!isMatch) return res.status(401).json({ error: 'بيانات غير صحيحة' });

        res.json({
            success: true,
            user: {
                username: user.username,
                fullName: user.fullName,
                type: userType,
                ...(user.studentCode && { id: user.studentCode })
            }
        });
    } catch (error) { res.status(500).json({ error: 'خطأ في السيرفر: ' + error.message }); }
});

// ====================== تسجيل طالب جديد ======================
app.post('/api/register-student', async (req, res) => {
    try {
        const { fullName, username, password, studentCode, grade, phone, parentName, parentId } = req.body;
        if (!fullName || !username || !password || !studentCode) return res.status(400).json({ error: 'البيانات ناقصة' });

        const existingUser = await Student.findOne({ $or: [{ username }, { studentCode }] });
        if (existingUser) return res.status(400).json({ error: 'المستخدم أو الكود موجود مسبقاً' });

        const hashedPassword = hashPassword(password);
        const student = new Student({
            fullName, username: username.toLowerCase(), studentCode,
            grade: grade || 'first', password: hashedPassword,
            profile: { phone, parentName, parentId }
        });
        await student.save();
        res.json({ success: true, message: 'تم التسجيل بنجاح', username });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ====================== التحقق من اسم المستخدم ======================
app.post('/api/check-username', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'اسم المستخدم مطلوب' });
        const [existingAdmins, existingStudents] = await Promise.all([
            Admin.findOne({ username }).lean(),
            Student.findOne({ username }).lean()
        ]);
        res.json({ available: !existingAdmins && !existingStudents });
    } catch (error) { res.status(500).json({ error: 'خطأ في التحقق من اسم المستخدم' }); }
});

// ====================== المخالفات والإشعارات ======================
app.get('/api/violations', async (req, res) => { try { res.json(await Violation.find()); } catch (error) { res.status(500).json({ error: 'خطأ في جلب المخالفات' }); } });
app.post('/api/violations', async (req, res) => { try { const newViolation = new Violation(req.body); await newViolation.save(); res.json({ message: 'تم إضافة المخالفة', violation: newViolation }); } catch (error) { res.status(500).json({ error: 'خطأ في إضافة المخالفة' }); } });
app.delete('/api/violations/:id', async (req, res) => { try { await Violation.findByIdAndDelete(req.params.id); res.json({ message: 'تم حذف المخالفة' }); } catch (error) { res.status(500).json({ error: 'خطأ في حذف المخالفة' }); } });

app.get('/api/notifications', async (req, res) => { try { res.json(await Notification.find()); } catch (error) { res.status(500).json({ error: 'خطأ في جلب الإشعارات' }); } });
app.post('/api/notifications', async (req, res) => { try { const newNotification = new Notification(req.body); await newNotification.save(); res.json({ message: 'تم إضافة الإشعار', notification: newNotification }); } catch (error) { res.status(500).json({ error: 'خطأ في إضافة الإشعار' }); } });
app.delete('/api/notifications/:id', async (req, res) => { try { await Notification.findByIdAndDelete(req.params.id); res.json({ message: 'تم حذف الإشعار' }); } catch (error) { res.status(500).json({ error: 'خطأ في حذف الإشعار' }); } });

// ====================== الاختبارات (Exams) ======================
app.post('/api/exams/check-code', async (req, res) => { try { const { code } = req.body; const exam = await Exam.findOne({ code }); res.json({ available: !exam }); } catch (error) { res.status(500).json({ error: 'فشل في التحقق من الكود' }); } });
app.post('/api/exams', async (req, res) => { try { const exam = new Exam(req.body); await exam.save(); res.json({ message: 'تم حفظ الاختبار', code: req.body.code }); } catch (error) { res.status(500).json({ error: 'فشل في حفظ الاختبار' }); } });
app.get('/api/exams/:code', async (req, res) => { try { const exam = await Exam.findOne({ code: req.params.code }); if (!exam) return res.status(404).json({ error: 'الاختبار غير موجود' }); res.json(exam); } catch (error) { res.status(500).json({ error: 'فشل في جلب الاختبار' }); } });
app.post('/api/exams/submit', async (req, res) => { try { const result = new ExamResult(req.body); await result.save(); res.json({ message: 'تم حفظ النتيجة' }); } catch (error) { res.status(500).json({ error: 'فشل في إرسال النتيجة' }); } });
app.get('/api/exams/:code/results', async (req, res) => { try { const results = await ExamResult.find({ examCode: req.params.code }); res.json(results); } catch (error) { res.status(500).json({ error: 'فشل في جلب نتائج الاختبار' }); } });

// ====================== تحليل PDF ونور AI ======================
app.post('/api/analyze-pdf', async (req, res) => {
    try {
        const { pdfData } = req.body;
        if (!pdfData) return res.status(400).json({ error: 'بيانات PDF غير صالحة' });
        const buffer = Buffer.from(pdfData, 'base64');
        const data = await pdfParse(buffer);
        res.json({ message: 'تم تحليل PDF بنجاح', text: data.text.substring(0, 500), pageCount: data.numpages });
    } catch (error) { res.status(500).json({ error: 'خطأ في تحليل الملف: ' + error.message }); }
});

app.post('/api/nour', async (req, res) => {
    try {
        const { prompt } = req.body;
        const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
        if (!prompt) return res.json({ reply: "اكتب حاجة الأول يا وحش!" });
        if (!GEMINI_API_KEY) return res.json({ reply: "نور نايمة دلوقتي يا بطل… كلمني بعد شوية" });
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `السؤال: ${prompt}` }] }] })
        });
        const result = await response.json();
        const reply = result.candidates?.[0]?.content?.parts?.[0]?.text || "معلش يا وحش… جرب تاني";
        res.json({ reply: reply.trim() });
    } catch (err) { res.json({ reply: "النت وقع يا أسطورة… جرب تاني" }); }
});

// ====================== إنشاء مدير تجريبي ======================
app.post('/api/create-test-admin', async (req, res) => {
    try {
        const existingAdmin = await Admin.findOne({ username: 'admin' });
        if (existingAdmin) return res.json({ message: 'المدير موجود مسبقاً', username: 'admin', password: 'admin123' });
        const admin = new Admin({ fullName: 'مدير النظام', username: 'admin', password: hashPassword('admin123') });
        await admin.save();
        res.json({ message: 'تم إنشاء المدير بنجاح', username: 'admin', password: 'admin123' });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// ====================== API Routes - الحضور والغياب ======================
app.get('/api/attendance/:date', async (req, res) => {
    try { const attendance = await Attendance.find({ date: req.params.date }); res.json(attendance); }
    catch (error) { res.status(500).json({ error: 'خطأ في جلب بيانات الحضور' }); }
});

app.get('/api/attendance/student/:studentCode', async (req, res) => {
    try { const attendance = await Attendance.find({ studentCode: req.params.studentCode }); res.json(attendance); }
    catch (error) { res.status(500).json({ error: 'خطأ في جلب حضور الطالب' }); }
});

app.post('/api/attendance', async (req, res) => {
    try {
        const { studentCode, studentName, date, status, note, recordedBy } = req.body;
        const existing = await Attendance.findOne({ studentCode, date });
        if (existing) {
            existing.status = status; existing.note = note || '';
            await existing.save();
            return res.json({ message: 'تم تحديث الحضور بنجاح', attendance: existing });
        }
        const attendance = new Attendance({ studentCode, studentName, date, status, note: note || '', recordedBy: recordedBy || 'admin' });
        await attendance.save();
        res.json({ message: 'تم تسجيل الحضور بنجاح', attendance });
    } catch (error) { res.status(500).json({ error: 'خطأ في تسجيل الحضور' }); }
});

app.post('/api/attendance/bulk', async (req, res) => {
    try {
        const { date, students, recordedBy } = req.body;
        let saved = 0, updated = 0;
        for (const student of students) {
            const existing = await Attendance.findOne({ studentCode: student.code, date });
            if (existing) {
                existing.status = student.status; existing.note = student.note || '';
                await existing.save(); updated++;
            } else {
                const attendance = new Attendance({ studentCode: student.code, studentName: student.name, date, status: student.status, note: student.note || '', recordedBy: recordedBy || 'admin' });
                await attendance.save(); saved++;
            }
        }
        res.json({ message: `تم تسجيل الحضور: ${saved} جديد، ${updated} تحديث`, saved, updated });
    } catch (error) { res.status(500).json({ error: 'خطأ في تسجيل الحضور' }); }
});

app.get('/api/attendance/stats/:studentCode', async (req, res) => {
    try {
        const attendance = await Attendance.find({ studentCode: req.params.studentCode });
        const present = attendance.filter(a => a.status === 'present').length;
        const absent = attendance.filter(a => a.status === 'absent').length;
        const late = attendance.filter(a => a.status === 'late').length;
        const percentage = attendance.length > 0 ? (present / attendance.length) * 100 : 0;
        res.json({ present, absent, late, total: attendance.length, percentage: percentage.toFixed(1) });
    } catch (error) { res.status(500).json({ error: 'خطأ في جلب إحصائيات الحضور' }); }
});

// ====================== Error Handling ======================
app.use((err, req, res, next) => {
    console.error('❌ Unhandled Error:', err);
    res.status(500).json({ error: 'حدث خطأ داخلي في السيرفر', details: process.env.NODE_ENV === 'development' ? err.message : undefined });
});

module.exports = app;
