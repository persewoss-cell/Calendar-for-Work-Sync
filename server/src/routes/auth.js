import { Router } from 'express';
import { google } from 'googleapis';
import { config, googleConfigured } from '../config.js';
import { COOKIE, consumeOneTimeCode, issueOneTimeCode, setAuthCookie } from '../lib/auth.js';
import { encrypt } from '../lib/crypto.js';
import { oauthClient, SCOPES } from '../lib/googleClient.js';
import { User } from '../models/User.js';

export const authRouter = Router();

authRouter.get('/config', (req, res) => {
  res.json({ google: googleConfigured(), devLogin: config.devLogin });
});

// ?client=desktop makes the callback hand the session back to the Electron app.
authRouter.get('/google', (req, res) => {
  if (!googleConfigured()) return res.status(500).send('Google OAuth is not configured on the server.');
  const state = Buffer.from(JSON.stringify({ client: req.query.client === 'desktop' ? 'desktop' : 'web' })).toString('base64url');
  const url = oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: SCOPES,
    state,
  });
  res.redirect(url);
});

authRouter.get('/google/callback', async (req, res) => {
  let state = { client: 'web' };
  try {
    state = JSON.parse(Buffer.from(String(req.query.state || ''), 'base64url').toString());
  } catch { /* default to web */ }
  if (req.query.error) return res.redirect(`${config.webUrl}/?login_error=${encodeURIComponent(req.query.error)}`);

  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(String(req.query.code));
    client.setCredentials(tokens);
    const { data: profile } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();

    let user = await User.findOne({ googleId: profile.id });
    if (!user) user = new User({ googleId: profile.id, google: {} });
    user.email = profile.email;
    user.name = profile.name;
    user.picture = profile.picture;
    if (tokens.refresh_token) user.google.refreshToken = encrypt(tokens.refresh_token);
    user.google.scopes = String(tokens.scope || '').split(' ').filter(Boolean);
    await user.save();

    if (state.client === 'desktop') {
      const code = issueOneTimeCode(user._id);
      return res.send(desktopHandoffPage(`${config.desktopProtocol}://auth?code=${code}`));
    }
    setAuthCookie(res, user._id);
    res.redirect(`${config.webUrl}/`);
  } catch (err) {
    console.error('[auth] google callback failed', err.message);
    res.redirect(`${config.webUrl}/?login_error=callback`);
  }
});

// The desktop app loads this URL inside its own window to receive the session cookie.
authRouter.get('/complete', (req, res) => {
  const userId = consumeOneTimeCode(String(req.query.code || ''));
  if (!userId) return res.status(400).send('Login link expired. Please try again.');
  setAuthCookie(res, userId);
  res.redirect(`${config.webUrl}/`);
});

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Local development only: sign in without Google.
authRouter.post('/dev', async (req, res) => {
  if (!config.devLogin) return res.status(404).end();
  let user = await User.findOne({ email: 'dev@localhost' });
  if (!user) user = await User.create({ email: 'dev@localhost', name: '개발용 사용자', google: {} });
  setAuthCookie(res, user._id);
  res.json({ ok: true });
});

function desktopHandoffPage(url) {
  return `<!doctype html><meta charset="utf-8"><title>로그인 완료</title>
<body style="font-family:sans-serif;text-align:center;padding:60px">
<h2>로그인되었습니다</h2><p>데스크톱 캘린더로 돌아갑니다…</p>
<p><a href="${url}">자동으로 열리지 않으면 여기를 누르세요</a></p>
<script>location.href=${JSON.stringify(url)};setTimeout(()=>window.close(),3000)</script></body>`;
}
