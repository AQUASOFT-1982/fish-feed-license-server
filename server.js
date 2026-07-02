/*
 * سيرفر بسيط لإدارة وفحص أكواد تفعيل "نظام تقارير مصنع علف الأسماك"
 * مبني بـ Node.js الأساسي فقط (بدون أي مكتبات خارجية) — سهل النشر على أي استضافة بتدعم Node.
 *
 * طريقة التشغيل:
 *   node server.js
 *
 * المتغيرات البيئية (اختياري):
 *   PORT=4000
 *   ADMIN_SECRET=كلمة-سر-قوية
 */

const http = require('http');
const crypto = require('crypto');
const { ADMIN_SECRET, PORT } = require('./config');
const db = require('./db');

function sendJSON(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, x-admin-secret',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function generateKey() {
  // شكل الكود: FFR-XXXX-XXXX-XXXX (سهل القراءة والكتابة يدويًا لو احتاج العميل)
  const part = () => crypto.randomBytes(2).toString('hex').toUpperCase();
  return `FFR-${part()}-${part()}-${part()}`;
}

function isAdmin(req) {
  return req.headers['x-admin-secret'] === ADMIN_SECRET;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathName = url.pathname;

  if (req.method === 'OPTIONS') {
    return sendJSON(res, 200, { ok: true });
  }

  try {
    /* ============== تفعيل كود على جهاز جديد ============== */
    if (pathName === '/api/activate' && req.method === 'POST') {
      const { key, deviceId, deviceLabel } = await readBody(req);
      if (!key || !deviceId) {
        return sendJSON(res, 400, { ok: false, error: 'يجب إرسال الكود ومُعرّف الجهاز.' });
      }
      const license = db.findByKey(key.trim());
      if (!license) {
        return sendJSON(res, 404, { ok: false, error: 'كود التفعيل غير صحيح.' });
      }
      if (license.status === 'revoked') {
        return sendJSON(res, 403, { ok: false, error: 'هذا الكود تم إلغاؤه. تواصل مع الشركة البائعة.' });
      }
      if (!license.devices) license.devices = [];

      const alreadyBound = license.devices.find(d => d.deviceId === deviceId);
      if (alreadyBound) {
        alreadyBound.lastSeenAt = new Date().toISOString();
        db.saveLicense(license);
        return sendJSON(res, 200, { ok: true, message: 'تم التحقق من التفعيل بنجاح.' });
      }

      if (license.devices.length >= (license.maxDevices || 1)) {
        return sendJSON(res, 403, {
          ok: false,
          error: `هذا الكود مفعّل بالفعل على الحد الأقصى المسموح من الأجهزة (${license.maxDevices || 1}). لا يمكن استخدامه على جهاز إضافي.`
        });
      }

      license.devices.push({
        deviceId,
        deviceLabel: deviceLabel || 'غير معروف',
        activatedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
      });
      db.saveLicense(license);
      return sendJSON(res, 200, { ok: true, message: 'تم تفعيل الكود بنجاح على هذا الجهاز.' });
    }

    /* ============== التحقق الدوري من صلاحية التفعيل ============== */
    if (pathName === '/api/validate' && req.method === 'POST') {
      const { key, deviceId } = await readBody(req);
      if (!key || !deviceId) {
        return sendJSON(res, 400, { ok: false, error: 'بيانات غير مكتملة.' });
      }
      const license = db.findByKey(key.trim());
      if (!license || license.status === 'revoked') {
        return sendJSON(res, 403, { ok: false, error: 'الترخيص غير صالح أو تم إلغاؤه.' });
      }
      const bound = (license.devices || []).find(d => d.deviceId === deviceId);
      if (!bound) {
        return sendJSON(res, 403, { ok: false, error: 'هذا الجهاز غير مفعّل على هذا الكود.' });
      }
      bound.lastSeenAt = new Date().toISOString();
      db.saveLicense(license);
      return sendJSON(res, 200, { ok: true });
    }

    /* ============== [إدارة] إنشاء كود جديد ============== */
    if (pathName === '/api/admin/create-key' && req.method === 'POST') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'غير مصرح.' });
      const { companyName, maxDevices } = await readBody(req);
      const license = {
        key: generateKey(),
        companyName: companyName || 'غير محدد',
        maxDevices: parseInt(maxDevices) || 1,
        status: 'active',
        devices: [],
        createdAt: new Date().toISOString()
      };
      db.saveLicense(license);
      return sendJSON(res, 200, { ok: true, license });
    }

    /* ============== [إدارة] عرض كل الأكواد ============== */
    if (pathName === '/api/admin/list-keys' && req.method === 'GET') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'غير مصرح.' });
      return sendJSON(res, 200, { ok: true, licenses: db.readAll() });
    }

    /* ============== [إدارة] إلغاء كود ============== */
    if (pathName === '/api/admin/revoke-key' && req.method === 'POST') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'غير مصرح.' });
      const { key } = await readBody(req);
      const license = db.findByKey(key);
      if (!license) return sendJSON(res, 404, { ok: false, error: 'الكود غير موجود.' });
      license.status = 'revoked';
      db.saveLicense(license);
      return sendJSON(res, 200, { ok: true });
    }

    /* ============== [إدارة] فصل جهاز من كود (لو العميل غيّر جهازه) ============== */
    if (pathName === '/api/admin/unbind-device' && req.method === 'POST') {
      if (!isAdmin(req)) return sendJSON(res, 401, { ok: false, error: 'غير مصرح.' });
      const { key, deviceId } = await readBody(req);
      const license = db.findByKey(key);
      if (!license) return sendJSON(res, 404, { ok: false, error: 'الكود غير موجود.' });
      license.devices = (license.devices || []).filter(d => d.deviceId !== deviceId);
      db.saveLicense(license);
      return sendJSON(res, 200, { ok: true });
    }

    sendJSON(res, 404, { ok: false, error: 'مسار غير موجود.' });
  } catch (err) {
    sendJSON(res, 500, { ok: false, error: 'خطأ في السيرفر: ' + err.message });
  }
});

server.listen(PORT, () => {
  console.log(`✅ سيرفر الترخيص يعمل على المنفذ ${PORT}`);
  console.log(`   مثال: http://localhost:${PORT}/api/activate`);
});
