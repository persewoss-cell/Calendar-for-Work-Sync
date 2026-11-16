import { useState } from 'react';
import { Modal, Row, Section } from './Modal.jsx';
import { Icon } from './Icon.jsx';
import { api } from '../lib/api.js';

export function AccountDialog({ me, onSaved, onLogout, onClose }) {
  const [name, setName] = useState(me.name || '');
  const [pw, setPw] = useState({ current: '', next: '', next2: '' });
  const [msg, setMsg] = useState('');

  const saveName = async () => {
    try {
      await api.updateAccount({ name });
      setMsg('이름을 바꿨습니다.');
      onSaved();
    } catch (e) {
      setMsg(e.message);
    }
  };

  const savePassword = async () => {
    if (pw.next !== pw.next2) return setMsg('새 비밀번호 확인이 일치하지 않습니다.');
    try {
      await api.updateAccount({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', next2: '' });
      setMsg('비밀번호를 바꿨습니다.');
    } catch (e) {
      setMsg(e.message);
    }
  };

  return (
    <Modal title="계정 설정" onClose={onClose} width={520}>
      <div className="account-head">
        <span className="avatar"><Icon name="user" /></span>
        <div>
          <strong>{me.name || me.username}</strong>
          <small>아이디: {me.username}</small>
        </div>
        <button className="btn ghost" onClick={onLogout}><Icon name="logout" size={14} /> 로그아웃</button>
      </div>

      <Section title="이름">
        <Row label="화면에 표시할 이름">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={saveName}>저장</button>
        </Row>
      </Section>

      <Section title="비밀번호 변경">
        <Row label="현재 비밀번호">
          <input className="input" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </Row>
        <Row label="새 비밀번호" hint="8자 이상">
          <input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </Row>
        <Row label="새 비밀번호 확인">
          <input className="input" type="password" autoComplete="new-password" value={pw.next2} onChange={(e) => setPw({ ...pw, next2: e.target.value })} />
          <button className="btn primary" disabled={!pw.current || !pw.next} onClick={savePassword}>변경</button>
        </Row>
      </Section>
      {msg && <p className="notice">{msg}</p>}
    </Modal>
  );
}
