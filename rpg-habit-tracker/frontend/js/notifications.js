// ════════════════════════════════════════════════════════════════
// УВЕДОМЛЕНИЯ — колокольчик в хедере, дропдаун со списком, пуллинг
// ════════════════════════════════════════════════════════════════
//
// Хранит состояние, рендерит элементы, периодически дёргает бэк за
// счётчиком непрочитанных. Сам не лезет в чужие модули — для перехода
// на пост/профиль использует уже существующие функции (openUserProfile,
// switchPage и т.п.) если они есть; иначе тихо игнорирует.

const NOTIF_POLL_MS = 30_000; // как часто перепроверять unread-count

const notifState = {
    items: [],
    unreadCount: 0,
    isOpen: false,
    isLoading: false,
    pollTimer: null,
};

// ────────────────────────────────────────────────────────────────
// Хелперы рендера для разных типов
// ────────────────────────────────────────────────────────────────

// Возвращает { html: 'основной текст', preview?: 'превью контента' }
function notifContent(n) {
    const actorName = n.actor?.display_name
        || n.actor?.character_name
        || n.payload?.sender_name
        || n.payload?.commenter_name
        || n.payload?.liker_name
        || n.payload?.accepter_name
        || 'Кто-то';
    const safeName = `<strong class="notif-link" data-act="open-user" data-username="${escapeAttrSafe(n.actor?.username || '')}">${escapeHtml(actorName)}</strong>`;

    switch (n.type) {
        case 'friend_request':
            return {
                icon: '👋',
                html: `${safeName} отправил(а) запрос в друзья`,
            };
        case 'friend_accepted':
            return {
                icon: '🤝',
                html: `${safeName} принял(а) ваш запрос в друзья`,
            };
        case 'ping_received':
            return {
                icon: '💪',
                html: `${safeName} прислал(а) мотивационный пинг`,
                preview: n.payload?.message ? escapeHtml(n.payload.message) : '',
            };
        case 'post_liked':
            return {
                icon: '❤️',
                html: `${safeName} лайкнул(а) ваш пост`,
                preview: n.payload?.post_preview ? escapeHtml(n.payload.post_preview) : '',
            };
        case 'post_commented':
            return {
                icon: '💬',
                html: `${safeName} прокомментировал(а) ваш пост`,
                preview: n.payload?.comment_preview ? escapeHtml(n.payload.comment_preview) : '',
            };
        case 'level_up':
            return {
                icon: '⚡',
                html: `Новый уровень — <strong>Lvl ${escapeHtml(String(n.payload?.new_level ?? '?'))}</strong>`,
            };
        case 'rank_up':
            return {
                icon: '🏆',
                html: `Новый ранг — <strong>${escapeHtml(n.payload?.new_rank || '?')}</strong>`,
            };
        default:
            return { icon: '🔔', html: escapeHtml(n.type) };
    }
}

// Маленькая аватарка актора (если есть) — иначе emoji-иконка типа
function notifIconHtml(n, fallbackEmoji) {
    const url = n.actor?.avatar_url;
    if (url && /^https?:\/\//.test(url)) {
        return `<img src="${escapeAttrSafe(url)}" alt="">`;
    }
    if (url && url.length <= 4) {
        return escapeHtml(url);
    }
    return fallbackEmoji || '🔔';
}

function notifItemHtml(n) {
    const c = notifContent(n);
    const time = (typeof relTime === 'function') ? relTime(n.created_at) : '';
    const icon = notifIconHtml(n, c.icon);
    return `
        <div class="notif-item ${n.is_read ? '' : 'unread'}"
             data-notif-id="${escapeAttrSafe(n.id)}"
             data-notif-type="${escapeAttrSafe(n.type)}"
             data-entity-id="${escapeAttrSafe(n.entity_id || '')}"
             data-actor-username="${escapeAttrSafe(n.actor?.username || '')}">
            <div class="notif-icon-wrap">${icon}</div>
            <div class="notif-text">
                ${c.html}
                ${c.preview ? `<span class="notif-preview">«${c.preview}»</span>` : ''}
            </div>
            <div class="notif-time">${escapeHtml(time)}</div>
            <button class="notif-del" data-act="notif-delete" title="Удалить">✕</button>
        </div>
    `;
}

// ────────────────────────────────────────────────────────────────
// API
// ────────────────────────────────────────────────────────────────

async function notifFetchUnreadCount() {
    try {
        const data = await api.request('GET', '/notifications/unread-count', null, true);
        notifSetUnreadCount(data.unread_count || 0);
    } catch (e) {
        // тихо игнорим (например, юзер ещё не залогинен)
    }
}

async function notifFetchList() {
    if (notifState.isLoading) return;
    notifState.isLoading = true;
    try {
        const data = await api.request('GET', '/notifications?limit=30', null, true);
        notifState.items = data.items || [];
        notifSetUnreadCount(data.unread_count || 0);
        renderNotifList();
    } catch (e) {
        const list = document.getElementById('notif-list');
        if (list) list.innerHTML = `<div class="notif-empty">Не удалось загрузить</div>`;
    } finally {
        notifState.isLoading = false;
    }
}

async function notifMarkRead(id) {
    try {
        await api.request('POST', `/notifications/${id}/read`, null, true);
    } catch (e) { /* ignore */ }
}

async function notifMarkAll() {
    try {
        await api.request('POST', '/notifications/read-all', null, true);
        notifState.items.forEach(n => n.is_read = true);
        notifSetUnreadCount(0);
        renderNotifList();
    } catch (e) {
        showToast?.('Не удалось отметить все', true);
    }
}

async function notifDelete(id) {
    try {
        await api.request('DELETE', `/notifications/${id}`, null, true);
        notifState.items = notifState.items.filter(n => n.id !== id);
        // Если удалили непрочитанное — скорректировать счётчик
        notifFetchUnreadCount();
        renderNotifList();
    } catch (e) {
        showToast?.('Не удалось удалить', true);
    }
}

async function notifClearAll() {
    const ok = (typeof confirmModal === 'function')
        ? await confirmModal({
            title: 'Очистить все уведомления?',
            message: 'Все уведомления будут удалены.',
            confirmText: 'Очистить',
            danger: true,
        })
        : true;
    if (!ok) return;
    try {
        await api.request('DELETE', '/notifications', null, true);
        notifState.items = [];
        notifSetUnreadCount(0);
        renderNotifList();
    } catch (e) {
        showToast?.('Не удалось очистить', true);
    }
}

// ────────────────────────────────────────────────────────────────
// Рендер
// ────────────────────────────────────────────────────────────────

function notifSetUnreadCount(count) {
    notifState.unreadCount = count;
    const badge = document.getElementById('notif-badge');
    const bell = document.getElementById('notif-bell');
    if (!badge || !bell) return;
    if (count > 0) {
        badge.style.display = '';
        badge.textContent = count > 99 ? '99+' : String(count);
        bell.classList.add('has-unread');
    } else {
        badge.style.display = 'none';
        bell.classList.remove('has-unread');
    }
}

function renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (!notifState.items.length) {
        list.innerHTML = `<div class="notif-empty">Пока тихо. Здесь будут лайки, комменты, пинги и левелапы.</div>`;
        return;
    }
    list.innerHTML = notifState.items.map(notifItemHtml).join('');
}

// ────────────────────────────────────────────────────────────────
// Открыть/закрыть дропдаун
// ────────────────────────────────────────────────────────────────

function openNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    const bd = document.getElementById('notif-backdrop');
    if (!dd) return;
    dd.style.display = 'flex';
    if (bd && window.matchMedia('(max-width: 768px)').matches) {
        bd.style.display = 'block';
    }
    notifState.isOpen = true;
    notifFetchList(); // всегда подгружаем свежий список при открытии
}

function closeNotifDropdown() {
    const dd = document.getElementById('notif-dropdown');
    const bd = document.getElementById('notif-backdrop');
    if (dd) dd.style.display = 'none';
    if (bd) bd.style.display = 'none';
    notifState.isOpen = false;
}

function toggleNotifDropdown() {
    if (notifState.isOpen) closeNotifDropdown();
    else openNotifDropdown();
}

// ────────────────────────────────────────────────────────────────
// Клик по уведомлению — навигация к источнику
// ────────────────────────────────────────────────────────────────

// Универсальная навигация: используем существующую логику initNavigation()
// в app.js, т.е. кликаем по соответствующей nav-кнопке.
function notifGoToPage(page) {
    const btn = document.querySelector(`.nav-btn[data-page="${page}"], .mobile-nav-btn[data-page="${page}"]`);
    if (btn) btn.click();
}

async function handleNotifClick(item) {
    const id = item.dataset.notifId;
    const type = item.dataset.notifType;
    const entityId = item.dataset.entityId;
    const username = item.dataset.actorUsername;

    // Локально отметим прочитанным, не ждём ответа сервера
    const n = notifState.items.find(x => x.id === id);
    if (n && !n.is_read) {
        n.is_read = true;
        notifSetUnreadCount(Math.max(0, notifState.unreadCount - 1));
        item.classList.remove('unread');
        notifMarkRead(id);
    }

    // Куда перейти
    switch (type) {
        case 'friend_request':
            // На ленту → вкладка «Друзья»
            notifGoToPage('feed');
            if (typeof switchFeedTab === 'function') switchFeedTab('friends');
            closeNotifDropdown();
            break;

        case 'friend_accepted':
        case 'ping_received':
            // Открыть профиль того, кто инициировал
            if (username && typeof openUserProfile === 'function') {
                openUserProfile(username);
                closeNotifDropdown();
            }
            break;

        case 'post_liked':
        case 'post_commented':
            // Перейти на ленту — полноценный deep-link до поста потом
            notifGoToPage('feed');
            closeNotifDropdown();
            break;

        case 'level_up':
        case 'rank_up':
            // На свой профиль
            notifGoToPage('profile');
            closeNotifDropdown();
            break;
    }
}

// ────────────────────────────────────────────────────────────────
// Делегация кликов
// ────────────────────────────────────────────────────────────────

function setupNotifHandlers() {
    const bell = document.getElementById('notif-bell');
    const dd = document.getElementById('notif-dropdown');
    const bd = document.getElementById('notif-backdrop');
    const markAll = document.getElementById('notif-mark-all');
    const clearAll = document.getElementById('notif-clear-all');

    bell?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNotifDropdown();
    });

    bd?.addEventListener('click', closeNotifDropdown);

    markAll?.addEventListener('click', (e) => {
        e.stopPropagation();
        notifMarkAll();
    });

    clearAll?.addEventListener('click', (e) => {
        e.stopPropagation();
        notifClearAll();
    });

    // Esc — закрыть
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && notifState.isOpen) closeNotifDropdown();
    });

    // Клик снаружи — закрыть (только на десктопе; на мобилке закрывает бэкдроп)
    document.addEventListener('click', (e) => {
        if (!notifState.isOpen) return;
        if (window.matchMedia('(max-width: 768px)').matches) return;
        if (e.target.closest('#notif-dropdown') || e.target.closest('#notif-bell')) return;
        closeNotifDropdown();
    });

    // Делегация по самому списку: клик по элементу, удаление, клик по имени → профиль
    dd?.addEventListener('click', (e) => {
        // Сначала — удаление, чтобы не открывалась навигация
        const delBtn = e.target.closest('[data-act="notif-delete"]');
        if (delBtn) {
            e.stopPropagation();
            const item = delBtn.closest('.notif-item');
            if (item) notifDelete(item.dataset.notifId);
            return;
        }
        // Клик по имени актора — открыть его профиль
        const userLink = e.target.closest('[data-act="open-user"]');
        if (userLink) {
            e.stopPropagation();
            const u = userLink.dataset.username;
            if (u && typeof openUserProfile === 'function') {
                openUserProfile(u);
                closeNotifDropdown();
            }
            return;
        }
        // Клик по уведомлению — обычная навигация
        const item = e.target.closest('.notif-item');
        if (item) handleNotifClick(item);
    });
}

// ────────────────────────────────────────────────────────────────
// Пуллинг
// ────────────────────────────────────────────────────────────────

function startNotifPolling() {
    stopNotifPolling();
    notifFetchUnreadCount(); // первый сразу
    notifState.pollTimer = setInterval(() => {
        // Не дёргаем, если вкладка скрыта — экономим запросы
        if (document.hidden) return;
        notifFetchUnreadCount();
    }, NOTIF_POLL_MS);
}

function stopNotifPolling() {
    if (notifState.pollTimer) {
        clearInterval(notifState.pollTimer);
        notifState.pollTimer = null;
    }
}

// При возврате в таб — сразу обновить счётчик
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) notifFetchUnreadCount();
});

// ────────────────────────────────────────────────────────────────
// Public init — вызывается из app.js (loadApp) после логина
// ────────────────────────────────────────────────────────────────

function initNotifications() {
    setupNotifHandlers();
    startNotifPolling();
}

window.initNotifications = initNotifications;
window.stopNotifPolling   = stopNotifPolling;