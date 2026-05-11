import { t } from '../../../core/i18n.js';
import { calculatePreviousYearLeaveStats, calculateTeamStats } from './schedule-view-helpers.js';

export function renderStatsScheduleView(uiManager) {
    const dataManager = uiManager.dataManager;
    const container = document.getElementById('stats-container');
    if (!container) {
        return;
    }

    const year = dataManager.getCurrentDate().getFullYear();
    const stats = calculateTeamStats(dataManager, year);
    const previousYearStats = calculatePreviousYearLeaveStats(dataManager, year);
    const totals = stats.reduce((accumulator, stat) => {
        accumulator.vacationAllowance += stat.vacationAllowance;
        accumulator.vacationDays += stat.vacationDays;
        accumulator.vacationBalance += stat.vacationBalance;
        accumulator.previousYearUnusedVacationDays += stat.previousYearUnusedVacationDays;
        accumulator.extraHours += stat.extraHours;
        if (stat.vacationBalance < 0) {
            accumulator.balanceAlerts += 1;
        }
        return accumulator;
    }, { vacationAllowance: 0, vacationDays: 0, vacationBalance: 0, previousYearUnusedVacationDays: 0, extraHours: 0, balanceAlerts: 0 });

    uiManager.currentStats = stats;
    uiManager.currentStatsYear = year;
    uiManager.previousYearLeaveStats = previousYearStats;

    container.innerHTML = `
        <div class="schedule-stats-layout space-y-6">
            <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div class="border-b border-slate-200 bg-slate-50/80 px-5 py-5 lg:flex lg:items-end lg:justify-between lg:px-6">
                    <div>
                        <h3 class="text-lg font-semibold text-slate-950">${t('schedule.stats.title')} (${year})</h3>
                        <p class="mt-1 text-sm text-slate-500">${t('schedule.viewDescriptions.stats')}</p>
                    </div>
                    <button id="export-stats-csv-btn" class="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 lg:mt-0">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m-9 5h12a2 2 0 002-2V7a2 2 0 00-2-2h-3.586a1 1 0 01-.707-.293l-1.414-1.414A1 1 0 0010.586 3H7a2 2 0 00-2 2v11a2 2 0 002 2z"></path>
                        </svg>
                        ${t('schedule.stats.exportCsv')}
                    </button>
                </div>
                <div class="px-5 py-5 lg:px-6">
                    <div class="grid gap-3 md:grid-cols-2 2xl:grid-cols-5">
                        ${renderMetric(t('schedule.workspace.activeColleagues'), String(stats.length), 'text-slate-950')}
                        ${renderMetric(t('schedule.stats.yearStartDays'), String(totals.vacationAllowance), 'text-slate-950')}
                        ${renderMetric(t('schedule.stats.totalVacationDays'), String(totals.vacationDays), 'text-amber-700')}
                        ${renderMetric(t('schedule.stats.totalVacationLeft'), String(totals.vacationBalance), totals.vacationBalance < 0 ? 'text-rose-700' : 'text-emerald-700')}
                        ${renderMetric(t('schedule.stats.totalExtraHours'), totals.extraHours.toFixed(1), 'text-sky-700')}
                    </div>
                </div>
                <div class="overflow-x-auto border-t border-slate-200">
                    <table class="min-w-full text-sm text-left">
                        <thead class="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                                <th class="px-5 py-4 font-semibold">${t('common.name')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.stats.yearStartDays')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.stats.vacationUsed')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.stats.vacationLeft')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.stats.previousYearUnused')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.summary.extraHours')}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            ${stats.map((stat) => `
                                <tr class="transition-colors hover:bg-slate-50/80">
                                    <td class="px-5 py-4 font-medium text-slate-900">${stat.name}</td>
                                    <td class="px-5 py-4 text-right font-semibold text-slate-900">${stat.vacationAllowance}</td>
                                    <td class="px-5 py-4 text-right text-slate-600">${stat.vacationDays}</td>
                                    <td class="px-5 py-4 text-right font-semibold ${stat.vacationBalance < 0 ? 'text-rose-700' : 'text-emerald-700'}">${stat.vacationBalance}</td>
                                    <td class="px-5 py-4 text-right font-semibold ${stat.previousYearUnusedVacationDays > 0 ? 'text-amber-700' : 'text-slate-500'}">${stat.previousYearUnusedVacationDays}</td>
                                    <td class="px-5 py-4 text-right font-semibold ${stat.extraHours > 0 ? 'text-sky-700' : 'text-slate-500'}">${stat.extraHours.toFixed(1)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </section>
            <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div class="border-b border-slate-200 bg-slate-50/80 px-5 py-5 lg:px-6">
                    <h3 class="text-lg font-semibold text-slate-950">${t('schedule.stats.previousYearsTitle')}</h3>
                    <p class="mt-1 text-sm text-slate-500">${t('schedule.stats.previousYearsDescription')}</p>
                </div>
                <div class="grid gap-px bg-slate-200 lg:grid-cols-3">
                    ${previousYearStats.map((row) => renderPreviousYearCard(row)).join('')}
                </div>
            </section>
        </div>
    `;
}

function renderMetric(label, value, accentClass) {
    return `
        <div class="rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${label}</div>
            <div class="mt-2 text-2xl font-semibold ${accentClass}">${value}</div>
        </div>
    `;
}

function renderPreviousYearCard(row) {
    return `
        <div class="bg-white px-5 py-5 lg:px-6">
            <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${row.year}</div>
            <div class="mt-4 grid grid-cols-3 gap-3">
                ${renderCompactStat(t('schedule.stats.yearStartDaysShort'), row.vacationAllowance, 'text-slate-950')}
                ${renderCompactStat(t('schedule.stats.vacationUsedShort'), row.vacationDays, 'text-amber-700')}
                ${renderCompactStat(t('schedule.stats.unusedDaysShort'), row.unusedVacationDays, row.unusedVacationDays > 0 ? 'text-emerald-700' : 'text-slate-500')}
            </div>
            <div class="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <span class="font-semibold text-slate-950">${row.colleaguesWithUnusedDays}</span>
                ${t('schedule.stats.colleaguesWithUnused')}
            </div>
        </div>
    `;
}

function renderCompactStat(label, value, accentClass) {
    return `
        <div>
            <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">${label}</div>
            <div class="mt-1 text-xl font-semibold ${accentClass}">${value}</div>
        </div>
    `;
}
