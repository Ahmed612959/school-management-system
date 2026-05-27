const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

const TRAINING_DIR = path.join(__dirname, 'training-data');

if (!fs.existsSync(TRAINING_DIR)) {
    fs.mkdirSync(TRAINING_DIR, { recursive: true });
}

// استخراج النص من PDF
async function extractTextFromPDF(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
}

// استخراج النص من TXT
function extractTextFromTXT(filePath) {
    return fs.readFileSync(filePath, 'utf-8');
}

// حفظ الملف المدرب
function saveTrainingFile(fileName, content) {
    const safeFileName = fileName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
    const filePath = path.join(TRAINING_DIR, `${safeFileName}.json`);
    
    const data = {
        id: Date.now(),
        name: fileName,
        content: content,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return data;
}

// حذف جميع البيانات
function clearAllData() {
    const files = fs.readdirSync(TRAINING_DIR);
    for (const file of files) {
        if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(TRAINING_DIR, file));
        }
    }
    return { success: true, message: 'تم حذف جميع البيانات' };
}

// تدريب على ملف
async function trainOnFile(filePath, originalName) {
    try {
        const ext = path.extname(filePath).toLowerCase();
        let text = '';
        
        if (ext === '.pdf') {
            text = await extractTextFromPDF(filePath);
        } else if (ext === '.txt') {
            text = extractTextFromTXT(filePath);
        } else {
            return { success: false, error: `نوع الملف غير مدعوم حالياً: ${ext}. استخدم PDF أو TXT` };
        }
        
        if (!text || text.length < 50) {
            return { success: false, error: 'الملف لا يحتوي على نص كافي (يحتاج 50 حرف على الأقل)' };
        }
        
        const fileName = originalName.replace(/\.[^/.]+$/, '');
        saveTrainingFile(fileName, text);
        
        return { success: true, fileName: originalName, chunksCount: Math.ceil(text.length / 500) };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = { trainOnFile, clearAllData };
