let userProfileState = {
    currentUsername: null,
    data: null,
    activeTab: 'overview',
};

const UP_CAT_ICON = { theme: '🎨', background: '🖼', frame: '🔲', artifact: '🧪' };

function ensureUserProfileModal() {
    let m = document.getElementById('user-profile-modal');
    if (m) return m;

    m = document.createElement('div');
    m.id = 'user-profile-modal';
    m.className = 'up-overlay';
    m.innerHTML = `
        <div class="up-modal" role="dialog" aria-modal="true">
            <button class="up-close" data-up-close>✕</button>
            <div class="up-body" id="up-body">
                <div class="up-loading">Загрузка профиля…</div>
            </div>
        </div>`;
    document.body.appendChild(m);

    m.addEventListener('click', (e) => {
        if (e.target === m) closeUserProfile();
        const closeBtn = e.target.closest('[data-up-close]');
        if (closeBtn) closeUserProfile();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && m.classList.contains('open')) closeUserProfile();
    });

    return m;
}

function openUserProfile(username) {
    if (!username) return;
    const m = ensureUserProfileModal();
    m.classList.add('open');
    userProfileState.currentUsername = username;
    userProfileState.activeTab = 'overview';
    loadUserProfile(username);
}

function closeUserProfile() {
    const m = document.getElementById('user-profile-modal');
    if (m) m.classList.remove('open');
    userProfileState.currentUsername = null;
    userProfileState.data = null;
}

async function loadUserProfile(username) {
    const body = document.getElementById('up-body');
    if (!body) return;
    body.innerHTML = '<div class="up-loading">Загрузка профиля…</div>';
    try {
        const data = await api.request('GET', `/profile/user/${encodeURIComponent(username)}`, null, true);
        userProfileState.data = data;
        renderUserProfile();
    } catch (e) {
        body.innerHTML = `<div class="up-error">
            <div class="up-error-icon">😢</div>
            <div>${escapeHtml(e.message || 'Не удалось загрузить профиль')}</div>
        </div>`;
    }
}

function renderUserProfile() {
    const data = userProfileState.data;
    const body = document.getElementById('up-body');
    if (!data || !body) return;

    const ch = data.character;
    const name = ch.display_name || ch.character_name || 'Герой';
    const handle = ch.username ? `@${ch.username}` : '';
    const avatar = (function () {
        if (ch.avatar_url && /^https?:\/\//.test(ch.avatar_url)) {
            return `<img src="${escapeAttrSafe(ch.avatar_url)}" alt="">`;
        }
        if (ch.avatar_url && ch.avatar_url.length <= 4) {
            return ch.avatar_url;
        }
        return typeof avatarFor === 'function' ? avatarFor(ch.level) : '🧑';
    })();

    const frameClass = ch.active_frame ? `up-frame ${ch.active_frame}` : '';
    const bgClass = ch.active_background ? `up-hero-bg ${ch.active_background}` : 'up-hero-bg';

    body.innerHTML = `
        <div class="up-hero-wrap">
            <div class="${bgClass}"></div>
            <div class="up-hero">
                <div class="up-avatar-wrap ${frameClass}">
                    <div class="up-avatar">${avatar}</div>
                </div>
                <div class="up-id">
                    <h2 class="up-name">${escapeHtml(name)}</h2>
                    ${handle ? `<div class="up-handle">${escapeHtml(handle)}</div>` : ''}
                    <div class="up-meta">
                        <span class="up-rank">${escapeHtml(ch.rank || 'Warrior')}</span>
                        <span class="up-dot">·</span>
                        <span class="up-level">Lvl ${ch.level || 1}</span>
                        <span class="up-dot">·</span>
                        <span class="up-streak">🔥 ${ch.current_streak || 0}</span>
                    </div>
                </div>
                <div class="up-actions">
                    ${renderFriendshipBtn(data)}
                </div>
            </div>
        </div>

        <nav class="up-tabs" id="up-tabs">
            <button class="up-tab ${userProfileState.activeTab === 'overview' ? 'active' : ''}" data-up-tab="overview">📊 Обзор</button>
            <button class="up-tab ${userProfileState.activeTab === 'achievements' ? 'active' : ''}" data-up-tab="achievements">🏆 Достижения</button>
            <button class="up-tab ${userProfileState.activeTab === 'posts' ? 'active' : ''}" data-up-tab="posts">📝 Посты</button>
        </nav>

        <div class="up-pane">${renderUserProfilePane()}</div>
    `;

    body.querySelector('#up-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-up-tab]');
        if (!btn) return;
        userProfileState.activeTab = btn.dataset.upTab;
        renderUserProfile();
    });

    body.querySelector('[data-up-act="add-friend"]')?.addEventListener('click', () => addFriendByUsername(ch.username));
    body.querySelector('[data-up-act="cancel-request"]')?.addEventListener('click', () => cancelFriendRequestByUsername(ch.username));
    body.querySelector('[data-up-act="remove-friend"]')?.addEventListener('click', () => removeFriendByUsername(ch.username));
    body.querySelector('[data-up-act="send-ping"]')?.addEventListener('click', () => sendPingByUserId(data.user.id));
}

function renderFriendshipBtn(data) {
    if (data.is_self) {
        return '<button class="up-btn up-btn-ghost" disabled>Это вы</button>';
    }
    switch (data.friendship_status) {
        case 'friends':
            return `
                <button class="up-btn up-btn-primary" data-up-act="send-ping">💪 Пинг</button>
                <button class="up-btn up-btn-ghost"   data-up-act="remove-friend">Убрать</button>
            `;
        case 'request_sent':
            return '<button class="up-btn up-btn-ghost" data-up-act="cancel-request">Запрос отправлен · Отменить</button>';
        case 'request_received':
            return '<button class="up-btn up-btn-primary" disabled>Запрос ждёт вашего ответа во «Друзьях»</button>';
        default:
            return '<button class="up-btn up-btn-primary" data-up-act="add-friend">➕ Добавить в друзья</button>';
    }
}

function renderUserProfilePane() {
    const data = userProfileState.data;
    if (!data) return '';
    const tab = userProfileState.activeTab;
    if (tab === 'achievements') return renderUserAchievements();
    if (tab === 'posts')        return renderUserPosts();
    return renderUserOverview();
}

function renderUserOverview() {
    const data = userProfileState.data;
    const c = data.counts || {};
    const ch = data.character;
    const cells = [
        { ic: '⚡', val: ch.xp_total || 0,         lbl: 'Всего XP' },
        { ic: '🌋', val: ch.longest_streak || 0,   lbl: 'Рекорд стрика' },
        { ic: '⚔️', val: c.tasks_done || 0,        lbl: 'Задач' },
        { ic: '🌱', val: c.habits_active || 0,     lbl: 'Привычек' },
        { ic: '🎯', val: c.goals_done || 0,        lbl: 'Целей' },
        { ic: '👥', val: c.friends || 0,           lbl: 'Друзей' },
        { ic: '🏆', val: c.challenges_joined || 0, lbl: 'Ивентов' },
        { ic: '📝', val: c.posts || 0,             lbl: 'Постов' },
    ];
    return `
        <div class="up-stats">
            ${cells.map(c => `
                <div class="up-stat">
                    <div class="up-stat-ic">${c.ic}</div>
                    <div class="up-stat-val">${c.val}</div>
                    <div class="up-stat-lbl">${c.lbl}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderUserAchievements() {
    const ach = userProfileState.data.achievements;
    if (!ach || !ach.items) return '<div class="up-empty">Нет данных</div>';
    const sorted = [...ach.items].sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return b.progress_pct - a.progress_pct;
    });
    return `
        <div class="up-ach-head">${ach.unlocked_count} из ${ach.total} открыто</div>
        <div class="up-ach-grid">
            ${sorted.map(a => `
                <div class="up-ach ${a.unlocked ? 'unlocked' : 'locked'}">
                    <div class="up-ach-ic">${a.icon}</div>
                    <div class="up-ach-body">
                        <div class="up-ach-title">${escapeHtml(a.title)}</div>
                        <div class="up-ach-desc">${escapeHtml(a.description)}</div>
                        ${!a.unlocked ? `
                            <div class="up-ach-bar"><div class="up-ach-fill" style="width:${a.progress_pct}%"></div></div>
                            <div class="up-ach-prog">${a.current} / ${a.threshold}</div>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderUserPosts() {
    const posts = userProfileState.data.posts || [];
    if (!posts.length) {
        return '<div class="up-empty">📝 Пока нет постов</div>';
    }
    setTimeout(() => {
        const wrap = document.querySelector('.up-posts');
        if (!wrap || typeof makePostCard !== 'function') return;
        wrap.innerHTML = '';
        posts.forEach(p => wrap.appendChild(makePostCard(p)));
    }, 0);
    return '<div class="posts-list up-posts"></div>';
}

async function addFriendByUsername(username) {
    if (!username) return;
    try {
        await api.request('POST', '/social/friends/request', { username }, true);
        showToast('Запрос отправлен');
        await loadUserProfile(username);
    } catch (e) {
        showToast(e.message || 'Не удалось отправить запрос', true);
    }
}

async function cancelFriendRequestByUsername(username) {
    try {
        await api.request('POST', '/social/friends/cancel', { username }, true);
        showToast('Запрос отменён');
        await loadUserProfile(username);
    } catch (e) {
        showToast(e.message || 'Не удалось отменить', true);
    }
}

async function removeFriendByUsername(username) {
    const ok = await confirmModal({
        title: 'Удалить из друзей?',
        message: `Пользователь @${username} больше не будет видеть ваши посты для друзей.`,
        confirmText: 'Удалить',
        danger: true,
    });
    if (!ok) return;
    try {
        await api.request('POST', '/social/friends/remove', { username }, true);
        showToast('Удалён из друзей');
        await loadUserProfile(username);
    } catch (e) {
        showToast(e.message || 'Не удалось убрать', true);
    }
}

async function sendPingByUserId(userId) {
    try {
        await api.request('POST', `/social/ping/${userId}`, {}, true);
        showToast('Пинг отправлен 💪');
    } catch (e) {
        showToast(e.message || 'Не удалось', true);
    }
}

window.openUserProfile = openUserProfile;
window.closeUserProfile = closeUserProfile;