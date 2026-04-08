const API_BASE = import.meta.env.VITE_API_BASE ?? `http://${window.location.hostname}:8000`;

function buildFallbackBase(base: string): string | null {
  if (base.includes('localhost')) return base.replace('localhost', '127.0.0.1');
  if (base.includes('127.0.0.1')) return base.replace('127.0.0.1', 'localhost');
  return null;
}

async function safeFetch(url: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch {
    const fallbackBase = buildFallbackBase(API_BASE);
    if (!fallbackBase) throw new Error('Network error: failed to connect to API');
    const fallbackUrl = `${fallbackBase}${url.slice(API_BASE.length)}`;
    return fetch(fallbackUrl, options);
  }
}

type ApiResponse<T> = {
  data: T;
  status: number;
};

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  const response = await safeFetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) return false;

  const data = await response.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  return true;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  retried = false
): Promise<ApiResponse<T>> {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await safeFetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && !retried) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return request<T>(method, path, body, true);
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
  }

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `HTTP ${response.status}`);
  }

  // FastAPI 204 responses have no body.
  if (response.status === 204) {
    return { data: undefined as T, status: response.status };
  }

  const data = (await response.json()) as T;
  return { data, status: response.status };
}

const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export default api;
