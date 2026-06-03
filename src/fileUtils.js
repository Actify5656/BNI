// import fs   from 'fs';
// import path from 'path';
// import cfg  from '../config.js';

// export function archiveExistingFiles() {
//   fs.mkdirSync(cfg.PROFILE_DIR, { recursive: true });
//   fs.mkdirSync(cfg.MOVED_DIR,   { recursive: true });

//   const files = fs.readdirSync(cfg.PROFILE_DIR).filter(f => f.endsWith('.xlsx'));
//   if (!files.length) { console.log('[Archive] Nothing to archive.'); return; }

//   const stamp = formatTimestamp(new Date());
//   for (const file of files) {
//     const base = path.basename(file, '.xlsx');
//     const dest = path.join(cfg.MOVED_DIR, `${base}-${stamp}.xlsx`);
//     fs.renameSync(path.join(cfg.PROFILE_DIR, file), dest);
//     console.log(`[Archive] ${file} → MOVED_FILES/${base}-${stamp}.xlsx`);
//   }
// }

// export function writeTextFile(filePath, content) {
//   fs.mkdirSync(path.dirname(filePath), { recursive: true });
//   fs.writeFileSync(filePath, content, 'utf8');
// }

// export function readTextFile(filePath) {
//   return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
// }

// // Mirror PAD regex exactly:
// // Email: [a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
// // Phone: \+?\d[\d\s-]{6,}
// // Website: https?:\/\/(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/\S*)?
// export function parseContactDetails(text) {
//   const emailRx   = /[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
//   const phoneRx   = /\+?\d[\d\s\-()+.]{6,}/g;
//   const websiteRx = /https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s<"')]*)?/g;

//   // Filter BNI emails
//   const emails = [...new Set(text.match(emailRx) || [])]
//     .filter(e => !e.toLowerCase().includes('bni'));

//   // PAD uses first phone match joined with '/'
//   const phones = [...new Set(text.match(phoneRx) || [])]
//     .map(p => p.trim())
//     .filter(p => p.replace(/\D/g, '').length >= 7);

//   // Filter BNI websites
//   const websites = [...new Set(text.match(websiteRx) || [])]
//     .filter(w =>
//       !w.includes('bniconnectglobal') &&
//       !w.includes('bni.com') &&
//       !w.includes('bni.in')
//     );

//   return {
//     email:   emails.length   ? emails[0]    : 'Not Found',
//     phone:   phones.length   ? phones[0]    : 'Not Found',
//     website: websites.length ? websites[0]  : 'Not Found',
//   };
// }

// export function formatTimestamp(date) {
//   const p = n => String(n).padStart(2, '0');
//   return `${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
// }

// export function ensureDir(dir) {
//   fs.mkdirSync(dir, { recursive: true });
// }


// src/fileUtils.js
import fs        from 'fs';
import path      from 'path';
import ExcelJS   from 'exceljs';
import cfg       from '../config.js';

// ─────────────────────────────────────────────────────────────────────────────
//  CLEAN THEN ARCHIVE
//  Called instead of the old archiveExistingFiles().
//  For every .xlsx in PROFILE_DIR:
//    1. Clean all dirty data in-place (phone / email / website)
//    2. Save the cleaned version back to PROFILE_DIR
//    3. Move it to MOVED_DIR with a timestamp suffix
// ─────────────────────────────────────────────────────────────────────────────
export async function cleanAndArchive() {
  fs.mkdirSync(cfg.PROFILE_DIR, { recursive: true });
  fs.mkdirSync(cfg.MOVED_DIR,   { recursive: true });

  const files = fs.readdirSync(cfg.PROFILE_DIR).filter(f => f.endsWith('.xlsx'));
  if (!files.length) { console.log('[Archive] Nothing to archive.'); return; }

  const stamp = formatTimestamp(new Date());

  for (const file of files) {
    const srcPath = path.join(cfg.PROFILE_DIR, file);
    console.log(`\n[Clean] Processing: ${file}`);

    // ── Load workbook ─────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(srcPath);
    const ws = wb.worksheets[0];

    // ── Find column indices from header row ───────────────────────────────
    const headerRow = ws.getRow(1);
    const colIndex  = {};
    headerRow.eachCell((cell, colNum) => {
      colIndex[String(cell.value).trim()] = colNum;
    });

    const emailCol   = colIndex['Email']   || 6;
    const phoneCol   = colIndex['PhoneNo'] || 7;
    const websiteCol = colIndex['Website'] || 8;

    let cleaned = 0;

    // ── Clean every data row ──────────────────────────────────────────────
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum === 1) return; // skip header

      const rawEmail   = String(row.getCell(emailCol).value   ?? '');
      const rawPhone   = String(row.getCell(phoneCol).value   ?? '');
      const rawWebsite = String(row.getCell(websiteCol).value ?? '');

      const cleanedEmail   = cleanEmail(rawEmail);
      const cleanedPhone   = cleanPhone(rawPhone);
      const cleanedWebsite = cleanWebsite(rawWebsite);

      if (
        cleanedEmail   !== rawEmail   ||
        cleanedPhone   !== rawPhone   ||
        cleanedWebsite !== rawWebsite
      ) {
        row.getCell(emailCol).value   = cleanedEmail;
        row.getCell(phoneCol).value   = cleanedPhone;
        row.getCell(websiteCol).value = cleanedWebsite;
        cleaned++;
      }
    });

    console.log(`[Clean] Fixed ${cleaned} rows.`);

    // ── Save cleaned file back to same path ───────────────────────────────
    await wb.xlsx.writeFile(srcPath);

    // ── Move to MOVED_FILES with timestamp ────────────────────────────────
    const base    = path.basename(file, '.xlsx');
    const destPath = path.join(cfg.MOVED_DIR, `${base}-${stamp}.xlsx`);
    fs.renameSync(srcPath, destPath);
    console.log(`[Archive] Moved → MOVED_FILES/${base}-${stamp}.xlsx`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  EMAIL CLEANER
//  Issues seen in data:
//    - Multiple emails separated by ", "  → keep all, they're valid
//    - Uppercase emails                   → lowercase them
//    - "Not Found" / "ERROR"              → keep as-is
// ─────────────────────────────────────────────────────────────────────────────
function cleanEmail(raw) {
  if (!raw || raw === 'Not Found' || raw === 'ERROR' || raw === 'No URL') return raw;

  // Split on comma, newline, semicolon — multiple emails possible
  const parts = raw.split(/[,;\n]+/).map(e => e.trim().toLowerCase()).filter(Boolean);

  // Validate each part looks like an email
  const valid = parts.filter(e => /^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e));

  return valid.length ? valid.join(', ') : 'Not Found';
}

// ─────────────────────────────────────────────────────────────────────────────
//  PHONE CLEANER
//  Issues seen in data:
//    - Duplicated number with \n\n between: "9847500075\n\n9847500075" → "9847500075"
//    - Two different numbers with \n\n: "+919447681968\n\n+919961260163" → first one
//    - Split number across lines: "1352\n\n 7346" → join → "13527346" → too short → Not Found
//    - Date stored as phone: "12.03.2026"          → Not Found
//    - Junk fragments: "42", "135", "91 - 94"      → Not Found
//    - Valid formats: "+91 9876543210", "9876543210", "+917988621427"
// ─────────────────────────────────────────────────────────────────────────────
function cleanPhone(raw) {
  if (!raw || raw === 'Not Found' || raw === 'ERROR' || raw === 'No URL') return raw;

  // Split on newline — BNI profile pages sometimes inject duplicate numbers
  const parts = raw.split(/\n+/).map(p => p.trim()).filter(Boolean);

  // Deduplicate (handles "9847500075\n\n9847500075" case)
  const unique = [...new Set(parts)];

  // Validate each part
  const valid = unique.filter(p => isValidPhone(p));

  if (valid.length > 0) {
    // Return the best (longest/most complete) number
    valid.sort((a, b) => b.replace(/\D/g, '').length - a.replace(/\D/g, '').length);
    return valid[0];
  }

  // Try joining split fragments (e.g. "1352\n\n 7346" → "13527346")
  const joined = parts.join('').replace(/\s/g, '');
  if (isValidPhone(joined)) return joined;

  return 'Not Found';
}

function isValidPhone(p) {
  if (!p) return false;
  // Remove all formatting characters
  const digits = p.replace(/[\s\-().+]/g, '');
  // Must be 7–15 digits, not look like a date (12.03.2026), not too short
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(p)) return false;  // date pattern
  if (digits.length < 7 || digits.length > 15) return false;
  if (!/^\d+$/.test(digits)) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  WEBSITE CLEANER
//  Issues seen in data:
//    - "http://WWW.COMINGSOON"                → Not Found  (no TLD)
//    - "http://WWW.Gajanandcaterersanand"     → Not Found  (no TLD)
//    - "http://Www.Facebook"                  → Not Found  (no TLD)
//    - "http://www.aaharacatering.com"        → valid, lowercase
//    - "http://dindigulbriyanikadai.in/"      → valid
//    - "http://tawalogy.com/?i=1"             → valid
// ─────────────────────────────────────────────────────────────────────────────
function cleanWebsite(raw) {
  if (!raw || raw === 'Not Found' || raw === 'ERROR' || raw === 'No URL') return raw;

  // Lowercase and trim
  const url = raw.trim().toLowerCase();

  // Must have a real TLD (dot followed by 2-6 alpha chars at domain level)
  // Reject bare domains with no TLD: "http://www.comingsoon", "http://www.facebook"
  try {
    const parsed   = new URL(url);
    const hostname = parsed.hostname; // e.g. "www.aaharacatering.com"
    const parts    = hostname.split('.');

    // Need at least: ["www", "something", "com"] or ["something", "co", "in"]
    if (parts.length < 2) return 'Not Found';

    const tld = parts[parts.length - 1];
    // TLD must be 2-6 letters (com, in, co, org, etc.)
    if (!/^[a-z]{2,6}$/.test(tld)) return 'Not Found';

    // Reject known fake/incomplete domains
    const fakeDomains = ['comingsoon', 'facebook', 'instagram', 'coming soon'];
    if (fakeDomains.some(f => hostname.includes(f))) return 'Not Found';

    // Valid — return normalized lowercase
    return url;
  } catch {
    return 'Not Found';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Other exports (unchanged)
// ─────────────────────────────────────────────────────────────────────────────
export function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

export function readTextFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

export function parseContactDetails(text) {
  const emailRx   = /[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRx   = /(?:\+91[\s-]?)?[6-9]\d{9}|\+?\d[\d\s\-()+.]{7,14}/g;
  const websiteRx = /https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s<"')]*)?/g;

  const emails   = [...new Set(text.match(emailRx)   || [])].filter(e => !e.toLowerCase().includes('bni'));
  const phones   = [...new Set(text.match(phoneRx)   || [])].map(p => p.trim()).filter(p => p.length >= 7);
  const websites = [...new Set(text.match(websiteRx) || [])].filter(
    w => !w.includes('bniconnectglobal') && !w.includes('bni.com')
  );

  return {
    email:   emails.length   ? emails.join(', ')   : 'Not Found',
    phone:   phones.length   ? phones[0]           : 'Not Found',
    website: websites.length ? websites[0]         : 'Not Found',
  };
}

export function formatTimestamp(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}