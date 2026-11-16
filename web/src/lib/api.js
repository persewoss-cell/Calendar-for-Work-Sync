async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    const err = new Error('unauthorized');
    err.status = 401;
    throw err;
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { status: res.status });
  return data;
}

export const api = {
  authConfig: () => request('GET', '/auth/config'),
  devLogin: () => request('POST', '/auth/dev'),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/api/me'),
  saveSettings: (s) => request('PUT', '/api/settings', s),

  events: (from, to) => request('GET', `/api/events?from=${from}&to=${to}`),
  search: (q) => request('GET', `/api/events/search?q=${encodeURIComponent(q)}`),
  exportEvents: () => request('GET', '/api/events/export'),
  createEvent: (e) => request('POST', '/api/events', e),
  bulkCreate: (events) => request('POST', '/api/events/bulk', { events }),
  updateEvent: (id, e) => request('PATCH', `/api/events/${id}`, e),
  deleteEvent: (id) => request('DELETE', `/api/events/${id}`),
  reorder: (ids) => request('POST', '/api/events/reorder', { ids }),
  rollover: (today) => request('POST', '/api/events/rollover', { today }),

  notes: () => request('GET', '/api/notes'),
  createNote: (n) => request('POST', '/api/notes', n),
  updateNote: (id, n) => request('PATCH', `/api/notes/${id}`, n),
  deleteNote: (id) => request('DELETE', `/api/notes/${id}`),

  countdowns: () => request('GET', '/api/countdowns'),
  createCountdown: (c) => request('POST', '/api/countdowns', c),
  updateCountdown: (id, c) => request('PATCH', `/api/countdowns/${id}`, c),
  deleteCountdown: (id) => request('DELETE', `/api/countdowns/${id}`),

  googleStatus: () => request('GET', '/api/google/status'),
  googleCalendars: () => request('GET', '/api/google/calendars'),
  googleConfig: (c) => request('PUT', '/api/google/config', c),
  googleSync: () => request('POST', '/api/google/sync'),
  googleBulkToggle: (ids, googleSync) => request('POST', '/api/google/bulk-toggle', { ids, googleSync }),
};
