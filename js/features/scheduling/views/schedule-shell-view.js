import { t } from '../../../core/i18n.js';
import { getScheduleLocale, getUpcomingVacationEntries } from './schedule-view-helpers.js';

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
    'vacation-board': {
        categoryKey: 'schedule.navigation.planning',
        titleKey: 'schedule.views.vacationBoard',
        descriptionKey: 'schedule.viewDescriptions.vacationBoard'
    },
    vacation: {
        categoryKey: 'schedule.navigation.planning',
        titleKey: 'schedule.views.vacationPlanner',
        descriptionKey: 'schedule.viewDescriptions.vacation'
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

export function renderScheduleWorkspaceSummary(dataManager) {
    const container = document.getElementById('schedule-shell-summary');
    if (!container) {
        return;
    }

    const currentView = dataManager.getCurrentView();
    const currentDate = dataManager.getCurrentDate();
    const locale = getScheduleLocale();
    const activeEmployees = dataManager.getActiveEmployees();
    const upcomingVacations = getUpcomingVacationEntries(dataManager);
    const isVacationBoardOnlyUser = dataManager.isVacationBoardOnlyUser?.() || false;
    const currentUserEmployee = dataManager.getCurrentUserEmployee?.() || null;
    const colleaguesAwayToday = activeEmployees.filter((employee) => {
        return dataManager.isDateInVacation(new Date(), employee.vacations);
    }).length;
    const periodLabel = formatViewPeriod(currentView, currentDate, locale);
    const coverageTarget = dataManager.minStaffThreshold > 0
        ? String(dataManager.minStaffThreshold)
        : t('schedule.workspace.notSet');

    const summaryItems = [
        {
            label: t('schedule.workspace.period'),
            value: periodLabel
        },
        {
            label: t('schedule.workspace.activeColleagues'),
            value: String(activeEmployees.length)
        },
        {
            label: t('schedule.workspace.upcomingVacations'),
            value: String(upcomingVacations.length)
        },
        {
            label: t('schedule.workspace.awayToday'),
            value: String(colleaguesAwayToday)
        },
        {
            label: isVacationBoardOnlyUser
                ? t('schedule.board.summaryYourDepartment')
                : t('schedule.workspace.coverageTarget'),
            value: isVacationBoardOnlyUser
                ? (currentUserEmployee?.department || t('schedule.board.unassignedDepartment'))
                : coverageTarget
        }
    ];

    container.innerHTML = summaryItems.map((item) => `
        <dl class="schedule-summary-pill">
            <dt>${item.label}</dt>
            <dd>${item.value}</dd>
        </dl>
    `).join('');
}

export function renderScheduleAccessBanner(dataManager) {
    const container = document.getElementById('schedule-access-banner');
    if (!container) {
        return;
    }

    const isVacationBoardOnlyUser = dataManager.isVacationBoardOnlyUser?.() || false;
    if (!isVacationBoardOnlyUser) {
        container.innerHTML = '';
        container.classList.add('hidden');
        return;
    }

    const currentUserEmployee = dataManager.getCurrentUserEmployee?.();
    const colleagueName = currentUserEmployee?.name || t('schedule.board.youBadge');

    container.classList.remove('hidden');
    container.innerHTML = `
        <section class="overflow-hidden rounded-[30px] border border-sky-200 bg-[linear-gradient(135deg,rgba(240,249,255,1)_0%,rgba(224,242,254,1)_46%,rgba(239,246,255,1)_100%)] px-5 py-5 shadow-sm lg:px-6">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div class="max-w-3xl">
                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">${t('schedule.board.accessBannerKicker')}</div>
                    <h3 class="mt-2 text-xl font-semibold tracking-tight text-slate-950">${t('schedule.board.accessBannerTitle')}</h3>
                    <p class="mt-2 text-sm leading-6 text-slate-600">${t('schedule.board.accessBannerBody')}</p>
                </div>
                <div class="rounded-[24px] border border-white/70 bg-white/80 px-4 py-4 shadow-sm">
                    <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${t('schedule.board.colleagueColumn')}</div>
                    <div class="mt-2 text-lg font-semibold text-slate-950">${colleagueName}</div>
                </div>
            </div>
        </section>
    `;
}

function formatViewPeriod(view, currentDate, locale) {
    if (view === 'monthly') {
        return new Intl.DateTimeFormat(locale, {
            month: 'long',
            year: 'numeric'
        }).format(currentDate);
    }

    return new Intl.DateTimeFormat(locale, {
        year: 'numeric'
    }).format(currentDate);
}
