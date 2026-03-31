const COMPLETED_RESERVATIONS_URL = "https://www.airbnb.pt/hosting/reservations/completed";
const REPO_ROOT = "c:\\Users\\Lucas\\Documents\\GitHub\\horario";

const MODE_CONFIG = {
    download: {
        flags: [],
        description: "Opens the Airbnb profile browser if needed, waits for you to prepare the list, then exports the invoices to PDF."
    },
    dryRun: {
        flags: ["--dry-run"],
        description: "Lists the reservation codes and invoice URLs it finds, without writing any PDF files."
    },
    reuseSession: {
        flags: ["--skip-login-prompt"],
        description: "Reuses the saved Airbnb browser session and skips the manual pause before export."
    }
};

export class AirbnbReservationInvoicesManager {
    constructor(documentRef = document, windowRef = window) {
        this.documentRef = documentRef;
        this.windowRef = windowRef;
        this.feedbackTimeoutId = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.bindButtons();
        this.bindInputs();
        this.renderCommand();
    }

    bindButtons() {
        this.bindClick('open-airbnb-completed-reservations-btn', () => {
            this.windowRef.open(COMPLETED_RESERVATIONS_URL, '_blank', 'noopener');
        });

        this.bindClick('copy-airbnb-reservation-invoices-command-btn', async () => {
            const didCopy = await this.copyToClipboard(this.buildCommand());
            this.showFeedback(
                didCopy ? 'Command copied.' : 'Copy failed. Select the command manually and try again.',
                didCopy ? 'success' : 'error'
            );
        });
    }

    bindInputs() {
        const modeInputs = this.documentRef.querySelectorAll('input[name="airbnb-invoices-mode"]');
        modeInputs.forEach((input) => {
            if (input.dataset.bound === 'true') {
                return;
            }

            input.dataset.bound = 'true';
            input.addEventListener('change', () => this.renderCommand());
        });

        [
            'airbnb-invoices-pages-input',
            'airbnb-invoices-concurrency-input',
            'airbnb-invoices-overwrite-input'
        ].forEach((elementId) => {
            const element = this.documentRef.getElementById(elementId);
            if (!element || element.dataset.bound === 'true') {
                return;
            }

            element.dataset.bound = 'true';
            element.addEventListener('input', () => this.renderCommand());
            element.addEventListener('change', () => this.renderCommand());
        });
    }

    bindClick(elementId, handler) {
        const element = this.documentRef.getElementById(elementId);
        if (!element || element.dataset.bound === 'true') {
            return;
        }

        element.dataset.bound = 'true';
        element.addEventListener('click', handler);
    }

    getSelectedMode() {
        const checked = this.documentRef.querySelector('input[name="airbnb-invoices-mode"]:checked');
        return checked?.value || 'download';
    }

    getPositiveInteger(elementId, fallbackValue) {
        const element = this.documentRef.getElementById(elementId);
        const value = Number.parseInt(element?.value || '', 10);
        return Number.isInteger(value) && value > 0 ? value : fallbackValue;
    }

    buildCommand() {
        const mode = this.getSelectedMode();
        const modeConfig = MODE_CONFIG[mode] || MODE_CONFIG.download;
        const pages = this.getPositiveInteger('airbnb-invoices-pages-input', 1);
        const concurrency = this.getPositiveInteger('airbnb-invoices-concurrency-input', 10);
        const overwrite = this.documentRef.getElementById('airbnb-invoices-overwrite-input')?.checked;

        const parts = [
            'npm run airbnb:download-reservation-invoices --',
            ...modeConfig.flags,
            `--pages ${pages}`,
            `--concurrency ${concurrency}`
        ];

        if (overwrite) {
            parts.push('--overwrite');
        }

        return `cd /d "${REPO_ROOT}" && ${parts.join(' ')}`;
    }

    renderCommand() {
        const command = this.buildCommand();
        this.setText('airbnb-reservation-invoices-command', command);

        const mode = this.getSelectedMode();
        const description = MODE_CONFIG[mode]?.description || MODE_CONFIG.download.description;
        this.setText('airbnb-reservation-invoices-command-description', description);
    }

    setText(elementId, value) {
        const element = this.documentRef.getElementById(elementId);
        if (element) {
            element.textContent = value;
        }
    }

    async copyToClipboard(value) {
        const clipboard = this.windowRef.navigator?.clipboard;
        if (clipboard?.writeText) {
            try {
                await clipboard.writeText(value);
                return true;
            } catch (error) {
                console.warn('Clipboard API copy failed, falling back:', error);
            }
        }

        const textarea = this.documentRef.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.left = '-1000px';

        this.documentRef.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        let copied = false;
        try {
            copied = this.documentRef.execCommand('copy');
        } catch (error) {
            console.warn('execCommand copy failed:', error);
            copied = false;
        } finally {
            textarea.remove();
        }

        return copied;
    }

    showFeedback(message, tone = 'success') {
        const feedback = this.documentRef.getElementById('airbnb-reservation-invoices-copy-feedback');
        if (!feedback) {
            return;
        }

        feedback.textContent = message;
        feedback.classList.remove('hidden', 'text-green-600', 'text-red-600');
        feedback.classList.add(tone === 'success' ? 'text-green-600' : 'text-red-600');

        if (this.feedbackTimeoutId) {
            this.windowRef.clearTimeout(this.feedbackTimeoutId);
        }

        this.feedbackTimeoutId = this.windowRef.setTimeout(() => {
            feedback.classList.add('hidden');
        }, 2400);
    }
}
