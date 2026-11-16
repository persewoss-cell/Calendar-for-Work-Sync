import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { api } from '../lib/api.js';
import { download, fromICS, toCSV, toICS } from '../lib/ics.js';
import { todayIn } from '../lib/date.js';

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

  const doImport = async (file) => {
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
          <p className="muted">백업 파일(.json) 또는 iCalendar 파일(.ics)을 고르세요. 기존 일정은 그대로 두고 추가됩니다.</p>
          <input ref={fileRef} type="file" accept=".json,.ics" hidden onChange={(e) => e.target.files[0] && doImport(e.target.files[0])} />
          <button className="big-btn" onClick={() => fileRef.current.click()}><Icon name="upload" /> 파일 선택</button>
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
    ['셀 클릭 → 바로 입력', '날짜 칸을 누르면 그 자리에서 할 일을 적습니다. Enter로 줄을 추가하고 Esc나 바깥을 누르면 저장됩니다. 빈 줄로 지우면 삭제됩니다.'],
    ['일정 상세', '일정 글자를 누르거나 두 번 누르면 시간, 여러 날, 반복, 색상, 알림, 메모를 설정할 수 있습니다.'],
    ['끌어서 옮기기', '일정을 다른 날짜로 끌어 놓으면 날짜가 바뀝니다.'],
    ['체크박스·완료', '체크하면 완료 처리되고 설정에 따라 맨 아래로 내려갑니다. 미완료 자동 연기도 켤 수 있습니다.'],
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
