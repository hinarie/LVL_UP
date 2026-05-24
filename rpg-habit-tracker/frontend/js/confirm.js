// ════════════════════════════════════════════════════════════════
// CONFIRM MODAL — универсальная модалка подтверждения действий
// Заменяет нативный confirm() красивым диалогом в стиле приложения.
//
// Использование:
//   const ok = await confirmModal({
//       title: 'Удалить?',
//       message: 'Это нельзя отменить.',
//       confirmText: 'Удалить',
//       cancelText: 'Отмена',
//       danger: true,            // красная кнопка
//   });
//   if (ok) { ... }
// ════════════════════════════════════════════════════════════════

(function () {
    let activeResolve = null;
    let overlayEl = null;

    function ensureOverlay() {
        if (overlayEl) return overlayEl;
        overlayEl = document.createElement('div');
        overlayEl.className = 'confirm-overlay';
        overlayEl.innerHTML = `
            <div class="confirm-modal" role="dialog" aria-modal="true">
                <div class="confirm-icon" data-confirm-icon>⚠️</div>
                <h3 class="confirm-title" data-confirm-title></h3>
                <p class="confirm-message" data-confirm-message></p>
                <div class="confirm-actions">
                    <button class="confirm-btn confirm-cancel" data-confirm-cancel>Отмена</button>
                    <button class="confirm-btn confirm-ok" data-confirm-ok>OK</button>
                </div>
            </div>`;
        document.body.appendChild(overlayEl);

        // Клик по затемнению = отмена
        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl) close(false);
        });
        // Кнопки
        overlayEl.querySelector('[data-confirm-cancel]').addEventListener('click', () => close(false));
        overlayEl.querySelector('[data-confirm-ok]').addEventListener('click', () => close(true));
        // Esc / Enter
        document.addEventListener('keydown', (e) => {
            if (!overlayEl.classList.contains('open')) return;
            if (e.key === 'Escape') { e.preventDefault(); close(false); }
            if (e.key === 'Enter')  { e.preventDefault(); close(true); }
        });

        return overlayEl;
    }

    function close(result) {
        if (!overlayEl) return;
        overlayEl.classList.remove('open');
        if (activeResolve) {
            activeResolve(result);
            activeResolve = null;
        }
    }

    window.confirmModal = function ({
        title = 'Подтвердить действие',
        message = '',
        confirmText = 'OK',
        cancelText = 'Отмена',
        danger = false,
        icon = null,
    } = {}) {
        ensureOverlay();
        overlayEl.querySelector('[data-confirm-title]').textContent = title;
        overlayEl.querySelector('[data-confirm-message]').textContent = message;
        overlayEl.querySelector('[data-confirm-cancel]').textContent = cancelText;

        const ok = overlayEl.querySelector('[data-confirm-ok]');
        ok.textContent = confirmText;
        ok.classList.toggle('confirm-danger', !!danger);

        const iconEl = overlayEl.querySelector('[data-confirm-icon]');
        iconEl.textContent = icon || (danger ? '⚠️' : '❔');

        overlayEl.classList.add('open');
        // Если ранее уже был открыт диалог — отменим предыдущий
        if (activeResolve) activeResolve(false);

        // Фокус на кнопке отмены — безопаснее по умолчанию для деструктивных действий
        setTimeout(() => {
            (danger ? overlayEl.querySelector('[data-confirm-cancel]') : ok).focus();
        }, 50);

        return new Promise((resolve) => { activeResolve = resolve; });
    };
})();