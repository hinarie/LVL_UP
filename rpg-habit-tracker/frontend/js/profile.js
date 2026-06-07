let profileState = {
    profileData:  null,
    stats:        null,
    achievements: null,
    history:      null,
    historyType:  'xp',
    historyDays:  30,
    invCategory:  '',
};

const AVATAR_EMOJIS = [
    '🐣','🧒','👦','👧','🧑','👨','👩','🧔',
    '🧙','🧝','🧚','🧛','🧜','🧞','🦸','🦹',
    '🐱','🐶','🦊','🦁','🐯','🐺','🐻','🐼',
    '🦄','🐲','🐉','👻','💀','🤖','👽','🎃',
];

async function loadProfile() {
    try {

        const [profile, stats] = await Promise.all([
            api.request('GET', '/social/profile', null, true),
            api.request('GET', '/profile/stats', null, true),
        ]);
        profileState.profileData = profile;
        profileState.stats = stats;
        renderProfile();
    } catch (e) {
        console.error('Profile load error:', e);
    }
}

function renderProfile() {
    const profile = profileState.profileData;
    const stats   = profileState.stats;
    if (!profile || !stats) return;

    const char = profile.character || {};

    setAvatarDisplay(char.avatar_url, stats.level);

    const username = profile.user?.username || char.username || '';
    setText('profile-char-name',    char.display_name || char.character_name || 'Герой');
    const handleEl = document.getElementById('profile-display-name');
    if (handleEl) {
        if (username) {
            handleEl.innerHTML = `<span class="profile-handle">@${escapeAttr(username)}</span>`
                + (char.character_name && char.character_name !== char.display_name
                    ? ` <span class="profile-charname">· ${escapeAttr(char.character_name)}</span>`
                    : '');
        } else if (char.character_name && char.character_name !== char.display_name) {
            handleEl.textContent = char.character_name;
        } else {
            handleEl.textContent = '';
        }
    }
    setText('profile-rank',         stats.rank || 'Warrior');
    setText('profile-email',        profile.user?.email || '');
    setText('profile-since',        stats.member_since ? formatMemberSince(stats.member_since) : '');

    setText('profile-level',        stats.level);
    setText('profile-level-xp',     `${stats.xp_current_level} / ${stats.xp_per_level} XP`);
    const fill = document.getElementById('profile-xp-fill');
    if (fill) fill.style.width = `${stats.xp_progress_pct}%`;

    setText('profile-streak',       stats.current_streak);
    setText('profile-xp-total',     stats.xp_total);
    setText('profile-credits',      stats.credits);
    setText('profile-friends',      profile.friends_count || 0);
    setText('profile-tasks-done',   stats.counts?.tasks_done || 0);

    setText('overview-xp-today',     stats.xp_earned_today);
    setText('overview-xp-cap',       stats.daily_xp_cap);
    const todayFill = document.getElementById('overview-xp-today-fill');
    if (todayFill) {
        const pct = Math.min(100, Math.round((stats.xp_earned_today / stats.daily_xp_cap) * 100));
        todayFill.style.width = `${pct}%`;
    }
    setText('overview-longest',       stats.longest_streak);
    setText('overview-habits-active', stats.counts?.habits_active || 0);
    setText('overview-habit-marks',   stats.counts?.habit_marks || 0);
    setText('overview-goals-done',    stats.counts?.goals_done || 0);
    setText('overview-goals-total',   stats.counts?.goals_total || 0);
    setText('overview-challenges',    stats.counts?.challenges_joined || 0);
    setText('overview-items',         stats.counts?.items_owned || 0);

    const postsList = document.getElementById('profile-posts-list');
    if (postsList) {
        if (!profile.posts || profile.posts.length === 0) {
            postsList.innerHTML = `<div class="feed-empty">
                <div class="feed-empty-icon">📝</div><p>Пока нет постов</p>
            </div>`;
        } else {
            postsList.innerHTML = '';
            profile.posts.forEach(post => {
                if (typeof makePostCard === 'function') {
                    postsList.appendChild(makePostCard(post));
                }
            });
        }
    }
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setUsernameHint(text, kind = 'muted') {
    const el = document.getElementById('username-hint');
    if (!el) return;
    el.textContent = text;
    el.className = `username-hint username-hint-${kind}`;
    el.style.display = text ? 'block' : 'none';
}

function setAvatarDisplay(avatar_url, level) {
    const av = document.getElementById('profile-avatar');
    if (!av) return;
    if (avatar_url && /^https?:\/\//.test(avatar_url)) {
        av.innerHTML = `<img src="${escapeAttr(avatar_url)}" alt="avatar" onerror="this.parentElement.textContent='${escapeAttr(avatar_url.length <= 4 ? avatar_url : '')}'">`;
    } else if (avatar_url && avatar_url.length <= 4) {

        av.textContent = avatar_url;
    } else if (typeof avatarFor === 'function') {
        av.textContent = avatarFor(level);
    } else {
        av.textContent = '🧑';
    }
}

function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function formatMemberSince(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return 'С ' + d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function initProfileTabs() {
    const tabsEl = document.getElementById('profile-tabs');
    if (!tabsEl) return;
    tabsEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.profile-tab');
        if (!btn) return;
        const tab = btn.dataset.tab;
        document.querySelectorAll('.profile-tab').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.profile-pane').forEach(p =>
            p.classList.toggle('active', p.id === `profile-pane-${tab}`));
        onProfileTabOpen(tab);
    });
}

function onProfileTabOpen(tab) {
    if (tab === 'custom')        loadProfileInventory();
    if (tab === 'achievements')  loadProfileAchievements();
    if (tab === 'history')       loadProfileHistory();
}

async function loadProfileInventory() {
    try {
        const inventory = await api.request('GET', '/shop/inventory', null, true);
        renderProfileInventory(inventory);
    } catch (e) { console.error(e); }
}

const RARITY_LABEL = { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' };
const CAT_ICON = { theme: '🎨', background: '🖼', frame: '🔲', clothing: '👕', hairstyle: '💇', face: '😊', artifact: '🧪' };

function renderProfileInventory(items) {
    const grid = document.getElementById('profile-inv-grid');
    if (!grid) return;

    const filtered = profileState.invCategory
        ? items.filter(i => i.category === profileState.invCategory)
        : items;

    if (!filtered.length) {
        grid.innerHTML = `<div class="profile-inv-empty">
            <div class="profile-inv-empty-icon">🎒</div>
            <p>${items.length ? 'В этой категории пусто.' : 'Инвентарь пуст. Загляни в Магазин!'}</p>
        </div>`;
        return;
    }

    grid.innerHTML = '';
    filtered.forEach(item => grid.appendChild(makeInvCard(item)));
}

function makeInvCard(item) {
    const card = document.createElement('div');
    card.className = `profile-inv-card rarity-${item.rarity} ${item.is_equipped ? 'equipped' : ''}`;
    const icon = CAT_ICON[item.category] || '📦';
    const rarLabel = RARITY_LABEL[item.rarity] || item.rarity;
    const isArtifact = item.category === 'artifact';

    card.innerHTML = `
        ${item.quantity > 1 ? `<div class="profile-inv-qty">×${item.quantity}</div>` : ''}
        <div class="profile-inv-icon">${icon}</div>
        <div class="profile-inv-name">${escapeAttr(item.name)}</div>
        <div class="profile-inv-rar">${rarLabel}</div>
        ${item.is_equipped ? '<div class="profile-inv-equipped">✓ Надето</div>' : ''}
        <div class="profile-inv-actions">
            ${isArtifact
                ? `<button onclick="profileUseItem('${item.id}')">Использовать</button>`
                : `<button class="${item.is_equipped ? 'btn-unequip' : ''}"
                    onclick="profileEquipItem('${item.id}')">
                    ${item.is_equipped ? 'Снять' : 'Надеть'}
                </button>`
            }
        </div>`;
    return card;
}

async function profileEquipItem(invItemId) {
    try {
        const res = await api.request('POST', `/shop/equip/${invItemId}`, null, true);
        showToast(res.message || 'Готово');
        await loadProfileInventory();
        if (typeof loadCharacter === 'function') await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

async function profileUseItem(invItemId) {
    try {
        const res = await api.request('POST', `/shop/use/${invItemId}`, null, true);
        showToast(res.message || 'Готово');
        await loadProfileInventory();
        if (typeof loadCharacter === 'function') await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

function initInvFilters() {
    const wrap = document.getElementById('profile-inv-filters');
    if (!wrap) return;
    wrap.addEventListener('click', (e) => {
        const btn = e.target.closest('.profile-inv-filter');
        if (!btn) return;
        document.querySelectorAll('.profile-inv-filter').forEach(b => b.classList.toggle('active', b === btn));
        profileState.invCategory = btn.dataset.cat || '';
        loadProfileInventory();
    });
}

async function loadProfileAchievements() {
    try {
        const data = await api.request('GET', '/profile/achievements', null, true);
        profileState.achievements = data;
        renderAchievements();
    } catch (e) { console.error(e); }
}

function renderAchievements() {
    const data = profileState.achievements;
    if (!data) return;

    setText('ach-unlocked', data.unlocked_count);
    setText('ach-total',    data.total);
    setText('profile-ach-count', `${data.unlocked_count}/${data.total}`);

    const grid = document.getElementById('profile-ach-grid');
    if (!grid) return;

    const sorted = [...data.achievements].sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return b.progress_pct - a.progress_pct;
    });

    grid.innerHTML = '';
    sorted.forEach(ach => grid.appendChild(makeAchCard(ach)));
}

function makeAchCard(ach) {
    const card = document.createElement('div');
    card.className = `profile-ach-card ${ach.unlocked ? 'unlocked' : 'locked'}`;
    card.innerHTML = `
        ${ach.unlocked ? '<div class="profile-ach-badge">Открыто</div>' : ''}
        <div class="profile-ach-icon">${ach.icon}</div>
        <div class="profile-ach-body">
            <div class="profile-ach-title">${escapeAttr(ach.title)}</div>
            <div class="profile-ach-desc">${escapeAttr(ach.description)}</div>
            ${!ach.unlocked ? `
                <div class="profile-ach-bar"><div class="profile-ach-fill" style="width:${ach.progress_pct}%"></div></div>
                <div class="profile-ach-prog">${ach.current} / ${ach.threshold}</div>
            ` : ''}
        </div>`;
    return card;
}


async function loadProfileHistory() {
    const list = document.getElementById('profile-history-list');
    if (list) list.innerHTML = '<div class="profile-history-empty">Загрузка…</div>';
    try {
        const data = await api.request(
            'GET',
            `/profile/history?type=${profileState.historyType}&days=${profileState.historyDays}`,
            null, true,
        );
        profileState.history = data;
        renderHistory();
    } catch (e) {
        if (list) list.innerHTML = `<div class="profile-history-empty">Ошибка: ${escapeAttr(e.message)}</div>`;
    }
}

const XP_SOURCE_LABEL = {
    daily_task: '⚔️ Задача',
    subtask:    '🎯 Подзадача',
    habit:      '🌱 Привычка',
    challenge:  '🏆 Ивент',
    mini_game:  '🎮 Мини-игра',
    admin:      '⚙️ Админ',
};
const CRED_SOURCE_LABEL = {
    xp_conversion:   '⚡ Из XP',
    shop_purchase:   '🛒 Покупка',
    challenge_entry: '🎟 Взнос в ивент',
    challenge_prize: '🏆 Приз ивента',
    admin:           '⚙️ Админ',
};

function renderHistory() {
    const data = profileState.history;
    if (!data) return;

    const summary = document.getElementById('profile-history-summary');
    if (summary) {
        const sign = data.total >= 0 ? '+' : '';
        const unit = data.type === 'xp' ? 'XP' : '₡';
        summary.innerHTML = `
            <div>
                <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">Итого за период</div>
                <div class="profile-history-total">${sign}${data.total} ${unit}</div>
            </div>
            <div class="profile-spark">${renderSparkline(data.chart, data.type)}</div>
        `;
    }

    const list = document.getElementById('profile-history-list');
    if (!list) return;
    if (!data.items.length) {
        list.innerHTML = '<div class="profile-history-empty">За выбранный период нет записей.</div>';
        return;
    }

    const labels = data.type === 'xp' ? XP_SOURCE_LABEL : CRED_SOURCE_LABEL;
    list.innerHTML = '';
    data.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'profile-history-row';
        const sign = item.amount >= 0 ? '+' : '';
        const cls  = item.amount >= 0 ? 'pos' : 'neg';
        const unit = data.type === 'xp' ? 'XP' : '₡';
        row.innerHTML = `
            <div class="profile-history-row-left">
                <div class="profile-history-source">${labels[item.source] || item.source}</div>
                ${item.description ? `<div class="profile-history-desc">${escapeAttr(item.description)}</div>` : ''}
            </div>
            <div class="profile-history-row-right">
                <div class="profile-history-amount ${cls}">${sign}${item.amount} ${unit}</div>
                <div class="profile-history-time">${typeof relTime === 'function' ? relTime(item.created_at) : ''}</div>
            </div>`;
        list.appendChild(row);
    });
}

function renderSparkline(chart, type) {
    if (!chart || chart.length < 2) return '';
    const W = 320, H = 50, P = 4;
    const vals = chart.map(p => p.value);
    const max = Math.max(...vals, 1);
    const min = Math.min(...vals, 0);
    const range = max - min || 1;
    const dx = (W - P * 2) / (chart.length - 1);
    const points = chart.map((p, i) => {
        const x = P + i * dx;
        const y = H - P - ((p.value - min) / range) * (H - P * 2);
        return `${x},${y}`;
    }).join(' ');
    const color = type === 'xp' ? 'var(--accent-purple-bright)' : 'var(--accent-yellow)';
    const last = points.split(' ').slice(-1)[0]?.split(',') || [W - P, H / 2];
    return `
        <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:100%">
            <defs>
                <linearGradient id="sparkfill-${type}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%"   stop-color="${color}" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
                </linearGradient>
            </defs>
            <polyline points="${points} ${W - P},${H - P} ${P},${H - P}"
                fill="url(#sparkfill-${type})" stroke="none"/>
            <polyline points="${points}"
                fill="none" stroke="${color}" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${last[0]}" cy="${last[1]}" r="3" fill="${color}"/>
        </svg>`;
}

function initHistoryControls() {
    const tabs = document.getElementById('profile-history-tabs');
    if (tabs) {
        tabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.profile-history-tab');
            if (!btn) return;
            document.querySelectorAll('.profile-history-tab').forEach(b => b.classList.toggle('active', b === btn));
            profileState.historyType = btn.dataset.htype;
            loadProfileHistory();
        });
    }
    const range = document.getElementById('profile-history-range');
    if (range) {
        range.addEventListener('change', () => {
            profileState.historyDays = parseInt(range.value, 10) || 30;
            loadProfileHistory();
        });
    }
}


function showModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'flex';
}
function hideModal(id) {
    const m = document.getElementById(id);
    if (m) m.style.display = 'none';
}

function initProfileEditing() {
    document.getElementById('profile-edit-name')?.addEventListener('click', () => {
        const char = profileState.profileData?.character || {};
        const user = profileState.profileData?.user || {};
        const dn = document.getElementById('edit-display-name');
        const cn = document.getElementById('edit-character-name');
        const un = document.getElementById('edit-username');
        if (dn) dn.value = char.display_name || '';
        if (cn) cn.value = char.character_name || '';
        if (un) un.value = user.username || char.username || '';
        setUsernameHint('', 'muted');
        showModal('profile-name-modal');
    });

    let usernameCheckTimer = null;
    document.getElementById('edit-username')?.addEventListener('input', (e) => {
        clearTimeout(usernameCheckTimer);
        const val = (e.target.value || '').trim().toLowerCase();
        const current = profileState.profileData?.user?.username || '';
        if (val === current) {
            setUsernameHint('Это ваш текущий username', 'muted');
            return;
        }
        if (!val) {
            setUsernameHint('', 'muted');
            return;
        }
        if (!/^[a-z0-9_]{3,30}$/.test(val)) {
            setUsernameHint('3-30 символов: латиница, цифры, _', 'error');
            return;
        }
        setUsernameHint('Проверка…', 'muted');
        usernameCheckTimer = setTimeout(async () => {
            try {
                const res = await api.request('GET',
                    `/profile/username/check?username=${encodeURIComponent(val)}`, null, true);
                if (res.available) {
                    setUsernameHint('✓ Свободно', 'ok');
                } else {
                    setUsernameHint(res.error || 'Занято', 'error');
                }
            } catch (err) { setUsernameHint('', 'muted'); }
        }, 400);
    });

    document.getElementById('save-profile-name')?.addEventListener('click', async () => {
        const display_name   = document.getElementById('edit-display-name')?.value?.trim() || '';
        const character_name = document.getElementById('edit-character-name')?.value?.trim() || '';
        const username       = document.getElementById('edit-username')?.value?.trim().toLowerCase() || '';
        const errEl = document.getElementById('edit-profile-error');
        if (!character_name) {
            if (errEl) { errEl.textContent = 'Имя персонажа не может быть пустым'; errEl.style.display = 'block'; }
            return;
        }
        const payload = { display_name, character_name };
        const currentUsername = profileState.profileData?.user?.username || '';
        if (username && username !== currentUsername) payload.username = username;

        try {
            await api.request('PATCH', '/profile', payload, true);
            showToast('Сохранено');
            hideModal('profile-name-modal');
            await loadProfile();
        } catch (e) {
            if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
        }
    });

    document.getElementById('profile-avatar-edit')?.addEventListener('click', () => {
        renderAvatarPicker();
        const urlInput = document.getElementById('edit-avatar-url');
        const current = profileState.profileData?.character?.avatar_url || '';
        if (urlInput) urlInput.value = /^https?:\/\//.test(current) ? current : '';
        showModal('profile-avatar-modal');
    });

    document.getElementById('save-avatar')?.addEventListener('click', async () => {
        const selectedEl = document.querySelector('.avatar-picker-cell.selected');
        const urlVal = document.getElementById('edit-avatar-url')?.value?.trim() || '';
        const avatar_url = urlVal || (selectedEl ? selectedEl.dataset.emoji : '');
        try {
            await api.request('PATCH', '/profile', { avatar_url }, true);
            showToast('Аватар обновлён');
            hideModal('profile-avatar-modal');
            await loadProfile();
        } catch (e) {
            const errEl = document.getElementById('edit-avatar-error');
            if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
        }
    });

    document.getElementById('reset-avatar')?.addEventListener('click', async () => {
        try {
            await api.request('PATCH', '/profile', { avatar_url: '' }, true);
            showToast('Аватар сброшен');
            hideModal('profile-avatar-modal');
            await loadProfile();
        } catch (e) { showToast(e.message, true); }
    });

    document.querySelectorAll('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => hideModal(btn.dataset.close));
    });
    ['profile-name-modal', 'profile-avatar-modal'].forEach(id => {
        const m = document.getElementById(id);
        if (m) m.addEventListener('click', (e) => { if (e.target === m) hideModal(id); });
    });
}

function renderAvatarPicker() {
    const picker = document.getElementById('avatar-picker');
    if (!picker) return;
    const current = profileState.profileData?.character?.avatar_url || '';
    picker.innerHTML = '';
    AVATAR_EMOJIS.forEach(emo => {
        const cell = document.createElement('div');
        cell.className = `avatar-picker-cell ${current === emo ? 'selected' : ''}`;
        cell.dataset.emoji = emo;
        cell.textContent = emo;
        cell.addEventListener('click', () => {
            picker.querySelectorAll('.avatar-picker-cell').forEach(c => c.classList.remove('selected'));
            cell.classList.add('selected');
            const urlInput = document.getElementById('edit-avatar-url');
            if (urlInput) urlInput.value = '';
        });
        picker.appendChild(cell);
    });
}

initProfileTabs();
initInvFilters();
initHistoryControls();
initProfileEditing();