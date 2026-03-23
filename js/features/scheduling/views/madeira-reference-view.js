import { t } from '../../../core/i18n.js';

const PUBLIC_HOLIDAYS = [
    { name: "New Year's Day", date: "January 1" },
    { name: "Carnival Tuesday", date: "Variable (February/March)" },
    { name: "Good Friday", date: "Variable (March/April)" },
    { name: "Easter Sunday", date: "Variable (March/April)" },
    { name: "Madeira's Autonomy Day", date: "April 2", badge: "Regional" },
    { name: "Freedom Day", date: "April 25" },
    { name: "Labour Day", date: "May 1" },
    { name: "Corpus Christi", date: "Variable (May/June)" },
    { name: "Portugal Day", date: "June 10" },
    { name: "Madeira Day", date: "July 1", badge: "Regional" },
    { name: "Assumption of Mary", date: "August 15" },
    { name: "Funchal City Day", date: "August 21", badge: "Regional" },
    { name: "Republic Day", date: "October 5" },
    { name: "All Saints' Day", date: "November 1" },
    { name: "Restoration of Independence", date: "December 1" },
    { name: "Immaculate Conception", date: "December 8" },
    { name: "Christmas Day", date: "December 25" },
    { name: "Boxing Day", date: "December 26" }
];

const CULTURAL_EVENTS = [
    { name: "Flower Festival", date: "April/May", description: "Celebrates spring with flower parades and the famous Wall of Hope." },
    { name: "Atlantic Festival", date: "June (Saturdays)", description: "International fireworks competition at Funchal harbour." },
    { name: "Medieval Market (Machico)", date: "June 7-9", description: "Historic reenactment in Machico with period costumes and crafts." },
    { name: "Madeira Wine Rally", date: "August 1-3", description: "Motorsport event celebrating Madeira's automotive culture." },
    { name: "Wine Festival", date: "August 29 - September 15", description: "Celebrates Madeira's wine heritage with harvest activities and tastings." },
    { name: "Apple Festival (Santo da Serra)", date: "September", description: "Rural celebration of apple harvest and cider production." },
    { name: "Columbus Festival (Porto Santo)", date: "September 19-22", description: "Commemorates Christopher Columbus's time in the archipelago." },
    { name: "Senhor dos Milagres (Machico)", date: "October 9", description: "Important religious pilgrimage with candlelit processions." },
    { name: "Madeira Nature Festival", date: "October 1-6", description: "Celebrates the island's natural beauty and biodiversity." },
    { name: "Christmas Market & Illuminations", date: "December 1 - January 7", description: "Festive decorations and markets throughout Funchal." },
    { name: "New Year's Eve Fireworks", date: "December 31", description: "World-famous fireworks display recognized by Guinness World Records." }
];

export function renderMadeiraReferenceView() {
    const container = document.getElementById('madeira-holidays-container');
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="space-y-6">
            <section class="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                <div class="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(255,251,235,1)_0%,rgba(255,255,255,1)_55%,rgba(239,246,255,1)_100%)] px-5 py-5 lg:px-6">
                    <div class="max-w-3xl">
                        <div class="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">${t('schedule.navigation.reference')}</div>
                        <h2 class="mt-2 text-2xl font-semibold text-slate-950">${t('schedule.madeira.title')}</h2>
                        <p class="mt-2 text-sm text-slate-600">${t('schedule.madeira.subtitle')}</p>
                    </div>
                </div>
                <div class="px-5 py-5 lg:px-6">
                    <div class="inline-flex rounded-full bg-slate-100 p-1">
                        <button class="madeira-tab-btn rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-950 shadow-sm transition-colors" data-tab="holidays" data-active="true">
                            ${t('schedule.madeira.publicHolidays')}
                        </button>
                        <button class="madeira-tab-btn rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900" data-tab="events" data-active="false">
                            ${t('schedule.madeira.culturalEvents')}
                        </button>
                    </div>
                </div>
                <div id="madeira-holidays-tab" class="madeira-tab-content px-5 pb-6 lg:px-6">
                    <div class="mb-5 max-w-3xl">
                        <h3 class="text-lg font-semibold text-slate-950">${t('schedule.madeira.official')}</h3>
                        <p class="mt-2 text-sm text-slate-500">${t('schedule.madeira.officialDesc')}</p>
                    </div>
                    <div class="grid gap-3">
                        ${PUBLIC_HOLIDAYS.map((holiday) => `
                            <div class="flex flex-col gap-3 rounded-[22px] border border-amber-200 bg-amber-50/70 px-4 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
                                <div class="flex items-center gap-3">
                                    <span class="inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
                                    <div>
                                        <div class="font-medium text-slate-900">${holiday.name}</div>
                                        ${holiday.badge ? `<div class="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-sky-700">${holiday.badge}</div>` : ''}
                                    </div>
                                </div>
                                <div class="text-sm font-semibold text-amber-800">${holiday.date}</div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-6 rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                        <strong>${t('schedule.madeira.autoManagement')}</strong> ${t('schedule.madeira.autoManagementDesc')}
                    </div>
                </div>
                <div id="madeira-events-tab" class="madeira-tab-content hidden px-5 pb-6 lg:px-6">
                    <div class="mb-5 max-w-3xl">
                        <h3 class="text-lg font-semibold text-slate-950">${t('schedule.madeira.eventsTitle')}</h3>
                        <p class="mt-2 text-sm text-slate-500">${t('schedule.madeira.eventsSubtitle')}</p>
                    </div>
                    <div class="grid gap-4 md:grid-cols-2">
                        ${CULTURAL_EVENTS.map((event) => `
                            <article class="rounded-[24px] border border-sky-200 bg-sky-50/60 px-4 py-4 shadow-sm">
                                <div class="flex items-start justify-between gap-4">
                                    <h4 class="text-base font-semibold text-slate-950">${event.name}</h4>
                                    <span class="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-sky-800 shadow-sm">${event.date}</span>
                                </div>
                                <p class="mt-3 text-sm leading-6 text-slate-600">${event.description}</p>
                            </article>
                        `).join('')}
                    </div>
                    <div class="mt-6 rounded-[22px] border border-sky-200 bg-sky-50 px-4 py-4 text-sm text-sky-900">
                        <strong>${t('schedule.madeira.eventsNoteLabel')}</strong> ${t('schedule.madeira.eventsNoteText')}
                    </div>
                </div>
            </section>
        </div>
    `;

    container.onclick = (event) => {
        const targetButton = event.target.closest('.madeira-tab-btn');
        if (!targetButton) {
            return;
        }

        const targetTab = targetButton.dataset.tab;
        container.querySelectorAll('.madeira-tab-btn').forEach((button) => {
            const isActive = button.dataset.tab === targetTab;
            button.dataset.active = isActive ? 'true' : 'false';
            button.classList.toggle('bg-white', isActive);
            button.classList.toggle('text-slate-950', isActive);
            button.classList.toggle('shadow-sm', isActive);
            button.classList.toggle('text-slate-500', !isActive);
        });

        container.querySelectorAll('.madeira-tab-content').forEach((content) => {
            content.classList.toggle('hidden', content.id !== `madeira-${targetTab}-tab`);
        });
    };
}
