import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { parseCalendarXlsx, toDateString } from './xlsx.js';

/** Build a tiny zip (deflate) in memory — enough to stand in for an .xlsx file. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBuf = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const sheetXlsx = (rowsXml, shared) => zip({
  'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="CalendarTask" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml': `<sst>${shared.map((s) => `<si><t xml:space="preserve">${s}</t></si>`).join('')}</sst>`,
  'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rowsXml}</sheetData></worksheet>`,
});

test('reads the CalendarTask layout: A = Excel date, B = bullet lines', async () => {
  const file = sheetXlsx(
    '<row r="1"><c r="A1" s="1"><v>46379</v></c><c r="B1" t="s"><v>0</v></c></row>'
    + '<row r="2"><c r="A2" s="1"><v>46363</v></c><c r="B2" t="s"><v>1</v></c></row>'
    + '<row r="3"><c r="A3" t="inlineStr"><is><t>2026-11-18</t></is></c><c r="B3" t="inlineStr"><is><t>☑ 실천 나눔 출장</t></is></c></row>',
    ['• 창의돋음제출(16시간)', '• 수학점핑 만족도조사\n• 수학점핑 결과보고(1/29) &amp; 정리'],
  );
  const { events, skippedRows } = await parseCalendarXlsx(file);
  assert.equal(skippedRows, 0);
  assert.deepEqual(events, [
    { date: '2026-12-23', title: '창의돋음제출(16시간)', done: false },
    { date: '2026-12-07', title: '수학점핑 만족도조사', done: false },
    { date: '2026-12-07', title: '수학점핑 결과보고(1/29) & 정리', done: false },
    { date: '2026-11-18', title: '실천 나눔 출장', done: true },
  ]);
});

test('date strings in common formats', () => {
  assert.equal(toDateString('2026.11.5'), '2026-11-05');
  assert.equal(toDateString('2026년 11월 5일'), '2026-11-05');
  assert.equal(toDateString('12-23-26'), '2026-12-23');
  assert.equal(toDateString('메모'), null);
});

test('rejects files that are not xlsx', async () => {
  await assert.rejects(parseCalendarXlsx(Buffer.from('not a zip at all, just some text bytes here')), /xlsx/);
});
