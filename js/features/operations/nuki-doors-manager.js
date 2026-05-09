export class NukiDoorsManager {
    constructor({ listDoors, doorAction, listDevices, saveDoor, deleteDoor } = {}) {
        this.listDoors = listDoors;
        this.doorAction = doorAction;
        this.listDevices = listDevices;
        this.saveDoor = saveDoor;
        this.deleteDoor = deleteDoor;
        this.doors = [];
        this.canManage = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) {
            this.loadDoors();
            return;
        }

        this.initialized = true;
        this.bindEvents();
        this.loadDoors();
    }

    bindEvents() {
        document.getElementById('nuki-refresh-btn')?.addEventListener('click', () => this.loadDoors());
        document.getElementById('nuki-list-devices-btn')?.addEventListener('click', () => this.loadDevices());
        document.getElementById('nuki-door-form')?.addEventListener('submit', (event) => {
            event.preventDefault();
            this.saveDoorFromForm();
        });
    }

    async loadDoors() {
        const root = document.getElementById('nuki-doors-root');
        if (!root) return;

        if (!this.listDoors || !this.doorAction) {
            this.renderMessage('Nuki functions are not configured in this deployment.', 'error');
            return;
        }

        this.setStatus('Loading doors...');

        try {
            const result = await this.listDoors();
            this.doors = Array.isArray(result?.data?.doors) ? result.data.doors : [];
            this.canManage = Boolean(result?.data?.canManage);
            this.renderDoors();
            this.setStatus(this.doors.length ? '' : 'No Nuki doors are configured yet.');
        } catch (error) {
            this.renderMessage(this.getErrorMessage(error), 'error');
        }
    }

    renderDoors() {
        const root = document.getElementById('nuki-doors-root');
        const deviceButton = document.getElementById('nuki-list-devices-btn');
        const adminPanel = document.getElementById('nuki-admin-panel');
        if (!root) return;

        if (deviceButton) {
            deviceButton.classList.toggle('hidden', !this.canManage);
        }
        if (adminPanel) {
            adminPanel.classList.toggle('hidden', !this.canManage);
        }

        if (!this.doors.length) {
            root.innerHTML = `
                <div class="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
                    No doors configured. Privileged users can add a door below after using Find devices.
                </div>
            `;
            return;
        }

        root.innerHTML = this.doors.map((door) => `
            <article class="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h3 class="text-xl font-semibold text-slate-950">${escapeHtml(door.name)}</h3>
                        <p class="mt-1 text-sm text-slate-500">Device ending ${escapeHtml(door.smartlockIdLast4 || '----')} · default ${escapeHtml(door.defaultAction || 'unlatch')}</p>
                    </div>
                    <div class="flex flex-col gap-2 sm:flex-row">
                        <button type="button" class="nuki-action-btn rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-700" data-door-id="${escapeHtml(door.id)}" data-action="${escapeHtml(door.defaultAction || 'unlatch')}">Open</button>
                        <button type="button" class="nuki-action-btn rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-200" data-door-id="${escapeHtml(door.id)}" data-action="unlock">Unlock</button>
                        <button type="button" class="nuki-action-btn rounded-lg bg-slate-100 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-200" data-door-id="${escapeHtml(door.id)}" data-action="lock">Lock</button>
                        ${this.canManage ? `<button type="button" class="nuki-delete-btn rounded-lg bg-white px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50" data-door-id="${escapeHtml(door.id)}">Remove</button>` : ''}
                    </div>
                </div>
            </article>
        `).join('');

        root.querySelectorAll('.nuki-action-btn').forEach((button) => {
            button.addEventListener('click', () => this.runDoorAction(button.dataset.doorId, button.dataset.action));
        });
        root.querySelectorAll('.nuki-delete-btn').forEach((button) => {
            button.addEventListener('click', () => this.deleteConfiguredDoor(button.dataset.doorId));
        });
    }

    async runDoorAction(doorId, action) {
        const door = this.doors.find((item) => item.id === doorId);
        if (!door) return;

        const label = action === 'lock' ? 'lock' : 'open';
        const confirmed = window.confirm(`Confirm someone is physically at the door.\n\nDoor: ${door.name}\nAction: ${label.toUpperCase()}`);
        if (!confirmed) return;

        this.setBusy(true);
        this.setStatus(`Sending ${label} command to ${door.name}...`);

        try {
            const result = await this.doorAction({ doorId, action });
            this.setStatus(`${door.name}: ${result?.data?.action || action} command sent.`, 'success');
        } catch (error) {
            this.setStatus(this.getErrorMessage(error), 'error');
        } finally {
            this.setBusy(false);
        }
    }

    async loadDevices() {
        const output = document.getElementById('nuki-devices-output');
        if (!output || !this.listDevices) return;

        this.setBusy(true);
        this.setStatus('Loading devices from Nuki...');
        output.classList.add('hidden');

        try {
            const result = await this.listDevices();
            output.textContent = JSON.stringify(result?.data?.devices || [], null, 2);
            output.classList.remove('hidden');
            this.setStatus('Devices loaded. Use the smartlockId values in Firebase Functions config.', 'success');
        } catch (error) {
            this.setStatus(this.getErrorMessage(error), 'error');
        } finally {
            this.setBusy(false);
        }
    }

    async saveDoorFromForm() {
        if (!this.saveDoor) return;

        const name = document.getElementById('nuki-door-name')?.value || '';
        const smartlockId = document.getElementById('nuki-smartlock-id')?.value || '';
        const defaultAction = document.getElementById('nuki-default-action')?.value || 'unlatch';

        this.setBusy(true);
        this.setStatus('Saving Nuki door...');

        try {
            await this.saveDoor({ name, smartlockId, defaultAction });
            document.getElementById('nuki-door-form')?.reset();
            const defaultActionInput = document.getElementById('nuki-default-action');
            if (defaultActionInput) {
                defaultActionInput.value = 'unlatch';
            }
            await this.loadDoors();
            this.setStatus('Door saved.', 'success');
        } catch (error) {
            this.setStatus(this.getErrorMessage(error), 'error');
        } finally {
            this.setBusy(false);
        }
    }

    async deleteConfiguredDoor(doorId) {
        if (!this.deleteDoor || !doorId) return;
        const door = this.doors.find((item) => item.id === doorId);
        if (!window.confirm(`Remove ${door?.name || doorId} from the website?`)) return;

        this.setBusy(true);
        this.setStatus('Removing door...');

        try {
            await this.deleteDoor({ id: doorId });
            await this.loadDoors();
            this.setStatus('Door removed.', 'success');
        } catch (error) {
            this.setStatus(this.getErrorMessage(error), 'error');
        } finally {
            this.setBusy(false);
        }
    }

    renderMessage(message, type = '') {
        const root = document.getElementById('nuki-doors-root');
        if (!root) return;
        root.innerHTML = `<div class="rounded-lg border ${type === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600'} p-6 text-sm">${escapeHtml(message)}</div>`;
        this.setStatus('');
    }

    setStatus(message, type = '') {
        const status = document.getElementById('nuki-status');
        if (!status) return;
        status.textContent = message || '';
        status.className = `min-h-[1.5rem] text-sm ${type === 'error' ? 'text-red-600' : type === 'success' ? 'text-green-700' : 'text-slate-600'}`;
    }

    setBusy(isBusy) {
        document.querySelectorAll('#nuki-doors-page button').forEach((button) => {
            button.disabled = isBusy;
            button.classList.toggle('opacity-60', isBusy);
            button.classList.toggle('cursor-not-allowed', isBusy);
        });
    }

    getErrorMessage(error) {
        return error?.message || error?.details || 'Nuki request failed.';
    }
}

function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
}
