// Обработка OAuth редиректа
(function handleOAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('oauth_token');
    const isOnboarded = params.get('is_onboarded');
    const error = params.get('error');

    if (error) {
        // Убираем параметры из URL
        window.history.replaceState({}, '', '/');
        setTimeout(() => {
            showScreen('auth-screen');
            showError('login-error', 'Ошибка входа через Google. Попробуй снова.');
        }, 100);
        return;
    }

    if (oauthToken) {
        // Убираем параметры из URL
        window.history.replaceState({}, '', '/');
        api.setToken(oauthToken);

        setTimeout(() => {
            if (isOnboarded === 'false') {
                showScreen('onboarding-screen');
            } else {
                loadApp();
            }
        }, 100);
    }
})();


// Кнопка Google — скрываем только если сервер явно сказал disabled.
// По умолчанию кнопка видима (display:flex задан в CSS .btn-google).
async function initGoogleBtn() {
    try {
        const status = await fetch('/auth/google/status').then(r => r.json());
        const btn = document.getElementById('google-login-btn');
        const divider = document.getElementById('oauth-divider');
        const enabled = status.enabled !== false; // true если enabled или запрос упал
        if (btn) btn.style.display = enabled ? 'flex' : 'none';
        if (divider) divider.style.display = enabled ? 'flex' : 'none';
    } catch {
        // Сеть упала — оставляем кнопку видимой, пусть пользователь попробует
        const btn = document.getElementById('google-login-btn');
        const divider = document.getElementById('oauth-divider');
        if (btn) btn.style.display = 'flex';
        if (divider) divider.style.display = 'flex';
    }
}

document.addEventListener('DOMContentLoaded', initGoogleBtn);

let pendingEmail = '';

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function showError(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4000);
}

function showSuccess(id, msg) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.style.display = 'block';
    el.style.color = 'var(--accent-green)';
    setTimeout(() => el.style.display = 'none', 3000);
}

// Переключение вкладок логин/регистрация
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

// Регистрация
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (password !== confirm) return showError('reg-error', 'Пароли не совпадают');
    if (password.length < 8) return showError('reg-error', 'Пароль минимум 8 символов');

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Отправка...';

    try {
        await api.register(email, password);
        pendingEmail = email;
        showScreen('otp-screen');
    } catch (err) {
        showError('reg-error', err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Зарегистрироваться';
    }
});

// OTP подтверждение
document.getElementById('otp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const otp = document.getElementById('otp-input').value;

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Проверка...';

    try {
        const data = await api.verifyOtp(pendingEmail, otp);
        api.setToken(data.access_token);
        if (!data.is_onboarded) {
            showScreen('onboarding-screen');
        } else {
            loadApp();
        }
    } catch (err) {
        showError('otp-error', err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Подтвердить';
    }
});

// Логин
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    const btn = e.target.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Вход...';

    try {
        const data = await api.login(email, password);
        api.setToken(data.access_token);
        if (!data.is_onboarded) {
            showScreen('onboarding-screen');
        } else {
            loadApp();
        }
    } catch (err) {
        showError('login-error', err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Войти';
    }
});

// Онбординг — выбор пола
document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

// Онбординг — отправка
document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const display_name = document.getElementById('display-name').value;
    const character_name = document.getElementById('character-name').value;
    const genderBtn = document.querySelector('.gender-btn.active');

    if (!genderBtn) return showError('onboarding-error', 'Выбери пол персонажа');

    const gender = genderBtn.dataset.gender;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Создание...';

    try {
        const data = await api.onboarding(display_name, character_name, gender);
        api.setToken(data.access_token);
        loadApp();
    } catch (err) {
        showError('onboarding-error', err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Начать приключение';
    }
});