// إعدادات سيرفر الترخيص
// ===============================================
// غيّر القيمة دي لكلمة سر قوية وسرّية قبل النشر — هي اللي بتحميك من إنشاء/حذف الأكواد من أي شخص غريب
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'CHANGE_THIS_SECRET_BEFORE_DEPLOY';

// البورت اللي السيرفر هيشتغل عليه
const PORT = process.env.PORT || 4000;

module.exports = { ADMIN_SECRET, PORT };
