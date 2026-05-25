// Загружает HTML-фрагменты и инициализирует приложение
async function loadFragment(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Не удалось загрузить ${url}`);
    return await res.text();
}

async function initApp() {
    const root    = document.getElementById('app-root');
    const modRoot = document.getElementById('modals-root');

    try {
        // Загружаем все фрагменты параллельно
        const [
            authHtml,
            appHtml,
            dailyHtml,
            goalsHtml,
            habitsHtml,
            shopHtml,
            challengesHtml,
            feedHtml,
            profileHtml,
            modalsHtml,
        ] = await Promise.all([
            loadFragment('/partials/auth.html'),
            loadFragment('/partials/app.html'),
            loadFragment('/partials/pages/daily.html'),
            loadFragment('/partials/pages/goals.html'),
            loadFragment('/partials/pages/habits.html'),
            loadFragment('/partials/pages/shop.html'),
            loadFragment('/partials/pages/challenges.html'),
            loadFragment('/partials/pages/feed.html'),
            loadFragment('/partials/pages/profile.html'),
            loadFragment('/partials/modals.html'),
        ]);

        // Собираем страницы в app-main
        const pagesHtml = dailyHtml + goalsHtml + habitsHtml + shopHtml
            + challengesHtml + feedHtml + profileHtml;

        // Вставляем основной контент
        root.innerHTML = authHtml + appHtml.replace('{{pages}}', pagesHtml);

        // Вставляем модалки
        modRoot.innerHTML = modalsHtml;

        // Подгружаем скрипты последовательно
        await loadScripts([
            '/js/confirm.js',
            '/js/auth.js',
            '/js/tasks.js',
            '/js/goals.js',
            '/js/habits.js',
            '/js/shop.js',
            '/js/cosmetics.js',
            '/js/social.js',
            '/js/profile.js',
            '/js/user-profile.js',
            '/js/challenges.js',
            '/js/notifications.js',
            '/js/app.js',
        ]);

        initDeadlinePicker();

    } catch (e) {
        console.error('Ошибка загрузки приложения:', e);
        root.innerHTML = `
            <div style="display:flex;flex-direction:column;align-items:center;
                        justify-content:center;height:100vh;gap:16px;color:#f1f0ff">
                <div style="font-size:48px">⚠️</div>
                <div style="font-size:18px;font-weight:700">Ошибка загрузки</div>
                <div style="color:#5a5a7a">Убедись что сервер запущен</div>
                <button onclick="location.reload()"
                    style="padding:10px 24px;background:#7c3aed;border:none;
                           border-radius:8px;color:#fff;cursor:pointer;font-size:14px">
                    Перезагрузить
                </button>
            </div>
        `;
    }
}

function loadScripts(urls) {
    return urls.reduce((chain, url) => {
        return chain.then(() => new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = url;
            script.onload  = resolve;
            script.onerror = reject;
            document.body.appendChild(script);
        }));
    }, Promise.resolve());
}

// Стили загрузочного экрана
const style = document.createElement('style');
style.textContent = `
    .app-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        gap: 24px;
    }
    .app-loading-logo {
        font-size: 48px;
        font-weight: 800;
        color: #f1f0ff;
        letter-spacing: -2px;
    }
    .app-loading-logo span { color: #9d5ff3; }
    .app-loading-bar {
        width: 200px;
        height: 4px;
        background: #2a2a3e;
        border-radius: 2px;
        overflow: hidden;
    }
    .app-loading-fill {
        height: 100%;
        background: linear-gradient(90deg, #7c3aed, #06b6d4);
        border-radius: 2px;
        animation: loading 1.5s ease-in-out infinite;
    }
    @keyframes loading {
        0%   { width: 0%; margin-left: 0; }
        50%  { width: 60%; margin-left: 20%; }
        100% { width: 0%; margin-left: 100%; }
    }
`;
document.head.appendChild(style);

initApp();