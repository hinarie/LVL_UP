let feedPosts = [];
let friendRequests = [];
let friends = [];

// ===== ЛЕНТА =====
async function loadFeed() {
    try {
        feedPosts = await api.request('GET', '/social/feed', null, true);
        renderFeed();
    } catch (e) { console.error(e); }
}

function renderFeed() {
    const list = document.getElementById('posts-list');
    if (feedPosts.length === 0) {
        list.innerHTML = `<div class="tasks-empty">
            <div class="empty-icon">📰</div>
            <p>Лента пуста.<br>Напиши первый пост!</p>
        </div>`;
        return;
    }
    list.innerHTML = '';
    feedPosts.forEach(post => list.appendChild(makePostCard(post)));
}

function makePostCard(post) {
    const card = document.createElement('div');
    card.className = 'post-card';
    const time = new Date(post.created_at).toLocaleString('ru-RU', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
    const authorName = post.author?.character_name || 'Герой';
    const authorLevel = post.author?.level || 1;
    const isOwn = post.author_id === getCurrentUserId();
    const avatars = ['🐣','🧒','👦','🧑','👨','🧔','👴'];
    const avatarIdx = Math.min(Math.floor((authorLevel - 1) / 5), avatars.length - 1);
    const avatar = avatars[avatarIdx];

    const eventBadge = post.is_auto_generated ? `
        <div class="post-event-badge">
            ${post.auto_event_type === 'level_up' ? '🆙 Новый уровень!' : '🏆 Победа в челлендже!'}
        </div>` : '';

    card.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">${avatar}</div>
            <div class="post-author-info">
                <div class="post-author-name">${authorName}</div>
                <div class="post-meta">Lvl ${authorLevel} · ${time}</div>
            </div>
            ${isOwn ? `<button class="btn-delete post-delete" onclick="deletePost('${post.id}')">🗑</button>` : ''}
        </div>
        ${eventBadge}
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-actions">
            <button class="btn-like ${post.liked ? 'liked' : ''}" onclick="toggleLike('${post.id}', this)">
                ${post.liked ? '❤️' : '🤍'} ${post.likes}
            </button>
        </div>
    `;
    return card;
}

function getCurrentUserId() {
    try {
        const token = api.getToken();
        if (!token) return null;
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.sub;
    } catch { return null; }
}

function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}

async function toggleLike(postId, btn) {
    try {
        const result = await api.request('POST', `/social/posts/${postId}/like`, null, true);
        const countStr = btn.textContent.match(/\d+/)?.[0] || '0';
        const count = parseInt(countStr);
        btn.classList.toggle('liked', result.liked);
        btn.innerHTML = `${result.liked ? '❤️' : '🤍'} ${result.liked ? count + 1 : count - 1}`;
    } catch (e) { showToast(e.message, true); }
}

async function deletePost(postId) {
    if (!confirm('Удалить пост?')) return;
    try {
        await api.request('DELETE', `/social/posts/${postId}`, null, true);
        showToast('Пост удалён');
        await loadFeed();
    } catch (e) { showToast(e.message, true); }
}

// Создание поста
document.getElementById('submit-post').addEventListener('click', async () => {
    const content = document.getElementById('post-content').value.trim();
    const visibility = document.getElementById('post-visibility').value;
    if (!content) return showToast('Напиши что-нибудь!', true);

    const btn = document.getElementById('submit-post');
    btn.disabled = true;
    btn.textContent = 'Публикация...';
    try {
        await api.request('POST', '/social/posts', { content, visibility }, true);
        document.getElementById('post-content').value = '';
        showToast('Пост опубликован! 🎉');
        await loadFeed();
    } catch (e) { showToast(e.message, true); }
    finally {
        btn.disabled = false;
        btn.textContent = 'Опубликовать';
    }
});

document.getElementById('refresh-feed').addEventListener('click', async () => {
    await loadFeed();
    showToast('Лента обновлена');
});

// ===== ДРУЗЬЯ =====
async function loadFriendRequests() {
    try {
        friendRequests = await api.request('GET', '/social/friends/requests', null, true);
        renderFriendRequests();
    } catch (e) { console.error(e); }
}

function renderFriendRequests() {
    const card = document.getElementById('friend-requests-card');
    const list = document.getElementById('friend-requests-list');
    if (friendRequests.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';
    list.innerHTML = '';
    friendRequests.forEach(req => {
        const item = document.createElement('div');
        item.className = 'friend-request-item';
        item.innerHTML = `
            <div class="friend-req-info">
                <div class="friend-req-name">${req.requester?.character_name || 'Герой'}</div>
                <div class="friend-req-email">${req.requester_email}</div>
            </div>
            <div class="friend-req-actions">
                <button class="btn-accept" onclick="acceptFriend('${req.id}')">✓</button>
                <button class="btn-decline" onclick="declineFriend('${req.id}')">✕</button>
            </div>
        `;
        list.appendChild(item);
    });
}

async function loadFriends() {
    try {
        friends = await api.request('GET', '/social/friends', null, true);
        renderFriends();
    } catch (e) { console.error(e); }
}

function renderFriends() {
    const list = document.getElementById('friends-list');
    if (friends.length === 0) {
        list.innerHTML = '<div class="friends-empty">Пока нет друзей</div>';
        return;
    }
    list.innerHTML = '';
    const avatars = ['🐣','🧒','👦','🧑','👨','🧔','👴'];
    friends.forEach(f => {
        const level = f.character?.level || 1;
        const avatarIdx = Math.min(Math.floor((level - 1) / 5), avatars.length - 1);
        const item = document.createElement('div');
        item.className = 'friend-item';
        item.innerHTML = `
            <div class="friend-avatar">${avatars[avatarIdx]}</div>
            <div class="friend-info">
                <div class="friend-name">${f.character?.character_name || 'Герой'}</div>
                <div class="friend-level">Lvl ${level} · ${f.character?.rank || 'Warrior'}</div>
            </div>
            <button class="btn-ping" onclick="sendPing('${f.user_id}')" title="Мотивационный пинг">💪</button>
        `;
        list.appendChild(item);
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

document.getElementById('send-friend-request').addEventListener('click', async () => {
    const email = document.getElementById('friend-email').value.trim();
    if (!email) return;
    try {
        const result = await api.request('POST', '/social/friends/request', { addressee_email: email }, true);
        document.getElementById('friend-email').value = '';
        showToast(result.message);
    } catch (e) {
        const err = document.getElementById('friend-error');
        err.textContent = e.message;
        err.style.display = 'block';
        setTimeout(() => err.style.display = 'none', 3000);
    }
});

// ===== ПРОФИЛЬ =====
async function loadProfile() {
    try {
        const profile = await api.request('GET', '/social/profile', null, true);
        renderProfile(profile);
    } catch (e) { console.error(e); }
}

function renderProfile(profile) {
    const char = profile.character;
    const avatars = ['🐣','🧒','👦','🧑','👨','🧔','👴'];
    const avatarIdx = Math.min(Math.floor(((char.level || 1) - 1) / 5), avatars.length - 1);

    document.getElementById('profile-avatar').textContent = avatars[avatarIdx];
    document.getElementById('profile-char-name').textContent = char.character_name || 'Герой';
    document.getElementById('profile-rank').textContent = char.rank || 'Warrior';
    document.getElementById('profile-email').textContent = profile.user?.email || '';
    document.getElementById('profile-level').textContent = char.level || 1;
    document.getElementById('profile-friends').textContent = profile.friends_count || 0;

    if (character) {
        document.getElementById('profile-credits').textContent = character.credits;
        document.getElementById('profile-streak').textContent = character.current_streak;
    }

    const postsList = document.getElementById('profile-posts-list');
    if (!profile.posts || profile.posts.length === 0) {
        postsList.innerHTML = `<div class="tasks-empty">
            <div class="empty-icon">📝</div><p>Нет постов</p>
        </div>`;
        return;
    }
    postsList.innerHTML = '';
    profile.posts.forEach(post => postsList.appendChild(makePostCard(post)));
}