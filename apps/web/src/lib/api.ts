const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api/v1';

export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  staffProfileId?: string | null;
};

function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

export function saveUser(user: User) {
  localStorage.setItem('user', JSON.stringify(user));
}

export function getStoredUser(): User | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ refreshToken: refreshToken || undefined }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.accessToken && data.refreshToken) {
    setTokens(data.accessToken, data.refreshToken);
  }
  return (data.accessToken as string) || 'cookie';
}

export function getBranchId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('branchId');
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (auth) {
    const token = getToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  const branchId = getBranchId();
  if (branchId && !headers.has('X-Branch-Id')) {
    headers.set('X-Branch-Id', branchId);
  }

  let res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (res.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      if (newToken !== 'cookie') {
        headers.set('Authorization', `Bearer ${newToken}`);
      }
      res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  if (!res.ok) {
    let message = 'Помилка запиту';
    try {
      const err = await res.json();
      message = Array.isArray(err.message) ? err.message.join(', ') : err.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

/** Base API URL for EventSource / absolute links */
export function getApiBase() {
  if (typeof window === 'undefined') return API_URL;
  if (API_URL.startsWith('http')) return API_URL;
  return `${window.location.origin}${API_URL}`;
}

export const publicApi = {
  salon: () => api('/public/salon', {}, false),
  services: () => api<any[]>('/public/services', {}, false),
  staff: (serviceId?: string, branchId?: string) => {
    const q = new URLSearchParams();
    if (serviceId) q.set('serviceId', serviceId);
    if (branchId) q.set('branchId', branchId);
    const qs = q.toString();
    return api<any[]>(`/public/staff${qs ? `?${qs}` : ''}`, {}, false);
  },
  slots: (staffId: string, date: string, serviceIds: string, branchId?: string) => {
    const q = new URLSearchParams({ staffId, date, serviceIds });
    if (branchId) q.set('branchId', branchId);
    return api<{
      slots: string[];
      durationMin: number;
      options?: { at: string; staffId: string; displayName: string }[];
    }>(`/public/slots?${q.toString()}`, {}, false);
  },
  availability: (params: {
    from: string;
    serviceIds: string;
    staffId?: string;
    days?: number;
    branchId?: string;
  }) => {
    const q = new URLSearchParams({
      from: params.from,
      serviceIds: params.serviceIds,
    });
    if (params.staffId) q.set('staffId', params.staffId);
    if (params.days) q.set('days', String(params.days));
    if (params.branchId) q.set('branchId', params.branchId);
    return api<{ days: { date: string; slotsCount: number; full: boolean }[] }>(
      `/public/availability?${q.toString()}`,
      {},
      false,
    );
  },
  book: (body: unknown) =>
    api('/public/bookings', { method: 'POST', body: JSON.stringify(body) }, false),
  waitlist: (body: unknown) =>
    api('/public/waitlist', { method: 'POST', body: JSON.stringify(body) }, false),
  rooms: (branchId?: string) =>
    api<any[]>(
      `/public/rooms${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''}`,
      {},
      false,
    ),
};

export const portalApi = {
  requestCode: (phone: string) =>
    api<{ ok: boolean; message: string; devCode?: string }>(
      '/public/portal/request-code',
      { method: 'POST', body: JSON.stringify({ phone }) },
      false,
    ),
  verify: (phone: string, code: string) =>
    api<{ token: string; client: any }>(
      '/public/portal/verify',
      { method: 'POST', body: JSON.stringify({ phone, code }) },
      false,
    ),
  me: (token: string) =>
    fetch(`${getApiBase()}/public/portal/me`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    }).then(async (r) => {
      if (!r.ok) throw new Error('Сесію вичерпано');
      return r.json();
    }),
  appointments: (token: string) =>
    fetch(`${getApiBase()}/public/portal/appointments`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    }).then(async (r) => {
      if (!r.ok) throw new Error('Не вдалося завантажити записи');
      return r.json();
    }),
  cancel: (token: string, appointmentId: string, reason?: string) =>
    fetch(`${getApiBase()}/public/portal/cancel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ appointmentId, reason }),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || 'Не вдалося скасувати');
      }
      return r.json();
    }),
  profile: (token: string, body: unknown) =>
    fetch(`${getApiBase()}/public/portal/profile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(body),
    }).then(async (r) => {
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || 'Не вдалося зберегти профіль');
      }
      return r.json();
    }),
  nps: (token: string, appointmentId: string, score: number) =>
    fetch(`${getApiBase()}/public/portal/nps`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ appointmentId, score }),
    }).then(async (r) => {
      if (!r.ok) throw new Error('Не вдалося надіслати оцінку');
      return r.json();
    }),
  telegramLink: (token: string) =>
    fetch(`${getApiBase()}/public/portal/telegram-link`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    }).then(async (r) => {
      if (!r.ok) return { url: '', enabled: false };
      return r.json() as Promise<{ url: string; enabled: boolean }>;
    }),
};
