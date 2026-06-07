async function loadApp() {
    let user;
    try {
        user = await api.me();
    } catch (e) {
        console.error('Авторизация не удалась:', e);
        api.clearToken();
        showScreen('auth-screen');
        return;
    }

    window.MY_USER_ID = user.id;
    showScreen('app-screen');
    const emailEl = document.getElementById('user-email');
    if (emailEl) emailEl.textContent = user.email;
    initNavigation();

    const steps = [
        ['loadCharacter', loadCharacter],
        ['loadTasks', loadTasks],
        ['loadGoals', loadGoals],
        ['loadHabits', loadHabits],
        ['loadShop', loadShop],
        ['loadFeed', loadFeed],
        ['loadFriendRequests', loadFriendRequests],
        ['loadFriends', loadFriends],
        ['loadProfile', loadProfile],
    ];
    for (const [name, fn] of steps) {
        try {
            if (typeof fn === 'function') await fn();
        } catch (e) {
            console.error(`Ошибка загрузки (${name}):`, e);
        }
    }

    try { initChallenges(); } catch (e) { console.error('initChallenges:', e); }
    try {
        if (typeof initNotifications === 'function') initNotifications();
    } catch (e) { console.error('initNotifications:', e); }
}

function initNavigation() {
    const allBtns = [
        ...document.querySelectorAll('.nav-btn'),
        ...document.querySelectorAll('.mobile-nav-btn'),
    ];

    allBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const page = btn.dataset.page;
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll(`[data-page="${page}"]`).forEach(b => b.classList.add('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById(`page-${page}`)?.classList.add('active');
            window.scrollTo(0, 0);

            onPageShown(page);
        });
    });
}

async function onPageShown(page) {
    try {
        switch (page) {
            case 'daily':
                await loadCharacter();
                await loadTasks();
                break;
            case 'challenges':
                await loadChallenges();
                break;
            case 'feed':
                await loadFeed();
                await loadFriendRequests();
                await loadFriends();
                break;
            case 'profile':
                await loadProfile();
                if (typeof applyCosmetics === 'function' && character) {
                    applyCosmetics(character);
                }
                break;
            case 'shop':
                await loadShop();
                break;
            case 'habits':
                await loadHabits();
                break;
            case 'goals':
                await loadGoals();
                break;
        }
    } catch (e) {
        console.error('onPageShown error:', e);
    }
}

document.getElementById('logout-btn').addEventListener('click', () => {
    if (typeof stopNotifPolling === 'function') stopNotifPolling();
    api.clearToken();
    showScreen('auth-screen');
});

async function init() {
    const token = api.getToken();
    if (!token) { showScreen('auth-screen'); return; }
    await loadApp();
}

init();