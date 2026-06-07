const BASE_URL = 'http://localhost:8000';

const api = {
    getToken: () => localStorage.getItem('token'),
    setToken: (t) => localStorage.setItem('token', t),
    clearToken: () => localStorage.removeItem('token'),

    async request(method, path, body = null, auth = false) {
        const headers = { 'Content-Type': 'application/json' };
        if (auth) headers['Authorization'] = `Bearer ${this.getToken()}`;
        const res = await fetch(`${BASE_URL}${path}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : null,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Ошибка сервера');
        return data;
    },

    register: (email, password) =>
        api.request('POST', '/auth/register', { email, password }),

    verifyOtp: (email, otp) =>
        api.request('POST', '/auth/verify-otp', { email, otp }),

    login: (email, password) =>
        api.request('POST', '/auth/login', { email, password }),

    onboarding: (display_name, character_name, gender, username) =>
        api.request('POST', '/auth/onboarding',
            { display_name, character_name, gender, username }, true),

    me: () => api.request('GET', '/auth/me', null, true),
};

function getTimezoneOffset() {
    return new Date().getTimezoneOffset();
}