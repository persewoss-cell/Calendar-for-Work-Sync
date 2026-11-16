const env = process.env;

export const config = {
  port: Number(env.PORT || 4000),
  mongoUri: env.MONGODB_URI || 'mongodb://127.0.0.1:27017/workcal',
  jwtSecret: env.JWT_SECRET || 'dev-secret-change-me',
  publicUrl: (env.PUBLIC_URL || `http://localhost:${env.PORT || 4000}`).replace(/\/$/, ''),
  // Set ALLOW_SIGNUP=false once everyone who should use the calendar has an account.
  allowSignup: env.ALLOW_SIGNUP !== 'false',
  isProd: env.NODE_ENV === 'production',
};

if (config.isProd && config.jwtSecret === 'dev-secret-change-me') {
  throw new Error('JWT_SECRET must be set in production');
}
