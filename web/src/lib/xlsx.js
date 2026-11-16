// Minimal .xlsx reader (no dependencies): unzips with DecompressionStream and reads the
// first worksheet's cell values. Enough for the "A = date, B = items" calendar sheet.

const td = new TextDecoder();

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Read every file in a ZIP archive → Map(name → Uint8Array). */
export async function unzip(buffer) {
  const data = new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let eocd = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('엑셀(.xlsx) 파일이 아닙니다.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('파일이 손상되었습니다.');
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = td.decode(data.subarray(p + 46, p + 46 + nameLen));
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const raw = data.subarray(start, start + size);
    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflateRaw(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unescapeXml = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');

const colIndex = (ref) => {
  const letters = ref.match(/^[A-Z]+/)[0];
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** First worksheet as rows of cell values: numbers stay numbers, strings stay strings. */
export async function readFirstSheet(buffer) {
  const files = await unzip(buffer);
  const xml = (name) => (files.has(name) ? td.decode(files.get(name)) : '');
  const shared = [...xml('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  // Resolve the first sheet through workbook.xml + its relationships (fallback: sheet1.xml).
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const firstSheet = xml('xl/workbook.xml').match(/<sheet\b[^>]*r:id="([^"]+)"/);
  if (firstSheet) {
    const rel = xml('xl/_rels/workbook.xml.rels').match(new RegExp(`<Relationship\\b[^>]*Id="${firstSheet[1]}"[^>]*Target="([^"]+)"`))
      || xml('xl/_rels/workbook.xml.rels').match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstSheet[1]}"`));
    if (rel) sheetPath = rel[1].startsWith('/') ? rel[1].slice(1) : `xl/${rel[1].replace(/^\.\//, '')}`;
  }
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error('엑셀 시트를 찾을 수 없습니다.');

  const rows = [];
  for (const rm of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1];
      const body = cm[2] || '';
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = null;
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'str') value = unescapeXml(v ?? '');
      else if (type === 'b') value = v === '1';
      else if (v != null) value = Number(v);
      row[ref ? colIndex(ref) : row.length] = value;
    }
    rows.push(row);
  }
  return rows;
}

const pad = (n) => String(n).padStart(2, '0');

/** Excel serial day number or a date-like string → "YYYY-MM-DD" (null if not a date). */
export function toDateString(value) {
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 864e5);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof value !== 'string') return null;
  const s = value.trim();
  let m = s.match(/^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2}|\d{4})$/); // mm-dd-yy (US style, as in the sample)
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(m[1])}-${pad(m[2])}`;
  return null;
}

const DONE_MARK = /^[☑✓✔√]\s*/;
const BULLET = /^(?:[•·▪◦●○■□\-*]|\d+[.)])\s*/;

/** Turn sheet rows (A = date, B = text, one item per line) into events. */
export function rowsToEvents(rows) {
  const events = [];
  let skippedRows = 0;
  for (const row of rows) {
    const date = toDateString(row?.[0]);
    const text = row?.[1];
    if (!date || text == null || text === '') { if (row?.some((v) => v != null && v !== '')) skippedRows++; continue; }
    for (const rawLine of String(text).split(/\r?\n/)) {
      let line = rawLine.trim();
      if (!line) continue;
      let done = false;
      if (DONE_MARK.test(line)) { done = true; line = line.replace(DONE_MARK, ''); }
      line = line.replace(BULLET, '').trim();
      if (DONE_MARK.test(line)) { done = true; line = line.replace(DONE_MARK, '').trim(); }
      if (line) events.push({ date, title: line, done });
    }
  }
  return { events, skippedRows };
}

export async function parseCalendarXlsx(buffer) {
  return rowsToEvents(await readFirstSheet(buffer));
}
