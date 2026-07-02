const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'licenses.json');

function readAll() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function writeAll(licenses) {
  fs.writeFileSync(DB_PATH, JSON.stringify(licenses, null, 2), 'utf8');
}

function findByKey(key) {
  return readAll().find(l => l.key === key);
}

function saveLicense(license) {
  const all = readAll();
  const idx = all.findIndex(l => l.key === license.key);
  if (idx >= 0) {
    all[idx] = license;
  } else {
    all.push(license);
  }
  writeAll(all);
}

function deleteLicense(key) {
  const all = readAll().filter(l => l.key !== key);
  writeAll(all);
}

module.exports = { readAll, writeAll, findByKey, saveLicense, deleteLicense };
