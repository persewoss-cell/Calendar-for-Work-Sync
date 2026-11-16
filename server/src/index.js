import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { config } from './config.js';
import { requireAuth, tokenFromRequest, userIdFromToken } from './lib/auth.js';
import { setIo } from './lib/realtime.js';
import { authRouter } from './routes/auth.js';
import { eventsRouter } from './routes/events.js';
import { accountRouter } from './routes/account.js';
import { crudRouter } from './routes/crud.js';
import { daysRouter } from './routes/days.js';
import { Countdown } from './models/Countdown.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  app.get('/healthz', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
  app.use('/auth', authRouter);
  app.use('/api', requireAuth);
  app.use('/api', accountRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/days', daysRouter);
  app.use('/api/countdowns', crudRouter(Countdown, 'countdowns', ['title', 'date', 'repeatYearly', 'color', 'visible']));

  // Serve the built web/PWA client from the same origin.
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api|auth|socket\.io).*/, (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'server error' });
  });
  return app;
}

/**
 * All-day reminders used to count back from 09:00; they now count from midnight.
 * Convert old ones once so they keep ringing at the same time.
 */
async function migrateReminders() {
  const { Event } = await import('./models/Event.js');
  const old = { reminderV: { $exists: false } };
  const r = await Event.updateMany(
    { ...old, startTime: null, reminder: { $ne: null } },
    [{ $set: { reminder: { $subtract: ['$reminder', 540] }, reminderV: 2 } }],
  );
  await Event.updateMany(old, { $set: { reminderV: 2 } });
  if (r.modifiedCount) console.log(`[migrate] converted ${r.modifiedCount} all-day reminders`);
}

export async function start() {
  await mongoose.connect(config.mongoUri);
  await migrateReminders();
  const app = createApp();
  const server = http.createServer(app);
  const io = new Server(server, { path: '/socket.io' });
  io.use((socket, next) => {
    const userId = userIdFromToken(tokenFromRequest(socket.request));
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });
  io.on('connection', (socket) => socket.join(`user:${socket.data.userId}`));
  setIo(io);
  server.listen(config.port, () => {
    console.log(`[server] http://localhost:${config.port}  (sign-up ${config.allowSignup ? 'open' : 'closed'})`);
  });
  return server;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
