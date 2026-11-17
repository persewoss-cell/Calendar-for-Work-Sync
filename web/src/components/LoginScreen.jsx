import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { desktop } from '../lib/desktop.js';

export function LoginScreen({ onLoggedIn }) {
  const [mode, setMode] = useState('login'); // login | register
  const [allowSignup, setAllowSignup] = useState(true);
  const [f, setF] = useState({ username: '', password: '', password2: '', name: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // PC app: show the login as a normal front window with a taskbar button (not on the desktop layer).
  useEffect(() => {
    document.body.classList.add('login-mode');
    desktop?.setLoginMode?.(true);
    return () => {
      document.body.classList.remove('login-mode');
      desktop?.setLoginMode?.(false);
    };
  }, []);

  useEffect(() => {
    api.authConfig().then((c) => setAllowSignup(c.allowSignup)).catch(() => setError('서버에 연결할 수 없습니다.'));
  }, []);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && f.password !== f.password2) return setError('비밀번호 확인이 일치하지 않습니다.');
    setBusy(true);
    try {
      if (mode === 'register') await api.register({ username: f.username, password: f.password, name: f.name });
      else await api.login({ username: f.username, password: f.password });
      onLoggedIn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo"><span className="app-mark big" /></div>
        <h1>업무 캘린더</h1>
        <p>PC 바탕화면과 휴대폰에서 같은 일정을 봅니다.</p>
        <input className="input" placeholder="아이디" autoComplete="username" autoCapitalize="none" value={f.username} onChange={set('username')} required />
        {mode === 'register' && <input className="input" placeholder="이름 (화면에 표시)" value={f.name} onChange={set('name')} />}
        <input className="input" type="password" placeholder="비밀번호 (8자 이상)" autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          value={f.password} onChange={set('password')} required />
        {mode === 'register' && (
          <input className="input" type="password" placeholder="비밀번호 확인" autoComplete="new-password" value={f.password2} onChange={set('password2')} required />
        )}
        <button className="btn primary wide" disabled={busy}>{mode === 'register' ? '가입하고 시작하기' : '로그인'}</button>
        {error && <p className="error">{error}</p>}
        {allowSignup && (
          <button type="button" className="btn ghost small" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
            {mode === 'login' ? '처음이신가요? 회원가입' : '이미 계정이 있어요. 로그인'}
          </button>
        )}
        {desktop && <button type="button" className="btn ghost small" onClick={() => desktop.changeServer()}>서버 주소 변경</button>}
      </form>
    </div>
  );
}
