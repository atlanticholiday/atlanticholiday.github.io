const PREVIEW_ROOT_ID = 'interactive-access-preview-bar';
const PREVIEW_TOAST_ID = 'interactive-access-preview-toast';

const MUTATING_CONTROL_PATTERN = /(?:^|[-_\s])(approve|archive|assign|clock|complete|confirm|delete|import|invite|publish|reject|request|save|send|submit|sync|undo|update|upload)(?:$|[-_\s])/i;
const SAFE_EXPLORATION_ACTION_PATTERN = /^(?:cancel|change|close|jump|open|review|select|show|toggle|view|workspace)(?:-|$)/i;

function cloneUserContext(context = {}) {
    return {
        uid: context?.uid || null,
        email: context?.email || null,
        roles: Array.isArray(context?.roles) ? [...context.roles] : [],
        allowedApps: Array.isArray(context?.allowedApps) ? [...context.allowedApps] : [],
        linkedEmployee: context?.linkedEmployee ? { ...context.linkedEmployee } : null
    };
}

function getControlDescriptor(control) {
    return [
        control?.id,
        control?.className,
        control?.getAttribute?.('name'),
        control?.getAttribute?.('data-action'),
        control?.getAttribute?.('data-laundry-action'),
        control?.getAttribute?.('data-linen-action'),
        control?.getAttribute?.('aria-label'),
        control?.textContent
    ]
        .filter((value) => typeof value === 'string')
        .join(' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2');
}

export class InteractiveAccessPreviewSession {
    constructor({
        dataManager,
        navigationManager,
        syncAccessUi = () => {},
        documentRef = document,
        windowRef = window,
        translate = (_key, fallback) => fallback
    } = {}) {
        this.dataManager = dataManager;
        this.navigationManager = navigationManager;
        this.syncAccessUi = syncAccessUi;
        this.document = documentRef;
        this.window = windowRef;
        this.translate = translate;
        this.activePreview = null;
        this.originalContext = null;
        this.returnPage = 'userManagement';
        this.blockedMessageTimer = null;
        this.handleDocumentClick = this.handleDocumentClick.bind(this);
        this.handleDocumentSubmit = this.handleDocumentSubmit.bind(this);
        this.handleDocumentChange = this.handleDocumentChange.bind(this);
        this.handleDocumentDrop = this.handleDocumentDrop.bind(this);
    }

    isActive() {
        return Boolean(this.activePreview);
    }

    start({ user = {}, linkedEmployee = null, buttonId = '' } = {}) {
        if (!this.dataManager || !user?.email) return false;

        if (this.isActive()) {
            this.stop({ restorePage: false });
        }

        this.originalContext = cloneUserContext(this.dataManager.getCurrentUserContext?.());
        this.returnPage = this.navigationManager?.currentPage || 'userManagement';
        this.activePreview = {
            email: user.email,
            displayName: linkedEmployee?.name || user.email,
            buttonId
        };

        this.dataManager.setCurrentUserContext?.({
            uid: this.originalContext.uid,
            email: user.email,
            roles: Array.isArray(user.roles) ? user.roles : [],
            allowedApps: Array.isArray(user.allowedApps) ? user.allowedApps : [],
            linkedEmployee: linkedEmployee?.id ? {
                id: linkedEmployee.id,
                name: linkedEmployee.name || '',
                email: linkedEmployee.email || user.email,
                isArchived: Boolean(linkedEmployee.isArchived)
            } : null
        });

        this.renderBar();
        this.bindReadOnlyGuards();
        this.syncAccessUi();
        this.openPreviewDestination(buttonId);
        return true;
    }

    stop({ restorePage = true } = {}) {
        if (!this.isActive()) return false;

        const returnPage = this.returnPage;
        const originalContext = this.originalContext;
        this.activePreview = null;
        this.originalContext = null;
        this.unbindReadOnlyGuards();
        this.document.getElementById(PREVIEW_ROOT_ID)?.remove();
        this.document.getElementById(PREVIEW_TOAST_ID)?.remove();
        this.document.body?.classList.remove('interactive-access-preview-active');
        if (this.document.documentElement?.dataset) {
            delete this.document.documentElement.dataset.interactiveAccessPreview;
        }

        if (originalContext) {
            this.dataManager.setCurrentUserContext?.(originalContext);
        }
        this.syncAccessUi();

        if (restorePage) {
            if (returnPage === 'userManagement') {
                this.navigationManager?.showUserManagementPage?.();
            } else {
                this.navigationManager?.showPage?.(returnPage || 'landing');
            }
        }
        return true;
    }

    openPreviewDestination(buttonId = '') {
        const isStation = Boolean(this.dataManager.isTimeClockStationUser?.());
        const shouldOpenClockDirectly = isStation
            || (this.dataManager.isClockOnlyUser?.() && !this.dataManager.hasAnyGrantedAppAccess?.());

        if (shouldOpenClockDirectly && !buttonId) {
            this.navigationManager?.showTimeClockPage?.();
            return;
        }

        this.navigationManager?.showLandingPage?.();
        if (!buttonId) return;

        const destinationButton = this.document.getElementById(buttonId);
        if (!destinationButton) {
            this.showBlockedMessage(this.translate(
                'userManagement.preview.interactive.unavailable',
                'This app could not be opened in the preview.'
            ));
            return;
        }

        if (destinationButton.getAttribute('onclick')?.includes('window.location')) {
            this.showBlockedMessage(this.translate(
                'userManagement.preview.interactive.standalone',
                'This standalone app can only be opened in the normal signed-in view.'
            ));
            return;
        }

        destinationButton.click();
    }

    renderBar() {
        this.document.getElementById(PREVIEW_ROOT_ID)?.remove();
        const bar = this.document.createElement('aside');
        bar.id = PREVIEW_ROOT_ID;
        bar.className = 'interactive-access-preview-bar';
        bar.setAttribute('role', 'status');
        bar.innerHTML = `
            <div class="interactive-access-preview-bar__identity">
                <span class="interactive-access-preview-bar__pulse" aria-hidden="true"></span>
                <div>
                    <strong>${this.escapeHtml(this.translate('userManagement.preview.interactive.previewing', 'Previewing'))} ${this.escapeHtml(this.activePreview.displayName)}</strong>
                    <span>${this.escapeHtml(this.activePreview.email)}</span>
                </div>
            </div>
            <p>${this.escapeHtml(this.translate('userManagement.preview.interactive.readOnlyNotice', 'Navigation works normally. Changes are blocked in this preview.'))}</p>
            <button id="exit-interactive-access-preview-btn" type="button">${this.escapeHtml(this.translate('userManagement.preview.interactive.exit', 'Exit preview'))}</button>
        `;
        bar.querySelector('#exit-interactive-access-preview-btn')?.addEventListener('click', () => this.stop());
        this.document.body?.prepend(bar);
        this.document.body?.classList.add('interactive-access-preview-active');
        if (this.document.documentElement?.dataset) {
            this.document.documentElement.dataset.interactiveAccessPreview = 'true';
        }
    }

    bindReadOnlyGuards() {
        this.document.addEventListener('click', this.handleDocumentClick, true);
        this.document.addEventListener('submit', this.handleDocumentSubmit, true);
        this.document.addEventListener('change', this.handleDocumentChange, true);
        this.document.addEventListener('drop', this.handleDocumentDrop, true);
    }

    unbindReadOnlyGuards() {
        this.document.removeEventListener('click', this.handleDocumentClick, true);
        this.document.removeEventListener('submit', this.handleDocumentSubmit, true);
        this.document.removeEventListener('change', this.handleDocumentChange, true);
        this.document.removeEventListener('drop', this.handleDocumentDrop, true);
        if (this.blockedMessageTimer) {
            this.window.clearTimeout?.(this.blockedMessageTimer);
            this.blockedMessageTimer = null;
        }
    }

    handleDocumentClick(event) {
        if (!this.isActive()) return;
        const target = event.target;
        const ElementType = this.window.Element || this.document.defaultView?.Element;
        if (!ElementType || !(target instanceof ElementType)) return;
        if (target.closest(`#${PREVIEW_ROOT_ID}`)) return;

        const control = target.closest('button, a, [role="button"], input, label');
        if (!control) return;
        const input = control.matches?.('input')
            ? control
            : (control.matches?.('label') && control.htmlFor ? this.document.getElementById(control.htmlFor) : null);
        if (input && ['checkbox', 'radio', 'file'].includes(input.type)) {
            this.blockInteraction(event);
            return;
        }
        const descriptor = getControlDescriptor(control);

        if (/sign[-_\s]?out|logout|sair/i.test(descriptor)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.stop();
            return;
        }

        const previewAction = [
            control.getAttribute?.('data-action'),
            control.getAttribute?.('data-laundry-action'),
            control.getAttribute?.('data-linen-action')
        ].find((value) => typeof value === 'string' && value);
        if (previewAction && SAFE_EXPLORATION_ACTION_PATTERN.test(previewAction)) {
            return;
        }

        if (MUTATING_CONTROL_PATTERN.test(descriptor)) {
            this.blockInteraction(event);
        }
    }

    handleDocumentSubmit(event) {
        if (this.isActive()) this.blockInteraction(event);
    }

    handleDocumentChange(event) {
        if (!this.isActive()) return;
        const target = event.target;
        const InputType = this.window.HTMLInputElement || this.document.defaultView?.HTMLInputElement;
        if (!InputType || !(target instanceof InputType)) return;
        if (['checkbox', 'radio', 'file'].includes(target.type)) {
            this.blockInteraction(event);
        }
    }

    handleDocumentDrop(event) {
        if (this.isActive()) this.blockInteraction(event);
    }

    blockInteraction(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.showBlockedMessage(this.translate(
            'userManagement.preview.interactive.blocked',
            'Changes are blocked while previewing another user.'
        ));
    }

    showBlockedMessage(message) {
        let toast = this.document.getElementById(PREVIEW_TOAST_ID);
        if (!toast) {
            toast = this.document.createElement('div');
            toast.id = PREVIEW_TOAST_ID;
            toast.className = 'interactive-access-preview-toast';
            toast.setAttribute('role', 'alert');
            this.document.body?.append(toast);
        }
        toast.textContent = message;
        toast.classList.add('is-visible');
        if (this.blockedMessageTimer) this.window.clearTimeout?.(this.blockedMessageTimer);
        this.blockedMessageTimer = this.window.setTimeout?.(() => {
            toast?.classList.remove('is-visible');
            this.blockedMessageTimer = null;
        }, 2600);
    }

    escapeHtml(value) {
        return String(value ?? '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }
}
