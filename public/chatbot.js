// public/js/chatbot.js
// النسخة النهائية اللي هتشتغل من أول مرة بدون "النت وقع" أبدًا

document.addEventListener('DOMContentLoaded', function () {
    console.log('%cChatbot JS Loaded - SchoolX مصري أصلي 100%', 'color: gold; font-size: 16px; font-weight: bold');

    // العناصر الأساسية
    const chatWindow  = document.getElementById('chat-window');
    const chatInput   = document.getElementById('chat-input');
    const sendBtn     = document.getElementById('send-btn');
    const voiceBtn    = document.getElementById('voice-btn');
    const clearBtn    = document.getElementById('clearChat');
    const modeToggle  = document.getElementById('modeToggle');
    const suggestions = document.querySelectorAll('.suggestions div');

    // الأصوات
    const sendSound    = new Audio("https://cdn.pixabay.com/download/audio/2022/03/15/audio_233a3e35a3.mp3?filename=message-133874.mp3");
    const receiveSound = new Audio("https://cdn.pixabay.com/download/audio/2021/12/22/audio_c16a4c19f1.mp3?filename=bell-58749.mp3");

    // Dark Mode
    modeToggle.addEventListener('click', () => {
        document.body.classList.toggle('dark');
        modeToggle.classList.toggle('fa-moon');
        modeToggle.classList.toggle('fa-sun');
    });

    // مسح الدردشة
    clearBtn.addEventListener('click', () => {
        if (confirm('هتمسح الدردشة كلها؟')) {
            chatWindow.innerHTML = `
                <div class="welcome">
                    <h2>مرحباً بكِ</h2>
                    <p>أنا مساعدك الذكي — جاهز لمساعدتك في الأسئلة، الواجبات، الجداول والنتائج.</p>
                    <small>الخصوصية مضمونة بالكامل</small>
                </div>`;
        }
    });

    // إضافة رسالة
    function addMessage(text, type) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${type}`;
        msgDiv.innerHTML = `
            <div class="av"><img src="${type === 'user' ? 'Karton.jpeg' : 'logo.png'}" alt="avatar"></div>
            <div class="b">
                ${text.replace(/\n/g, '<br>')}
                <div class="time">${new Date().toLocaleTimeString('ar-EG', {hour: 'numeric', minute: '2-digit'})}</div>
            </div>
        `;
        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;

        if (type === 'user') sendSound.play().catch(() => {});
        else receiveSound.play().catch(() => {});
    }

    // حالة الكتابة
    function showTyping() {
        const typing = document.createElement('div');
        typing.className = 'msg bot';
        typing.id = 'typing';
        typing.innerHTML = `<div class="b"><div class="typing"><span></span><span></span><span></span></div></div>`;
        chatWindow.appendChild(typing);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function removeTyping() {
        document.getElementById('typing')?.remove();
    }

    // إرسال الرسالة للسيرفر (النسخة المضمونة 1000%)
    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        addMessage(message, 'user');
        chatInput.value = '';
        showTyping();

        try {
            const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prompt: message,
                    lang: 'ar'
                })
            });

            removeTyping();

            if (!response.ok) {
                const err = await response.text();
                console.error('API Error:', response.status, err);
                throw new Error(`Server ${response.status}`);
            }

            const data = await response.json();
            const reply = data.reply?.trim();

            if (reply && reply.length > 0) {
                addMessage(reply, 'bot');
            } else {
                addMessage('معلش يا قمر… أنا لسة بفكر، جربي تاني بعد ثواني', 'bot');
            }

        } catch (err) {
            console.error('خطأ في الاتصال:', err);
            removeTyping();
            addMessage('النت وقع يا وحش… جربي تاني بعد شوية', 'bot');
        }
    }

    // الأحداث الأساسية
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // الاقتراحات السريعة
    suggestions.forEach(s => {
        s.addEventListener('click', () => {
            chatInput.value = s.textContent.trim();
            sendMessage();
        });
    });

    // التعرف على الصوت (يعمل على كل الموبايلات والكمبيوتر)
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'ar-EG';
        recognition.continuous = false;
        recognition.interimResults = false;

        voiceBtn.addEventListener('click', () => {
            recognition.start();
            voiceBtn.style.background = '#c82333';
            voiceBtn.innerHTML = '<i class="fa-solid fa-stop"></i>';
        });

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            chatInput.value = transcript;
            sendMessage();
        };

        recognition.onend = () => {
            voiceBtn.style.background = '';
            voiceBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        };

        recognition.onerror = () => {
            voiceBtn.style.background = '';
            voiceBtn.innerHTML = '<i class="fa-solid fa-microphone"></i>';
        };
    }

    // رسالة الترحيب الفخمة
    setTimeout(() => {
        addMessage('أهلاً يا أجمل طالبة في معهد رعاية الضبعية! ازيك النهاردة؟ عايزة أساعدك في إيه يا قمر؟', 'bot');
    }, 1000);

    console.log('%cChatbot جاهز ومستنيكي يا ملكة!', 'color: #c9a552; font-size: 18px; font-weight: bold');
});
