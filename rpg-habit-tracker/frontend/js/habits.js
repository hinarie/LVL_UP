let habits = [];
let calendarMonth = new Date();
calendarMonth.setDate(1);

const CAT_ICONS = {
    health:'💪', learning:'📚', productive:'⚡',
    creative:'🎨', social:'🤝', other:'✨'
};
const CAT_LABELS = {
    health:'Здоровье', learning:'Обучение', productive:'Продуктивность',
    creative:'Творчество', social:'Общение', other:'Другое'
};
const REMINDER_LABELS = {
    morning:'🌅 Утро', afternoon:'☀️ День', evening:'🌙 Вечер'
};
const FREQ_LABELS = {
    daily:'Каждый день', weekdays:'Будни', custom:'Свои дни'
};
const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь',
    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function jsDay(date) {
    return (date.getDay() + 6) % 7;
}

function isHabitScheduledToday(habit, date = new Date()) {
    const dow = jsDay(date);
    const freq = habit.frequency || 'daily';
    if (freq === 'daily') return true;
    if (freq === 'weekdays') return dow < 5;
    if (freq === 'custom' && habit.frequency_days) {
        const days = habit.frequency_days.split(',').map(Number);
        return days.includes(dow);
    }
    return true;
}

function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function dateToStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function loadHabits() {
    try {
        const tz = -new Date().getTimezoneOffset();
        habits = await api.request('GET', `/habits/?tz_offset=${tz}`, null, true);
        renderHabits();
        renderTodayPanel();
        renderMiniCalendar();
    } catch (e) { console.error(e); }
}

function renderTodayPanel() {
    const today = new Date();
    const todayList   = document.getElementById('today-habits-list');
    const progressFill  = document.getElementById('today-progress-fill');
    const progressLabel = document.getElementById('today-progress-label');
    const dateEl        = document.getElementById('habits-today-date');

    dateEl.textContent = today.toLocaleDateString('ru-RU', {
        weekday:'long', day:'numeric', month:'long'
    });

    const todayHabits = habits.filter(h => isHabitScheduledToday(h, today));
    const doneCount   = todayHabits.filter(h => h.completed_today).length;
    const total       = todayHabits.length;
    const pct         = total > 0 ? Math.round((doneCount / total) * 100) : 0;

    progressFill.style.width = pct + '%';
    progressFill.style.background = pct === 100
        ? 'var(--accent-green)'
        : pct > 50 ? 'var(--accent-purple)' : 'var(--accent-yellow)';
    progressLabel.textContent = total === 0
        ? 'Нет привычек на сегодня'
        : `${doneCount} / ${total} · ${pct}%`;

    todayList.innerHTML = '';
    if (todayHabits.length === 0) {
        todayList.innerHTML = '<div class="today-empty">На сегодня привычек нет 🎉</div>';
        return;
    }

    todayHabits.forEach(h => {
        const item = document.createElement('div');
        item.className = `today-item ${h.completed_today ? 'today-done' : ''}`;
        const color = h.color || '#7c3aed';
        item.innerHTML = `
            <div class="today-dot" style="background:${color}"></div>
            <span class="today-name">${h.title}</span>
            ${h.completed_today
                ? `<button class="today-done-btn" onclick="uncompleteHabitToday('${h.id}')">✓ Отменить</button>`
                : `<button class="today-do-btn" onclick="completeHabitToday('${h.id}')">Выполнить</button>`
            }
        `;
        todayList.appendChild(item);
    });
}

async function completeHabitToday(habitId) {
    try {
        const tz = -new Date().getTimezoneOffset();
        const result = await api.request('POST', `/habits/${habitId}/complete?tz_offset=${tz}`, null, true);
        showToast(`+${result.xp_result.xp_gained} XP! 🌱`);
        updateHabitLocalDone(habitId, true);
        renderTodayPanel();
        renderHabits();
        renderMiniCalendar();
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

async function uncompleteHabitToday(habitId) {
    try {
        const tz = -new Date().getTimezoneOffset();
        await api.request('POST', `/habits/${habitId}/uncomplete?tz_offset=${tz}`, null, true);
        showToast('Выполнение отменено ↩');
        updateHabitLocalDone(habitId, false);
        renderTodayPanel();
        renderHabits();
        renderMiniCalendar();
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

async function uncompleteHabit(habitId) {
    const confirmed = await showConfirm(
        'Отменить выполнение?',
        'XP за эту привычку будет возвращён',
        'Да, отменить',
        'btn-confirm-undo'
    );
    if (!confirmed) return;
    try {
        const tz = -new Date().getTimezoneOffset();
        await api.request('POST', `/habits/${habitId}/uncomplete?tz_offset=${tz}`, null, true);
        showToast('Выполнение отменено ↩');
        updateHabitLocalDone(habitId, false);
        renderHabits();
        renderTodayPanel();
        renderMiniCalendar();
        await loadCharacter();
    } catch (e) { showToast(e.message, true); }
}

function updateHabitLocalDone(habitId, done) {
    const idx = habits.findIndex(h => h.id === habitId);
    if (idx === -1) return;
    habits[idx].completed_today = done;
    habits[idx].current_streak = done
        ? habits[idx].current_streak + 1
        : Math.max(0, habits[idx].current_streak - 1);

    const todayStr = getTodayStr();
    if (!habits[idx].calendar) habits[idx].calendar = [];
    const calDay = habits[idx].calendar.find(c => c.date === todayStr);
    if (calDay) {
        calDay.done = done;
    } else if (done) {
        habits[idx].calendar.push({ date: todayStr, done: true });
    }
}

function renderMiniCalendar() {
    const grid  = document.getElementById('mini-cal-grid');
    const title = document.getElementById('mini-cal-title');
    if (!grid || !title) return;

    const year  = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    title.textContent = `${MONTH_NAMES[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = jsDay(firstDay);

    grid.innerHTML = '';

    for (let i = 0; i < startDow; i++) {
        const empty = document.createElement('div');
        empty.style.visibility = 'hidden';
        grid.appendChild(empty);
    }

    const todayStr = getTodayStr();

    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dateStr  = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
        const isToday  = dateStr === todayStr;
        const isFuture = dateStr > todayStr;

        const activeOnDay = habits.filter(h => {
            if (!h.calendar) return false;
            const calEntry = h.calendar.find(c => c.date === dateStr);
            if (!calEntry) return false;
            const dateObj = new Date(year, month, day);
            return isHabitScheduledToday(h, dateObj);
        });

        const total = activeOnDay.length;
        let doneCount = 0;

        if (total > 0) {
            activeOnDay.forEach(h => {
                if (isToday) {

                    if (h.completed_today) doneCount++;
                } else {

                    const found = h.calendar.find(c => c.date === dateStr);
                    if (found?.done) doneCount++;
                }
            });
        }

        let dotClass = '';
        if (total > 0 && !isFuture) {
            if (isToday) {
                if (doneCount === total)   dotClass = 'cal-cell-full';
                else if (doneCount > 0)    dotClass = 'cal-cell-partial';

            } else {

                if (doneCount === total)   dotClass = 'cal-cell-full';
                else if (doneCount > 0)    dotClass = 'cal-cell-partial';
                else                       dotClass = 'cal-cell-miss';
            }
        }

        const cell = document.createElement('div');
        const classes = ['cal-cell'];
        if (isToday)  classes.push('cal-cell-today');
        if (isFuture) classes.push('cal-cell-future');
        if (dotClass) classes.push(dotClass);
        cell.className = classes.join(' ');

        if (!isFuture && total > 0) {
            cell.title = `${dateStr}: ${doneCount}/${total}`;
        }

        cell.innerHTML = `<span class="cal-cell-num">${day}</span>`;
        grid.appendChild(cell);
    }
}

document.getElementById('cal-prev').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() - 1);
    renderMiniCalendar();
});

document.getElementById('cal-next').addEventListener('click', () => {
    calendarMonth.setMonth(calendarMonth.getMonth() + 1);
    renderMiniCalendar();
});

function renderHabits() {
    const list = document.getElementById('habits-list');
    if (habits.length === 0) {
        list.innerHTML = `<div class="tasks-empty">
            <div class="empty-icon">🌱</div>
            <p>Нет привычек.<br>Начни с маленького шага!</p>
        </div>`;
        return;
    }

    list.innerHTML = '';
    const today = new Date();

    const todayHabits = habits.filter(h => isHabitScheduledToday(h, today));
    const otherHabits = habits.filter(h => !isHabitScheduledToday(h, today));

    todayHabits.forEach(h => list.appendChild(makeHabitCard(h, false)));

    if (otherHabits.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'habits-other-sep';
        sep.innerHTML = '<span>Не запланированы на сегодня</span>';
        list.appendChild(sep);
        otherHabits.forEach(h => list.appendChild(makeHabitCard(h, true)));
    }
}

function formatDuration(minutes) {
    if (!minutes) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0 && m > 0) return `${h}ч ${m}мин`;
    if (h > 0) return `${h}ч`;
    return `${m}мин`;
}

function makeHabitCard(habit, isDimmed) {
    const card = document.createElement('div');
    card.className = `habit-card ${isDimmed ? 'habit-dimmed' : ''}`;
    card.dataset.id = habit.id;
    const color = habit.color || '#7c3aed';
    card.style.setProperty('--habit-color', color);
    card.style.borderLeftColor = color;

    const done      = habit.completed_today;
    const catIcon   = CAT_ICONS[habit.category]  || '✨';
    const catLabel  = CAT_LABELS[habit.category]  || 'Другое';
    const freqLabel = FREQ_LABELS[habit.frequency] || 'Каждый день';
    const dur       = formatDuration(habit.duration_minutes);
    const reminder  = habit.reminder_time ? REMINDER_LABELS[habit.reminder_time] : null;

    const todayStr = getTodayStr();

    const streakBar = Array.from({length: 14}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (13 - i));
        const ds      = dateToStr(d);
        const isPast  = ds < todayStr;
        const isToday = ds === todayStr;

        const calEntry  = habit.calendar?.find(c => c.date === ds);
        const existed   = calEntry !== undefined;
        const scheduled = isHabitScheduledToday(habit, d);

        let cls = 'pip-empty', sty = '';

        if (!existed) {
            cls = 'pip-empty';
        } else if (calEntry.done) {
            cls = 'pip-done';
            sty = `background:${color}`;
        } else if (!scheduled) {
            cls = 'pip-skip';
        } else if (isPast) {
            cls = 'pip-miss';
        }

        return `<div class="streak-pip ${cls}" style="${sty}" title="${ds}"></div>`;
    }).join('');

    card.innerHTML = `
        <div class="habit-top">
            <div class="habit-left">
                <div class="habit-cat-icon" style="background:${color}22;color:${color}">${catIcon}</div>
                <div class="habit-info">
                    <div class="habit-title ${done ? 'habit-title-done' : ''}">${habit.title}</div>
                    <div class="habit-meta">
                        <span class="badge" style="color:${color};border-color:${color}44">${catLabel}</span>
                        <span class="badge">${freqLabel}</span>
                        ${dur      ? `<span class="badge">⏱ ${dur}</span>`        : ''}
                        ${reminder ? `<span class="badge">${reminder}</span>`      : ''}
                        <span class="badge xp-badge">+${habit.xp_reward} XP</span>
                        <span class="badge" style="color:var(--accent-pink);border-color:rgba(236,72,153,0.3)">
                            🔥 ${habit.current_streak} дн.
                        </span>
                    </div>
                </div>
            </div>
            <div class="habit-actions">
                ${done
                    ? `<button class="habit-done-btn" onclick="uncompleteHabit('${habit.id}')">✓ Сделано</button>`
                    : isDimmed
                        ? `<div class="habit-skip-badge">Не сегодня</div>`
                        : `<button class="btn-complete" onclick="completeHabit('${habit.id}')">Выполнить</button>`
                }
                <button class="btn-delete" onclick="deleteHabit('${habit.id}')">🗑</button>
            </div>
        </div>
        <div class="streak-bar-wrap">
            <div class="streak-bar">${streakBar}</div>
            <span class="streak-bar-label">14 дн.</span>
        </div>
    `;
    return card;
}

async function completeHabit(habitId) {
    const btn = document.querySelector(`.habit-card[data-id="${habitId}"] .btn-complete`);
    if (btn) { btn.disabled = true; btn.textContent = '...'; }
    try {
        const tz = -new Date().getTimezoneOffset();
        const result = await api.request('POST', `/habits/${habitId}/complete?tz_offset=${tz}`, null, true);
        showToast(`+${result.xp_result.xp_gained} XP! Привычка выполнена 🌱`);
        updateHabitLocalDone(habitId, true);
        renderHabits();
        renderTodayPanel();
        renderMiniCalendar();
        await loadCharacter();
    } catch (e) {
        showToast(e.message, true);
        if (btn) { btn.disabled = false; btn.textContent = 'Выполнить'; }
    }
}

async function deleteHabit(habitId) {
    const habit = habits.find(h => h.id === habitId);
    const confirmed = await showConfirm(
        'Удалить привычку?',
        `"${habit?.title}" и весь стрик будут удалены`
    );
    if (!confirmed) return;

    const card = document.querySelector(`.habit-card[data-id="${habitId}"]`);
    if (card) {
        card.style.transition = 'opacity 0.2s, transform 0.2s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(16px)';
        setTimeout(() => card.remove(), 220);
    }
    try {
        await api.request('DELETE', `/habits/${habitId}`, null, true);
        habits = habits.filter(h => h.id !== habitId);
        showToast('Привычка удалена');
        renderTodayPanel();
        renderMiniCalendar();
        if (habits.length === 0) renderHabits();
    } catch (e) {
        showToast(e.message, true);
        await loadHabits();
    }
}

let durHours = 0, durMins = 0;

function updateDurDisplay() {
    document.getElementById('dur-hours').textContent = durHours;
    document.getElementById('dur-mins').textContent  = String(durMins).padStart(2,'0');
    const total = durHours * 60 + durMins;
    document.getElementById('habit-duration-hidden').value = total > 0 ? total : '';
    document.getElementById('dur-clear-btn').style.display  = total > 0 ? 'block' : 'none';
}

document.querySelectorAll('.dur-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
        const dir = btn.dataset.dir === 'up' ? 1 : -1;
        if (btn.dataset.target === 'dur-hours') {
            durHours = Math.max(0, Math.min(23, durHours + dir));
        } else {
            durMins = Math.max(0, Math.min(55, durMins + dir * 5));
        }
        updateDurDisplay();
    });
});

document.getElementById('dur-clear-btn').addEventListener('click', () => {
    durHours = 0; durMins = 0;
    updateDurDisplay();
});

const habitModal = document.getElementById('habit-modal');

document.getElementById('open-habit-modal').addEventListener('click', () => {
    habitModal.style.display = 'flex';
    document.getElementById('habit-title').focus();
});

document.getElementById('close-habit-modal').addEventListener('click', () => {
    habitModal.style.display = 'none';
});

habitModal.addEventListener('click', e => {
    if (e.target === habitModal) habitModal.style.display = 'none';
});

habitModal.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        habitModal.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

habitModal.querySelectorAll('.freq-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        habitModal.querySelectorAll('.freq-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('days-picker').style.display =
            btn.dataset.freq === 'custom' ? 'flex' : 'none';
    });
});

habitModal.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
});

habitModal.querySelectorAll('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        habitModal.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

document.getElementById('habit-form').addEventListener('submit', async e => {
    e.preventDefault();
    const title            = document.getElementById('habit-title').value.trim();
    const duration_minutes = parseInt(document.getElementById('habit-duration-hidden').value) || null;
    const reminder_time    = document.getElementById('habit-reminder').value || null;
    const category         = habitModal.querySelector('.cat-btn.active')?.dataset.cat   || 'other';
    const frequency        = habitModal.querySelector('.freq-tab.active')?.dataset.freq || 'daily';
    const color            = habitModal.querySelector('.color-btn.active')?.dataset.color || '#7c3aed';

    let frequency_days = null;
    if (frequency === 'custom') {
        frequency_days = [...habitModal.querySelectorAll('.day-btn.active')]
            .map(b => parseInt(b.dataset.day));
        if (frequency_days.length === 0) {
            showToast('Выбери хотя бы один день!', true);
            return;
        }
    }

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Создание...';

    try {
        const newHabit = await api.request('POST', '/habits/', {
            title, duration_minutes, reminder_time,
            category, frequency, frequency_days, color
        }, true);

        habitModal.style.display = 'none';
        e.target.reset();
        durHours = 0; durMins = 0; updateDurDisplay();
        habitModal.querySelectorAll('.cat-btn').forEach((b,i)  => b.classList.toggle('active', i===0));
        habitModal.querySelectorAll('.freq-tab').forEach((b,i)  => b.classList.toggle('active', i===0));
        habitModal.querySelectorAll('.color-btn').forEach((b,i) => b.classList.toggle('active', i===0));
        habitModal.querySelectorAll('.day-btn').forEach(b => b.classList.remove('active'));
        document.getElementById('days-picker').style.display = 'none';

        habits.unshift(newHabit);
        renderHabits();
        renderTodayPanel();
        renderMiniCalendar();
        showToast('Привычка создана! 🌱');
    } catch (err) {
        const errEl = document.getElementById('habit-error');
        errEl.textContent = err.message;
        errEl.style.display = 'block';
        setTimeout(() => errEl.style.display = 'none', 4000);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Создать привычку';
    }
});