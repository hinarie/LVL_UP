// ═══════════════════════════════════════════════════════════════
// challenges.js
// ═══════════════════════════════════════════════════════════════

let allChallenges    = [];
let currentChallenge = null;
let activeFilter     = 'all';
let activeLiveTab    = 'tasks';
let taskTimers       = {};
let holdTimers       = {};
let tickInterval     = null;

// ──────────────────────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────────────────────

function initChallenges() {
    document.querySelectorAll('.ch-live-tab').forEach(btn =>
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ch-live-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeLiveTab = btn.dataset.tab;
            document.querySelectorAll('.ch-live-panel-content').forEach(p => p.classList.remove('active'));
            document.getElementById(`lp-tab-${activeLiveTab}`)?.classList.add('active');
        })
    );

    document.getElementById('lp-finish-btn')?.addEventListener('click', finishChallenge);
    document.getElementById('lp-post-btn')?.addEventListener('click', submitPost);
    initCreateForm();

    // Автотик статусов каждые 60 сек
    tickInterval = setInterval(tickStatuses, 60000);

    loadChallenges();
}

// ──────────────────────────────────────────────────────────────
// Загрузка
// ──────────────────────────────────────────────────────────────

async function loadChallenges() {
    try {
        // При (пере)входе в раздел на мобиле всегда стартуем со списка
        document.getElementById('page-challenges')?.setAttribute('data-mobile-view', 'list');
        allChallenges = await api.request('GET', '/challenges/', null, true);
        renderCatalog();
        if (currentChallenge) {
            refreshLivePanel(currentChallenge.challenge.id);
        } else if (allChallenges.length > 0) {
            // Автооткрываем первый НЕзавершённый ивент. Завершённые идут в архив
            // в конце каталога — не стоит показывать их первыми в живой панели.
            const first = allChallenges.find(c => c.status !== 'finished')
                       ?? allChallenges[0];
            openLivePanel(first.id);
        }
    } catch (e) {
        console.error('loadChallenges:', e);
        showToast('Не удалось загрузить ивенты', true);
    }
}

async function refreshLivePanel(challengeId) {
    try {
        const data = await api.request('GET', `/challenges/${challengeId}`, null, true);
        currentChallenge = data;
        renderLivePanel(data);
    } catch (e) { console.error(e); }
}

// ──────────────────────────────────────────────────────────────
// Каталог
// ──────────────────────────────────────────────────────────────

function renderCatalog() {
    // По умолчанию на мобиле показываем список (если пользователь не открыл детали)
    const page = document.getElementById('page-challenges');
    if (page && !page.hasAttribute('data-mobile-view')) {
        page.setAttribute('data-mobile-view', 'list');
    }

    const active   = allChallenges.filter(c => c.status !== 'finished');
    const archived = allChallenges.filter(c => c.status === 'finished');
    const joined   = active.filter(c => c.joined);
    const open     = active.filter(c => !c.joined);

    const myList   = document.getElementById('my-challenges-list');
    const pubList  = document.getElementById('public-challenges-list');
    const joinedSection = document.getElementById('ch-section-joined');
    const pubSection    = document.getElementById('ch-section-public');

    if (joinedSection) joinedSection.style.display = joined.length > 0 ? '' : 'none';
    renderList(myList, joined, 'Вступи в ивент и выиграй кредиты');

    if (pubSection) pubSection.style.display = open.length > 0 ? '' : 'none';
    renderList(pubList, open, 'Нет доступных ивентов');

    // Архив
    const archiveSection = document.getElementById('ch-archive-section');
    const archiveList    = document.getElementById('ch-archive-list');
    const archiveCount   = document.getElementById('ch-archive-count');
    if (archived.length > 0) {
        archiveSection.style.display = '';
        if (archiveCount) archiveCount.textContent = archived.length;
        // Перерисовываем всегда — иначе только что завершившийся ивент
        // не попадёт в архив до перезагрузки страницы.
        if (archiveList) {
            archiveList.innerHTML = '';
            archived.forEach(c => archiveList.appendChild(makeCatalogCard(c)));
        }
    } else {
        if (archiveSection) archiveSection.style.display = 'none';
    }
}

function renderList(container, items, emptyMsg) {
    if (!container) return;
    if (items.length === 0) {
        container.innerHTML = `<div class="ch-empty"><div class="ch-empty-icon">🏆</div><p>${emptyMsg}</p></div>`;
        return;
    }
    container.innerHTML = '';
    items.forEach(c => container.appendChild(makeCatalogCard(c)));
}

function toggleArchive() {
    const list    = document.getElementById('ch-archive-list');
    const chevron = document.getElementById('ch-archive-chevron');
    if (!list) return;
    const isOpen = list.style.display !== 'none';
    list.style.display   = isOpen ? 'none' : '';
    if (chevron) chevron.textContent = isOpen ? '▼ показать' : '▲ скрыть';
}

const STATUS_LABELS = { upcoming: '⏳ Скоро', active: '🔥 Активный', finished: '✅ Завершён' };
const TYPE_LABELS   = { public: '🌍 Публичный', friends: '👥 Для друзей' };

function makeCatalogCard(ch) {
    const card = document.createElement('div');
    card.className = `challenge-card status-${ch.status}`;
    card.dataset.challengeId = ch.id;
    if (ch.joined) card.dataset.joined = '1';
    card.onclick = () => openLivePanel(ch.id, true);

    // Прогресс (для активных)
    let progressHtml = '';
    if (ch.status === 'active') {
        const starts = new Date(ch.starts_at).getTime();
        const ends   = new Date(ch.ends_at).getTime();
        const now    = Date.now();
        const pct    = Math.min(100, Math.max(0, ((now - starts) / (ends - starts)) * 100));
        const daysLeft = Math.max(0, Math.ceil((ends - now) / 86400000));
        progressHtml = `
            <div class="ch-card-progress">
                <div class="ch-card-progress-bar"><div class="ch-card-progress-fill" style="width:${pct}%"></div></div>
                <div class="ch-card-progress-label">
                    <span>Прогресс</span>
                    <span>${daysLeft} дн. осталось</span>
                </div>
            </div>`;
    }

    const joinBtn = !ch.joined && ch.status !== 'finished'
        ? `<button class="btn-card-join" onclick="event.stopPropagation();joinChallenge('${ch.id}')">Вступить · ${ch.entry_fee_credits} ₡</button>`
        : ch.joined
            ? `<span class="ch-card-joined">✓ ${ch.my_score} очков</span>`
            : '';

    card.innerHTML = `
        <div class="ch-card-top">
            <span class="ch-card-emoji">${ch.banner_emoji || '🏆'}</span>
            <div class="ch-card-info">
                <div class="ch-card-badges">
                    <span class="ch-badge ch-badge-${ch.status}">${STATUS_LABELS[ch.status] || ch.status}</span>
                    <span class="ch-badge ch-badge-${ch.challenge_type}">${TYPE_LABELS[ch.challenge_type] || ''}</span>
                    ${ch.required_rank ? `<span class="ch-badge ch-badge-rank">⚔️ ${ch.required_rank}+</span>` : ''}
                </div>
                <div class="ch-card-title">${ch.title}</div>
                ${ch.description ? `<div class="ch-card-desc">${ch.description}</div>` : ''}
            </div>
        </div>
        <div class="ch-card-stats">
            <div class="ch-card-stat">
                <div class="ch-card-stat-val" style="color:var(--accent-yellow)">${ch.prize_pool_credits} ₡</div>
                <div class="ch-card-stat-lbl">Фонд</div>
            </div>
            <div class="ch-card-stat">
                <div class="ch-card-stat-val">${ch.participants_count}</div>
                <div class="ch-card-stat-lbl">Участников</div>
            </div>
            <div class="ch-card-stat">
                <div class="ch-card-stat-val" style="color:var(--accent-purple-bright)">${ch.entry_fee_credits} ₡</div>
                <div class="ch-card-stat-lbl">Взнос</div>
            </div>
        </div>
        ${progressHtml}
        <div class="ch-card-footer">
            ${joinBtn}
        </div>`;
    return card;
}

// ──────────────────────────────────────────────────────────────
// Живая панель
// ──────────────────────────────────────────────────────────────

async function openLivePanel(challengeId, userInitiated = false) {
    // Подсвечиваем карточку по data-challenge-id
    document.querySelectorAll('.challenge-card').forEach(c => c.classList.remove('active'));
    const targetCard = document.querySelector(`.challenge-card[data-challenge-id="${challengeId}"]`);
    if (targetCard) targetCard.classList.add('active');

    try {
        const data = await api.request('GET', `/challenges/${challengeId}`, null, true);
        currentChallenge = data;
        document.getElementById('ch-live-empty').style.display = 'none';
        document.getElementById('ch-live-content').style.display = 'flex';
        renderLivePanel(data);
        // Сброс на первый таб
        document.querySelectorAll('.ch-live-tab').forEach(b => b.classList.remove('active'));
        document.querySelector('.ch-live-tab[data-tab="tasks"]')?.classList.add('active');
        document.querySelectorAll('.ch-live-panel-content').forEach(p => p.classList.remove('active'));
        document.getElementById('lp-tab-tasks')?.classList.add('active');
        activeLiveTab = 'tasks';

        // На узких экранах используем мастер-деталь: список и детали — это два
        // отдельных «экрана». Тап по карточке открывает детали на весь экран
        // с кнопкой «Назад». На десктопе атрибут игнорируется (две колонки).
        if (userInitiated && window.matchMedia('(max-width: 900px)').matches) {
            showLiveDetailMobile();
        }
    } catch (e) {
        showToast('Не удалось загрузить ивент', true);
    }
}

// ── Мобильный мастер-деталь: переключение список ⇄ детали ──────
function showLiveDetailMobile() {
    const page = document.getElementById('page-challenges');
    if (page) page.setAttribute('data-mobile-view', 'detail');
    ensureLiveBackBar();
    // Прокрутка к верху деталей
    requestAnimationFrame(() => {
        document.getElementById('ch-live-panel')?.scrollIntoView({ block: 'start' });
        window.scrollTo({ top: 0, behavior: 'auto' });
    });
}

function showCatalogMobile() {
    const page = document.getElementById('page-challenges');
    if (page) page.setAttribute('data-mobile-view', 'list');
    // Снимаем подсветку — мы снова в списке
    document.querySelectorAll('.challenge-card.active').forEach(c => c.classList.remove('active'));
}

// Вставляем кнопку «Назад» в шапку живой панели один раз (без правки HTML-партиала)
function ensureLiveBackBar() {
    const content = document.getElementById('ch-live-content');
    if (!content || document.getElementById('ch-live-back')) return;
    const bar = document.createElement('button');
    bar.id = 'ch-live-back';
    bar.className = 'ch-live-back';
    bar.type = 'button';
    bar.innerHTML = '<span class="ch-live-back-arrow">←</span> К списку ивентов';
    bar.onclick = showCatalogMobile;
    content.insertBefore(bar, content.firstChild);
}

function renderLivePanel(data) {
    const { challenge, is_joined, is_creator, tasks, leaderboard, prize_preview, posts } = data;

    // Шапка
    document.getElementById('lp-emoji').textContent = challenge.banner_emoji || '🏆';
    document.getElementById('lp-title').textContent = challenge.title;
    document.getElementById('lp-desc').textContent  = challenge.description || '';

    // Бейджи
    const badgesEl = document.getElementById('lp-badges');
    badgesEl.innerHTML = `
        <span class="ch-badge ch-badge-${challenge.status}">${STATUS_LABELS[challenge.status] || challenge.status}</span>
        <span class="ch-badge ch-badge-${challenge.challenge_type}">${TYPE_LABELS[challenge.challenge_type] || ''}</span>
        ${challenge.required_rank ? `<span class="ch-badge ch-badge-rank">⚔️ ${challenge.required_rank}+</span>` : ''}
    `;

    // Статы
    const statsEl = document.getElementById('lp-stats');
    statsEl.innerHTML = `
        <div class="ch-live-stat"><div class="ch-live-stat-val" style="color:var(--accent-yellow)">${challenge.prize_pool_credits} ₡</div><div class="ch-live-stat-lbl">Призовой фонд</div></div>
        <div class="ch-live-stat"><div class="ch-live-stat-val">${challenge.participants_count}</div><div class="ch-live-stat-lbl">Участников</div></div>
        <div class="ch-live-stat"><div class="ch-live-stat-val" style="color:var(--accent-purple-bright)">${challenge.entry_fee_credits} ₡</div><div class="ch-live-stat-lbl">Взнос</div></div>
        <div class="ch-live-stat"><div class="ch-live-stat-val">${fmtDate(challenge.starts_at)} – ${fmtDate(challenge.ends_at)}</div><div class="ch-live-stat-lbl">Период</div></div>
    `;

    // Прогресс-бар для активных
    const progressEl = document.getElementById('lp-progress');
    if (challenge.status === 'active') {
        const starts = new Date(challenge.starts_at).getTime();
        const ends   = new Date(challenge.ends_at).getTime();
        const now    = Date.now();
        const pct    = Math.min(100, Math.max(0, ((now - starts) / (ends - starts)) * 100));
        const daysLeft = Math.max(0, Math.ceil((ends - now) / 86400000));
        progressEl.style.display = '';
        document.getElementById('lp-progress-fill').style.width = pct + '%';
        document.getElementById('lp-progress-label').innerHTML =
            `<span>Прогресс ивента</span><span>${daysLeft} дн. осталось</span>`;
    } else {
        progressEl.style.display = 'none';
    }

    // Действия
    const actionsEl = document.getElementById('lp-actions');
    actionsEl.innerHTML = '';
    if (!is_joined && challenge.status !== 'finished') {
        const btn = document.createElement('button');
        btn.className = 'btn-live-join';
        btn.textContent = `Вступить · ${challenge.entry_fee_credits} ₡`;
        btn.onclick = () => joinChallenge(challenge.id);
        actionsEl.appendChild(btn);
    } else if (is_joined) {
        const badge = document.createElement('span');
        badge.className = 'ch-live-joined-badge';
        badge.textContent = `✓ Участвую · ${challenge.my_score} очков`;
        actionsEl.appendChild(badge);
    }

    // Задачи
    renderLiveTasks(tasks, is_joined, challenge.status);

    // Лидерборд
    renderLiveBoard(leaderboard, prize_preview);
    const finishWrap = document.getElementById('lp-finish-wrap');
    if (finishWrap) finishWrap.style.display = (is_creator && challenge.status !== 'finished') ? '' : 'none';

    // Лента
    const isFinished = challenge.status === 'finished';
    // В завершённом ивенте писать нельзя — только просмотр
    document.getElementById('lp-post-form').style.display = (is_joined && !isFinished) ? '' : 'none';
    renderLiveFeed(posts, isFinished);
}

// ──────────────────────────────────────────────────────────────
// Задачи
// ──────────────────────────────────────────────────────────────

function renderLiveTasks(tasks, is_joined, status) {
    const list = document.getElementById('lp-tasks-list');
    list.innerHTML = '';
    if (!tasks || tasks.length === 0) {
        list.innerHTML = '<div class="ch-empty"><p>Задачи не добавлены</p></div>';
        return;
    }
    tasks.forEach(task => list.appendChild(makeLiveTaskCard(task, is_joined, status)));
}

function makeLiveTaskCard(task, is_joined, status) {
    const card = document.createElement('div');
    const comp = task.completion;
    const isDone    = !!(comp && comp.completed_at);
    const isRunning = !!(comp && comp.timer_started_at && !comp.completed_at);

    // Проверяем истёк ли таймер уже прямо сейчас (при загрузке страницы)
    let timerExpired = false;
    if (isRunning && comp.timer_started_at) {
        const startMs  = new Date(comp.timer_started_at.endsWith('Z') || comp.timer_started_at.includes('+')
            ? comp.timer_started_at : comp.timer_started_at + 'Z').getTime();
        const totalMs  = task.duration_minutes * 60 * 1000;
        timerExpired   = (Date.now() - startMs) >= totalMs;
    }

    const canStart  = is_joined && status === 'active' && task.in_window && !isDone && !isRunning;
    // Hold-кнопка только если таймер УЖЕ истёк; иначе показываем прогресс-бар
    const canFinish = is_joined && status === 'active' && isRunning && timerExpired;
    const showTimer = isRunning && !timerExpired;

    card.className = `lp-task ${isDone ? 'done' : ''}`;
    card.id = `lp-task-${task.id}`;

    let windowHtml = '';
    if (task.available_from_hour !== null && task.available_until_hour !== null) {
        windowHtml = `<span class="lp-task-window">🕐 ${task.available_from_hour}:00–${task.available_until_hour}:00 UTC</span>`;
        if (!task.in_window && !isDone) windowHtml += `<span class="lp-task-locked">· Заблокировано</span>`;
    }

    let actionHtml = '';
    if (isDone) {
        actionHtml = `<span class="lp-task-done-badge">✓ Готово</span>`;
    } else if (canStart) {
        actionHtml = `<button class="btn-task-start" onclick="chStartTask('${task.id}')">▶ Старт</button>`;
    } else if (canFinish) {
        actionHtml = holdBtnHtml(task.id, comp.id);
    } else if (isRunning && !timerExpired) {
        actionHtml = `<span class="lp-task-timer-running">⏳ Идёт...</span>`;
    }

    card.innerHTML = `
        <div class="lp-task-top">
            <div class="lp-task-check ${isDone ? 'done' : ''}">${isDone ? '✓' : ''}</div>
            <div class="lp-task-info">
                <div class="lp-task-title ${isDone ? 'done' : ''}">${task.title}</div>
                <div class="lp-task-meta">
                    <span class="lp-task-xp">+${task.xp_reward} XP</span>
                    <span class="lp-task-score">+${task.score_value} очков</span>
                    <span class="lp-task-dur">⏱ ${task.duration_minutes} мин</span>
                    ${windowHtml}
                </div>
            </div>
            <div class="lp-task-action" id="lp-task-action-${task.id}">${actionHtml}</div>
        </div>
        <div class="lp-task-timer" id="lp-timer-${task.id}" style="display:${showTimer ? '' : 'none'}">
            <div class="lp-timer-bar"><div class="lp-timer-fill" id="lp-timer-fill-${task.id}" style="width:0%"></div></div>
            <div class="lp-timer-label">
                <span id="lp-timer-label-${task.id}">Загрузка...</span>
            </div>
        </div>`;

    // Запускаем countdown только если таймер ещё не истёк
    if (isRunning && comp.timer_started_at && !timerExpired) {
        startCountdown(task.id, comp.id, comp.timer_started_at, task.duration_minutes);
    }
    return card;
}

function holdBtnHtml(taskId, completionId) {
    return `<button class="btn-hold" id="hold-btn-${taskId}"
        onmousedown="holdStart('${taskId}','${completionId}')"
        onmouseup="holdCancel('${taskId}')"
        onmouseleave="holdCancel('${taskId}')"
        ontouchstart="holdStart('${taskId}','${completionId}')"
        ontouchend="holdCancel('${taskId}')">
        <span class="hold-ring" id="hold-ring-${taskId}"></span>
        Удержи для завершения
    </button>`;
}

function startCountdown(taskId, completionId, startedAt, durationMin) {
    // Сервер возвращает UTC без Z — добавляем
    const startStr = startedAt.endsWith('Z') || startedAt.includes('+') ? startedAt : startedAt + 'Z';
    const startMs = new Date(startStr).getTime();
    const totalMs = durationMin * 60 * 1000;
    if (taskTimers[taskId]) clearInterval(taskTimers[taskId]);
    taskTimers[taskId] = setInterval(() => {
        const elapsed   = Date.now() - startMs;
        const pct       = Math.min(100, (elapsed / totalMs) * 100);
        const remaining = Math.max(0, totalMs - elapsed);
        const fill  = document.getElementById(`lp-timer-fill-${taskId}`);
        const label = document.getElementById(`lp-timer-label-${taskId}`);
        if (!fill) { clearInterval(taskTimers[taskId]); return; }
        fill.style.width = pct + '%';
        if (remaining > 0) {
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            label.textContent = `Осталось: ${m}:${s.toString().padStart(2,'0')}`;
        } else {
            clearInterval(taskTimers[taskId]);
            // Скрываем прогресс-бар, показываем Hold-кнопку
            const timerWrap = document.getElementById(`lp-timer-${taskId}`);
            if (timerWrap) timerWrap.style.display = 'none';
            const actionEl = document.getElementById(`lp-task-action-${taskId}`);
            if (actionEl) actionEl.innerHTML = holdBtnHtml(taskId, completionId);
        }
    }, 500);
}

const HOLD_MS = 2000;

function holdStart(taskId, completionId) {
    const ring = document.getElementById(`hold-ring-${taskId}`);
    if (ring) {
        ring.style.transition = `transform ${HOLD_MS}ms linear, opacity ${HOLD_MS}ms linear`;
        ring.style.transform  = 'scale(30)';
        ring.style.opacity    = '0';
    }
    holdTimers[taskId] = setTimeout(() => chCompleteTask(taskId, completionId), HOLD_MS);
}

function holdCancel(taskId) {
    if (holdTimers[taskId]) { clearTimeout(holdTimers[taskId]); delete holdTimers[taskId]; }
    const ring = document.getElementById(`hold-ring-${taskId}`);
    if (ring) {
        ring.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
        ring.style.transform  = 'scale(0)';
        ring.style.opacity    = '0.3';
    }
}

async function chStartTask(taskId) {
    if (!currentChallenge) return;
    try {
        const res = await api.request('POST', `/challenges/${currentChallenge.challenge.id}/tasks/${taskId}/start`, null, true);
        showToast(res.message);
        await refreshLivePanel(currentChallenge.challenge.id);
        startCountdown(taskId, res.completion_id, res.timer_started_at, res.duration_minutes);
    } catch (e) { showToast(e.message, true); }
}

async function chCompleteTask(taskId, completionId) {
    if (!currentChallenge) return;
    const btn = document.getElementById(`hold-btn-${taskId}`);
    if (btn) { btn.disabled = true; btn.textContent = 'Завершение...'; }
    try {
        const res = await api.request('POST', `/challenges/${currentChallenge.challenge.id}/tasks/${taskId}/complete`, null, true);
        clearInterval(taskTimers[taskId]);
        showToast(res.message);
        // award_xp возвращает поле xp_gained (не xp_awarded) — иначе анимация не покажется
        showXpFloat(res.xp_result?.xp_gained ?? res.xp_result?.xp_awarded ?? 0);
        await refreshLivePanel(currentChallenge.challenge.id);
        await loadCharacter();
        await loadChallenges();
    } catch (e) {
        showToast(e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = 'Удержи для завершения'; }
    }
}

// ──────────────────────────────────────────────────────────────
// Join
// ──────────────────────────────────────────────────────────────

async function joinChallenge(challengeId) {
    try {
        const res = await api.request('POST', `/challenges/${challengeId}/join`, null, true);
        showToast(`${res.message} 🏆 Фонд: ${res.prize_pool} ₡`);
        await loadChallenges();
        await loadCharacter();
        // Если ивент уже активен — его задачи должны сразу появиться в Квестах.
        if (typeof loadTasks === 'function') {
            await loadTasks();
        }
        await refreshLivePanel(challengeId);
    } catch (e) { showToast(e.message, true); }
}

// ──────────────────────────────────────────────────────────────
// Лидерборд
// ──────────────────────────────────────────────────────────────

function renderLiveBoard(leaderboard, prize_preview) {
    const prizesEl = document.getElementById('lp-prizes');
    prizesEl.innerHTML = `
        <div class="lp-prize-item"><span class="lp-prize-medal">🥇</span><span class="lp-prize-val">${prize_preview['1st']} ₡</span></div>
        <div class="lp-prize-item"><span class="lp-prize-medal">🥈</span><span class="lp-prize-val">${prize_preview['2nd']} ₡</span></div>
        <div class="lp-prize-item"><span class="lp-prize-medal">🥉</span><span class="lp-prize-val">${prize_preview['3rd']} ₡</span></div>
    `;
    const listEl = document.getElementById('lp-board-list');
    const medals = ['🥇','🥈','🥉'];
    if (!leaderboard || leaderboard.length === 0) {
        listEl.innerHTML = '<div class="ch-empty"><p>Нет участников</p></div>';
        return;
    }
    listEl.innerHTML = '';
    leaderboard.forEach((p, i) => {
        const item = document.createElement('div');
        item.className = `lp-board-item ${p.is_me ? 'is-me' : ''}`;
        item.innerHTML = `
            <div class="lp-board-pos">${medals[i] || `#${i+1}`}</div>
            <div class="lp-board-avatar">${p.character.name[0]?.toUpperCase() || '?'}</div>
            <div class="lp-board-info">
                <div class="lp-board-name">${p.character.name}</div>
                <div class="lp-board-sub">Lvl ${p.character.level} · ${p.character.rank}</div>
            </div>
            <div class="lp-board-score">${p.score} очков</div>`;
        listEl.appendChild(item);
    });
}

async function finishChallenge() {
    if (!currentChallenge) return;
    const ok = await confirmModal({
        title: 'Завершить ивент?',
        message: 'Призы будут выданы победителям. Это действие нельзя отменить.',
        confirmText: 'Завершить',
        danger: true,
    });
    if (!ok) return;
    try {
        const res = await api.request('POST', `/challenges/${currentChallenge.challenge.id}/finish`, null, true);
        showToast(res.message);
        await loadChallenges();
        await loadCharacter();
        await refreshLivePanel(currentChallenge.challenge.id);
    } catch (e) { showToast(e.message, true); }
}

// ──────────────────────────────────────────────────────────────
// Лента + комментарии
// ──────────────────────────────────────────────────────────────

function renderLiveFeed(posts, isFinished = false) {
    const list = document.getElementById('lp-feed-list');
    list.innerHTML = '';
    if (!posts || posts.length === 0) {
        list.innerHTML = '<div class="ch-empty"><p>Лента пуста — поделись прогрессом!</p></div>';
        return;
    }
    posts.forEach(post => list.appendChild(makeChallengePostCard(post, isFinished)));
}

const EMOJI_MAP = { fire: '🔥', muscle: '💪', star: '⭐', like: '👍' };

// Свой ли это контент (для кнопок удаления)
function chIsMine(userId) {
    return userId && window.MY_USER_ID && String(userId) === String(window.MY_USER_ID);
}

function makeChallengePostCard(post, isFinished = false) {
    const card = document.createElement('div');
    card.className = `lp-post ${post.is_auto_generated ? 'auto-post' : ''}`;
    card.id = `lp-post-${post.id}`;

    // Реакции — только одна активная. В завершённом ивенте только для вида (не кликаются).
    const myReaction = post.my_reactions && post.my_reactions.length > 0 ? post.my_reactions[0] : null;
    const reactionsHtml = Object.entries(EMOJI_MAP).map(([key, emoji]) => {
        const count  = (post.reactions && post.reactions[key]) || 0;
        const active = myReaction === key;
        // В завершённом ивенте показываем только реакции, у которых есть счётчик,
        // и без обработчика клика (просмотр).
        if (isFinished && count === 0) return '';
        const onClick = isFinished ? '' : `onclick="toggleReaction('${post.id}','${key}',this)"`;
        return `<button class="lp-reaction ${active ? 'active' : ''} ${isFinished ? 'lp-reaction-readonly' : ''}"
            data-emoji="${key}" ${onClick}>
            ${emoji}${count > 0 ? ` ${count}` : ''}
        </button>`;
    }).join('');

    // Комментарии (+ кнопка удаления своих)
    const comments = post.comments || [];
    const commentsHtml = comments.map(c => `
        <div class="lp-comment" id="lp-comment-${c.id}">
            <div class="lp-comment-avatar">${(c.author_name || '?')[0].toUpperCase()}</div>
            <div class="lp-comment-body">
                <div class="lp-comment-head">
                    <span class="lp-comment-author">${c.author_name || 'Герой'}</span>
                    ${c.created_at ? `<span class="lp-comment-time">${fmtRelTime(c.created_at)}</span>` : ''}
                    ${chIsMine(c.user_id) ? `<button class="lp-comment-del" title="Удалить"
                        onclick="chDeleteComment('${post.id}','${c.id}')">✕</button>` : ''}
                </div>
                <div class="lp-comment-text">${chEscapeHtml(c.content)}</div>
            </div>
        </div>`).join('');

    const commentCount = comments.length;
    const commentLabel = commentCount > 0 ? `Комментарии (${commentCount})` : 'Комментировать';

    // Кнопка удаления своего поста (авто-посты не удаляем)
    const deletePostBtn = (chIsMine(post.author.user_id) && !post.is_auto_generated)
        ? `<button class="lp-post-del" title="Удалить пост" onclick="chDeletePost('${post.id}')">🗑</button>`
        : '';

    // Форма комментария скрыта в завершённом ивенте
    const commentFormHtml = isFinished ? '' : `
        <div class="lp-comment-form">
            <input class="lp-comment-input" id="lp-comment-input-${post.id}"
                placeholder="Комментарий..." maxlength="200">
            <button class="btn-comment-send" onclick="chSendComment('${post.id}')">↑</button>
        </div>`;

    card.innerHTML = `
        <div class="lp-post-header">
            <div class="lp-post-avatar">${post.author.name[0]?.toUpperCase() || '?'}</div>
            <div class="lp-post-author-info">
                <div class="lp-post-author-name">${post.author.name}</div>
                <div class="lp-post-author-meta">Lvl ${post.author.level} · ${fmtRelTime(post.created_at)}</div>
            </div>
            ${post.cross_posted ? '<span style="font-size:12px;color:var(--text-muted)" title="В глобальной ленте">🌍</span>' : ''}
            ${deletePostBtn}
        </div>
        <div class="lp-post-content">${chEscapeHtml(post.content)}</div>
        <div class="lp-post-footer-row">
            <div class="lp-reactions">${reactionsHtml}</div>
            <button class="btn-toggle-comments" onclick="chToggleComments('${post.id}')">
                💬 ${commentLabel}
            </button>
        </div>
        <div class="lp-comments" id="lp-comments-${post.id}" style="display:none">
            <div class="lp-comments-list" id="lp-comments-list-${post.id}">
                ${commentsHtml}
            </div>
            ${commentFormHtml}
        </div>`;
    return card;
}

// ── Удаление поста / комментария (только свои) ────────────────
async function chDeletePost(postId) {
    const ok = await confirmModal({
        title: 'Удалить пост?',
        message: 'Пост будет удалён без возможности восстановления.',
        confirmText: 'Удалить',
        danger: true,
    });
    if (!ok) return;
    try {
        await api.request('DELETE',
            `/challenges/${currentChallenge.challenge.id}/posts/${postId}`, null, true);
        document.getElementById(`lp-post-${postId}`)?.remove();
        showToast('Пост удалён');
    } catch (e) { showToast(e.message, true); }
}

async function chDeleteComment(postId, commentId) {
    const ok = await confirmModal({
        title: 'Удалить комментарий?',
        message: 'Комментарий будет удалён без возможности восстановления.',
        confirmText: 'Удалить',
        danger: true,
    });
    if (!ok) return;
    try {
        await api.request('DELETE',
            `/challenges/${currentChallenge.challenge.id}/posts/${postId}/comments/${commentId}`,
            null, true);
        document.getElementById(`lp-comment-${commentId}`)?.remove();
        // Обновляем счётчик в кнопке
        const listEl = document.getElementById(`lp-comments-list-${postId}`);
        const cur = listEl ? listEl.querySelectorAll('.lp-comment').length : 0;
        const btn = document.querySelector(`#lp-post-${postId} .btn-toggle-comments`);
        if (btn) btn.innerHTML = `💬 ${cur > 0 ? `Комментарии (${cur})` : 'Комментировать'}`;
        showToast('Комментарий удалён');
    } catch (e) { showToast(e.message, true); }
}

async function toggleReaction(postId, emoji, btn) {
    if (!currentChallenge) return;
    // Оптимистичный UI — сначала обновляем, потом запрос
    const postEl = document.getElementById(`lp-post-${postId}`);
    const activeBtn = postEl?.querySelector('.lp-reaction.active');
    const isTogglingOff = activeBtn === btn;

    // Снимаем все активные реакции в этом посте
    postEl?.querySelectorAll('.lp-reaction.active').forEach(b => b.classList.remove('active'));

    if (!isTogglingOff) btn.classList.add('active');

    try {
        // Если была другая активная — сначала снимаем её
        if (activeBtn && activeBtn !== btn) {
            const oldEmoji = activeBtn.dataset.emoji;
            if (oldEmoji) await api.request('POST',
                `/challenges/${currentChallenge.challenge.id}/posts/${postId}/react`,
                { emoji: oldEmoji }, true);
        }
        // Ставим / снимаем текущую
        await api.request('POST',
            `/challenges/${currentChallenge.challenge.id}/posts/${postId}/react`,
            { emoji }, true);
    } catch (e) {
        // Откатываем UI при ошибке
        if (!isTogglingOff) btn.classList.remove('active');
        if (activeBtn && activeBtn !== btn) activeBtn.classList.add('active');
        showToast('Ошибка реакции', true);
    }
}

function chToggleComments(postId) {
    const el = document.getElementById(`lp-comments-${postId}`);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? '' : 'none';
}

async function chSendComment(postId) {
    if (!currentChallenge) return;
    const input = document.getElementById(`lp-comment-input-${postId}`);
    const content = input?.value?.trim();
    if (!content) return;
    try {
        const res = await api.request('POST', `/challenges/${currentChallenge.challenge.id}/posts/${postId}/comments`, { content }, true);
        // Добавляем комментарий в DOM
        const commentsEl = document.getElementById(`lp-comments-${postId}`);
        const commentForm = commentsEl?.querySelector('.lp-comment-form');
        const commentEl = document.createElement('div');
        commentEl.className = 'lp-comment';
        commentEl.id = `lp-comment-${res.id}`;
        commentEl.innerHTML = `
            <div class="lp-comment-avatar">${(res.author_name || '?')[0].toUpperCase()}</div>
            <div class="lp-comment-body">
                <div class="lp-comment-head">
                    <span class="lp-comment-author">${res.author_name || 'Герой'}</span>
                    <span class="lp-comment-time">${fmtRelTime(res.created_at || new Date().toISOString())}</span>
                    <button class="lp-comment-del" title="Удалить"
                        onclick="chDeleteComment('${postId}','${res.id}')">✕</button>
                </div>
                <div class="lp-comment-text">${chEscapeHtml(res.content)}</div>
            </div>`;
        const listEl = document.getElementById(`lp-comments-list-${postId}`);
        if (listEl) listEl.appendChild(commentEl);
        // Обновляем счётчик
        const toggleBtn = commentsEl?.closest('.lp-post')?.querySelector('.btn-toggle-comments');
        if (toggleBtn) {
            const cur = listEl ? listEl.querySelectorAll('.lp-comment').length : 0;
            toggleBtn.textContent = `💬 Комментарии (${cur})`;
        }
        input.value = '';
    } catch (e) { showToast(e.message, true); }
}

async function submitPost() {
    if (!currentChallenge) return;
    const input     = document.getElementById('lp-post-input');
    const crosspost = document.getElementById('lp-crosspost-check');
    const content   = input.value.trim();
    if (!content) return;
    const btn = document.getElementById('lp-post-btn');
    btn.disabled = true;
    try {
        await api.request('POST', `/challenges/${currentChallenge.challenge.id}/posts`,
            { content, cross_post: crosspost.checked }, true);
        input.value = '';
        crosspost.checked = false;
        showToast('Пост опубликован!');
        await refreshLivePanel(currentChallenge.challenge.id);
    } catch (e) { showToast(e.message, true); }
    finally { btn.disabled = false; }
}

// ──────────────────────────────────────────────────────────────
// Автотик статусов
// ──────────────────────────────────────────────────────────────

async function tickStatuses() {
    try {
        await api.request('POST', '/challenges/admin/tick', null, true);
        await loadChallenges();
        // Тик мог перевести ивент upcoming → active либо active → finished.
        // Перезагружаем Квесты, чтобы задачи такого ивента появились/исчезли там.
        if (typeof loadTasks === 'function') {
            await loadTasks();
        }
    } catch (e) { /* тихо */ }
}

// ──────────────────────────────────────────────────────────────
// Форма создания
// ──────────────────────────────────────────────────────────────

function initCreateForm() {
    document.getElementById('open-challenge-modal')?.addEventListener('click', openCreateModal);
    document.getElementById('close-challenge-modal')?.addEventListener('click', () => {
        document.getElementById('challenge-modal').style.display = 'none';
    });

    document.querySelectorAll('#challenge-form .ch-type-btn').forEach(btn =>
        btn.addEventListener('click', () => {
            document.querySelectorAll('#challenge-form .ch-type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        })
    );

    document.getElementById('ch-stake')?.addEventListener('input', e => {
        document.getElementById('ch-entry-preview').textContent = Math.floor((parseInt(e.target.value) || 0) / 2);
    });

    document.getElementById('ch-add-task-btn')?.addEventListener('click', addTaskRow);
    document.getElementById('challenge-form')?.addEventListener('submit', submitCreateForm);
    addTaskRow();
}

function openCreateModal() {
    const now   = new Date();
    const in30d = new Date(now.getTime() + 30 * 24 * 3600000);
    // <input type="datetime-local"> работает в ЛОКАЛЬНОМ времени, поэтому формат
    // тоже должен быть локальным (toISOString() даёт UTC и сдвигает значение).
    const fmtLocal = d => {
        const off = d.getTimezoneOffset() * 60000;
        return new Date(d.getTime() - off).toISOString().slice(0, 16);
    };
    // Старт = сейчас: вместе с серверным фиксом ивент создаётся сразу активным,
    // и его задачи появляются в Квестах без ожидания admin/tick.
    document.getElementById('ch-starts').value = fmtLocal(now);
    document.getElementById('ch-ends').value   = fmtLocal(in30d);
    document.getElementById('challenge-modal').style.display = 'flex';
    document.getElementById('ch-error').style.display = 'none';
}

let taskRowIdx = 0;

function addTaskRow() {
    const builder = document.getElementById('ch-tasks-builder');
    const idx = taskRowIdx++;
    const row = document.createElement('div');
    row.className = 'ch-task-builder-row';
    row.id = `ch-tb-${idx}`;
    row.innerHTML = `
        <div class="ch-task-row-header">
            <span class="ch-task-row-num">Задача ${idx + 1}</span>
            ${idx > 0 ? `<button type="button" class="ch-task-row-remove" onclick="document.getElementById('ch-tb-${idx}').remove()">✕</button>` : ''}
        </div>
        <input type="text" class="ch-form-input" name="task_title_${idx}" placeholder="Название задачи" required>
        <div class="ch-task-row-opts">
            <div class="ch-task-opt">
                <span class="ch-task-opt-label">XP</span>
                <input type="number" class="ch-form-input" name="task_xp_${idx}" value="25" min="5" max="200" style="padding:6px 8px">
            </div>
            <div class="ch-task-opt">
                <span class="ch-task-opt-label">Таймер (мин)</span>
                <input type="number" class="ch-form-input" name="task_dur_${idx}" value="15" min="1" max="480" style="padding:6px 8px">
            </div>
            <div class="ch-task-opt">
                <span class="ch-task-opt-label">Очки</span>
                <input type="number" class="ch-form-input" name="task_score_${idx}" value="10" min="1" max="100" style="padding:6px 8px">
            </div>
            <div class="ch-task-opt">
                <span class="ch-task-opt-label">Тип</span>
                <select class="ch-form-input ch-form-select" name="task_repeat_${idx}" style="padding:6px 8px"
                    onchange="toggleCustomDays(${idx}, this.value)">
                    <option value="daily">🔄 Ежедневно</option>
                    <option value="once">1️⃣ Один раз</option>
                    <option value="custom_days">📅 Свои дни</option>
                </select>
            </div>
        </div>
        <div class="ch-task-custom-days" id="ch-custom-days-${idx}" style="display:none">
            <span class="ch-task-opt-label">Дни недели</span>
            <div class="ch-days-picker">
                ${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((d,i) =>
                    `<label class="ch-day-btn"><input type="checkbox" name="task_day_${idx}_${i}" value="${i}"><span>${d}</span></label>`
                ).join('')}
            </div>
        </div>
        <div class="ch-task-window-row">
            <label class="ch-task-window-label">
                <input type="checkbox" name="task_win_${idx}" onchange="toggleTaskWindow(${idx},this.checked)">
                Временное окно (UTC)
            </label>
            <div class="ch-task-window-inputs" id="ch-twin-${idx}" style="display:none">
                <input type="number" class="ch-form-input" name="task_from_${idx}" placeholder="От" min="0" max="23">
                <span>—</span>
                <input type="number" class="ch-form-input" name="task_until_${idx}" placeholder="До" min="0" max="23">
            </div>
        </div>`;
    builder.appendChild(row);
}

function toggleTaskWindow(idx, on) {
    document.getElementById(`ch-twin-${idx}`).style.display = on ? 'flex' : 'none';
}

function toggleCustomDays(idx, val) {
    const el = document.getElementById(`ch-custom-days-${idx}`);
    if (el) el.style.display = val === 'custom_days' ? '' : 'none';
}

async function submitCreateForm(e) {
    e.preventDefault();
    const errEl = document.getElementById('ch-error');
    errEl.style.display = 'none';

    const rows = document.querySelectorAll('.ch-task-builder-row');
    const tasks = [];
    let err = null;
    rows.forEach((row, i) => {
        const titleInput = row.querySelector(`[name^="task_title_"]`);
        const title = titleInput?.value?.trim();
        if (!title) { err = 'Заполните название всех задач'; return; }
        const idx = titleInput.name.replace('task_title_', '');
        const winCheck = row.querySelector(`[name^="task_win_"]`);
        const repeatType = row.querySelector(`[name="task_repeat_${idx}"]`)?.value || 'daily';
        const task = {
            title,
            xp_reward:        parseInt(row.querySelector(`[name="task_xp_${idx}"]`)?.value) || 25,
            duration_minutes: parseInt(row.querySelector(`[name="task_dur_${idx}"]`)?.value) || 15,
            score_value:      parseInt(row.querySelector(`[name="task_score_${idx}"]`)?.value) || 10,
            repeat_type:      repeatType,
        };
        if (repeatType === 'custom_days') {
            const checked = [...row.querySelectorAll(`[name^="task_day_${idx}_"]:checked`)].map(cb => cb.value);
            if (checked.length === 0) { err = 'Выберите хотя бы один день для повторения'; return; }
            task.custom_days = checked.join(',');
        }
        if (winCheck?.checked) {
            task.available_from_hour  = parseInt(row.querySelector(`[name="task_from_${idx}"]`)?.value);
            task.available_until_hour = parseInt(row.querySelector(`[name="task_until_${idx}"]`)?.value);
        }
        tasks.push(task);
    });

    if (err) { errEl.textContent = err; errEl.style.display = 'block'; return; }
    if (!tasks.length) { errEl.textContent = 'Добавьте хотя бы одну задачу'; errEl.style.display = 'block'; return; }

    const typeBtn = document.querySelector('#challenge-form .ch-type-btn.active');
    const payload = {
        title:                 document.getElementById('ch-title').value,
        description:           document.getElementById('ch-desc').value || null,
        banner_emoji:          document.getElementById('ch-emoji').value || '🏆',
        challenge_type:        typeBtn?.dataset.type || 'public',
        required_rank:         document.getElementById('ch-rank').value || null,
        initial_stake_credits: parseInt(document.getElementById('ch-stake').value),
        starts_at:             new Date(document.getElementById('ch-starts').value).toISOString(),
        ends_at:               new Date(document.getElementById('ch-ends').value).toISOString(),
        tasks,
    };

    const submitBtn = e.target.querySelector('.ch-submit-btn');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Создание...';

    try {
        const created = await api.request('POST', '/challenges/', payload, true);
        document.getElementById('challenge-modal').style.display = 'none';
        e.target.reset();
        document.getElementById('ch-tasks-builder').innerHTML = '';
        taskRowIdx = 0;
        addTaskRow();
        showToast('Ивент создан! 🏆');
        await loadChallenges();
        await loadCharacter();
        // На случай, если ивент стартует сразу — подтянуть его задачи в Квесты.
        if (typeof loadTasks === 'function') {
            await loadTasks();
        }
        openLivePanel(created.id);
    } catch (err) {
        errEl.textContent = err.message;
        errEl.style.display = 'block';
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Создать ивент';
    }
}

// ──────────────────────────────────────────────────────────────
// Utils
// ──────────────────────────────────────────────────────────────

function fmtDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function fmtRelTime(iso) {
    if (!iso) return '';
    // Сервер возвращает UTC без Z — добавляем
    const str = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
    const diff = Date.now() - new Date(str).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'только что';
    if (m < 60) return `${m} мин назад`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч назад`;
    return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function chEscapeHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showXpFloat(amount) {
    if (!amount) return;
    const el = document.createElement('div');
    el.className = 'xp-float';
    el.textContent = `+${amount} XP`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1600);
}