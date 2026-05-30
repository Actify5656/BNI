import fs   from 'fs';
import path from 'path';
import cfg  from '../config.js';

export function archiveExistingFiles() {
  fs.mkdirSync(cfg.PROFILE_DIR, { recursive: true });
  fs.mkdirSync(cfg.MOVED_DIR,   { recursive: true });

  const files = fs.readdirSync(cfg.PROFILE_DIR).filter(f => f.endsWith('.xlsx'));
  if (!files.length) { console.log('[Archive] Nothing to archive.'); return; }

  const stamp = formatTimestamp(new Date());
  for (const file of files) {
    const base = path.basename(file, '.xlsx');
    const dest = path.join(cfg.MOVED_DIR, `${base}-${stamp}.xlsx`);
    fs.renameSync(path.join(cfg.PROFILE_DIR, file), dest);
    console.log(`[Archive] ${file} → MOVED_FILES/${base}-${stamp}.xlsx`);
  }
}

export function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

export function readTextFile(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

// Mirror PAD regex exactly:
// Email: [a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}
// Phone: \+?\d[\d\s-]{6,}
// Website: https?:\/\/(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/\S*)?
export function parseContactDetails(text) {
  const emailRx   = /[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const phoneRx   = /\+?\d[\d\s\-()+.]{6,}/g;
  const websiteRx = /https?:\/\/(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\/[^\s<"')]*)?/g;

  // Filter BNI emails
  const emails = [...new Set(text.match(emailRx) || [])]
    .filter(e => !e.toLowerCase().includes('bni'));

  // PAD uses first phone match joined with '/'
  const phones = [...new Set(text.match(phoneRx) || [])]
    .map(p => p.trim())
    .filter(p => p.replace(/\D/g, '').length >= 7);

  // Filter BNI websites
  const websites = [...new Set(text.match(websiteRx) || [])]
    .filter(w =>
      !w.includes('bniconnectglobal') &&
      !w.includes('bni.com') &&
      !w.includes('bni.in')
    );

  return {
    email:   emails.length   ? emails[0]    : 'Not Found',
    phone:   phones.length   ? phones[0]    : 'Not Found',
    website: websites.length ? websites[0]  : 'Not Found',
  };
}

export function formatTimestamp(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}_${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}