import { t } from '../../../core/i18n.js';

const VIEW_META = {
    monthly: {
        categoryKey: 'schedule.navigation.planning',
        titleKey: 'schedule.views.monthly',
        descriptionKey: 'schedule.viewDescriptions.monthly'
    },
    yearly: {
        categoryKey: 'schedule.navigation.planning',
        titleKey: 'schedule.views.yearly',
        descriptionKey: 'schedule.viewDescriptions.yearly'
    },
    stats: {
        categoryKey: 'schedule.navigation.reference',
        titleKey: 'schedule.views.stats',
        descriptionKey: 'schedule.viewDescriptions.stats'
    },
    'madeira-holidays': {
        categoryKey: 'schedule.navigation.reference',
        titleKey: 'schedule.views.madeiraHolidays',
        descriptionKey: 'schedule.viewDescriptions.madeiraHolidays'
    }
};

export function getScheduleViewMeta(view) {
    return VIEW_META[view] || VIEW_META.monthly;
}

export function renderScheduleAccessBanner(dataManager) {
    const container = document.getElementById('schedule-access-banner');
    if (!container) return;
    const readOnly = dataManager.isScheduleOnlyUser?.() || false;
    container.classList.toggle('hidden', !readOnly);
    container.replaceChildren();
    if (readOnly) {
        const note = document.createElement('p');
        note.className = 'schedule-access-note';
        note.textContent = t('schedule.selfService.accessBannerTitle');
        container.appendChild(note);
    }
}
