
(function handleOAuthRedirect() {
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('oauth_token');
    const isOnboarded = params.get('is_onboarded');
    const error = params.get('error');

    if (error) {

        window.history.replaceState({}, '', '/');
        setTimeout(() => {
            showScreen('auth-screen');
            showError('login-error', 'Ошибка входа через Google. Попробуй снова.');
        }, 100);
        return;
    }

    if (oauthToken) {

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

async function initGoogleBtn() {
    try {
        const status = await fetch('/auth/google/status').then(r => r.json());
        const btn = document.getElementById('google-login-btn');
        const divider = document.getElementById('oauth-divider');
        const enabled = status.enabled !== false;
        if (btn) btn.style.display = enabled ? 'flex' : 'none';
        if (divider) divider.style.display = enabled ? 'flex' : 'none';
    } catch {

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

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
});

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

document.querySelectorAll('.gender-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

(function setupOnboardingUsernameCheck() {
    const input = document.getElementById('onboarding-username');
    const hint  = document.getElementById('onboarding-username-hint');
    if (!input || !hint) return;

    let timer = null;
    let lastChecked = '';
    let lastAvailable = false;

    function setHint(msg, kind) {
        hint.textContent = msg;
        hint.style.display = msg ? 'block' : 'none';
        hint.classList.remove('username-hint-ok', 'username-hint-err', 'username-hint-muted');
        if (kind === 'ok')  hint.classList.add('username-hint-ok');
        if (kind === 'err') hint.classList.add('username-hint-err');
        if (kind === 'muted') hint.classList.add('username-hint-muted');
    }

    input._isAvailable = () => lastAvailable && lastChecked === input.value.trim().toLowerCase();

    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        input.value = val;
        clearTimeout(timer);
        if (!val) { setHint('', 'muted'); return; }
        if (val.length < 3) { setHint('Минимум 3 символа', 'err'); return; }
        if (val.length > 30) { setHint('Максимум 30 символов', 'err'); return; }
        if (!/^[a-z0-9_]+$/.test(val)) {
            setHint('Только латинские буквы, цифры и _', 'err');
            return;
        }
        setHint('Проверяем…', 'muted');
        timer = setTimeout(async () => {
            try {
                const res = await api.request(
                    'GET',
                    `/profile/username/check?username=${encodeURIComponent(val)}`,
                    null, true
                );
                lastChecked = val;
                lastAvailable = !!res.available;
                if (!res.valid) {
                    setHint(res.error || 'Невалидный username', 'err');
                } else if (res.available) {
                    setHint('Свободен ✓', 'ok');
                } else {
                    setHint(res.error || 'Уже занят', 'err');
                }
            } catch (e) {
                setHint('Не удалось проверить — попробуйте ещё раз', 'err');
            }
        }, 350);
    });
})();

document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const display_name = document.getElementById('display-name').value;
    const character_name = document.getElementById('character-name').value;
    const username = document.getElementById('onboarding-username').value.trim().toLowerCase();
    const genderBtn = document.querySelector('.gender-btn.active');

    if (!username || username.length < 3) {
        return showError('onboarding-error', 'Придумай @username (минимум 3 символа)');
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
        return showError('onboarding-error', 'Username: только латинские буквы, цифры и _');
    }
    if (!genderBtn) return showError('onboarding-error', 'Выбери пол персонажа');

    const gender = genderBtn.dataset.gender;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Создание...';

    try {
        const data = await api.onboarding(display_name, character_name, gender, username);
        api.setToken(data.access_token);
        loadApp();
    } catch (err) {
        showError('onboarding-error', err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Начать приключение';
    }
});