// security.js - حماية متقدمة للصفحات

(function() {
    // منع F12 واختصارات المطور
    document.addEventListener('keydown', function(e) {
        // قائمة الاختصارات الممنوعة
        const forbiddenKeys = [
            'F12',
            'F11',
            'F10'
        ];
        
        const forbiddenCombos = [
            { ctrl: true, shift: true, key: 'I' },
            { ctrl: true, shift: true, key: 'C' },
            { ctrl: true, shift: true, key: 'J' },
            { ctrl: true, key: 'U' },
            { ctrl: true, key: 'S' },
            { ctrl: true, key: 'P' },
            { ctrl: true, shift: true, key: 'R' },
            { metaKey: true, altKey: true, key: 'I' },
            { metaKey: true, altKey: true, key: 'C' }
        ];
        
        // منع المفاتيح المفردة
        if (forbiddenKeys.includes(e.key)) {
            e.preventDefault();
            return false;
        }
        
        // منع المجموعات
        for (let combo of forbiddenCombos) {
            if ((!combo.ctrl || e.ctrlKey) &&
                (!combo.shift || e.shiftKey) &&
                (!combo.alt || e.altKey) &&
                (!combo.metaKey || e.metaKey) &&
                e.key === combo.key) {
                e.preventDefault();
                return false;
            }
        }
    });
    
    // منع النقر بزر الماوس الأيمن
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    // تشويش على الـ Console
    if (typeof console !== 'undefined') {
        const noop = function() {};
        console.log = noop;
        console.warn = noop;
        console.error = noop;
        console.info = noop;
        console.debug = noop;
        console.table = noop;
        console.group = noop;
        console.groupEnd = noop;
    }
    
    // منع فتح DevTools
    let devToolsOpen = false;
    const element = new Image();
    
    Object.defineProperty(element, 'id', {
        get: function() {
            devToolsOpen = true;
            document.body.innerHTML = `
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:white;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Tajawal,monospace;">
                    <i class="fas fa-shield-alt" style="font-size:80px;color:#d4af37;margin-bottom:20px;"></i>
                    <h2 style="color:#1a4f6e;">🔒 تم تعطيل أدوات المطور</h2>
                    <p style="color:#64748b;margin-top:10px;">يرجى إغلاق أدوات المطور لإكمال العملية</p>
                </div>
            `;
            document.body.style.overflow = 'hidden';
        }
    });
    
    setInterval(function() {
        const start = performance.now();
        debugger;
        const end = performance.now();
        if (end - start > 100) {
            devToolsOpen = true;
            document.body.innerHTML = `
                <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:white;z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;font-family:Tajawal,monospace;">
                    <i class="fas fa-shield-alt" style="font-size:80px;color:#d4af37;margin-bottom:20px;"></i>
                    <h2 style="color:#1a4f6e;">🔒 تم تعطيل أدوات المطور</h2>
                    <p style="color:#64748b;margin-top:10px;">يرجى إغلاق أدوات المطور لإكمال العملية</p>
                </div>
            `;
            document.body.style.overflow = 'hidden';
        }
    }, 1000);
    
    // منع حفظ الصفحة
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            return false;
        }
    });
    
    // منع dragging الصور
    document.querySelectorAll('img').forEach(img => {
        img.setAttribute('draggable', 'false');
        img.addEventListener('dragstart', (e) => {
            e.preventDefault();
            return false;
        });
    });
    
    // إخفاء محاولات النسخ
    document.addEventListener('copy', function(e) {
        e.preventDefault();
        return false;
    });
    
    // منع تحديد النص
    document.addEventListener('selectstart', function(e) {
        e.preventDefault();
        return false;
    });
    
    console.log('🔒 الحماية مفعلة');
})();