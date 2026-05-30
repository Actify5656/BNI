import ExcelJS from 'exceljs';

export async function readAllRows(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];

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

export async function writeSheet(filePath, headers, dataRows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(headers);
  for (const row of dataRows) ws.addRow(row);
  await wb.xlsx.writeFile(filePath);
}

export async function writeCells(filePath, updates) {
  // updates = [{ rowIndex, colIndex, value }, ...]
  // Load once, write all, save once — avoids repeated file I/O
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const ws = wb.worksheets[0];
  for (const { rowIndex, colIndex, value } of updates) {
    ws.getCell(rowIndex, colIndex).value = value;
  }
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