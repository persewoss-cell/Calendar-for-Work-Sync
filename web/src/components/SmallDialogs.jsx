import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { api } from '../lib/api.js';
import { download, fromICS, toCSV, toICS } from '../lib/ics.js';
import { todayIn } from '../lib/date.js';
import { parseCalendarXlsx } from '../lib/xlsx.js';

export function SearchDialog({ onPick, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  useEffect(() => {
    if (!q.trim()) return setResults(null);
    const t = setTimeout(() => api.search(q.trim()).then(setResults).catch(() => setResults([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title="내용 검색" onClose={onClose} width={480}>
      <div className="search-box">
        <Icon name="search" />
        <input className="input" autoFocus placeholder="제목이나 메모로 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="search-results">
        {results?.length === 0 && <li className="muted">검색 결과가 없습니다.</li>}
        {results?.map((e) => (
          <li key={e._id}>
            <button onClick={() => onPick(e.date)}>
              <span className="sr-date">{e.date}{e.startTime ? ` ${e.startTime}` : ''}</span>
              <span className="sr-title">{e.title}</span>
              {e.memo && <span className="sr-memo">{e.memo.slice(0, 60)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function DateDialog({ value, onPick, onClose }) {
  const [d, setD] = useState(value);
  return (
    <Modal title="날짜 선택" onClose={onClose} width={340}
      footer={<><button className="btn" onClick={onClose}>취소</button><button className="btn primary" onClick={() => onPick(d)}>이동</button></>}>
      <input type="date" className="input" value={d} onChange={(e) => setD(e.target.value)} autoFocus />
      <div className="quick-dates">
        <button className="btn ghost" onClick={() => onPick(todayIn())}>오늘</button>
      </div>
    </Modal>
  );
}

export function ExportDialog({ mode, s, onClose, onImported }) {
  const [status, setStatus] = useState('');
  const [preview, setPreview] = useState(null); // xlsx: { fresh, dup, from, to, name }
  const fileRef = useRef(null);
  const stamp = todayIn(s.timezone);

  const doExport = async (fmt) => {
    setStatus('내보내는 중…');
    const events = await api.exportEvents();
    if (fmt === 'json') {
      const [notes, countdowns] = await Promise.all([api.notes(), api.countdowns()]);
      download(`calendar-backup-${stamp}.json`, JSON.stringify({ version: 1, exportedAt: new Date(), settings: s, events, notes, countdowns }, null, 2), 'application/json');
    } else if (fmt === 'ics') {
      download(`calendar-${stamp}.ics`, toICS(events, s.timezone), 'text/calendar');
    } else {
      download(`calendar-${stamp}.csv`, toCSV(events), 'text/csv');
    }
    setStatus(`${events.length}개 일정을 내보냈습니다.`);
  };

  // Excel (A = 날짜, B = 일정 줄): show what will be added, skip items that already exist.
  const previewXlsx = async (file) => {
    setStatus('엑셀 읽는 중…');
    setPreview(null);
    try {
      const { events, skippedRows } = await parseCalendarXlsx(await file.arrayBuffer());
      if (!events.length) return setStatus('가져올 일정이 없습니다. A열에 날짜, B열에 일정이 있는지 확인하세요.');
      const existing = new Set((await api.exportEvents()).map((e) => `${e.date}|${e.title.trim()}`));
      const seen = new Set();
      const fresh = [];
      let dup = 0;
      const perDay = {};
      for (const e of events) {
        const key = `${e.date}|${e.title}`;
        if (existing.has(key) || seen.has(key)) { dup++; continue; }
        seen.add(key);
        perDay[e.date] = (perDay[e.date] || 0) + 1;
        fresh.push({ ...e, order: 1000 + perDay[e.date] }); // after what the day already has
      }
      const dates = events.map((e) => e.date).sort();
      setPreview({ fresh, dup, skippedRows, from: dates[0], to: dates[dates.length - 1], name: file.name });
      setStatus('');
    } catch (e) {
      setStatus(`엑셀을 읽지 못했습니다: ${e.message}`);
    }
  };

  const confirmXlsx = async () => {
    const { fresh, dup } = preview;
    setPreview(null);
    setStatus('저장하는 중…');
    try {
      let created = 0;
      for (let i = 0; i < fresh.length; i += 1000) created += (await api.bulkCreate(fresh.slice(i, i + 1000))).created;
      setStatus(`일정 ${created}개를 추가했습니다.${dup ? ` (이미 있던 ${dup}개는 건너뜀)` : ''}`);
      onImported?.();
    } catch (e) {
      setStatus(`저장 실패: ${e.message}`);
    }
  };

  const doImport = async (file) => {
    if (/\.xlsx$/i.test(file.name)) return previewXlsx(file);
    if (/\.xls$/i.test(file.name)) return setStatus('예전 엑셀 형식(.xls)은 읽을 수 없습니다. 엑셀에서 「다른 이름으로 저장 → Excel 통합 문서(.xlsx)」로 저장한 뒤 올려 주세요.');
    setStatus('불러오는 중…');
    try {
      const text = await file.text();
      let events = [];
      let extra = '';
      if (file.name.endsWith('.ics')) {
        events = fromICS(text);
      } else {
        const data = JSON.parse(text);
        events = data.events || [];
        for (const n of data.notes || []) await api.createNote({ title: n.title, items: n.items, color: n.color, visible: n.visible });
        for (const c of data.countdowns || []) await api.createCountdown({ title: c.title, date: c.date, repeatYearly: c.repeatYearly, color: c.color });
        extra = `, 메모 ${(data.notes || []).length}개, D-day ${(data.countdowns || []).length}개`;
      }
      const cleaned = events.map(({ _id, userId, createdAt, updatedAt, ...e }) => e);
      const r = await api.bulkCreate(cleaned);
      setStatus(`일정 ${r.created}개${extra}를 불러왔습니다.`);
      onImported?.();
    } catch (e) {
      setStatus(`불러오기 실패: ${e.message}`);
    }
  };

  return (
    <Modal title={mode === 'export' ? '내보내기' : '불러오기'} onClose={onClose} width={440}>
      {mode === 'export' ? (
        <div className="export-grid">
          <button className="big-btn" onClick={() => doExport('json')}><Icon name="download" /> 전체 백업 (JSON)<small>일정·메모·D-day·설정</small></button>
          <button className="big-btn" onClick={() => doExport('ics')}><Icon name="calendar" /> iCalendar (.ics)<small>다른 캘린더 앱(구글·아웃룩 등)에서 열기</small></button>
          <button className="big-btn" onClick={() => doExport('csv')}><Icon name="note" /> 엑셀용 (CSV)</button>
        </div>
      ) : (
        <div className="form">
          <p className="muted">엑셀(.xlsx), 백업 파일(.json), iCalendar 파일(.ics)을 고를 수 있습니다. 기존 일정은 그대로 두고 추가됩니다.</p>
          <div className="xlsx-guide">
            <b>엑셀 양식</b>
            <table>
              <tbody>
                <tr><th /><th>A</th><th>B</th></tr>
                <tr><th>1</th><td>2026-12-23</td><td>• 창의돋음제출</td></tr>
                <tr><th>2</th><td>2026-12-07</td><td>• 만족도조사<br />• 결과보고</td></tr>
              </tbody>
            </table>
            <small>A열 날짜, B열 일정. 한 칸에 여러 줄이면 줄마다 일정 하나가 됩니다. 앞의 •는 빼고 저장하고, 같은 날 같은 일정이 이미 있으면 건너뜁니다.</small>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.json,.ics" hidden
            onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) doImport(f); }} />
          <button className="big-btn" onClick={() => fileRef.current.click()}><Icon name="upload" /> 파일 선택</button>
          {preview && (
            <div className="xlsx-preview">
              <div><b>{preview.name}</b></div>
              <div>{preview.from} ~ {preview.to}</div>
              <div>추가할 일정 <b>{preview.fresh.length}개</b>{preview.dup ? ` · 이미 있어 건너뜀 ${preview.dup}개` : ''}{preview.skippedRows ? ` · 날짜를 못 읽은 행 ${preview.skippedRows}개` : ''}</div>
              <ul>
                {preview.fresh.slice(0, 5).map((e, i) => <li key={i}>{e.date} · {e.title}</li>)}
                {preview.fresh.length > 5 && <li className="muted">… 외 {preview.fresh.length - 5}개</li>}
              </ul>
              <div className="inline">
                <button className="btn" onClick={() => setPreview(null)}>취소</button>
                <button className="btn primary" disabled={!preview.fresh.length} onClick={confirmXlsx}>{preview.fresh.length}개 추가</button>
              </div>
            </div>
          )}
        </div>
      )}
      {status && <p className="notice">{status}</p>}
    </Modal>
  );
}

export function MobileDialog({ onClose }) {
  const [qr, setQr] = useState('');
  const url = window.location.origin;
  useEffect(() => { QRCode.toDataURL(url, { margin: 1, width: 220 }).then(setQr); }, [url]);
  return (
    <Modal title="모바일에서 사용하기" onClose={onClose} width={440}>
      <div className="mobile-connect">
        {qr && <img src={qr} alt="모바일 접속 QR 코드" width="180" height="180" />}
        <div>
          <p>휴대폰 카메라로 QR 코드를 찍고, <b>같은 아이디</b>로 로그인하세요. PC와 모바일이 실시간으로 동기화됩니다.</p>
          <p className="muted mono">{url}</p>
          <h4>앱처럼 설치하기</h4>
          <ul>
            <li><b>안드로이드(크롬)</b>: ⋮ 메뉴 → 「홈 화면에 추가」 또는 「앱 설치」</li>
            <li><b>아이폰(사파리)</b>: 공유 버튼 → 「홈 화면에 추가」</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

export function HelpDialog({ onClose }) {
  const items = [
    ['날짜 칸 더블클릭 → 입력창', '날짜 칸을 더블클릭하면 입력창이 뜹니다. Enter는 저장, Ctrl+Enter 또는 Alt+Enter는 줄바꿈(새 일정)입니다. 줄을 지우면 그 일정이 삭제됩니다. 휴대폰에서는 한 번 누르면 열리고, Enter가 줄바꿈, ✓가 저장입니다.'],
    ['서식과 칸 색', '입력창 아래 도구로 고른 글자를 굵게·기울임·밑줄·취소선·글자색·글꼴·크기로 꾸밉니다. 글자색의 X는 기본 색으로 되돌립니다. ▣ 버튼은 그 날짜 칸의 배경색, 목록 버튼은 그 날짜의 목록 모양(점·번호·없음)을 바꿉니다.'],
    ['일정 상세', '입력창의 시계 아이콘을 누르면 지금 줄의 시간, 여러 날, 반복, 색상, 알림, 메모를 설정할 수 있습니다.'],
    ['접기', '제목 줄을 더블클릭(또는 왼쪽 위 접기 버튼)하면 왼쪽 위에 작은 아이콘만 남습니다. 아이콘을 한 번 누르면 다시 펼쳐집니다.'],
    ['끌어서 옮기기', '일정을 다른 날짜로 끌어 놓으면 날짜가 바뀝니다.'],
    ['체크박스·완료', '체크하면 완료 처리되고 설정에 따라 맨 아래로 내려갑니다. 완료한 일정 오른쪽 끝의 휴지통을 누르면 물어본 뒤 삭제합니다. 미완료 자동 연기도 켤 수 있습니다.'],
    ['공휴일·24절기·음력', '대한민국 공휴일과 대체공휴일, 24절기, 음력 날짜를 표시합니다.'],
    ['스티커 메모·D-day 카드', '퍼즐 아이콘에서 메모와 D-day 카드를 만듭니다. PC 앱에서는 바탕화면에 따로 붙습니다.'],
    ['알림', '알림을 설정한 일정은 시간이 되면 알림창과 소리로 알려줍니다.'],
    ['PC ↔ 모바일 동기화', '같은 아이디로 로그인한 모든 기기에 즉시 반영됩니다.'],
    ['내보내기·불러오기·프린트', '메뉴에서 백업(JSON), iCalendar, CSV로 내보내고 불러오거나 인쇄할 수 있습니다.'],
  ];
  return (
    <Modal title="기능 소개" onClose={onClose} width={560}>
      <dl className="help-list">
        {items.map(([t, d]) => (<div key={t}><dt>{t}</dt><dd>{d}</dd></div>))}
      </dl>
    </Modal>
  );
}
