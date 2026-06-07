let feedPosts = [];
let friendRequests = [];
let friends = [];

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

function escapeAttrSafe(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

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

function avatarContent(avatarUrl, level) {
    if (avatarUrl && /^https?:\/\//.test(avatarUrl)) {
        return `<img src="${escapeAttrSafe(avatarUrl)}" alt="" class="avatar-img">`;
    }
    if (avatarUrl && avatarUrl.length <= 4) {
        return escapeHtml(avatarUrl);
    }
    return avatarFor(level);
}

function challengeTitleOf(post) {
    if (post.auto_event_data) {
        try {
            const d = JSON.parse(post.auto_event_data);
            if (d && d.challenge_title) return d.challenge_title;
        } catch {}
    }
    return null;
}

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

    const authorName  = post.author?.display_name || post.author?.character_name || 'Герой';
    const authorLevel = post.author?.level || 1;
    const authorRank  = post.author?.rank || 'Warrior';
    const isOwn = String(post.author_id) === String(getCurrentUserId());
    const avatar = avatarContent(post.author?.avatar_url, authorLevel);

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
        ? `<button class="post-menu" title="Удалить" data-act="delete-post" data-post-id="${post.id}">🗑</button>`
        : '';

    const authorUsername = post.author?.username || '';
    const nameHtml = authorUsername
        ? `<span class="post-name post-link" data-act="open-user" data-username="${escapeAttrSafe(authorUsername)}">${escapeHtml(authorName)}</span>`
        : `<span class="post-name">${escapeHtml(authorName)}</span>`;
    const handleHtml = authorUsername
        ? `<span class="post-handle" data-act="open-user" data-username="${escapeAttrSafe(authorUsername)}">@${escapeHtml(authorUsername)}</span>`
        : '';
    const avatarHtml = authorUsername
        ? `<div class="post-avatar post-link" data-act="open-user" data-username="${escapeAttrSafe(authorUsername)}">${avatar}</div>`
        : `<div class="post-avatar">${avatar}</div>`;

    const myR = post.my_reaction;
    card.innerHTML = `
        ${avatarHtml}
        <div class="post-main">
            <div class="post-head">
                ${nameHtml}
                ${handleHtml}
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
                    data-act="react-like" data-post-id="${post.id}">
                    <span class="post-act-ico">${myR === 'like' ? '❤️' : '🤍'}</span>
                    <span class="post-act-num">${post.likes || 0}</span>
                </button>
                <button class="post-act post-dislike ${myR === 'dislike' ? 'disliked' : ''}"
                    data-act="react-dislike" data-post-id="${post.id}">
                    <span class="post-act-ico">${myR === 'dislike' ? '👎🏻' : '👎'}</span>
                    <span class="post-act-num">${post.dislikes || 0}</span>
                </button>
                <button class="post-act post-comment-btn" data-act="toggle-comments" data-post-id="${post.id}">
                    <span class="post-act-ico">💬</span>
                    <span class="post-act-num post-cc-${post.id}">${post.comments_count || 0}</span>
                </button>
            </div>
            <div class="post-comments" id="post-comments-${post.id}">
                <div class="post-comments-list" id="post-comments-list-${post.id}"></div>
                <div class="post-comment-form">
                    <input class="post-comment-input" id="post-comment-input-${post.id}"
                        placeholder="Добавить комментарий…" maxlength="300"
                        data-act="comment-input" data-post-id="${post.id}">
                    <button class="post-comment-send" data-act="send-comment" data-post-id="${post.id}">↑</button>
                </div>
            </div>
        </div>`;
    return card;
}

async function reactPost(postId, type, btn) {
    const card = document.getElementById(`post-${postId}`);
    if (!card) return;
    const likeBtn = card.querySelector('.post-like');
    const disBtn  = card.querySelector('.post-dislike');
    const likeNum = likeBtn.querySelector('.post-act-num');
    const disNum  = disBtn.querySelector('.post-act-num');

    const wasLike = likeBtn.classList.contains('liked');
    const wasDislike = disBtn.classList.contains('disliked');
    let likes = parseInt(likeNum.textContent || '0', 10) || 0;
    let dislikes = parseInt(disNum.textContent || '0', 10) || 0;

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
        applyReactionUI(likeBtn, disBtn, res.my_reaction === 'like', res.my_reaction === 'dislike',
            res.likes, res.dislikes);
        const p = feedPosts.find(x => String(x.id) === String(postId));
        if (p) { p.my_reaction = res.my_reaction; p.likes = res.likes; p.dislikes = res.dislikes; }
    } catch (e) {
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

function postCardOf(el) {
    return el?.closest?.('.post') || null;
}

async function toggleComments(postId, btn) {
    const card = postCardOf(btn);
    const box = card
        ? card.querySelector('.post-comments')
        : document.querySelector(`#post-comments-${postId}`);
    if (!box) {
        console.warn('[toggleComments] box not found for', postId);
        return;
    }

    const opening = !box.classList.contains('open');
    box.classList.toggle('open', opening);

    if (opening) {
        await loadComments(postId, card);
        const input = card
            ? card.querySelector('.post-comment-input')
            : box.querySelector('.post-comment-input');
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(() => input?.focus(), 100);
    }
}

async function loadComments(postId, card = null) {
    const list = (card && card.querySelector('.post-comments-list'))
        || document.querySelector(`#post-comments-list-${postId}`);
    if (!list) return;
    list.innerHTML = '<div class="post-comments-loading">Загрузка…</div>';
    try {
        const comments = await api.request('GET', `/social/posts/${postId}/comments`, null, true);
        renderComments(postId, comments, list);
    } catch (e) {
        list.innerHTML = `<div class="post-comments-loading">Ошибка загрузки</div>`;
    }
}

function renderComments(postId, comments, listEl = null) {
    const list = listEl || document.querySelector(`#post-comments-list-${postId}`);
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
    const commentName = c.author_display_name || c.author_name || 'Герой';
    const commentUsername = c.author_username || '';
    const commentAvatar = avatarContent(c.author_avatar_url, c.author_level);
    const avatarHtml = commentUsername
        ? `<div class="post-comment-avatar post-link" data-act="open-user" data-username="${escapeAttrSafe(commentUsername)}">${commentAvatar}</div>`
        : `<div class="post-comment-avatar">${commentAvatar}</div>`;
    const nameHtml = commentUsername
        ? `<span class="post-comment-name post-link" data-act="open-user" data-username="${escapeAttrSafe(commentUsername)}">${escapeHtml(commentName)}</span>`
        : `<span class="post-comment-name">${escapeHtml(commentName)}</span>`;

    el.innerHTML = `
        ${avatarHtml}
        <div class="post-comment-body">
            <div class="post-comment-head">
                ${nameHtml}
                <span class="post-comment-time">${relTime(c.created_at)}</span>
                ${isMine ? `<button class="post-comment-del" title="Удалить"
                    data-act="delete-comment" data-post-id="${postId}" data-comment-id="${c.id}">✕</button>` : ''}
            </div>
            <div class="post-comment-text">${escapeHtml(c.content)}</div>
        </div>`;
    return el;
}

async function sendComment(postId, sourceEl = null) {
    const card = sourceEl ? postCardOf(sourceEl) : null;
    const input = (card && card.querySelector('.post-comment-input'))
        || document.getElementById(`post-comment-input-${postId}`);
    if (!input) return;
    const content = input.value.trim();
    if (!content) return;
    input.disabled = true;
    try {
        const res = await api.request('POST', `/social/posts/${postId}/comments`, { content }, true);
        const list = (card && card.querySelector('.post-comments-list'))
            || document.getElementById(`post-comments-list-${postId}`);
        const empty = list.querySelector('.post-comments-empty');
        if (empty) list.innerHTML = '';
        list.appendChild(makeCommentEl(postId, res));
        input.value = '';
        bumpCommentCount(postId, +1, card);
    } catch (e) { showToast(e.message, true); }
    finally { input.disabled = false; input.focus(); }
}

async function deleteFeedComment(postId, commentId, sourceEl = null) {
    const ok = await confirmModal({
        title: 'Удалить комментарий?',
        message: 'Комментарий будет удалён без возможности восстановления.',
        confirmText: 'Удалить',
        danger: true,
    });
    if (!ok) return;

    const card = sourceEl ? postCardOf(sourceEl) : null;
    try {
        await api.request('DELETE', `/social/posts/${postId}/comments/${commentId}`, null, true);
        document.querySelectorAll(`#post-comment-${commentId}`).forEach(el => el.remove());
        bumpCommentCount(postId, -1, card);
        const list = (card && card.querySelector('.post-comments-list'))
            || document.getElementById(`post-comments-list-${postId}`);
        if (list && list.children.length === 0) {
            list.innerHTML = '<div class="post-comments-empty">Пока нет комментариев</div>';
        }
        showToast('Комментарий удалён');
    } catch (e) { showToast(e.message, true); }
}

function bumpCommentCount(postId, delta, card = null) {
    document.querySelectorAll(`.post-cc-${postId}`).forEach(el => {
        el.textContent = Math.max(0, (parseInt(el.textContent, 10) || 0) + delta);
    });
    const p = feedPosts.find(x => String(x.id) === String(postId));
    if (p) p.comments_count = Math.max(0, (p.comments_count || 0) + delta);
}

async function deletePost(postId) {
    const ok = await confirmModal({
        title: 'Удалить пост?',
        message: 'Пост будет удалён вместе с лайками и комментариями. Это нельзя отменить.',
        confirmText: 'Удалить',
        danger: true,
    });
    if (!ok) return;
    try {
        await api.request('DELETE', `/social/posts/${postId}`, null, true);
        document.querySelectorAll(`#post-${postId}`).forEach(el => el.remove());
        feedPosts = feedPosts.filter(p => String(p.id) !== String(postId));
        if (feedPosts.length === 0) renderFeed();
        showToast('Пост удалён');
    } catch (e) { showToast(e.message, true); }
}

function initComposer() {
    const input   = document.getElementById('post-content');
    const composer = document.getElementById('composer');
    const count   = document.getElementById('composer-count');
    if (!input || !composer) return;

    const avatar = document.getElementById('composer-avatar');
    if (avatar && typeof character !== 'undefined' && character) {
        avatar.innerHTML = avatarContent(character.avatar_url, character.level);
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

    document.addEventListener('click', (e) => {
        if (!composer.contains(e.target) && e.target.id !== 'feed-fab' && !input.value.trim()) {
            composer.classList.remove('expanded');
            input.style.height = 'auto';
        }
    });

    document.getElementById('submit-post')?.addEventListener('click', submitFeedPost);

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

initComposer();
initFeedTabs();

async function loadFriendRequests() {
    try {
        friendRequests = await api.request('GET', '/social/friends/requests', null, true);
        renderFriendRequests();
    } catch (e) { console.error(e); }
}

function renderFriendRequests() {
    const badge = document.getElementById('friends-tab-badge');
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
            const username = f.username || f.character?.username || '';
            const name = f.character?.display_name || f.character?.character_name || 'Герой';
            const item = document.createElement('div');
            item.className = 'friend-item';
            const clickableAttrs = username
                ? `data-act="open-user" data-username="${escapeAttrSafe(username)}" class="friend-clickable"`
                : '';
            item.innerHTML = `
                <div class="friend-avatar ${username ? 'post-link' : ''}" ${clickableAttrs}>${avatarContent(f.character?.avatar_url, level)}</div>
                <div class="friend-info ${username ? 'post-link' : ''}" ${clickableAttrs}>
                    <div class="friend-name">${escapeHtml(name)}</div>
                    <div class="friend-level">Lvl ${level} · ${f.character?.rank || 'Warrior'}${username ? ` · @${escapeHtml(username)}` : ''}</div>
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


document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-act]');
    if (!target) return;

    const act = target.dataset.act;

    if (act === 'open-user') {
        e.preventDefault();
        e.stopPropagation();
        const username = target.dataset.username;
        if (typeof openUserProfile === 'function') openUserProfile(username);
        return;
    }

    if (!target.closest('.post')) return;

    const postId = target.dataset.postId;
    const commentId = target.dataset.commentId;

    switch (act) {
        case 'toggle-comments':
            e.preventDefault();
            e.stopPropagation();
            toggleComments(postId, target);
            break;
        case 'send-comment':
            e.preventDefault();
            e.stopPropagation();
            sendComment(postId, target);
            break;
        case 'delete-comment':
            e.preventDefault();
            e.stopPropagation();
            deleteFeedComment(postId, commentId, target);
            break;
        case 'react-like':
            e.preventDefault();
            e.stopPropagation();
            reactPost(postId, 'like', target);
            break;
        case 'react-dislike':
            e.preventDefault();
            e.stopPropagation();
            reactPost(postId, 'dislike', target);
            break;
        case 'delete-post':
            e.preventDefault();
            e.stopPropagation();
            deletePost(postId);
            break;
    }
}, true);

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target.closest('[data-act="comment-input"]');
    if (!target) return;
    e.preventDefault();
    sendComment(target.dataset.postId, target);
}, true);
