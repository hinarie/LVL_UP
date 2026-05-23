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
    theme: '🎨', background: '🖼', frame: '🔲',
    clothing: '👕', hairstyle: '💇', face: '😊', artifact: '🧪',
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

function makeShopCard(item, isInventory) {
    const card = document.createElement('div');
    const rarityColor = RARITY_COLORS[item.rarity] || '#a0a0c0';
    const rarityLabel = RARITY_LABELS[item.rarity] || item.rarity;
    const catIcon = CATEGORY_ICONS[item.category] || '📦';
    const canAfford = character && character.credits >= (item.price_credits || 0);
    const isArtifact = item.category === 'artifact';

    card.className = `shop-card rarity-${item.rarity} ${item.is_equipped ? 'equipped' : ''}`;
    card.style.setProperty('--rarity-color', rarityColor);

    if (isInventory) {
        card.innerHTML = `
            <div class="shop-card-icon">${catIcon}</div>
            <div class="shop-card-name">${item.name}</div>
            <div class="shop-card-rarity" style="color:${rarityColor}">${rarityLabel}</div>
            ${item.quantity > 1 ? `<div class="shop-card-qty">x${item.quantity}</div>` : ''}
            ${item.is_equipped ? '<div class="shop-card-equipped">✓ Надето</div>' : ''}
            <div class="shop-card-actions">
                ${isArtifact
                    ? `<button class="btn-use" onclick="useItem('${item.id}')">Использовать</button>`
                    : `<button class="btn-equip ${item.is_equipped ? 'btn-unequip' : ''}"
                        onclick="equipItem('${item.id}')">
                        ${item.is_equipped ? 'Снять' : 'Надеть'}
                    </button>`
                }
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="shop-card-icon">${catIcon}</div>
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
                        onclick="${canAfford ? `buyItem('${item.id}')` : ''}"
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
        await loadShop();
    } catch (e) { showToast(e.message, true); }
}

async function equipItem(invItemId) {
    try {
        const result = await api.request('POST', `/shop/equip/${invItemId}`, null, true);
        showToast(result.message);
        await loadShop();
    } catch (e) { showToast(e.message, true); }
}

// Фильтры категорий
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentCategory = btn.dataset.cat;
        loadShop();
    });
});