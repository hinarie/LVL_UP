let feedPosts = [];
let friendRequests = [];
let friends = [];

// ════════════════════════════════════════════════════════════════
// Утилиты
// ════════════════════════════════════════════════════════════════

function getCurrentUserId() {
    if (window.MY_USER_ID) return window.MY_USER_ID;
    try {
        const token = api.getToken();
        if (!token) return null;
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub;
    } catch { return null; }
}

function escapeHtml(text) {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

// Относительное время в стиле соцсетей: «только что», «5 мин», «3 ч», «2 д», дата
function relTime(iso) {
    if (!iso) return '';
    const str = (typeof iso === 'string' && !iso.endsWith('Z') && !iso.includes('+')) ? iso + 'Z' : iso;
    const diff = Date.now() - new Date(str).getTime();
    if (isNaN(diff)) return '';
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'только что';
    if (m < 60) return `${m} мин`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} ч`;
    const d = Math.floor(h / 24);
    if (d < 7)  return `${d} д`;
    return new Date(str).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

const RANK_AVATARS = ['🐣','🧒','👦','🧑','👨','🧔','👴'];
function avatarFor(level) {
    const idx = Math.min(Math.floor(((level || 1) - 1) / 5), RANK_AVATARS.length - 1);
    return RANK_AVATARS[Math.max(0, idx)];
}

// Достаём название ивента из auto_event_data (JSON), если есть
function challengeTitleOf(post) {
    if (post.auto_event_data) {
        try {
            const d = JSON.parse(post.auto_event_data);
            if (d && d.challenge_title) return d.challenge_title;
        } catch { /* ignore */ }
    }
    return null;
}

// ════════════════════════════════════════════════════════════════
// ЛЕНТА
// ════════════════════════════════════════════════════════════════

async function loadFeed() {
    try {
        feedPosts = await api.request('GET', '/social/feed', null, true);
        renderFeed();
    } catch (e) { console.error(e); }
}

function renderFeed() {
    const list = document.getElementById('posts-list');
    if (!list) return;
    if (!feedPosts || feedPosts.length === 0) {
        list.innerHTML = `<div class="feed-empty">
            <div class="feed-empty-icon">📰</div>
            <p>Лента пуста.<br>Напиши первый пост!</p>
        </div>`;
        return;
    }
    list.innerHTML = '';
    feedPosts.forEach(post => list.appendChild(makePostCard(post)));
}

function makePostCard(post) {
    const card = document.createElement('article');
    card.className = 'post';
    card.id = `post-${post.id}`;

    const authorName  = post.author?.character_name || 'Герой';
    const authorLevel = post.author?.level || 1;
    const authorRank  = post.author?.rank || 'Warrior';
    const isOwn = String(post.author_id) === String(getCurrentUserId());
    const avatar = avatarFor(authorLevel);

    // Бейджи: авто-событие (level up / победа) или происхождение из ивента
    const chTitle = challengeTitleOf(post);
    let badge = '';
    if (post.is_auto_generated) {
        const t = post.auto_event_type;
        const label = t === 'level_up' ? '🆙 Новый уровень'
                    : (t === 'challenge_win' || t === 'winner') ? `🏆 Победа${chTitle ? ` · ${escapeHtml(chTitle)}` : ''}`
                    : '⭐ Достижение';
        badge = `<span class="post-badge">${label}</span>`;
    } else if (chTitle || post.from_challenge) {
        badge = `<span class="post-badge post-badge-event">🏆 из ивента${chTitle ? ` «${escapeHtml(chTitle)}»` : ''}</span>`;
    }

    const delBtn = isOwn && !post.is_auto_generated
        ? `<button class="post-menu" title="Удалить" onclick="deletePost('${post.id}')">🗑</button>`
        : '';

    const myR = post.my_reaction; // 'like' | 'dislike' | null
    card.innerHTML = `
        <div class="post-avatar">${avatar}</div>
        <div class="post-main">
            <div class="post-head">
                <span class="post-name">${escapeHtml(authorName)}</span>
                <span class="post-sub">Lvl ${authorLevel} · ${authorRank}</span>
                <span class="post-dot">·</span>
                <span class="post-time">${relTime(post.created_at)}</span>
                <span class="post-head-spacer"></span>
                ${delBtn}
            </div>
            ${badge ? `<div class="post-badges">${badge}</div>` : ''}
            <div class="post-text">${escapeHtml(post.content)}</div>
            <div class="post-bar">
                <button class="post-act post-like ${myR === 'like' ? 'liked' : ''}"
                    onclick="reactPost('${post.id}','like',this)">
                    <span class="post-act-ico">${myR === 'like' ? '❤️' : '🤍'}</span>
                    <span class="post-act-num">${post.likes || 0}</span>
                </button>
                <button class="post-act post-dislike ${myR === 'dislike' ? 'disliked' : ''}"
                    onclick="reactPost('${post.id}','dislike',this)">
                    <span class="post-act-ico">${myR === 'dislike' ? '👎🏻' : '👎'}</span>
                    <span class="post-act-num">${post.dislikes || 0}</span>
                </button>
                <button class="post-act post-comment-btn" onclick="toggleComments('${post.id}',this)">
                    <span class="post-act-ico">💬</span>
                    <span class="post-act-num post-cc-${post.id}">${post.comments_count || 0}</span>
                </button>
            </div>
            <div class="post-comments" id="post-comments-${post.id}" style="display:none">
                <div class="post-comments-list" id="post-comments-list-${post.id}"></div>
                <div class="post-comment-form">
                    <input class="post-comment-input" id="post-comment-input-${post.id}"
                        placeholder="Добавить комментарий…" maxlength="300"
                        onkeydown="if(event.key==='Enter')sendComment('${post.id}')">
                    <button class="post-comment-send" onclick="sendComment('${post.id}')">↑</button>
                </div>
            </div>
        </div>`;
    return card;
}

// ── Реакции: лайк / дизлайк (взаимоисключающие, оптимистично) ──
async function reactPost(postId, type, btn) {
    const card = document.getElementById(`post-${postId}`);
    if (!card) return;
    const likeBtn = card.querySelector('.post-like');
    const disBtn  = card.querySelector('.post-dislike');
    const likeNum = likeBtn.querySelector('.post-act-num');
    const disNum  = disBtn.querySelector('.post-act-num');

    // текущее состояние
    const wasLike = likeBtn.classList.contains('liked');
    const wasDislike = disBtn.classList.contains('disliked');
    let likes = parseInt(likeNum.textContent || '0', 10) || 0;
    let dislikes = parseInt(disNum.textContent || '0', 10) || 0;

    // вычисляем новое состояние оптимистично
    let nextLike = wasLike, nextDislike = wasDislike;
    if (type === 'like') {
        if (wasLike) { nextLike = false; likes--; }
        else { nextLike = true; likes++; if (wasDislike) { nextDislike = false; dislikes--; } }
    } else {
        if (wasDislike) { nextDislike = false; dislikes--; }
        else { nextDislike = true; dislikes++; if (wasLike) { nextLike = false; likes--; } }
    }
    applyReactionUI(likeBtn, disBtn, nextLike, nextDislike, Math.max(0,likes), Math.max(0,dislikes));
    btn.classList.add('pop'); setTimeout(() => btn.classList.remove('pop'), 220);

    try {
        const res = await api.request('POST', `/social/posts/${postId}/react`, { type }, true);
        // синхронизируем с сервером
        applyReactionUI(likeBtn, disBtn, res.my_reaction === 'like', res.my_reaction === 'dislike',
            res.likes, res.dislikes);
        const p = feedPosts.find(x => String(x.id) === String(postId));
        if (p) { p.my_reaction = res.my_reaction; p.likes = res.likes; p.dislikes = res.dislikes; }
    } catch (e) {
        // откат
        applyReactionUI(likeBtn, disBtn, wasLike, wasDislike,
            parseInt(likeNum.textContent,10)||0, parseInt(disNum.textContent,10)||0);
        showToast(e.message, true);
    }
}

function applyReactionUI(likeBtn, disBtn, liked, disliked, likes, dislikes) {
    likeBtn.classList.toggle('liked', liked);
    disBtn.classList.toggle('disliked', disliked);
    likeBtn.querySelector('.post-act-ico').textContent = liked ? '❤️' : '🤍';
    disBtn.querySelector('.post-act-ico').textContent = disliked ? '👎🏻' : '👎';
    likeBtn.querySelector('.post-act-num').textContent = likes;
    disBtn.querySelector('.post-act-num').textContent = dislikes;
}

// ── Комментарии ──────────────────────────────────────────────
async function toggleComments(postId, btn) {
    const box = document.getElementById(`post-comments-${postId}`);
    if (!box) return;
    const opening = box.style.display === 'none';
    box.style.display = opening ? 'block' : 'none';
    if (opening) {
        await loadComments(postId);
        document.getElementById(`post-comment-input-${postId}`)?.focus();
    }
}

async function loadComments(postId) {
    const list = document.getElementById(`post-comments-list-${postId}`);
    if (!list) return;
    list.innerHTML = '<div class="post-comments-loading">Загрузка…</div>';
    try {
        const comments = await api.request('GET', `/social/posts/${postId}/comments`, null, true);
        renderComments(postId, comments);
    } catch (e) {
        list.innerHTML = `<div class="post-comments-loading">Ошибка загрузки</div>`;
    }
}

function renderComments(postId, comments) {
    const list = document.getElementById(`post-comments-list-${postId}`);
    if (!list) return;
    if (!comments || comments.length === 0) {
        list.innerHTML = '<div class="post-comments-empty">Пока нет комментариев</div>';
        return;
    }
    list.innerHTML = '';
    comments.forEach(c => list.appendChild(makeCommentEl(postId, c)));
}

function makeCommentEl(postId, c) {
    const el = document.createElement('div');
    el.className = 'post-comment';
    el.id = `post-comment-${c.id}`;
    const isMine = String(c.user_id) === String(getCurrentUserId());
    el.innerHTML = `
        <div class="post-comment-avatar">${avatarFor(c.author_level)}</div>
        <div class="post-comment-body">
            <div class="post-comment-head">
                <span class="post-comment-name">${escapeHtml(c.author_name || 'Герой')}</span>
                <span class="post-comment-time">${relTime(c.created_at)}</span>
                ${isMine ? `<button class="post-comment-del" title="Удалить"
                    onclick="deleteFeedComment('${postId}','${c.id}')">✕</button>` : ''}
            </div>
            <div class="post-comment-text">${escapeHtml(c.content)}</div>
        </div>`;
    return el;
}

async function sendComment(postId) {
    const input = document.getElementById(`post-comment-input-${postId}`);
    const content = input?.value?.trim();
    if (!content) return;
    input.disabled = true;
    try {
        const res = await api.request('POST', `/social/posts/${postId}/comments`, { content }, true);
        const list = document.getElementById(`post-comments-list-${postId}`);
        const empty = list.querySelector('.post-comments-empty');
        if (empty) list.innerHTML = '';
        list.appendChild(makeCommentEl(postId, res));
        input.value = '';
        // обновляем счётчик
        bumpCommentCount(postId, +1);
    } catch (e) { showToast(e.message, true); }
    finally { input.disabled = false; input.focus(); }
}

async function deleteFeedComment(postId, commentId) {
    if (!confirm('Удалить комментарий?')) return;
    try {
        await api.request('DELETE', `/social/posts/${postId}/comments/${commentId}`, null, true);
        document.getElementById(`post-comment-${commentId}`)?.remove();
        bumpCommentCount(postId, -1);
        const list = document.getElementById(`post-comments-list-${postId}`);
        if (list && list.children.length === 0) {
            list.innerHTML = '<div class="post-comments-empty">Пока нет комментариев</div>';
        }
        showToast('Комментарий удалён');
    } catch (e) { showToast(e.message, true); }
}

function bumpCommentCount(postId, delta) {
    const el = document.querySelector(`.post-cc-${postId}`);
    if (el) el.textContent = Math.max(0, (parseInt(el.textContent, 10) || 0) + delta);
    const p = feedPosts.find(x => String(x.id) === String(postId));
    if (p) p.comments_count = Math.max(0, (p.comments_count || 0) + delta);
}

async function deletePost(postId) {
    if (!confirm('Удалить пост? Это действие необратимо.')) return;
    try {
        await api.request('DELETE', `/social/posts/${postId}`, null, true);
        document.getElementById(`post-${postId}`)?.remove();
        feedPosts = feedPosts.filter(p => String(p.id) !== String(postId));
        if (feedPosts.length === 0) renderFeed();
        showToast('Пост удалён');
    } catch (e) { showToast(e.message, true); }
}

// ════════════════════════════════════════════════════════════════
// КОМПОЗЕР
// ════════════════════════════════════════════════════════════════

function initComposer() {
    const input   = document.getElementById('post-content');
    const composer = document.getElementById('composer');
    const count   = document.getElementById('composer-count');
    if (!input || !composer) return;

    const avatar = document.getElementById('composer-avatar');
    if (avatar && typeof character !== 'undefined' && character) {
        avatar.textContent = avatarFor(character.level);
    }

    const autoGrow = () => {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 200) + 'px';
    };
    const expand = () => composer.classList.add('expanded');

    input.addEventListener('focus', expand);
    input.addEventListener('input', () => {
        autoGrow();
        if (count) count.textContent = `${input.value.length}/500`;
        if (input.value.length > 0) expand();
    });

    // Клик вне композера — свернуть, если пусто
    document.addEventListener('click', (e) => {
        if (!composer.contains(e.target) && e.target.id !== 'feed-fab' && !input.value.trim()) {
            composer.classList.remove('expanded');
            input.style.height = 'auto';
        }
    });

    document.getElementById('submit-post')?.addEventListener('click', submitFeedPost);

    // FAB — скролл наверх, фокус в композер
    document.getElementById('feed-fab')?.addEventListener('click', () => {
        switchFeedTab('feed');
        composer.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(() => input.focus(), 200);
    });
}

async function submitFeedPost() {
    const input = document.getElementById('post-content');
    const content = input.value.trim();
    const visibility = document.getElementById('post-visibility').value;
    if (!content) return showToast('Напиши что-нибудь!', true);

    const btn = document.getElementById('submit-post');
    btn.disabled = true;
    btn.textContent = 'Публикация…';
    try {
        const newPost = await api.request('POST', '/social/posts', { content, visibility }, true);
        input.value = '';
        input.style.height = 'auto';
        document.getElementById('composer-count').textContent = '0/500';
        document.getElementById('composer').classList.remove('expanded');
        showToast('Пост опубликован! 🎉');
        // Вставляем новый пост сверху без полной перезагрузки
        if (newPost && newPost.id) {
            feedPosts.unshift(newPost);
            const list = document.getElementById('posts-list');
            const empty = list.querySelector('.feed-empty');
            if (empty) list.innerHTML = '';
            const cardEl = makePostCard(newPost);
            cardEl.classList.add('post-new');
            list.insertBefore(cardEl, list.firstChild);
        } else {
            await loadFeed();
        }
    } catch (e) { showToast(e.message, true); }
    finally {
        btn.disabled = false;
        btn.textContent = 'Опубликовать';
    }
}

// ════════════════════════════════════════════════════════════════
// ТАБЫ Лента / Друзья
// ════════════════════════════════════════════════════════════════

function switchFeedTab(tab) {
    document.querySelectorAll('.feed-tab').forEach(b =>
        b.classList.toggle('active', b.dataset.feedTab === tab));
    document.querySelectorAll('.feed-pane').forEach(p =>
        p.classList.toggle('active', p.id === `feed-pane-${tab}`));
    const fab = document.getElementById('feed-fab');
    if (fab) fab.style.display = tab === 'feed' ? '' : 'none';
}

function initFeedTabs() {
    document.getElementById('feed-tabs')?.addEventListener('click', (e) => {
        const btn = e.target.closest('.feed-tab');
        if (btn) switchFeedTab(btn.dataset.feedTab);
    });
}

document.getElementById('refresh-feed')?.addEventListener('click', async () => {
    await loadFeed();
    showToast('Лента обновлена');
});

// Инициализация после загрузки партиалов
initComposer();
initFeedTabs();

// ════════════════════════════════════════════════════════════════
// ДРУЗЬЯ
// ════════════════════════════════════════════════════════════════

async function loadFriendRequests() {
    try {
        friendRequests = await api.request('GET', '/social/friends/requests', null, true);
        renderFriendRequests();
    } catch (e) { console.error(e); }
}

function renderFriendRequests() {
    const badge = document.getElementById('friends-tab-badge');
    // Десктоп — правый рейл; мобилка — карточка во вкладке Друзья
    const targets = [
        { card: document.getElementById('friend-requests-card'),   list: document.getElementById('friend-requests-list') },
        { card: document.getElementById('friend-requests-card-m'), list: document.getElementById('friend-requests-list-m') },
    ];
    const hasReqs = friendRequests.length > 0;
    if (badge) { badge.style.display = hasReqs ? '' : 'none'; badge.textContent = friendRequests.length; }

    targets.forEach(({ card, list }) => {
        if (!card || !list) return;
        card.style.display = hasReqs ? '' : 'none';
        list.innerHTML = '';
        friendRequests.forEach(req => {
            const item = document.createElement('div');
            item.className = 'friend-request-item';
            item.innerHTML = `
                <div class="friend-req-info">
                    <div class="friend-req-name">${escapeHtml(req.requester?.character_name || 'Герой')}</div>
                    <div class="friend-req-email">${escapeHtml(req.requester_email || '')}</div>
                </div>
                <div class="friend-req-actions">
                    <button class="btn-accept" onclick="acceptFriend('${req.id}')">✓</button>
                    <button class="btn-decline" onclick="declineFriend('${req.id}')">✕</button>
                </div>`;
            list.appendChild(item);
        });
    });
}

async function loadFriends() {
    try {
        friends = await api.request('GET', '/social/friends', null, true);
        renderFriends();
    } catch (e) { console.error(e); }
}

function renderFriends() {
    // Рендерим в оба контейнера: десктопный рейл и мобильную вкладку
    const lists = [
        document.getElementById('friends-list-rail'),
        document.getElementById('friends-list'),
    ].filter(Boolean);
    lists.forEach(list => {
        if (friends.length === 0) {
            list.innerHTML = '<div class="friends-empty">Пока нет друзей</div>';
            return;
        }
        list.innerHTML = '';
        friends.forEach(f => {
            const level = f.character?.level || 1;
            const item = document.createElement('div');
            item.className = 'friend-item';
            item.innerHTML = `
                <div class="friend-avatar">${avatarFor(level)}</div>
                <div class="friend-info">
                    <div class="friend-name">${escapeHtml(f.character?.character_name || 'Герой')}</div>
                    <div class="friend-level">Lvl ${level} · ${f.character?.rank || 'Warrior'}</div>
                </div>
                <button class="btn-ping" onclick="sendPing('${f.user_id}')" title="Мотивационный пинг">💪</button>`;
            list.appendChild(item);
        });
    });
}

async function acceptFriend(id) {
    try {
        const result = await api.request('POST', `/social/friends/${id}/accept`, null, true);
        showToast(result.message);
        await loadFriendRequests();
        await loadFriends();
    } catch (e) { showToast(e.message, true); }
}

async function declineFriend(id) {
    try {
        await api.request('POST', `/social/friends/${id}/decline`, null, true);
        showToast('Запрос отклонён');
        await loadFriendRequests();
    } catch (e) { showToast(e.message, true); }
}

async function sendPing(userId) {
    try {
        await api.request('POST', `/social/ping/${userId}`, null, true);
        showToast('Мотивационный пинг отправлен! 💪');
    } catch (e) { showToast(e.message, true); }
}

async function submitFriendRequest(emailInputId, errorId) {
    const emailEl = document.getElementById(emailInputId);
    const email = emailEl?.value?.trim();
    if (!email) return;
    try {
        const result = await api.request('POST', '/social/friends/request', { addressee_email: email }, true);
        emailEl.value = '';
        showToast(result.message);
    } catch (e) {
        const err = document.getElementById(errorId);
        if (err) { err.textContent = e.message; err.style.display = 'block'; setTimeout(() => err.style.display = 'none', 3000); }
        else showToast(e.message, true);
    }
}

document.getElementById('send-friend-request')?.addEventListener('click',
    () => submitFriendRequest('friend-email', 'friend-error'));
document.getElementById('send-friend-request-m')?.addEventListener('click',
    () => submitFriendRequest('friend-email-m', 'friend-error-m'));

// ════════════════════════════════════════════════════════════════
// ПРОФИЛЬ (использует makePostCard)
// ════════════════════════════════════════════════════════════════

async function loadProfile() {
    try {
        const profile = await api.request('GET', '/social/profile', null, true);
        renderProfile(profile);
    } catch (e) { console.error(e); }
}

function renderProfile(profile) {
    const char = profile.character;
    document.getElementById('profile-avatar').textContent = avatarFor(char.level);
    document.getElementById('profile-char-name').textContent = char.character_name || 'Герой';
    document.getElementById('profile-rank').textContent = char.rank || 'Warrior';
    document.getElementById('profile-email').textContent = profile.user?.email || '';
    document.getElementById('profile-level').textContent = char.level || 1;
    document.getElementById('profile-friends').textContent = profile.friends_count || 0;

    if (typeof character !== 'undefined' && character) {
        document.getElementById('profile-credits').textContent = character.credits;
        document.getElementById('profile-streak').textContent = character.current_streak;
    }

    const postsList = document.getElementById('profile-posts-list');
    if (!profile.posts || profile.posts.length === 0) {
        postsList.innerHTML = `<div class="feed-empty">
            <div class="feed-empty-icon">📝</div><p>Нет постов</p>
        </div>`;
        return;
    }
    postsList.innerHTML = '';
    profile.posts.forEach(post => postsList.appendChild(makePostCard(post)));
}