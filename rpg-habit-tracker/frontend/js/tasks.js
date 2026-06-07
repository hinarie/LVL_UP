let character = null;
let tasks = [];
let activeTimers = {};

async function loadCharacter() {
    try {
        character = await api.request('GET', '/character/', null, true);
        renderCharacter();

        if (typeof applyCosmetics === 'function') applyCosmetics(character);
    } catch (e) { console.error('Ошибка загрузки персонажа:', e); }
}

async function loadTasks() {
    try {
        tasks = await api.request('GET', '/tasks/', null, true);
        renderTasks();
    } catch (e) { console.error('Ошибка загрузки задач:', e); }
}

function renderCharacter() {
    if (!character) return;
    document.getElementById('char-name').textContent = character.character_name;
    document.getElementById('char-rank').textContent = character.rank;
    document.getElementById('char-level').textContent = `Lvl ${character.level}`;
    document.getElementById('char-level-stat').textContent = character.level;
    document.getElementById('char-credits').textContent = character.credits;
    document.getElementById('char-streak').textContent = character.current_streak;
    document.getElementById('xp-label').textContent = `${character.xp_current_level} / 1000`;
    document.getElementById('xp-fill').style.width = character.xp_progress_pct + '%';
    document.getElementById('xp-cap-label').textContent =
        `Сегодня: ${character.xp_earned_today} / ${character.daily_xp_cap} XP`;

    const avatars = ['🐣','🧒','👦','🧑','👨','🧔','👴'];
    const idx = Math.min(Math.floor((character.level - 1) / 5), avatars.length - 1);
    document.getElementById('char-avatar').textContent = avatars[idx];

    const banner = document.getElementById('double-xp-banner');
    if (banner) banner.style.display = character.double_xp_active ? 'block' : 'none';
}

const DIFF_COLORS = { easy: '#10b981', medium: '#f59e0b', hard: '#ef4444' };
const DIFF_LABELS = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };

function renderTasks() {
    const list = document.getElementById('tasks-list');

    Object.values(activeTimers).forEach(t => clearInterval(t));
    activeTimers = {};

    const regularTasks   = tasks.filter(t => !t.source);
    const challengeTasks = tasks.filter(t => t.source === 'challenge');

    const active = regularTasks.filter(t => t.status === 'active');
    const done   = regularTasks.filter(t => t.status === 'done');
    const chActive = challengeTasks.filter(t => t.status === 'active');
    const chDone   = challengeTasks.filter(t => t.status === 'done');

    if (tasks.length === 0) {
        list.innerHTML = `
            <div class="tasks-empty" id="tasks-empty">
                <div class="empty-icon">📋</div>
                <p>Нет активных задач.<br>Создай первый квест!</p>
            </div>`;
        return;
    }

    list.innerHTML = '';

    if (active.length > 0) {
        list.appendChild(makeSectionHeader('⚡ Активные', 'active-header'));
        active.forEach(t => {
            const card = makeTaskCard(t);
            list.appendChild(card);
            requestAnimationFrame(() => card.classList.add('card-visible'));
        });
    }

    if (chActive.length > 0) {
        list.appendChild(makeSectionHeader('🏆 Задачи ивентов', 'challenge-header'));
        chActive.forEach(t => {
            const card = makeChallengeTaskCard(t);
            list.appendChild(card);
            requestAnimationFrame(() => card.classList.add('card-visible'));
        });
    }

    if (done.length > 0 || chDone.length > 0) {
        list.appendChild(makeSectionHeader('✅ Выполнено', 'done-header'));
        [...done, ...chDone].forEach(t => {
            const card = t.source === 'challenge' ? makeChallengeTaskCard(t) : makeTaskCard(t);
            list.appendChild(card);
            requestAnimationFrame(() => card.classList.add('card-visible'));
        });
    }
}

function makeChallengeTaskCard(task) {
    const card = document.createElement('div');
    const isDone = task.status === 'done';

    let timerExpired = false;
    if (task.is_timer_running && task.timer_started_at) {
        const startStr = task.timer_started_at.endsWith('Z') ? task.timer_started_at : task.timer_started_at + 'Z';
        const elapsed = Date.now() - new Date(startStr).getTime();
        timerExpired = elapsed >= task.duration_minutes * 60 * 1000;
    }

    card.className = `task-card task-challenge-card ${isDone ? 'task-done' : ''}`;
    card.dataset.id = task.id;

    const windowOk = task.in_window !== false;

    let actionBtn = '';
    if (isDone) {
        actionBtn = '<span style="color:var(--accent-green);font-size:13px;font-weight:600">✓ Готово</span>';
    } else if (timerExpired) {
        actionBtn = `<button class="btn-complete" onclick="completeChallengeTask('${task.id}','${task.challenge_id}','${task.participant_id}')">✓ Готово</button>`;
    } else if (task.is_timer_running) {
        actionBtn = `<button class="btn-complete" onclick="completeChallengeTask('${task.id}','${task.challenge_id}','${task.participant_id}')">✓ Готово</button>`;
    } else if (windowOk) {
        actionBtn = `<button class="btn-start" onclick="startChallengeTask('${task.id}','${task.challenge_id}')">▶ Старт</button>`;
    }

    card.innerHTML = `
        <div class="task-left">
            <div class="task-diff-dot" style="background:var(--accent-purple);box-shadow:0 0 6px rgba(124,58,237,0.3)"></div>
            <div class="task-body">
                <div class="task-challenge-badge">
                    ${task.challenge_emoji || '🏆'} ${task.challenge_title || 'Ивент'}
                </div>
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                    <span class="badge" style="color:var(--accent-purple-bright);border-color:rgba(124,58,237,0.3)">Ивент</span>
                    <span class="badge xp-badge">+${task.xp_reward || 0} XP</span>
                    <span class="badge">⏱ ${task.duration_minutes || '?'} мин</span>
                    ${(task.score_value != null && task.score_value > 0) ? `<span class="badge">+${task.score_value} очков</span>` : ''}
                    ${(task.in_window === false) ? '<span class="badge" style="color:#f87171">🔒 Заблокировано</span>' : ''}
                </div>
                <div class="task-timer" id="timer-${task.id}" style="display:${task.is_timer_running && !timerExpired ? 'inline-block' : 'none'}"></div>
            </div>
        </div>
        <div class="task-actions">${actionBtn}</div>
    `;

    if (task.is_timer_running && task.timer_started_at && !timerExpired) {
        startVisualTimer(task);
    }

    if (timerExpired) {
        requestAnimationFrame(() => {
            const timerEl = card.querySelector(`[id="timer-${task.id}"]`)
                || document.getElementById(`timer-${task.id}`);
            if (timerEl) {
                timerEl.style.display = 'inline-block';
                timerEl.textContent = '✅ Время вышло! Нажми "Готово"';
                timerEl.style.color = 'var(--accent-green)';
                timerEl.style.background = 'rgba(16,185,129,0.1)';
            }
        });
    }

    return card;
}

async function startChallengeTask(taskId, challengeId) {
    const btn = document.querySelector(`.task-card[data-id="${taskId}"] .btn-start`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
        const res = await api.request('POST', `/challenges/${challengeId}/tasks/${taskId}/start`, null, true);
        showToast(res.message || 'Таймер запущен! 🎯');

        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            tasks[idx].is_timer_running = true;
            tasks[idx].timer_started_at = res.timer_started_at || new Date().toISOString();

            const oldCard = document.querySelector(`.task-card[data-id="${taskId}"]`);
            if (oldCard) {
                const newCard = makeChallengeTaskCard(tasks[idx]);
                oldCard.replaceWith(newCard);
            }
        } else {
            await loadTasks();
        }
    } catch (e) {
        showToast(e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = '▶ Старт'; }
    }
}

async function completeChallengeTask(taskId, challengeId, participantId) {
    try {
        const res = await api.request('POST', `/challenges/${challengeId}/tasks/${taskId}/complete`, null, true);
        showToast(res.message || 'Задача выполнена!');

        const gained = res.xp_result?.xp_gained ?? res.xp_result?.xp_awarded ?? 0;
        if (gained) {
            showXpAnimation(gained);
        }
        await loadTasks();
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

function showConfirm(title, subtitle, confirmText = 'Удалить', confirmClass = 'btn-confirm-delete') {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        document.querySelector('.confirm-title').textContent = title;
        document.getElementById('confirm-subtitle').textContent = subtitle || '';

        const okBtn = document.getElementById('confirm-ok');
        okBtn.textContent = confirmText;
        okBtn.className = confirmClass;

        modal.style.display = 'flex';

        const icon = document.querySelector('.confirm-icon');
        icon.style.animation = 'none';
        requestAnimationFrame(() => { icon.style.animation = 'shake 0.4s ease'; });

        const cancel = document.getElementById('confirm-cancel');

        function close(result) {
            modal.style.display = 'none';
            okBtn.removeEventListener('click', onOk);
            cancel.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onOverlay);
            resolve(result);
        }

        const onOk      = () => close(true);
        const onCancel  = () => close(false);
        const onOverlay = (e) => { if (e.target === modal) close(false); };

        okBtn.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
        modal.addEventListener('click', onOverlay);
    });
}

function makeSectionHeader(text, sectionKey) {
    const h = document.createElement('div');
    h.className = 'task-section-header';
    h.textContent = text;
    if (sectionKey) h.dataset.section = sectionKey;
    return h;
}

function makeTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card ${task.status === 'done' ? 'task-done' : ''}`;
    card.dataset.id = task.id;

    const color = DIFF_COLORS[task.difficulty];
    const label = DIFF_LABELS[task.difficulty];
    const isDone = task.status === 'done';

    card.style.setProperty('--diff-color', color);

    card.innerHTML = `
        <div class="task-left">
            <div class="task-diff-dot" style="background:${color};box-shadow:0 0 6px ${color}44"></div>
            <div class="task-body">
                <div class="task-title">${task.title}</div>
                <div class="task-meta">
                    <span class="badge" style="color:${color};border-color:${color}44">${label}</span>
                    <span class="badge xp-badge">+${task.xp_reward} XP</span>
                    <span class="badge">⏱ ${task.duration_minutes} мин</span>
                </div>
                ${task.description ? `<div class="task-desc">${task.description}</div>` : ''}
                <div class="task-timer" id="timer-${task.id}" style="display:${task.is_timer_running ? 'inline-block' : 'none'}"></div>
            </div>
        </div>
        <div class="task-actions">
            ${isDone
                ? `<button class="btn-undone" onclick="undoneTask('${task.id}')">↩ Отменить</button>`
                : task.is_timer_running
                    ? `<button class="btn-complete" onclick="completeTask('${task.id}')">✓ Готово</button>`
                    : `<button class="btn-start" onclick="startTimer('${task.id}')">▶ Старт</button>`
            }
            ${!isDone
                ? `<button class="btn-delete" onclick="deleteTask('${task.id}')" title="Удалить">🗑</button>`
                : ''
            }
        </div>
    `;

    if (task.is_timer_running && task.timer_started_at) {
        startVisualTimer(task);
    }

    return card;
}

function addTaskToList(task) {
    const list = document.getElementById('tasks-list');

    const empty = document.getElementById('tasks-empty');
    if (empty) empty.remove();

    let activeHeader = list.querySelector('[data-section="active-header"]');
    if (!activeHeader) {
        activeHeader = makeSectionHeader('⚡ Активные');
        activeHeader.dataset.section = 'active-header';

        const doneHeader = list.querySelector('[data-section="done-header"]');
        if (doneHeader) {
            list.insertBefore(activeHeader, doneHeader);
        } else {
            list.prepend(activeHeader);
        }
    }

    const card = makeTaskCard(task);
    card.style.opacity = '0';
    card.style.transform = 'translateY(-12px)';

    activeHeader.after(card);

    requestAnimationFrame(() => {
        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
    });

    tasks.unshift(task);
}

function removeTaskCard(taskId, callback) {
    const card = document.querySelector(`.task-card[data-id="${taskId}"]`);
    if (!card) { callback && callback(); return; }

    card.style.transition = 'opacity 0.25s ease, transform 0.25s ease, max-height 0.3s ease, margin 0.3s ease, padding 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(20px)';
    card.style.maxHeight = card.offsetHeight + 'px';
    card.style.overflow = 'hidden';

    setTimeout(() => {
        card.style.maxHeight = '0';
        card.style.marginBottom = '0';
        card.style.paddingTop = '0';
        card.style.paddingBottom = '0';
    }, 250);

    setTimeout(() => {
        card.remove();
        callback && callback();

        const list = document.getElementById('tasks-list');
        const remaining = list.querySelectorAll('.task-card');
        if (remaining.length === 0) {
            list.innerHTML = `
                <div class="tasks-empty" id="tasks-empty">
                    <div class="empty-icon">📋</div>
                    <p>Нет активных задач.<br>Создай первый квест!</p>
                </div>`;
        }
    }, 550);
}

function updateTaskCard(task) {
    const oldCard = document.querySelector(`.task-card[data-id="${task.id}"]`);
    if (!oldCard) { renderTasks(); return; }

    if (task.status === 'done') {
        moveCardToDoneSection(oldCard, task);
    } else if (task.status === 'active') {
        moveCardToActiveSection(oldCard, task);
    } else {
        const newCard = makeTaskCard(task);
        newCard.style.opacity = '0';
        oldCard.style.transition = 'opacity 0.15s ease';
        oldCard.style.opacity = '0';
        setTimeout(() => {
            oldCard.replaceWith(newCard);
            newCard.style.transition = 'opacity 0.2s ease';
            requestAnimationFrame(() => { newCard.style.opacity = '1'; });

            if (task.is_timer_running && task.timer_started_at) {
                startVisualTimer(task);
            }
        }, 150);
    }
}

function moveCardToActiveSection(card, task) {
    const list = document.getElementById('tasks-list');

    card.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.97)';

    setTimeout(() => {
        card.remove();

        let activeHeader = list.querySelector('[data-section="active-header"]');
        if (!activeHeader) {
            activeHeader = makeSectionHeader('⚡ Активные', 'active-header');

            const doneHeader = list.querySelector('[data-section="done-header"]');
            if (doneHeader) {
                list.insertBefore(activeHeader, doneHeader);
            } else {
                list.prepend(activeHeader);
            }
        }

        const newCard = makeTaskCard(task);
        newCard.style.opacity = '0';
        newCard.style.transform = 'translateY(-8px)';
        activeHeader.after(newCard);

        requestAnimationFrame(() => {
            newCard.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            newCard.style.opacity = '1';
            newCard.style.transform = 'translateY(0)';
        });

        if (task.is_timer_running && task.timer_started_at) {
            setTimeout(() => startVisualTimer(task), 50);
        }

        const doneHeader = list.querySelector('[data-section="done-header"]');
        if (doneHeader) {
            const doneCards = list.querySelectorAll('.task-card.task-done');
            if (doneCards.length === 0) doneHeader.remove();
        }
    }, 200);
}

function moveCardToDoneSection(card, task) {
    const list = document.getElementById('tasks-list');

    setTimeout(() => {

        const old = list.querySelector(`.task-card[data-id="${task.id}"]`);
        if (old) old.remove();

        let doneHeader = list.querySelector('[data-section="done-header"]');
        if (!doneHeader) {
            doneHeader = makeSectionHeader('✅ Выполнено', 'done-header');
            list.appendChild(doneHeader);
        }

        const newCard = makeTaskCard(task);
        newCard.style.opacity = '0';
        newCard.style.transform = 'translateY(8px)';
        doneHeader.after(newCard);

        requestAnimationFrame(() => {
            newCard.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
            newCard.style.opacity = '1';
            newCard.style.transform = 'translateY(0)';
        });

        const activeHeader = list.querySelector('[data-section="active-header"]');
        if (activeHeader) {
            const activeCards = list.querySelectorAll('.task-card:not(.task-done)');
            if (activeCards.length === 0) activeHeader.remove();
        }
    }, 200);
}

function startVisualTimer(task, _retry = 0) {
    if (activeTimers[task.id]) clearInterval(activeTimers[task.id]);

    const timerEl = document.getElementById(`timer-${task.id}`);
    if (!timerEl) {

        if (_retry < 5) {
            requestAnimationFrame(() => startVisualTimer(task, _retry + 1));
        }
        return;
    }
    timerEl.style.display = 'inline-block';

    if (!task.timer_started_at) { timerEl.style.display = 'none'; return; }

    const tsStr = task.timer_started_at.endsWith('Z') || task.timer_started_at.includes('+')
        ? task.timer_started_at : task.timer_started_at + 'Z';
    const startedAt = new Date(tsStr);
    const requiredMs = task.duration_minutes * 60 * 1000;

    const tick = () => {
        const elapsed = Date.now() - startedAt.getTime();
        const remaining = requiredMs - elapsed;

        if (remaining <= 0) {
            timerEl.textContent = '✅ Время вышло! Нажми "Готово"';
            timerEl.style.color = 'var(--accent-green)';
            timerEl.style.background = 'rgba(16,185,129,0.1)';
            clearInterval(activeTimers[task.id]);

            const btn = document.querySelector(`.task-card[data-id="${task.id}"] .btn-complete`);
            if (btn) btn.style.animation = 'pulse-btn 1s ease-in-out infinite';
        } else {
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            timerEl.textContent = `⏳ ${m}:${s.toString().padStart(2, '0')}`;
            timerEl.style.color = remaining < 60000 ? 'var(--accent-yellow)' : 'var(--text-secondary)';
            timerEl.style.background = '';
        }
    };

    tick();
    activeTimers[task.id] = setInterval(tick, 1000);
}

async function startTimer(taskId) {
    const btn = document.querySelector(`.task-card[data-id="${taskId}"] .btn-start`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
        await api.request('POST', `/tasks/${taskId}/start-timer`, null, true);

        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            tasks[idx].is_timer_running = true;
            tasks[idx].timer_started_at = new Date().toISOString();
            updateTaskCard(tasks[idx]);
        }

        showToast('Таймер запущен! Фокусируйся 🎯');
    } catch (e) {
        showToast(e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = '▶ Старт'; }
    }
}

async function completeTask(taskId) {
    const btn = document.querySelector(`.task-card[data-id="${taskId}"] .btn-complete`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
        const result = await api.request('POST', `/tasks/${taskId}/complete`, null, true);
        const xp = result.xp_result;

        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], ...result, status: 'done', is_timer_running: false };
            updateTaskCard(tasks[idx]);
        }

        showXpAnimation(xp.xp_gained);

        let msg = `+${xp.xp_gained} XP! 🎉`;
        if (xp.leveled_up) msg += ` Уровень ${xp.new_level}! 🆙`;
        if (xp.new_rank)   msg += ` Ранг: ${xp.new_rank}! 🏆`;
        if (xp.capped)     msg += ' (дневной лимит)';
        showToast(msg);

        await loadCharacter();
    } catch (e) {
        showToast(e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = '✓ Готово'; }
    }
}

async function undoneTask(taskId) {
    const btn = document.querySelector(`.task-card[data-id="${taskId}"] .btn-undone`);
    if (btn) { btn.disabled = true; }

    try {
        const result = await api.request('POST', `/tasks/${taskId}/undone`, null, true);

        const idx = tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
            tasks[idx] = { ...tasks[idx], status: 'active', completed_at: null,
                           is_timer_running: false, timer_started_at: null, xp_granted: false };
            updateTaskCard(tasks[idx]);
        }

        showToast('Задача возвращена в активные ↩');
        await loadCharacter();
    } catch (e) {
        showToast(e.message, true);
        if (btn) { btn.disabled = false; }
    }
}

async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    const taskName = task?.title || 'задачу';

    const confirmed = await showConfirm(
        'Удалить задачу?',
        `"${taskName}" будет удалена безвозвратно`
    );
    if (!confirmed) return;

    removeTaskCard(taskId, async () => {
        try {
            await api.request('DELETE', `/tasks/${taskId}`, null, true);
            tasks = tasks.filter(t => t.id !== taskId);
            showToast('Задача удалена');
        } catch (e) {
            showToast(e.message, true);
            await loadTasks();
        }
    });
}

function showXpAnimation(amount) {
    if (!amount) return;
    const el = document.createElement('div');
    el.className = 'xp-popup';
    el.textContent = `+${amount} XP`;
    document.body.appendChild(el);

    const xpBar = document.getElementById('xp-fill');
    if (xpBar) {
        const rect = xpBar.getBoundingClientRect();
        el.style.left = (rect.left + rect.width / 2) + 'px';
        el.style.top = (rect.top - 10) + 'px';
    } else {
        el.style.left = '50%';
        el.style.top = '80px';
    }

    requestAnimationFrame(() => {
        el.style.opacity = '1';
        el.style.transform = 'translateX(-50%) translateY(-30px)';
    });

    setTimeout(() => {
        el.style.opacity = '0';
        el.style.transform = 'translateX(-50%) translateY(-60px)';
        setTimeout(() => el.remove(), 400);
    }, 900);
}

document.getElementById('open-task-modal').addEventListener('click', () => {
    document.getElementById('task-modal').style.display = 'flex';
    document.getElementById('task-title').focus();
});

document.getElementById('close-task-modal').addEventListener('click', () => {
    document.getElementById('task-modal').style.display = 'none';
});

document.getElementById('task-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget)
        document.getElementById('task-modal').style.display = 'none';
});

document.querySelectorAll('.diff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title       = document.getElementById('task-title').value.trim();
    const description = document.getElementById('task-desc').value.trim();
    const difficulty  = document.querySelector('.diff-btn.active')?.dataset.diff || 'easy';

    if (!title) return;

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Создание...';

    try {
        const newTask = await api.request('POST', '/tasks/', { title, description, difficulty }, true);

        document.getElementById('task-modal').style.display = 'none';
        document.getElementById('task-form').reset();
        document.querySelectorAll('.diff-btn').forEach((b, i) => b.classList.toggle('active', i === 0));

        addTaskToList(newTask);

        showToast('Задача создана! ⚔️');
    } catch (err) {
        const errEl = document.getElementById('task-error');
        errEl.style.display = 'block';
        errEl.textContent = err.message;
        setTimeout(() => errEl.style.display = 'none', 4000);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Создать задачу';
    }
});

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.style.background = isError ? 'var(--accent-red)' : 'var(--accent-purple)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3500);
}