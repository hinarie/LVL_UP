async function loadApp() {
    try {
        const user = await api.me();
        showScreen('app-screen');
        document.getElementById('user-email').textContent = user.email;
        initNavigation();
        await loadCharacter();
        await loadTasks();
        await loadGoals();
        await loadHabits();
        await loadShop();
        await loadFeed();
        await loadFriendRequests();
        await loadFriends();
        await loadProfile();
        initChallenges();
    } catch {
        api.clearToken();
        showScreen('auth-screen');
    }
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

            // Обновляем данные при переходе на вкладку, чтобы подтянуть свежие изменения
            // (например, задачи ивента, который только что стал активным).
            onPageShown(page);
        });
    });
}

// Перезагрузка данных конкретной страницы при её открытии.
// Главное здесь — Квесты: туда подмешиваются задачи активных ивентов,
// а статус ивента мог измениться (upcoming → active) уже после первой загрузки.
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
    api.clearToken();
    showScreen('auth-screen');
});

async function init() {
    const token = api.getToken();
    if (!token) { showScreen('auth-screen'); return; }
    await loadApp();
}

init();