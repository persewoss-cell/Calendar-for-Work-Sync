async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (res.status === 401) {
    const err = new Error(data?.error && data.error !== 'unauthorized' ? data.error : '로그인이 필요합니다.');
    err.status = 401;
    throw err;
  }
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText), { status: res.status });
  return data;
}

export const api = {
  authConfig: () => request('GET', '/auth/config'),
  login: (body) => request('POST', '/auth/login', body),
  register: (body) => request('POST', '/auth/register', body),
  logout: () => request('POST', '/auth/logout'),
  me: () => request('GET', '/api/me'),
  saveSettings: (s) => request('PUT', '/api/settings', s),
  updateAccount: (body) => request('PUT', '/api/account', body),

  events: (from, to) => request('GET', `/api/events?from=${from}&to=${to}`),
  search: (q) => request('GET', `/api/events/search?q=${encodeURIComponent(q)}`),
  exportEvents: () => request('GET', '/api/events/export'),
  createEvent: (e) => request('POST', '/api/events', e),
  bulkCreate: (events) => request('POST', '/api/events/bulk', { events }),
  updateEvent: (id, e) => request('PATCH', `/api/events/${id}`, e),
  deleteEvent: (id) => request('DELETE', `/api/events/${id}`),
  reorder: (ids) => request('POST', '/api/events/reorder', { ids }),
  rollover: (today) => request('POST', '/api/events/rollover', { today }),
  styleUsage: () => request('GET', '/api/events/style-usage'),
  stripStyle: (props) => request('POST', '/api/events/strip-style', { props }),

  days: (from, to) => request('GET', `/api/days?from=${from}&to=${to}`),
  setDayStyle: (date, patch) => request('PUT', `/api/days/${date}`, patch),


  countdowns: () => request('GET', '/api/countdowns'),
  createCountdown: (c) => request('POST', '/api/countdowns', c),
  updateCountdown: (id, c) => request('PATCH', `/api/countdowns/${id}`, c),
  deleteCountdown: (id) => request('DELETE', `/api/countdowns/${id}`),
};
