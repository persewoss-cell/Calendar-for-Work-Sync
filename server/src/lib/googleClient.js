import { google } from 'googleapis';
import { config } from '../config.js';
import { decrypt, encrypt } from './crypto.js';

export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
];

export function oauthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    `${config.publicUrl}/auth/google/callback`,
  );
}

export function authedClient(user) {
  const client = oauthClient();
  client.setCredentials({ refresh_token: decrypt(user.google?.refreshToken) });
  client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      user.google.refreshToken = encrypt(tokens.refresh_token);
      await user.save();
    }
  });
  return client;
}

export function calendarApi(user) {
  return google.calendar({ version: 'v3', auth: authedClient(user) });
}
