import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { desktop } from '../lib/desktop.js';
import { GoogleMark } from './Icon.jsx';

export function LoginScreen() {
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState(() => new URLSearchParams(location.search).get('login_error'));
  useEffect(() => { api.authConfig().then(setCfg).catch(() => setError('서버에 연결할 수 없습니다.')); }, []);
  const google = () => {
    if (desktop) desktop.login();
    else window.location.href = '/auth/google';
  };
  return (
    <div className="login">
      <div className="login-card">
        <div className="login-logo"><span className="app-mark big" /></div>
        <h1>업무 캘린더</h1>
        <p>PC 바탕화면과 휴대폰에서 같은 일정을 보고, 구글 캘린더와 동기화합니다.</p>
        <button className="btn google" onClick={google} disabled={cfg && !cfg.google}>
          <GoogleMark size={18} /> 구글 계정으로 로그인
        </button>
        {cfg && !cfg.google && <p className="notice">서버에 구글 로그인이 아직 설정되지 않았습니다. (README 참고)</p>}
        {cfg?.devLogin && (
          <button className="btn ghost" onClick={() => api.devLogin().then(() => location.replace('/'))}>개발용으로 로그인</button>
        )}
        {desktop && (
          <button className="btn ghost small" onClick={() => desktop.changeServer()}>서버 주소 변경</button>
        )}
        {error && <p className="error">로그인에 실패했습니다: {error}</p>}
      </div>
    </div>
  );
}
