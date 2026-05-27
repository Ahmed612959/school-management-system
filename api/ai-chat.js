const fs = require('fs');
const path = require('path');

const TRAINING_DIR = path.join(__dirname, 'training-data');

// تحميل الملفات المدربة
function loadTrainingFiles() {
    if (!fs.existsSync(TRAINING_DIR)) return [];
    const files = fs.readdirSync(TRAINING_DIR);
    const trainingFiles = [];
    for (const file of files) {
        if (file.endsWith('.json')) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(TRAINING_DIR, file), 'utf-8'));
                trainingFiles.push(data);
            } catch(e) {}
        }
    }
    return trainingFiles;
}

// البحث البسيط
function searchInTraining(query, trainingFiles) {
    const results = [];
    for (const file of trainingFiles) {
        if (file.content && file.content.toLowerCase().includes(query.toLowerCase())) {
            const lines = file.content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(query.toLowerCase())) {
                    const context = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
                    results.push({
                        fileName: file.name,
                        context: context
                    });
                    break;
                }
            }
        }
    }
    return results;
}

// إجابة ذكية بدون API خارجي
function generateAnswer(question, searchResults) {
    if (searchResults.length === 0) {
        return "📚 **مرحباً! أنا المساعد الذكي للمعهد.**\n\n" +
               "⚠️ **لم أجد إجابة لسؤالك في قاعدة المعرفة.**\n\n" +
               "💡 **نصيحة:**\n" +
               "1. تأكد من أن المدير قام برفع ملفات تدريب (PDF، Word، Excel)\n" +
               "2. أو حاول إعادة صياغة السؤال بشكل أوضح\n" +
               "3. يمكنك طرح السؤال على المدير مباشرة\n\n" +
               `**سؤالك:** ${question}`;
    }
    
    let answer = `📚 **إجابة سؤالك:**\n\n`;
    answer += `> ${question}\n\n`;
    answer += `**المعلومات المتوفرة:**\n\n`;
    
    for (let i = 0; i < Math.min(searchResults.length, 3); i++) {
        answer += `${i + 1}. ${searchResults[i].context.substring(0, 400)}`;
        if (searchResults[i].context.length > 400) answer += '...';
        answer += `\n\n📁 **المصدر:** ${searchResults[i].fileName}\n\n`;
    }
    
    return answer;
}

// الدالة الرئيسية
async function askQuestion(question) {
    try {
        const trainingFiles = loadTrainingFiles();
        const searchResults = searchInTraining(question, trainingFiles);
        const answer = generateAnswer(question, searchResults);
        return answer;
    } catch (error) {
        console.error('Error:', error);
        return "⚠️ حدث خطأ في معالجة السؤال. حاول مرة أخرى.";
    }
}

module.exports = { askQuestion, loadTrainingFiles };
