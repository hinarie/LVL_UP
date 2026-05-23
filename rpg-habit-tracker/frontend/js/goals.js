let goals = [];

const RARITY_CONFIG = {
    common:    { label: 'Обычный',     color: '#10b981' },
    rare:      { label: 'Редкий',      color: '#06b6d4' },
    epic:      { label: 'Эпический',   color: '#7c3aed' },
    legendary: { label: 'Легендарный', color: '#f59e0b' },
};

const GOAL_CAT_ICONS = {
    health: '💪', career: '💼', learning: '📚',
    finance: '💰', creative: '🎨', social: '🤝',
    travel: '✈️', other: '🎯'
};

const GOAL_CAT_LABELS = {
    health: 'Здоровье', career: 'Карьера', learning: 'Обучение',
    finance: 'Финансы', creative: 'Творчество', social: 'Общение',
    travel: 'Путешествия', other: 'Другое'
};

const MONTH_NAMES_SHORT = [
    'Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
];

// ===== УТИЛИТЫ =====
function getEmoji(goal) {
    return goal.emoji || GOAL_CAT_ICONS[goal.category] || '🎯';
}
function getLabel(goal) {
    return GOAL_CAT_LABELS[goal.category] || 'Другое';
}

// ===== ЗАГРУЗКА =====
async function loadGoals() {
    try {
        goals = await api.request('GET', '/goals/', null, true);
        renderGoals();
    } catch (e) { console.error(e); }
}

// ===== РЕНДЕР =====
function renderGoals() {
    const list   = document.getElementById('goals-list');
    const addBtn = document.getElementById('open-goal-modal');
    list.innerHTML = '';

    if (goals.length === 0) {
        if (addBtn) addBtn.style.display = 'none';
        list.innerHTML = `
            <div class="goals-empty-state">
                <div class="goals-empty-icon"
                     onclick="document.getElementById('goal-modal').style.display='flex'"
                     title="Создать первую цель">🎯</div>
                <h3 class="goals-empty-title">Нет активных целей</h3>
                <p class="goals-empty-sub">Нажми на мишень или кнопку ниже чтобы начать</p>
                <button class="goals-empty-btn"
                    onclick="document.getElementById('goal-modal').style.display='flex'">
                    + Поставить первую цель
                </button>
            </div>
        `;
        return;
    }

    if (addBtn) addBtn.style.display = '';

    const mainQuest = goals.find(g => g.is_main_quest && g.status === 'active');
    const regular   = goals.filter(g => !g.is_main_quest && g.status === 'active');
    const done      = goals.filter(g => g.status === 'completed' || g.status === 'failed');

    if (mainQuest) {
        const sec = document.createElement('div');
        sec.className = 'goal-section';
        sec.innerHTML = '<div class="task-section-header">⚡ Главный квест</div>';
        sec.appendChild(makeBossCard(mainQuest));
        list.appendChild(sec);
    }

    if (regular.length > 0) {
        const sec = document.createElement('div');
        sec.className = 'goal-section';
        sec.innerHTML = '<div class="task-section-header">⚔️ Активные квесты</div>';
        const grid = document.createElement('div');
        grid.className = 'goals-grid';
        regular.forEach(g => grid.appendChild(makeGoalCard(g)));
        sec.appendChild(grid);
        list.appendChild(sec);
    }

    if (done.length > 0) {
        const isCollapsed = localStorage.getItem('archive-collapsed') === 'true';
        const sec = document.createElement('div');
        sec.className = 'goal-section';
        sec.innerHTML = `
            <div class="task-section-header archive-header"
                onclick="toggleArchive()" style="cursor:pointer;user-select:none">
                📜 Завершённые · ${done.length}
                <span class="archive-toggle">${isCollapsed ? '▶' : '▼'}</span>
            </div>
            <div class="archive-list" id="archive-list"
                style="display:${isCollapsed ? 'none' : 'flex'};flex-direction:column;gap:8px">
            </div>
        `;
        list.appendChild(sec);
        const archiveList = document.getElementById('archive-list');
        done.forEach(g => archiveList.appendChild(makeArchiveRow(g)));
    }

    // Статистика в самом конце
    const statsDiv = document.createElement('div');
    statsDiv.id = 'goals-stats-bottom';
    statsDiv.className = 'goals-stats-row';
    list.appendChild(statsDiv);
    
    // Заполняем
    const active    = goals.filter(g => g.status === 'active').length;
    const completed = goals.filter(g => g.status === 'completed').length;
    const failed    = goals.filter(g => g.status === 'failed').length;
    const total     = completed + failed;
    const rate      = total > 0 ? Math.round((completed / total) * 100) : 0;
    const xp        = goals.filter(g => g.completion_xp_granted)
                           .reduce((s, g) => s + g.completion_xp_bonus, 0);

    statsDiv.innerHTML = `
        <div class="goal-stat-card">
            <div class="goal-stat-val" style="color:#9d5ff3">${active}</div>
            <div class="goal-stat-lbl">Активных</div>
        </div>
        <div class="goal-stat-card">
            <div class="goal-stat-val" style="color:#10b981">${completed}</div>
            <div class="goal-stat-lbl">Завершено</div>
        </div>
        <div class="goal-stat-card">
            <div class="goal-stat-val" style="color:#f59e0b">+${xp}</div>
            <div class="goal-stat-lbl">XP заработано</div>
        </div>
        <div class="goal-stat-card">
            <div class="goal-stat-val" style="color:#06b6d4">${rate}%</div>
            <div class="goal-stat-lbl">Успех</div>
        </div>
    `;
}

function toggleArchive() {
    const list   = document.getElementById('archive-list');
    const toggle = document.querySelector('.archive-toggle');
    if (!list) return;
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'flex' : 'none';
    if (toggle) toggle.textContent = isHidden ? '▼' : '▶';
    localStorage.setItem('archive-collapsed', isHidden ? 'false' : 'true');
}

// ===== BOSS CARD =====
function makeBossCard(goal) {
    const card = document.createElement('div');
    card.className = 'boss-card';
    card.dataset.id = goal.id;
    const cfg     = RARITY_CONFIG[goal.rarity] || RARITY_CONFIG.common;
    const pct     = goal.progress_percent;
    const allDone = goal.subtasks_count > 0 && goal.subtasks_done === goal.subtasks_count;
    const deadline = goal.deadline
        ? new Date(goal.deadline).toLocaleDateString('ru-RU', {day:'numeric', month:'short', year:'numeric'})
        : 'Без дедлайна';

    card.innerHTML = `
        <div class="boss-header">
            <div class="boss-avatar" style="border-color:${cfg.color}">${getEmoji(goal)}</div>
            <div class="boss-info">
                <div class="boss-name">${goal.title}</div>
                <div class="boss-sub">${getLabel(goal)} · ${deadline}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
                <div class="boss-badge"
                    style="color:${cfg.color};border-color:${cfg.color}44;background:${cfg.color}11">
                    ${cfg.label}
                </div>
                <button class="boss-delete-btn" onclick="deleteGoal('${goal.id}')">🗑</button>
            </div>
        </div>
        <div class="boss-hp-wrap">
            <div class="boss-hp-labels">
                <span>Прогресс</span>
                <span>${goal.subtasks_done} / ${goal.subtasks_count} подзадач · ${pct}%</span>
            </div>
            <div class="boss-hp-bar">
                <div class="boss-hp-fill" style="width:${pct}%;background:${cfg.color}"></div>
            </div>
        </div>
        <div class="boss-subtasks">${renderSubtasksList(goal)}</div>
        <div class="boss-rewards">
            <div class="reward-chip">🏆 +${goal.completion_xp_bonus} XP при победе</div>
            <div class="reward-chip">⚡ ${goal.subtasks_count === 0 ? goal.completion_xp_bonus : goal.subtask_xp} XP/подзадачу</div>
            ${goal.min_deadline_days > 0 && !goal.deadline
                ? `<div class="reward-chip" style="color:var(--accent-yellow)">⏱ Мин: ${goal.min_deadline_days} дн.</div>`
                : ''}
        </div>
        <div class="boss-actions">
            ${goal.deadline && goal.extensions_left > 0
                ? `<button class="btn-extend" onclick="extendDeadline('${goal.id}')">
                    📅 Перенести (${goal.extensions_left})</button>`
                : goal.deadline && goal.extensions_left === 0
                    ? `<span style="font-size:11px;color:var(--accent-red)">⛔ Переносы исчерпаны</span>`
                    : ''
            }
            ${allDone && !goal.completion_xp_granted
                ? `<button class="btn-complete-goal" onclick="completeGoal('${goal.id}')">
                    🏆 Завершить квест · +${goal.completion_xp_bonus} XP</button>`
                : goal.completion_xp_granted
                    ? `<span class="goal-completed-badge">✓ Квест завершён</span>`
                    : ''
            }
        </div>
    `;
    return card;
}

// ===== GOAL CARD =====
function makeGoalCard(goal) {
    const card = document.createElement('div');
    card.className = `goal-card goal-rarity-${goal.rarity}`;
    card.dataset.id = goal.id;
    const cfg     = RARITY_CONFIG[goal.rarity] || RARITY_CONFIG.common;
    const pct     = goal.progress_percent;
    const allDone = goal.subtasks_count > 0 && goal.subtasks_done === goal.subtasks_count;
    const xpInfo  = goal.subtasks_count === 0 ? `до ${goal.subtask_xp}` : `${goal.subtask_xp}`;
    const statusColors = { green:'#10b981', yellow:'#f59e0b', red:'#ef4444', gray:'#5a5a7a' };
    const urgColor = statusColors[goal.status_color] || '#5a5a7a';
    const deadline = goal.deadline
        ? new Date(goal.deadline).toLocaleDateString('ru-RU', {day:'numeric', month:'short'})
        : null;
    const urgLabel = !deadline ? '📅 Без дедлайна'
        : goal.status_color === 'red'    ? `⚠️ ${deadline}`
        : goal.status_color === 'yellow' ? `⏰ ${deadline}`
        : `📅 ${deadline}`;

    card.innerHTML = `
        <div class="goal-card-top">
            <div class="goal-card-header">
                <div class="goal-card-icon" style="background:${cfg.color}22;color:${cfg.color}">
                    ${getEmoji(goal)}
                </div>
                <div class="goal-rarity-badge"
                    style="color:${cfg.color};border-color:${cfg.color}44;background:${cfg.color}11">
                    ${cfg.label}
                </div>
            </div>
            <div class="goal-card-title">${goal.title}</div>
            <div class="goal-card-xp">⚡ ${xpInfo} XP · 🏆 +${goal.completion_xp_bonus}</div>
            <div class="goal-prog-bar">
                <div class="goal-prog-fill" style="width:${pct}%;background:${cfg.color}"></div>
            </div>
            <div class="goal-prog-labels">
                <span>${goal.subtasks_done}/${goal.subtasks_count}</span>
                <span>${pct}%</span>
            </div>
            <div class="goal-card-footer">
                <span class="goal-deadline" style="color:${urgColor}">${urgLabel}</span>
                <div class="goal-card-actions">
                    ${allDone && !goal.completion_xp_granted
                        ? `<button class="btn-complete-goal btn-complete-goal-sm"
                            onclick="event.stopPropagation();completeGoal('${goal.id}')">🏆</button>` : ''}
                    ${goal.deadline && goal.extensions_left > 0
                        ? `<button class="btn-extend"
                            onclick="event.stopPropagation();extendDeadline('${goal.id}')">↗${goal.extensions_left}</button>` : ''}
                    <button class="btn-delete"
                        onclick="event.stopPropagation();deleteGoal('${goal.id}')">🗑</button>
                    <button class="goal-expand-btn" id="expand-btn-${goal.id}"
                        onclick="event.stopPropagation();toggleGoalCard('${goal.id}')">▾</button>
                    <button class="goal-mobile-open"
                        onclick="event.stopPropagation();openGoalSheet('${goal.id}')">›</button>
                </div>
            </div>
        </div>
        <div class="goal-subtasks-panel" id="goal-panel-${goal.id}">
            ${renderSubtasksList(goal)}
        </div>
    `;
    return card;
}

function toggleGoalCard(goalId) {
    const panel = document.getElementById(`goal-panel-${goalId}`);
    const btn   = document.getElementById(`expand-btn-${goalId}`);
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open');
    if (btn) btn.textContent = isOpen ? '▾' : '▴';
    if (!isOpen) setTimeout(() => focusSubtaskInput(goalId), 320);
}

// ===== ПОДЗАДАЧИ =====
function renderSubtasksList(goal) {
    const subtasks = goal.subtasks || [];
    const canAdd   = subtasks.length < goal.max_subtasks;

    const items = subtasks.map(s => `
        <div class="tw-subtask ${s.is_completed ? 'tw-done' : ''}" data-id="${s.id}">
            <span class="tw-subtask-title">${s.title}</span>
            <span class="tw-subtask-xp">+${s.xp_reward} XP</span>
            <button class="tw-check"
                onclick="${s.is_completed
                    ? `uncompleteSubtask('${goal.id}','${s.id}')`
                    : `completeSubtask('${goal.id}','${s.id}')`}">
                ${s.is_completed ? '✓' : ''}
            </button>
            <button class="tw-del" onclick="deleteSubtask('${goal.id}','${s.id}')">×</button>
        </div>
    `).join('');

    const addRow = canAdd ? `
        <div class="tw-add-row" onclick="focusSubtaskInput('${goal.id}')">
            <input class="tw-input" id="subtask-input-${goal.id}"
                placeholder="Добавить подзадачу..."
                onkeydown="handleSubtaskKey(event,'${goal.id}')"
                maxlength="100" enterkeyhint="done" />
        </div>
    ` : `<div class="tw-limit">Лимит: ${goal.max_subtasks} подзадач</div>`;

    return `<div class="tw-list" id="subtasks-${goal.id}">${items}${addRow}</div>`;
}

function focusSubtaskInput(goalId) {
    document.getElementById(`subtask-input-${goalId}`)?.focus();
}

function hideSubtaskInput(goalId) {}

async function submitSubtaskInline(goalId) {
    const input = document.getElementById(`subtask-input-${goalId}`);
    if (!input) return;
    const title = input.value.trim();
    if (!title) { input.focus(); return; }

    input.value = '';
    input.placeholder = 'Сохраняю...';
    input.disabled = true;

    try {
        const newSubtask = await api.request(
            'POST', `/goals/${goalId}/subtasks`, { title }, true
        );

        // Добавляем локально
        const goal = goals.find(g => g.id === goalId);
        if (goal) {
            goal.subtasks.push(newSubtask);
            goal.subtasks_count = goal.subtasks.length;
            // Пересчитываем XP для всех подзадач (сервер уже обновил, перезагрузим для XP)
            await loadGoals();
            refreshSheetIfOpen();
        }
        setTimeout(() => focusSubtaskInput(goalId), 50);
    } catch (err) {
        showToast(err.message, true);
        input.disabled = false;
        input.placeholder = 'Добавить подзадачу...';
    }
}

async function handleSubtaskKey(e, goalId) {
    if (e.key === 'Escape') {
        const input = document.getElementById(`subtask-input-${goalId}`);
        if (input) input.value = '';
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        await submitSubtaskInline(goalId);
    }
}

// Локальное обновление без перезагрузки
function updateSubtaskLocal(goalId, subtaskId, isDone) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const subtask = goal.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return;

    subtask.is_completed = isDone;
    subtask.completed_at = isDone ? new Date().toISOString() : null;

    // Пересчитываем прогресс
    const total = goal.subtasks.length;
    const done  = goal.subtasks.filter(s => s.is_completed).length;
    goal.progress_percent = total > 0 ? Math.round((done / total) * 100) : 0;
    goal.subtasks_done = done;

    // Перерендериваем только эту карточку
    rerenderGoalCard(goalId);
    // Обновляем sheet если открыт
    refreshSheetIfOpen();
}

function rerenderGoalCard(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    if (goal.is_main_quest) {
        // Boss card
        const old = document.querySelector(`.boss-card[data-id="${goalId}"]`);
        if (old) { const newCard = makeBossCard(goal); old.replaceWith(newCard); }
    } else {
        // Обычная карточка
        const old = document.querySelector(`.goal-card[data-id="${goalId}"]`);
        if (old) {
            const wasOpen = old.querySelector('.goal-subtasks-panel')?.classList.contains('open');
            const newCard = makeGoalCard(goal);
            old.replaceWith(newCard);
            // Восстанавливаем состояние аккордеона
            if (wasOpen) {
                const panel = newCard.querySelector('.goal-subtasks-panel');
                const btn   = newCard.querySelector('.goal-expand-btn');
                if (panel) panel.classList.add('open');
                if (btn) btn.textContent = '▴';
            }
        }
    }
}

// ===== ДЕЙСТВИЯ =====
async function completeSubtask(goalId, subtaskId) {
    try {
        const result = await api.request(
            'POST', `/goals/${goalId}/subtasks/${subtaskId}/complete`, null, true
        );
        const xp = result.xp_result;
        showToast(`+${xp.xp_gained} XP! ✓${xp.capped ? ' (лимит)' : ''}`);

        // Обновляем локально — без перезагрузки
        updateSubtaskLocal(goalId, subtaskId, true);
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

async function uncompleteSubtask(goalId, subtaskId) {
    try {
        await api.request(
            'POST', `/goals/${goalId}/subtasks/${subtaskId}/uncomplete`, null, true
        );
        showToast('Подзадача возвращена ↩');

        // Обновляем локально — без перезагрузки
        updateSubtaskLocal(goalId, subtaskId, false);
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

async function deleteSubtask(goalId, subtaskId) {
    try {
        await api.request('DELETE', `/goals/${goalId}/subtasks/${subtaskId}`, null, true);

        // Удаляем локально
        const goal = goals.find(g => g.id === goalId);
        if (goal) {
            goal.subtasks = goal.subtasks.filter(s => s.id !== subtaskId);
            const total = goal.subtasks.length;
            const done  = goal.subtasks.filter(s => s.is_completed).length;
            goal.progress_percent = total > 0 ? Math.round((done / total) * 100) : 0;
            goal.subtasks_done  = done;
            goal.subtasks_count = total;
        }
        rerenderGoalCard(goalId);
        refreshSheetIfOpen();
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

async function completeGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    const confirmed = await showConfirm(
        '🏆 Завершить квест?',
        `+${goal?.completion_xp_bonus} XP бонус за победу!`,
        'Завершить', 'btn-confirm-delete'
    );
    if (!confirmed) return;
    try {
        const result = await api.request('POST', `/goals/${goalId}/complete`, null, true);
        showToast(`🎉 Квест завершён! +${result.bonus_xp?.xp_gained || 0} XP!`);
        await loadGoals();
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

async function deleteGoal(goalId) {
    const goal = goals.find(g => g.id === goalId);
    const confirmed = await showConfirm('Удалить цель?', `"${goal?.title}" будет удалена`);
    if (!confirmed) return;
    try {
        await api.request('DELETE', `/goals/${goalId}`, null, true);
        showToast('Цель удалена');
        await loadGoals();
    } catch (e) { showToast(e.message, true); }
}

async function extendDeadline(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    let extModal = document.getElementById('extend-deadline-modal');
    if (!extModal) {
        extModal = document.createElement('div');
        extModal.id = 'extend-deadline-modal';
        extModal.className = 'modal-overlay';
        extModal.style.display = 'none';
        extModal.innerHTML = `
            <div class="modal" style="max-width:380px">
                <div class="modal-header">
                    <h3>📅 Перенести дедлайн</h3>
                    <button class="modal-close"
                        onclick="document.getElementById('extend-deadline-modal').style.display='none'">✕</button>
                </div>
                <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
                    Осталось переносов: <span id="ext-transfers-left"></span>
                </p>
                <div id="ext-cal-wrap">
                    <div class="dcal-header" style="margin-bottom:8px">
                        <button type="button" class="dcal-nav" id="ext-cal-prev">‹</button>
                        <span class="dcal-month" id="ext-cal-month"></span>
                        <button type="button" class="dcal-nav" id="ext-cal-next">›</button>
                    </div>
                    <div class="dcal-weekdays">
                        <span>Пн</span><span>Вт</span><span>Ср</span>
                        <span>Чт</span><span>Пт</span>
                        <span style="color:var(--accent-pink)">Сб</span>
                        <span style="color:var(--accent-pink)">Вс</span>
                    </div>
                    <div class="dcal-grid" id="ext-cal-grid"></div>
                </div>
                <div style="font-size:13px;color:var(--text-secondary);margin:10px 0;min-height:20px"
                    id="ext-selected-label"></div>
                <div class="error-msg" id="extend-error"></div>
                <div style="display:flex;gap:8px;margin-top:12px">
                    <button class="dcal-clear"
                        onclick="document.getElementById('extend-deadline-modal').style.display='none'">
                        Отмена
                    </button>
                    <button class="dcal-confirm" id="ext-confirm-btn">Перенести</button>
                </div>
            </div>
        `;
        document.getElementById('modals-root')?.appendChild(extModal)
            || document.body.appendChild(extModal);
    }

    document.getElementById('ext-transfers-left').textContent = goal.extensions_left;
    document.getElementById('ext-selected-label').textContent = '';
    document.getElementById('extend-error').style.display = 'none';
    extModal.style.display = 'flex';

    let extPickerMonth = new Date(); extPickerMonth.setDate(1);
    let extSelectedDate = null;
    let extSelectedValue = null;

    function renderExtCal() {
        const grid  = document.getElementById('ext-cal-grid');
        const month = document.getElementById('ext-cal-month');
        if (!grid || !month) return;
        const y = extPickerMonth.getFullYear();
        const m = extPickerMonth.getMonth();
        month.textContent = `${MONTH_NAMES_SHORT[m]} ${y}`;
        const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
        const lastDay  = new Date(y, m + 1, 0).getDate();
        const todayStr = getTodayStr();
        grid.innerHTML = '';
        for (let i = 0; i < startDow; i++) {
            const el = document.createElement('div'); el.style.visibility = 'hidden'; grid.appendChild(el);
        }
        for (let d = 1; d <= lastDay; d++) {
            const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const isPast = ds <= todayStr;
            const dow = new Date(y, m, d).getDay();
            const cell = document.createElement('div');
            cell.className = 'dcal-cell'
                + (isPast ? ' dcal-past' : '')
                + (extSelectedDate === ds ? ' dcal-selected' : '')
                + ((dow===0||dow===6) && !isPast ? ' dcal-weekend' : '');
            cell.textContent = d;
            if (!isPast) {
                cell.onclick = (e) => {
                    e.stopPropagation();
                    extSelectedDate = ds;
                    const dt = new Date(`${ds}T23:59:00`);
                    extSelectedValue = dt.toISOString();
                    document.getElementById('ext-selected-label').textContent =
                        '✓ ' + dt.toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'});
                    renderExtCal();
                };
            }
            grid.appendChild(cell);
        }
    }

    renderExtCal();

    document.getElementById('ext-cal-prev').onclick = (e) => {
        e.stopPropagation();
        extPickerMonth.setMonth(extPickerMonth.getMonth() - 1); renderExtCal();
    };
    document.getElementById('ext-cal-next').onclick = (e) => {
        e.stopPropagation();
        extPickerMonth.setMonth(extPickerMonth.getMonth() + 1); renderExtCal();
    };

    document.getElementById('ext-confirm-btn').onclick = async () => {
        if (!extSelectedValue) {
            const errEl = document.getElementById('extend-error');
            errEl.textContent = 'Выбери дату'; errEl.style.display = 'block'; return;
        }
        try {
            await api.request('POST', `/goals/${goalId}/extend-deadline`,
                { new_deadline: extSelectedValue }, true);
            extModal.style.display = 'none';
            showToast('Дедлайн перенесён 📅');
            await loadGoals();
        } catch (e) {
            const errEl = document.getElementById('extend-error');
            errEl.textContent = e.message; errEl.style.display = 'block';
        }
    };
}

// ===== ARCHIVE =====
function makeArchiveRow(goal) {
    const row = document.createElement('div');
    row.className = 'goal-archive-row';
    const cfg    = RARITY_CONFIG[goal.rarity] || RARITY_CONFIG.common;
    const date   = goal.completed_at || goal.failed_at;
    const dateStr = date ? new Date(date).toLocaleDateString('ru-RU', {day:'numeric', month:'short'}) : '';
    const isWin  = goal.status === 'completed';
    row.innerHTML = `
        <div class="archive-emoji">${getEmoji(goal)}</div>
        <div class="archive-info">
            <div class="archive-title">${goal.title}</div>
            <div class="archive-meta">${dateStr} · ${cfg.label}${isWin ? ` · +${goal.completion_xp_bonus} XP` : ''}</div>
        </div>
        <div class="archive-badge ${isWin ? 'badge-win' : 'badge-fail'}">
            ${isWin ? '✓ Победа' : '✕ Провал'}
        </div>
    `;
    return row;
}

// ===== BOTTOM SHEET =====
function openGoalSheet(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    let sheet = document.getElementById('goal-bottom-sheet');
    if (!sheet) {
        sheet = document.createElement('div');
        sheet.id = 'goal-bottom-sheet';
        sheet.className = 'goal-sheet-overlay';
        sheet.innerHTML = `
            <div class="goal-sheet-bg"></div>
            <div class="goal-sheet" id="goal-sheet-inner">
                <div class="goal-sheet-handle"></div>
                <div id="goal-sheet-content"></div>
            </div>
        `;
        document.querySelector('.app-main')?.appendChild(sheet)
            || document.body.appendChild(sheet);
        sheet.querySelector('.goal-sheet-bg')?.addEventListener('click', closeGoalSheet);
    }

    sheet.dataset.goalId = goalId;
    renderGoalSheetContent(goalId);
    sheet.style.display = 'flex';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        document.getElementById('goal-sheet-inner')?.classList.add('up');
    }));
}

function renderGoalSheetContent(goalId) {
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;
    const cfg     = RARITY_CONFIG[goal.rarity] || RARITY_CONFIG.common;
    const pct     = goal.progress_percent;
    const allDone = goal.subtasks_count > 0 && goal.subtasks_done === goal.subtasks_count;
    const deadline = goal.deadline
        ? new Date(goal.deadline).toLocaleDateString('ru-RU', {day:'numeric', month:'short'})
        : 'Без дедлайна';
    const content = document.getElementById('goal-sheet-content');
    if (!content) return;

    content.innerHTML = `
        <div class="goal-sheet-header">
            <div style="font-size:22px;flex-shrink:0">${getEmoji(goal)}</div>
            <div style="flex:1;min-width:0">
                <div class="goal-sheet-title">${goal.title}</div>
                <div class="goal-sheet-meta">
                    <span style="color:${cfg.color}">${cfg.label}</span> · ${deadline}
                </div>
            </div>
            <button class="goal-sheet-close" onclick="closeGoalSheet()">✕</button>
        </div>
        <div class="goal-sheet-prog-bar">
            <div style="width:${pct}%;background:${cfg.color};height:100%;border-radius:3px;transition:width 0.4s"></div>
        </div>
        <div class="goal-sheet-prog-label">${goal.subtasks_done}/${goal.subtasks_count} подзадач · ${pct}%</div>
        <div>${renderSubtasksList(goal)}</div>
        ${allDone && !goal.completion_xp_granted
            ? `<button class="btn-complete-goal" style="width:100%;margin-top:12px"
                onclick="completeGoal('${goal.id}');closeGoalSheet()">
                🏆 Завершить квест · +${goal.completion_xp_bonus} XP</button>`
            : ''
        }
    `;
}

function closeGoalSheet() {
    const inner = document.getElementById('goal-sheet-inner');
    const sheet = document.getElementById('goal-bottom-sheet');
    inner?.classList.remove('up');
    setTimeout(() => { if (sheet) sheet.style.display = 'none'; }, 300);
}

function refreshSheetIfOpen() {
    const sheet = document.getElementById('goal-bottom-sheet');
    if (sheet?.style.display === 'flex' && sheet.dataset.goalId) {
        renderGoalSheetContent(sheet.dataset.goalId);
    }
}

// ===== МОДАЛКА СОЗДАНИЯ ЦЕЛИ =====
document.getElementById('open-goal-modal')?.addEventListener('click', () => {
    document.getElementById('goal-modal').style.display = 'flex';
});
document.getElementById('close-goal-modal')?.addEventListener('click', () => {
    document.getElementById('goal-modal').style.display = 'none';
});
document.getElementById('goal-modal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
});

document.querySelectorAll('.rarity-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.rarity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('goal-rarity').value = btn.dataset.rarity;
    });
});

document.getElementById('goal-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const title         = document.getElementById('goal-title').value.trim();
    const description   = document.getElementById('goal-desc').value.trim();
    const deadlineRaw   = document.getElementById('goal-deadline').value;
    const deadline      = deadlineRaw ? new Date(deadlineRaw).toISOString() : null;
    const rarity        = document.getElementById('goal-rarity').value;
    const category      = document.getElementById('goal-category').value;
    const emoji         = document.getElementById('goal-emoji').value.trim() || null;
    const is_main_quest = document.getElementById('goal-is-main').checked;

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true; btn.textContent = 'Создание...';
    try {
        await api.request('POST', '/goals/', {
            title, description, deadline, rarity, category, emoji, is_main_quest
        }, true);
        document.getElementById('goal-modal').style.display = 'none';
        document.getElementById('goal-form').reset();
        document.querySelectorAll('.rarity-btn').forEach((b,i) => b.classList.toggle('active', i===0));
        document.getElementById('goal-rarity').value = 'common';
        clearDeadline();
        showToast('Цель создана! 🎯');
        await loadGoals();
    } catch (err) {
        const errEl = document.getElementById('goal-error');
        errEl.textContent = err.message; errEl.style.display = 'block';
        setTimeout(() => errEl.style.display = 'none', 4000);
    } finally {
        btn.disabled = false; btn.textContent = 'Создать цель';
    }
});

// ===== ПИКЕР ДЕДЛАЙНА =====
let pickerMonth  = new Date(); pickerMonth.setDate(1);
let selectedDate = null;

function toggleDeadlinePicker() {
    const dd = document.getElementById('deadline-dropdown');
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderDeadlineCalendar();
}

function renderDeadlineCalendar() {
    const grid  = document.getElementById('dcal-grid');
    const month = document.getElementById('dcal-month');
    if (!grid || !month) return;
    const y = pickerMonth.getFullYear();
    const m = pickerMonth.getMonth();
    month.textContent = `${MONTH_NAMES_SHORT[m]} ${y}`;
    const startDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const lastDay  = new Date(y, m + 1, 0).getDate();
    const todayStr = getTodayStr();
    grid.innerHTML = '';
    for (let i = 0; i < startDow; i++) {
        const el = document.createElement('div'); el.style.visibility = 'hidden'; grid.appendChild(el);
    }
    for (let d = 1; d <= lastDay; d++) {
        const dateStr   = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isPast    = dateStr < todayStr;
        const isToday   = dateStr === todayStr;
        const isSelected = selectedDate === dateStr;
        const dow       = new Date(y, m, d).getDay();
        const cell = document.createElement('div');
        cell.className = 'dcal-cell'
            + (isPast     ? ' dcal-past'     : '')
            + (isToday    ? ' dcal-today'    : '')
            + (isSelected ? ' dcal-selected' : '')
            + ((dow===0||dow===6) && !isPast ? ' dcal-weekend' : '');
        cell.textContent = d;
        if (!isPast) {
            cell.onclick = (e) => {
                e.stopPropagation();
                selectedDate = dateStr;
                renderDeadlineCalendar();
            };
        }
        grid.appendChild(cell);
    }
}

function confirmDeadline() {
    if (!selectedDate) { clearDeadline(); return; }
    const dt = new Date(`${selectedDate}T23:59:00`);
    document.getElementById('goal-deadline').value = dt.toISOString();
    document.getElementById('deadline-text').textContent =
        dt.toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'});
    document.getElementById('deadline-display').style.borderColor = 'var(--accent-purple)';
    document.getElementById('deadline-dropdown').style.display = 'none';
}

function clearDeadline() {
    selectedDate = null;
    const inp = document.getElementById('goal-deadline');
    const txt = document.getElementById('deadline-text');
    const dis = document.getElementById('deadline-display');
    const dd  = document.getElementById('deadline-dropdown');
    if (inp) inp.value = '';
    if (txt) txt.textContent = 'Без дедлайна';
    if (dis) dis.style.borderColor = '';
    if (dd)  dd.style.display = 'none';
}

function initDeadlinePicker() {
    document.addEventListener('click', e => {
        const target = e.target;
        if (target.closest('#deadline-dropdown')) {
            e.stopPropagation();
            if (target.id === 'dcal-prev' || target.closest('#dcal-prev')) {
                pickerMonth.setMonth(pickerMonth.getMonth() - 1); renderDeadlineCalendar();
            }
            if (target.id === 'dcal-next' || target.closest('#dcal-next')) {
                pickerMonth.setMonth(pickerMonth.getMonth() + 1); renderDeadlineCalendar();
            }
            return;
        }
        if (target.closest('#open-goal-modal')) {
            clearDeadline(); selectedDate = null;
            pickerMonth = new Date(); pickerMonth.setDate(1);
            return;
        }
        const dd = document.getElementById('deadline-dropdown');
        if (dd && dd.style.display !== 'none') {
            const picker = document.getElementById('deadline-picker');
            if (picker && !picker.contains(target)) dd.style.display = 'none';
        }
    });
}