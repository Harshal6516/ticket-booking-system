let apiBase = import.meta.env.VITE_API_URL || '/api';
if (apiBase && !apiBase.startsWith('http://') && !apiBase.startsWith('https://') && !apiBase.startsWith('/')) {
  apiBase = `https://${apiBase}`;
}

const api = axios.create({
  baseURL: apiBase,

  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach JWT to every request if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ============================================================
// Auth
// ============================================================
export const authAPI = {
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// ============================================================
// Events
// ============================================================
export const eventsAPI = {
  list: (params?: { type?: string; date?: string; venueId?: string; search?: string }) =>
    api.get('/events', { params }),
  get: (id: string) => api.get(`/events/${id}`),
  create: (data: any) => api.post('/events', data),
  summary: (id: string) => api.get(`/organiser/events/${id}/summary`),
};

// ============================================================
// Venues
// ============================================================
export const venuesAPI = {
  list: () => api.get('/venues'),
  get: (id: string) => api.get(`/venues/${id}`),
  create: (data: any) => api.post('/venues', data),
  update: (id: string, data: any) => api.put(`/venues/${id}`, data),
};

// ============================================================
// Seats
// ============================================================
export const seatsAPI = {
  getForShow: (eventId: string, showId: string) =>
    api.get(`/events/${eventId}/shows/${showId}/seats`),
  hold: (showId: string, seatIds: string[]) =>
    api.post(`/shows/${showId}/seats/hold`, { seatIds }),
};

// ============================================================
// Bookings
// ============================================================
export const bookingsAPI = {
  create: (data: { showId: string; seatIds: string[]; customerName: string; customerEmail: string; idempotencyKey?: string }) =>
    api.post('/bookings', data),
  mine: () => api.get('/bookings/me'),
  cancel: (id: string) => api.delete(`/bookings/${id}`),
};

// ============================================================
// Waitlist
// ============================================================
export const waitlistAPI = {
  join: (data: { showId: string; category: string }) =>
    api.post('/waitlist', data),
  mine: () => api.get('/waitlist/me'),
};

// ============================================================
// Offers
// ============================================================
export const offersAPI = {
  get: (token: string) => api.get(`/offers/${token}`),
  accept: (token: string, data?: { customerName?: string; customerEmail?: string }) =>
    api.post(`/offers/${token}/accept`, data),
};

export default api;
