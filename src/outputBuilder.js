// import path             from 'path';
// import cfg              from '../config.js';
// import * as excelHelper from './excelHelper.js';
// import * as fileUtils   from './fileUtils.js';

// // Columns mirror PAD exactly:
// // A=Name, B=Chapter, C=Company, D=City, E=Industry and Classification
// // F=Email, G=PhoneNo, H=Website, I=Status
// const HEADERS = [
//   'Name', 'Chapter', 'Company', 'City', 'Industry and Classification',
//   'Email', 'PhoneNo', 'Website', 'Status',
// ];

// // Column numbers (1-based for ExcelJS)
// const COL = { Email: 6, Phone: 7, Website: 8, Status: 9 };

// export function getOutputPath(countryName) {
//   fileUtils.ensureDir(cfg.PROFILE_DIR);
//   return path.join(cfg.PROFILE_DIR, `${countryName}.xlsx`);
// }

// export async function createOutputFile(countryName, members) {
//   const filePath = getOutputPath(countryName);
//   console.log(`[Output] Creating: ${filePath}`);
//   const dataRows = members.map(m => [
//     m.Name  || '',
//     m.Chapter || '',
//     m.Company || '',
//     m.City    || '',
//     m.IndustryClassification || '',
//     '', '', '', '',  // Email, Phone, Website, Status — filled per-member later
//   ]);
//   await excelHelper.writeSheet(filePath, HEADERS, dataRows);
//   console.log(`[Output] Created with ${members.length} rows.`);
//   return filePath;
// }

// export async function readOutputRows(countryName) {
//   return excelHelper.readAllRows(getOutputPath(countryName));
// }

// export async function writeContactToRow(countryName, memberName, contacts) {
//   const filePath = getOutputPath(countryName);
//   const rowIndex = await excelHelper.findRowByValue(filePath, memberName);
//   if (rowIndex === -1) {
//     console.warn(`[Output] Row not found for: "${memberName}"`);
//     return;
//   }
//   // Write all 4 cells in one file open/save (efficient)
//   await excelHelper.writeCells(filePath, [
//     { rowIndex, colIndex: COL.Email,   value: contacts.email   },
//     { rowIndex, colIndex: COL.Phone,   value: contacts.phone   },
//     { rowIndex, colIndex: COL.Website, value: contacts.website },
//     { rowIndex, colIndex: COL.Status,  value: 'DONE'           },
//   ]);
//   console.log(`[Output] Row ${rowIndex} → DONE`);
// }

// export function isAlreadyDone(row) {
//   return String(row['Status'] || row['status'] || '').trim().toUpperCase() === 'DONE';
// }

// src/outputBuilder.js
import path              from 'path';
import cfg               from '../config.js';
import * as excelHelper  from './excelHelper.js';
import * as fileUtils    from './fileUtils.js';

// ── Build output file path ────────────────────────────────────────────────────
export function getOutputPath(countryName) {
  fileUtils.ensureDir(cfg.PROFILE_DIR);
  return path.join(cfg.PROFILE_DIR, `${countryName}.xlsx`);
}

// ── Create multi-sheet workbook (one sheet per category) ─────────────────────
export async function createOutputFile(countryName, categories) {
  const filePath = getOutputPath(countryName);
  await excelHelper.createMultiSheetWorkbook(filePath, categories);
  return filePath;
}

// ── Append extracted members into their category sheet ───────────────────────
export async function appendMembersToSheet(countryName, categoryName, members) {
  const filePath = getOutputPath(countryName);
  console.log(`[Output] Writing ${members.length} members to sheet "${categoryName.substring(0,31)}"`);
  await excelHelper.appendRowsToSheet(filePath, categoryName, members);
}

// ── Write contact details back to the correct sheet row ──────────────────────
export async function writeContactToRow(countryName, categoryName, memberName, contacts) {
  const filePath = getOutputPath(countryName);
  await excelHelper.writeCellInSheet(filePath, categoryName, memberName, contacts);
}

// ── Check if member is already DONE in their sheet ───────────────────────────
export async function isAlreadyDone(countryName, categoryName, memberName) {
  const filePath = getOutputPath(countryName);
  return excelHelper.isRowDoneInSheet(filePath, categoryName, memberName);
}

// ── Read all rows from a specific sheet ──────────────────────────────────────
export async function readSheetRows(countryName, categoryName) {
  const filePath = getOutputPath(countryName);
  return excelHelper.readAllRows(filePath, categoryName);
}