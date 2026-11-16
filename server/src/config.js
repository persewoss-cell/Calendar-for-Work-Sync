const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/workcal',
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`).replace(/\/$/, ''),
  // Where the browser should land after login. In dev the Vite server runs on another port.
  webUrl: (env.WEB_URL || env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`).replace(/\/$/, ''),
  google: {
    clientId: env.GOOGLE_CLIENT_ID || '',
    clientSecret: env.GOOGLE_CLIENT_SECRET || '',
  },
  devLogin: env.DEV_LOGIN === 'true',
  desktopProtocol: env.DESKTOP_PROTOCOL || 'workcal',
  syncIntervalMin: Number(env.SYNC_INTERVAL_MIN || 3),
  isProd: env.NODE_ENV === 'production',
};

export const googleConfigured = () => Boolean(config.google.clientId && config.google.clientSecret);

if (config.isProd && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
