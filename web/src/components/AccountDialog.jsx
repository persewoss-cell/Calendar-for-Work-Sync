import { useEffect, useState } from 'react';
import { Modal, Row, Section, Select, Toggle } from './Modal.jsx';
import { GoogleMark, Icon } from './Icon.jsx';
import { api } from '../lib/api.js';
import { desktop } from '../lib/desktop.js';

const fmt = (d) => (d ? new Date(d).toLocaleString('ko-KR') : '없음');

export function AccountDialog({ me, google, refreshGoogle, onLogout, onClose, visibleEvents }) {
  const [calendars, setCalendars] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (google.connected) api.googleCalendars().then(setCalendars).catch(() => setCalendars([]));
  }, [google.connected]);

  const configure = async (patch) => {
    setBusy('config');
    setMsg('');
    try {
      await api.googleConfig(patch);
      await refreshGoogle();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  };

  const syncNow = async () => {
    setBusy('sync');
    setMsg('');
    try {
      const r = await api.googleSync();
      setMsg(r.error ? `실패: ${r.error}` : r.skipped ? '이미 동기화 중입니다.' : `완료 — 올림 ${r.pushed}건, 가져옴 ${r.pulled}건`);
      await refreshGoogle();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  };

  const bulk = async (on) => {
    const ids = [...new Set(visibleEvents.map((e) => e._id))];
    if (!ids.length) return;
    if (!confirm(`지금 보이는 기간의 일정 ${ids.length}개를 구글 캘린더에 ${on ? '반영' : '반영 해제'}할까요?`)) return;
    await api.googleBulkToggle(ids, on);
    setMsg(on ? '반영을 시작했습니다.' : '반영을 해제했습니다. 구글 캘린더에서 지워집니다.');
  };

  const reconnect = () => {
    if (desktop) desktop.login(); else window.location.href = '/auth/google';
  };

  return (
    <Modal title="계정 설정" onClose={onClose} width={560}>
      <div className="account-head">
        {me.picture ? <img src={me.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar"><Icon name="user" /></span>}
        <div>
          <strong>{me.name || '사용자'}</strong>
          <small>{me.email}</small>
        </div>
        <button className="btn ghost" onClick={onLogout}><Icon name="logout" size={14} /> 로그아웃</button>
      </div>

      <Section title={<><GoogleMark size={14} /> 구글 캘린더 동기화</>}>
        {!google.available && <p className="notice">서버에 구글 OAuth 설정이 없습니다. README의 「구글 클라우드 설정」을 참고하세요.</p>}
        {google.available && !google.connected && (
          <div className="notice">
            구글 캘린더 권한이 없습니다.
            <button className="btn primary" onClick={reconnect}>구글 계정 연결</button>
          </div>
        )}
        <Row label="구글 캘린더 동기화 사용" hint="켜면 이 앱과 구글 캘린더가 양방향으로 맞춰집니다.">
          <Toggle checked={google.enabled} disabled={!google.connected || busy === 'config'} onChange={(enabled) => configure({ enabled })} />
        </Row>
        <Row label="연결할 캘린더">
          <Select
            value={google.calendarId}
            onChange={(id) => {
              const cal = calendars?.find((c) => c.id === id);
              if (confirm('캘린더를 바꾸면 반영된 일정이 새 캘린더에 다시 올라갑니다. 계속할까요?')) configure({ calendarId: id, calendarName: cal?.name || '' });
            }}
            options={(calendars?.length ? calendars : [{ id: google.calendarId, name: google.calendarName || '기본 캘린더' }])
              .map((c) => ({ value: c.id, label: `${c.name}${c.primary ? ' (기본)' : ''}` }))}
          />
        </Row>
        <Row label="새 일정을 구글에 자동 반영" hint="일정마다 상세 창에서 따로 켜고 끌 수 있습니다.">
          <Toggle checked={google.defaultOn} onChange={(defaultOn) => configure({ defaultOn })} />
        </Row>
        <Row label="구글에서 만든 일정 가져오기" hint="끄면 이 앱에서 반영한 일정의 변경·삭제만 가져옵니다.">
          <Toggle checked={google.importFromGoogle} onChange={(importFromGoogle) => configure({ importFromGoogle })} />
        </Row>
        <Row label="지금 보이는 기간 일괄 처리">
          <button className="btn" disabled={!google.enabled} onClick={() => bulk(true)}>모두 반영</button>
          <button className="btn" disabled={!google.enabled} onClick={() => bulk(false)}>모두 해제</button>
        </Row>
        <Row label="마지막 동기화" hint={google.lastError ? `오류: ${google.lastError}` : ''}>
          <span className="muted">{fmt(google.lastSyncAt)}</span>
          <button className="btn primary" disabled={!google.enabled || busy === 'sync'} onClick={syncNow}>
            <Icon name="sync" size={14} className={busy === 'sync' ? 'spin' : ''} /> 지금 동기화
          </button>
        </Row>
        {msg && <p className="notice">{msg}</p>}
      </Section>
    </Modal>
  );
}
