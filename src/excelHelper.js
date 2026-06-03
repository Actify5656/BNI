// import ExcelJS from 'exceljs';

// export async function readAllRows(filePath) {
//   const wb = new ExcelJS.Workbook();
//   await wb.xlsx.readFile(filePath);
//   const ws = wb.worksheets[0];

//   const headers = [];
//   ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
//     headers[colNum] = String(cell.value ?? '').trim();
//   });

//   const rows = [];
//   ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
//     if (rowNum === 1) return;
//     const obj = {};
//     row.eachCell({ includeEmpty: true }, (cell, colNum) => {
//       obj[headers[colNum] || `col${colNum}`] = cell.value ?? '';
//     });
//     obj.__rowNum = rowNum;
//     rows.push(obj);
//   });
//   return rows;
// }

// export async function writeSheet(filePath, headers, dataRows) {
//   const wb = new ExcelJS.Workbook();
//   const ws = wb.addWorksheet('Sheet1');
//   ws.addRow(headers);
//   for (const row of dataRows) ws.addRow(row);
//   await wb.xlsx.writeFile(filePath);
// }

// export async function writeCells(filePath, updates) {
//   // updates = [{ rowIndex, colIndex, value }, ...]
//   // Load once, write all, save once — avoids repeated file I/O
//   const wb = new ExcelJS.Workbook();
//   await wb.xlsx.readFile(filePath);
//   const ws = wb.worksheets[0];
//   for (const { rowIndex, colIndex, value } of updates) {
//     ws.getCell(rowIndex, colIndex).value = value;
//   }
//   await wb.xlsx.writeFile(filePath);
// }

// export async function findRowByValue(filePath, searchValue) {
//   const wb = new ExcelJS.Workbook();
//   await wb.xlsx.readFile(filePath);
//   const ws = wb.worksheets[0];
//   let found = -1;
//   ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
//     if (found !== -1) return;
//     row.eachCell({ includeEmpty: false }, cell => {
//       if (String(cell.value).trim() === String(searchValue).trim()) found = rowNum;
//     });
//   });
//   return found;
// }











// src/excelHelper.js
import ExcelJS from 'exceljs';
import fs      from 'fs';

// ── Read all rows from a specific sheet (row 1 = headers) ────────────────────
export async function readAllRows(filePath, sheetName = null) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = sheetName ? wb.getWorksheet(sheetName) : wb.worksheets[0];
  if (!ws) return [];

  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum] = String(cell.value ?? '').trim();
  });

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const obj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      obj[headers[colNum] || `col${colNum}`] = cell.value ?? '';
    });
    obj.__rowNum = rowNum;
    rows.push(obj);
  });
  return rows;
}

// ── Read Category_Country.xlsx → returns { country, categories[] } ────────────
export async function readCategoryCountry(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

  // Row 1 = headers: Country, Category1, Category2, ...
  // Row 2 = values
  const headers = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, colNum) => {
    headers[colNum] = String(cell.value ?? '').trim();
  });

  const results = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum === 1) return;
    const country    = String(row.getCell(1).value ?? '').trim();
    const categories = [];
    for (let col = 2; col <= headers.length; col++) {
      const val = String(row.getCell(col).value ?? '').trim();
      if (val) categories.push(val);
    }
    if (country) results.push({ country, categories });
  });
  return results;
}

// ── Create output workbook with one sheet per category ────────────────────────
// ── Sanitize sheet name: remove Excel-forbidden characters, max 31 chars ──────
function sanitizeSheetName(name) {
  return name
    .replace(/[*?:\\/\[\]]/g, '-')  // replace * ? : \ / [ ] with dash
    .substring(0, 31)               // Excel max sheet name length
    .trim();
}

// ── Create output workbook with one sheet per category ────────────────────────
export async function createMultiSheetWorkbook(filePath, categories) {
  const HEADERS = ['Name', 'Chapter', 'Company', 'City',
                   'Industry and Classification', 'Email', 'PhoneNo', 'Website', 'Status'];

  const wb = new ExcelJS.Workbook();

  for (const cat of categories) {
    const sheetName = sanitizeSheetName(cat);   // FIX: sanitize before using
    const ws = wb.addWorksheet(sheetName);

    const headerRow = ws.addRow(HEADERS);
    headerRow.font  = { bold: true };
    headerRow.fill  = {
      type: 'pattern', pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' },
    };

    ws.columns = [
      { width: 25 }, { width: 20 }, { width: 25 }, { width: 15 },
      { width: 35 }, { width: 30 }, { width: 18 }, { width: 30 }, { width: 10 },
    ];
  }

  await wb.xlsx.writeFile(filePath);
  console.log(`[Excel] Created ${categories.length}-sheet workbook: ${filePath}`);
}


// ── Append member rows to a specific sheet ────────────────────────────────────
export async function appendRowsToSheet(filePath, sheetName, members) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const safeName = sanitizeSheetName(sheetName);   // FIX: sanitize for lookup
  let ws = wb.getWorksheet(safeName);
  if (!ws) {
    console.warn(`[Excel] Sheet not found: "${safeName}" — creating it`);
    ws = wb.addWorksheet(safeName);
    ws.addRow(['Name','Chapter','Company','City','Industry and Classification',
               'Email','PhoneNo','Website','Status']);
  }

  for (const m of members) {
    ws.addRow([
      m.Name || '', m.Chapter || '', m.Company || '',
      m.City || '', m.IndustryClassification || '',
      '', '', '', '',
    ]);
  }

  await wb.xlsx.writeFile(filePath);
}

// ── Write contact data to a specific row in a specific sheet ──────────────────
export async function writeCellInSheet(filePath, sheetName, memberName, contacts) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const safeName = sanitizeSheetName(sheetName);   // FIX: sanitize for lookup
  const ws = wb.getWorksheet(safeName);
  if (!ws) { console.warn(`[Excel] Sheet not found: ${safeName}`); return; }

  let targetRow = -1;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (targetRow !== -1) return;
    if (String(row.getCell(1).value ?? '').trim() === memberName.trim()) {
      targetRow = rowNum;
    }
  });

  if (targetRow === -1) {
    console.warn(`[Excel] Row not found for "${memberName}" in sheet "${safeName}"`);
    return;
  }

  ws.getCell(targetRow, 6).value = contacts.email;
  ws.getCell(targetRow, 7).value = contacts.phone;
  ws.getCell(targetRow, 8).value = contacts.website;
  ws.getCell(targetRow, 9).value = 'DONE';

  await wb.xlsx.writeFile(filePath);
  console.log(`[Excel] Row ${targetRow} updated in sheet "${safeName}"`);
}

// ── Check if a member row is already DONE in a sheet ─────────────────────────
export async function isRowDoneInSheet(filePath, sheetName, memberName) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  const safeName = sanitizeSheetName(sheetName);   // FIX: sanitize for lookup
  const ws = wb.getWorksheet(safeName);
  if (!ws) return false;

  let done = false;
  ws.eachRow({ includeEmpty: false }, (row) => {
    if (done) return;
    if (String(row.getCell(1).value ?? '').trim() === memberName.trim()) {
      done = String(row.getCell(9).value ?? '').trim().toUpperCase() === 'DONE';
    }
  });
  return done;
}

// ── Legacy: single-sheet helpers (kept for compatibility) ─────────────────────
export async function writeSheet(filePath, headers, dataRows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  for (const row of dataRows) ws.addRow(row);
  await wb.xlsx.writeFile(filePath);
}

export async function writeCell(filePath, rowIndex, colLetter, value) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  ws.getCell(rowIndex, colLetterToNumber(colLetter)).value = value;
  await wb.xlsx.writeFile(filePath);
}

export async function findRowByValue(filePath, searchValue) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  let found = -1;
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (found !== -1) return;
    row.eachCell({ includeEmpty: false }, cell => {
      if (String(cell.value).trim() === String(searchValue).trim()) found = rowNum;
    });
  });
  return found;
}

function colLetterToNumber(letter) {
  let n = 0;
  for (const ch of letter.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}


