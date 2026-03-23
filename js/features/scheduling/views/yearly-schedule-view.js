import { t } from '../../../core/i18n.js';
import { calculateYearlySummaryRows, getScheduleLocale } from './schedule-view-helpers.js';

export function renderYearlySummaryView(uiManager) {
    const dataManager = uiManager.dataManager;
    const year = dataManager.getCurrentDate().getFullYear();
    const container = document.getElementById('yearly-summary-container');
    if (!container) {
        return;
    }

    const locale = getScheduleLocale();
    const { rows, totals } = calculateYearlySummaryRows(dataManager, year);
    const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'long' });

    container.innerHTML = `
        <div class="space-y-6">
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                ${renderMetric(t('schedule.summary.worked'), totals.worked, 'text-emerald-700')}
                ${renderMetric(t('schedule.summary.vacation'), totals.vacation, 'text-amber-700')}
                ${renderMetric(t('schedule.summary.absent'), totals.absent, 'text-rose-700')}
                ${renderMetric(t('schedule.summary.extraHours'), totals.extraHours.toFixed(1), 'text-sky-700')}
            </div>
            <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div class="border-b border-slate-200 bg-slate-50/80 px-5 py-5 lg:px-6">
                    <h3 class="text-lg font-semibold text-slate-950">${t('schedule.summary.yearly')} (${year})</h3>
                    <p class="mt-1 text-sm text-slate-500">${t('schedule.viewDescriptions.yearly')}</p>
                </div>
                <div class="overflow-x-auto">
                    <table class="min-w-full text-sm text-left">
                        <thead class="bg-slate-50 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                            <tr>
                                <th class="px-5 py-4 font-semibold">${t('schedule.summary.month')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.summary.worked')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.summary.vacation')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.summary.off')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.summary.absent')}</th>
                                <th class="px-5 py-4 text-right font-semibold">${t('schedule.summary.extraHours')}</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-200">
                            ${rows.map((row) => `
                                <tr class="transition-colors hover:bg-slate-50/80">
                                    <td class="px-5 py-4 font-medium text-slate-900">${monthFormatter.format(new Date(year, row.monthIndex, 1))}</td>
                                    <td class="px-5 py-4 text-right font-semibold text-emerald-700">${row.worked}</td>
                                    <td class="px-5 py-4 text-right font-semibold text-amber-700">${row.vacation}</td>
                                    <td class="px-5 py-4 text-right font-semibold text-slate-600">${row.off}</td>
                                    <td class="px-5 py-4 text-right font-semibold text-rose-700">${row.absent}</td>
                                    <td class="px-5 py-4 text-right font-semibold text-sky-700">${row.extraHours.toFixed(1)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot class="border-t border-slate-200 bg-slate-950 text-white">
                            <tr>
                                <th class="px-5 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.18em]">${t('schedule.summary.total')}</th>
                                <th class="px-5 py-4 text-right text-sm font-semibold">${totals.worked}</th>
                                <th class="px-5 py-4 text-right text-sm font-semibold">${totals.vacation}</th>
                                <th class="px-5 py-4 text-right text-sm font-semibold">${totals.off}</th>
                                <th class="px-5 py-4 text-right text-sm font-semibold">${totals.absent}</th>
                                <th class="px-5 py-4 text-right text-sm font-semibold">${totals.extraHours.toFixed(1)}</th>
                            </tr>
                        </tfoot>
                    </table>
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
