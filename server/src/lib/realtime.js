let io = null;

export function setIo(instance) {
  io = instance;
}

/** Tell every open device of this user that something changed so it can refetch. */
export function notify(userId, kind, extra = {}) {
  io?.to(`user:${userId}`).emit('changed', { kind, ...extra });
}
