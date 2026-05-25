let shopItems = [];
let inventoryItems = [];
let currentCategory = '';

async function loadShop() {
    try {
        const url = currentCategory
            ? `/shop/items?category=${currentCategory}`
            : '/shop/items';
        shopItems = await api.request('GET', url, null, true);
        inventoryItems = await api.request('GET', '/shop/inventory', null, true);
        renderShop();
        renderInventory();
        updateShopCredits();
    } catch (e) { console.error(e); }
}

function updateShopCredits() {
    if (character) {
        document.getElementById('shop-credits').textContent = character.credits + ' ₡';
    }
}

const RARITY_COLORS = {
    common: '#a0a0c0',
    rare: '#06b6d4',
    epic: '#7c3aed',
    legendary: '#f59e0b',
};

const RARITY_LABELS = {
    common: 'Обычный',
    rare: 'Редкий',
    epic: 'Эпический',
    legendary: 'Легендарный',
};

const CATEGORY_ICONS = {
    theme: '🎨', background: '🖼', frame: '🔲', artifact: '🧪',
};

const THEME_PREVIEWS = {
    'theme-cyber-pink':   ['#150916', '#ec4899', '#ff6bb5'],
    'theme-ocean-dark':   ['#06121e', '#06b6d4', '#22d3ee'],
    'theme-emerald':      ['#08160f', '#10b981', '#34d399'],
    'theme-sunset':       ['#1a0e0a', '#fb923c', '#fbbf24'],
    'theme-midnight-gold':['#0a0a0a', '#fbbf24', '#fde68a'],
};

const BG_PREVIEWS = {
    'bg-stars':  'radial-gradient(2px 2px at 30% 30%, #fff, transparent), radial-gradient(1px 1px at 60% 70%, #fff, transparent), linear-gradient(135deg, #0a0a18, #1a0a2e)',
    'bg-aurora': 'linear-gradient(135deg, rgba(34,197,94,0.5), rgba(168,85,247,0.5), rgba(34,211,238,0.5))',
    'bg-matrix': 'repeating-linear-gradient(0deg, transparent 0, transparent 3px, rgba(34,197,94,0.6) 3px, rgba(34,197,94,0.6) 4px), #000',
    'bg-cosmos': 'radial-gradient(ellipse at 30% 40%, rgba(168,85,247,0.6), transparent), radial-gradient(ellipse at 70% 60%, rgba(236,72,153,0.5), transparent), #050514',
    'bg-sunset': 'linear-gradient(180deg, #1a0e2e, #7a2548, #c14d3c, #f59e0b)',
};

function renderShop() {
    const grid = document.getElementById('shop-grid');
    if (shopItems.length === 0) {
        grid.innerHTML = `<div class="tasks-empty" style="grid-column:1/-1">
            <div class="empty-icon">🛒</div><p>Нет товаров в этой категории</p>
        </div>`;
        return;
    }
    grid.innerHTML = '';
    shopItems.forEach(item => grid.appendChild(makeShopCard(item, false)));
}

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    if (inventoryItems.length === 0) {
        grid.innerHTML = `<div class="tasks-empty" style="grid-column:1/-1">
            <div class="empty-icon">🎒</div><p>Инвентарь пуст</p>
        </div>`;
        return;
    }
    grid.innerHTML = '';
    inventoryItems.forEach(item => grid.appendChild(makeShopCard(item, true)));
}

function previewHtml(item) {
    const cat = item.category;
    const key = item.asset_key;

    if (cat === 'theme' && THEME_PREVIEWS[key]) {
        const [c1, c2, c3] = THEME_PREVIEWS[key];
        return `
            <div class="theme-preview">
                <div class="theme-preview-swatch" style="background:${c1}"></div>
                <div class="theme-preview-swatch" style="background:${c2}"></div>
                <div class="theme-preview-swatch" style="background:${c3}"></div>
            </div>`;
    }

    if (cat === 'background' && BG_PREVIEWS[key]) {
        return `<div class="bg-preview" style="background:${BG_PREVIEWS[key]}"></div>`;
    }

    if (cat === 'frame') {
        return `<div class="shop-card-icon">🧑</div>`;
    }

    return `<div class="shop-card-icon">${CATEGORY_ICONS[cat] || '📦'}</div>`;
}

function makeShopCard(item, isInventory) {
    const card = document.createElement('div');
    const rarityColor = RARITY_COLORS[item.rarity] || '#a0a0c0';
    const rarityLabel = RARITY_LABELS[item.rarity] || item.rarity;
    const canAfford = character && character.credits >= (item.price_credits || 0);
    const isArtifact = item.category === 'artifact';

    const frameClass = (item.category === 'frame') ? `preview-frame ${item.asset_key}` : '';

    card.className = `shop-card rarity-${item.rarity} ${item.is_equipped ? 'equipped' : ''} ${frameClass}`;
    card.style.setProperty('--rarity-color', rarityColor);

    const preview = previewHtml(item);

    if (isInventory) {
        card.innerHTML = `
            ${preview}
            <div class="shop-card-name">${item.name}</div>
            <div class="shop-card-rarity" style="color:${rarityColor}">${rarityLabel}</div>
            ${item.quantity > 1 ? `<div class="shop-card-qty">x${item.quantity}</div>` : ''}
            ${item.is_equipped ? '<div class="shop-card-equipped">✓ Надето</div>' : ''}
            <div class="shop-card-actions">
                ${isArtifact
                    ? `<button class="btn-use" data-act="use" data-id="${item.id}">Использовать</button>`
                    : `<button class="btn-equip ${item.is_equipped ? 'btn-unequip' : ''}"
                        data-act="equip" data-id="${item.id}">
                        ${item.is_equipped ? 'Снять' : 'Надеть'}
                    </button>`
                }
            </div>
        `;
    } else {
        card.innerHTML = `
            ${preview}
            <div class="shop-card-name">${item.name}</div>
            <div class="shop-card-rarity" style="color:${rarityColor}">${rarityLabel}</div>
            <div class="shop-card-desc">${item.description || ''}</div>
            <div class="shop-card-price ${!canAfford ? 'cant-afford' : ''}">
                ${item.price_credits} ₡
            </div>
            <div class="shop-card-actions">
                ${item.owned
                    ? `<div class="shop-card-owned">✓ Куплено</div>`
                    : `<button class="btn-buy ${!canAfford ? 'btn-disabled' : ''}"
                        data-act="buy" data-id="${item.id}"
                        ${!canAfford ? 'disabled' : ''}>
                        ${canAfford ? 'Купить' : 'Мало ₡'}
                    </button>`
                }
            </div>
        `;
    }
    return card;
}

async function buyItem(itemId) {
    try {
        const result = await api.request('POST', `/shop/buy/${itemId}`, null, true);
        showToast(`${result.message} 🛒 Осталось: ${result.credits_left} ₡`);
        await loadCharacter();
        await loadShop();
    } catch (e) { showToast(e.message, true); }
}

async function useItem(invItemId) {
    try {
        const result = await api.request('POST', `/shop/use/${invItemId}`, null, true);
        showToast(result.message);
        await loadCharacter();
        await loadShop();
    } catch (e) { showToast(e.message, true); }
}

async function equipItem(invItemId) {
    try {
        const result = await api.request('POST', `/shop/equip/${invItemId}`, null, true);
        showToast(result.message);
        await loadCharacter();
        await loadShop();
    } catch (e) { showToast(e.message, true); }
}

document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act][data-id]');
    if (!btn) return;
    if (!btn.closest('#shop-grid') && !btn.closest('#inventory-grid')) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (act === 'buy')   buyItem(id);
    if (act === 'use')   useItem(id);
    if (act === 'equip') equipItem(id);
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.cat;
        loadShop();
    });
});