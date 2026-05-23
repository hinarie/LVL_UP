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
        });
    });
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