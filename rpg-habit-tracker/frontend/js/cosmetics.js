const THEME_KEYS = [
    'theme-cyber-pink', 'theme-ocean-dark', 'theme-emerald',
    'theme-sunset', 'theme-midnight-gold',
];
const BG_KEYS = [
    'bg-stars', 'bg-aurora', 'bg-matrix', 'bg-cosmos', 'bg-sunset',
];
const FRAME_KEYS = [
    'frame-silver', 'frame-gold', 'frame-fire', 'frame-ice', 'frame-rainbow',
];

function applyTheme(themeKey) {
    const body = document.body;
    THEME_KEYS.forEach(k => body.classList.remove(k));
    if (themeKey && themeKey !== 'default' && THEME_KEYS.includes(themeKey)) {
        body.classList.add(themeKey);
    }
}

function applyBackground(bgKey) {
    const layer = document.getElementById('profile-hero-bg');
    if (!layer) return;
    BG_KEYS.forEach(k => layer.classList.remove(k));
    if (bgKey && BG_KEYS.includes(bgKey)) {
        layer.classList.add(bgKey);
    }
}

function applyFrame(frameKey) {
    const wraps = document.querySelectorAll('.profile-avatar-wrap');
    wraps.forEach(wrap => {
        FRAME_KEYS.forEach(k => wrap.classList.remove(k));
        if (frameKey && FRAME_KEYS.includes(frameKey)) {
            wrap.classList.add(frameKey);
        }
    });
}

function applyCosmetics(character) {
    if (!character) return;
    applyTheme(character.active_theme);
    applyBackground(character.active_background);
    applyFrame(character.active_frame);
}

window.applyCosmetics = applyCosmetics;
window.applyTheme = applyTheme;
window.applyBackground = applyBackground;
window.applyFrame = applyFrame;