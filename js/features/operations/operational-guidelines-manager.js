import { i18n } from "../../core/i18n.js";
import {
    OPERATIONAL_GUIDELINE_SECTIONS,
    getLocalizedOperationalGuidelineContacts,
    getLocalizedOperationalGuidelineRules,
    getLocalizedOperationalGuidelineSuggestions,
    localizeOperationalGuidelineSections
} from "./operational-guidelines-data.js";
import {
    buildOperationalGuidelineSections,
    findOperationalGuidelineById,
    getOperationalGuidelineItems,
    searchOperationalGuidelines
} from "./operational-guidelines-utils.js";

const STORAGE_KEY = "operational-guidelines-edits-v1";

const COPY = {
    en: {
        cardTitle: "Operational Guide",
        cardDescription: "Search guest-response protocols and copy approved replies.",
        kicker: "Team manual",
        title: "Operational Guide",
        subtitle: "Ask what happened, jump to the right protocol, and copy the approved guest reply.",
        askLabel: "Ask the guide",
        askPlaceholder: "Example: guest says the Wi-Fi is slow, or parking is occupied",
        askHint: "Smart search matches accents, related words, and the manual's keywords. It does not send data to an external AI service.",
        suggestionsTitle: "Try one",
        bestMatch: "Best match",
        allProtocols: "All protocols",
        noResults: "No matching protocol found. Try fewer words or browse the full list.",
        action: "Action",
        reply: "Guest reply",
        copy: "Copy reply",
        copied: "Reply copied",
        open: "Open protocol",
        addProtocol: "Add protocol",
        edit: "Edit",
        delete: "Delete",
        deleteConfirm: "Hide this protocol from the guide?",
        editorTitleNew: "Add protocol",
        editorTitleEdit: "Edit protocol",
        section: "Section",
        titleField: "Title",
        actionField: "Action",
        replyField: "Guest reply",
        keywordsField: "Keywords",
        keywordsHint: "Separate keywords with commas.",
        saveProtocol: "Save protocol",
        cancel: "Cancel",
        customSection: "Custom protocols",
        resetLocalChanges: "Reset local changes",
        resetConfirm: "Remove all local Operational Guide edits from this browser?",
        localOnly: "Edits are saved in this browser. Use this for team drafts before moving the manual to shared storage.",
        rulesTitle: "Rules of gold",
        contactsTitle: "Emergency contacts",
        emergencyNote: "In an urgent case, ask the guest to call instead of sending messages.",
        protocolsCount: "protocols",
        sectionsCount: "sections"
    },
    pt: {
        cardTitle: "Guia Operacional",
        cardDescription: "Pesquisa protocolos de resposta e copia mensagens aprovadas.",
        kicker: "Manual da equipa",
        title: "Guia Operacional",
        subtitle: "Escreve o que aconteceu, salta para o protocolo certo e copia a resposta aprovada ao hóspede.",
        askLabel: "Perguntar ao guia",
        askPlaceholder: "Exemplo: hóspede diz que o Wi-Fi está lento, ou estacionamento ocupado",
        askHint: "A pesquisa inteligente reconhece acentos, palavras relacionadas e keywords do manual. Não envia dados para IA externa.",
        suggestionsTitle: "Experimenta",
        bestMatch: "Melhor resultado",
        allProtocols: "Todos os protocolos",
        noResults: "Nenhum protocolo encontrado. Tenta menos palavras ou navega pela lista completa.",
        action: "Ação",
        reply: "Resposta ao hóspede",
        copy: "Copiar resposta",
        copied: "Resposta copiada",
        open: "Abrir protocolo",
        addProtocol: "Adicionar protocolo",
        edit: "Editar",
        delete: "Apagar",
        deleteConfirm: "Esconder este protocolo do guia?",
        editorTitleNew: "Adicionar protocolo",
        editorTitleEdit: "Editar protocolo",
        section: "Secção",
        titleField: "Título",
        actionField: "Ação",
        replyField: "Resposta ao hóspede",
        keywordsField: "Keywords",
        keywordsHint: "Separar keywords com vírgulas.",
        saveProtocol: "Guardar protocolo",
        cancel: "Cancelar",
        customSection: "Protocolos personalizados",
        resetLocalChanges: "Repor alterações locais",
        resetConfirm: "Remover todas as alterações locais deste browser?",
        localOnly: "As edições ficam guardadas neste browser. Usa isto para rascunhos da equipa antes de passar o manual para storage partilhado.",
        rulesTitle: "Regras de ouro",
        contactsTitle: "Contactos de urgência",
        emergencyNote: "Em caso de urgência, peça sempre ao hóspede para ligar em vez de enviar mensagem.",
        protocolsCount: "protocolos",
        sectionsCount: "secções"
    }
};

function escapeHtml(value = "") {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getCopy() {
    return COPY[i18n?.getCurrentLanguage?.() === "pt" ? "pt" : "en"];
}

export class OperationalGuidelinesManager {
    constructor({ documentRef = document, windowRef = window } = {}) {
        this.documentRef = documentRef;
        this.windowRef = windowRef;
        this.root = null;
        this.query = "";
        this.activeItemId = "wifi-slow";
        this.editingItemId = null;
        this.isCreatingProtocol = false;
        this.protocolEdits = [];
        this.deletedProtocolIds = [];
        this.copyFeedbackTimer = null;
        this.bound = false;
    }

    init() {
        this.root = this.documentRef.getElementById("operational-guidelines-root");
        this.loadStoredState();
        this.syncLandingCopy();

        if (!this.root) {
            return;
        }

        if (!this.bound) {
            this.documentRef.addEventListener("operationalGuidelinesPageOpened", () => this.render());
            this.windowRef.addEventListener?.("languageChanged", () => {
                this.syncLandingCopy();
                this.render();
            });
            this.bound = true;
        }

        this.render();
    }

    loadStoredState() {
        try {
            const raw = this.windowRef.localStorage?.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            this.protocolEdits = Array.isArray(parsed.protocols) ? parsed.protocols : [];
            this.deletedProtocolIds = Array.isArray(parsed.deletedIds) ? parsed.deletedIds : [];
        } catch {
            this.protocolEdits = [];
            this.deletedProtocolIds = [];
        }
    }

    saveStoredState() {
        try {
            this.windowRef.localStorage?.setItem(STORAGE_KEY, JSON.stringify({
                protocols: this.protocolEdits,
                deletedIds: this.deletedProtocolIds
            }));
        } catch {
            // localStorage may be unavailable in private or restricted browser modes.
        }
    }

    getSections() {
        const sections = buildOperationalGuidelineSections({
            protocols: this.protocolEdits,
            deletedIds: this.deletedProtocolIds
        });
        return localizeOperationalGuidelineSections(sections, i18n?.getCurrentLanguage?.() || "en");
    }

    getItems() {
        return getOperationalGuidelineItems(this.getSections());
    }

    findItem(id) {
        return findOperationalGuidelineById(id, this.getSections());
    }

    syncLandingCopy() {
        const copy = getCopy();
        this.setText("operational-guidelines-card-title", copy.cardTitle);
        this.setText("operational-guidelines-card-description", copy.cardDescription);
        this.setText("operational-guidelines-header-kicker", copy.kicker);
        this.setText("operational-guidelines-page-title", copy.title);
        this.setText("operational-guidelines-page-subtitle", copy.subtitle);
    }

    setText(id, text) {
        const element = this.documentRef.getElementById(id);
        if (element) {
            element.textContent = text;
        }
    }

    render() {
        if (!this.root) {
            return;
        }

        const copy = getCopy();
        const sections = this.getSections();
        const rules = getLocalizedOperationalGuidelineRules(i18n?.getCurrentLanguage?.() || "en");
        const suggestions = getLocalizedOperationalGuidelineSuggestions(i18n?.getCurrentLanguage?.() || "en");
        const items = getOperationalGuidelineItems(sections);
        const results = this.query ? searchOperationalGuidelines(this.query, { sections }) : items;
        const activeItem = results.length
            ? (this.findItem(this.activeItemId) || results[0])
            : null;

        this.root.innerHTML = `
            <section class="operational-guide-shell">
                <div class="operational-guide-search-panel">
                    <div class="operational-guide-stat-row" aria-label="Manual summary">
                        <span><strong>${items.length}</strong> ${escapeHtml(copy.protocolsCount)}</span>
                        <span><strong>${OPERATIONAL_GUIDELINE_SECTIONS.length}</strong> ${escapeHtml(copy.sectionsCount)}</span>
                    </div>
                    <label class="operational-guide-search-label" for="operational-guidelines-search">${escapeHtml(copy.askLabel)}</label>
                    <div class="operational-guide-search-box">
                        <i class="fas fa-magnifying-glass" aria-hidden="true"></i>
                        <input id="operational-guidelines-search" type="search" value="${escapeHtml(this.query)}" placeholder="${escapeHtml(copy.askPlaceholder)}" autocomplete="off">
                    </div>
                    <p class="operational-guide-hint">${escapeHtml(copy.askHint)}</p>
                    <div class="operational-guide-edit-toolbar">
                        <button type="button" data-guideline-create>${escapeHtml(copy.addProtocol)}</button>
                        <button type="button" data-guideline-reset>${escapeHtml(copy.resetLocalChanges)}</button>
                    </div>
                    <p class="operational-guide-local-note">${escapeHtml(copy.localOnly)}</p>
                    <div class="operational-guide-suggestions" aria-label="${escapeHtml(copy.suggestionsTitle)}">
                        <span>${escapeHtml(copy.suggestionsTitle)}</span>
                        ${suggestions.map((suggestion) => `
                            <button type="button" data-guideline-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>
                        `).join("")}
                    </div>
                    ${this.renderContacts(copy)}
                </div>

                <aside class="operational-guide-answer-panel" aria-live="polite">
                    ${activeItem ? this.renderActiveItem(activeItem, copy) : this.renderNoResultAnswer(copy)}
                </aside>
            </section>

            ${this.renderEditor(copy)}

            <section class="operational-guide-rules">
                <div>
                    <p class="operational-guide-section-kicker">${escapeHtml(copy.rulesTitle)}</p>
                    <h3>${escapeHtml(rules[0].title)}</h3>
                </div>
                <div class="operational-guide-rule-list">
                    ${rules.map((rule) => `
                        <article>
                            <strong>${escapeHtml(rule.title)}</strong>
                            <p>${escapeHtml(rule.text)}</p>
                        </article>
                    `).join("")}
                </div>
            </section>

            <section class="operational-guide-list">
                <div class="operational-guide-list-header">
                    <div>
                        <p class="operational-guide-section-kicker">${escapeHtml(this.query ? copy.bestMatch : copy.allProtocols)}</p>
                        <h3>${escapeHtml(copy.allProtocols)}</h3>
                    </div>
                    <span>${results.length} / ${items.length}</span>
                </div>
                ${results.length ? this.renderSections(results, copy, sections) : `<p class="operational-guide-empty">${escapeHtml(copy.noResults)}</p>`}
            </section>
        `;

        this.bindEvents();
    }

    renderContacts(copy) {
        const contacts = getLocalizedOperationalGuidelineContacts(i18n?.getCurrentLanguage?.() || "en");
        return `
            <div class="operational-guide-contacts">
                <div>
                    <p class="operational-guide-section-kicker">${escapeHtml(copy.contactsTitle)}</p>
                    <p>${escapeHtml(copy.emergencyNote)}</p>
                </div>
                <div class="operational-guide-contact-list">
                    ${contacts.map((contact) => `
                        <a href="tel:${escapeHtml(contact.value.replace(/\s+/g, ""))}">
                            <span>${escapeHtml(contact.label)}</span>
                            <strong>${escapeHtml(contact.value)}</strong>
                        </a>
                    `).join("")}
                </div>
            </div>
        `;
    }

    renderActiveItem(item, copy) {
        return `
            <p class="operational-guide-section-kicker">${escapeHtml(copy.bestMatch)}</p>
            <h2>${escapeHtml(item.number)}. ${escapeHtml(item.title)}</h2>
            <div class="operational-guide-answer-block">
                <span>${escapeHtml(copy.action)}</span>
                <p>${escapeHtml(item.action)}</p>
            </div>
            <div class="operational-guide-answer-block">
                <span>${escapeHtml(copy.reply)}</span>
                <blockquote>${escapeHtml(item.response)}</blockquote>
            </div>
            <div class="operational-guide-answer-actions">
                <button type="button" data-guideline-copy="${escapeHtml(item.id)}">${escapeHtml(copy.copy)}</button>
                <button type="button" data-guideline-open="${escapeHtml(item.id)}">${escapeHtml(copy.open)}</button>
                <button type="button" data-guideline-edit="${escapeHtml(item.id)}">${escapeHtml(copy.edit)}</button>
                <button type="button" data-guideline-delete="${escapeHtml(item.id)}">${escapeHtml(copy.delete)}</button>
            </div>
            <p id="operational-guidelines-copy-feedback" class="operational-guide-copy-feedback" aria-live="polite"></p>
        `;
    }

    renderNoResultAnswer(copy) {
        return `
            <p class="operational-guide-section-kicker">${escapeHtml(copy.bestMatch)}</p>
            <h2>${escapeHtml(copy.noResults)}</h2>
            <div class="operational-guide-answer-block">
                <span>${escapeHtml(copy.action)}</span>
                <p>${escapeHtml(copy.askPlaceholder)}</p>
            </div>
        `;
    }

    renderEditor(copy) {
        if (!this.isCreatingProtocol && !this.editingItemId) {
            return "";
        }

        const item = this.editingItemId ? this.findItem(this.editingItemId) : null;
        const sectionId = item?.sectionId || "custom";
        const keywords = (item?.keywords || []).join(", ");
        const title = this.isCreatingProtocol ? copy.editorTitleNew : copy.editorTitleEdit;
        const sectionOptions = [
            ...localizeOperationalGuidelineSections(OPERATIONAL_GUIDELINE_SECTIONS, i18n?.getCurrentLanguage?.() || "en").map((section) => ({ id: section.id, title: section.title })),
            { id: "custom", title: copy.customSection }
        ];

        return `
            <section class="operational-guide-editor" aria-label="${escapeHtml(title)}">
                <div class="operational-guide-editor-header">
                    <div>
                        <p class="operational-guide-section-kicker">${escapeHtml(title)}</p>
                        <h3>${escapeHtml(item?.title || copy.addProtocol)}</h3>
                    </div>
                    <button type="button" data-guideline-cancel-edit>${escapeHtml(copy.cancel)}</button>
                </div>
                <form id="operational-guidelines-editor-form" class="operational-guide-editor-form">
                    <label>
                        <span>${escapeHtml(copy.section)}</span>
                        <select name="sectionId">
                            ${sectionOptions.map((section) => `
                                <option value="${escapeHtml(section.id)}" ${section.id === sectionId ? "selected" : ""}>${escapeHtml(section.title)}</option>
                            `).join("")}
                        </select>
                    </label>
                    <label>
                        <span>${escapeHtml(copy.titleField)}</span>
                        <input name="title" required value="${escapeHtml(item?.title || "")}">
                    </label>
                    <label>
                        <span>${escapeHtml(copy.actionField)}</span>
                        <textarea name="action" required rows="3">${escapeHtml(item?.action || "")}</textarea>
                    </label>
                    <label>
                        <span>${escapeHtml(copy.replyField)}</span>
                        <textarea name="response" required rows="5">${escapeHtml(item?.response || "")}</textarea>
                    </label>
                    <label>
                        <span>${escapeHtml(copy.keywordsField)}</span>
                        <input name="keywords" value="${escapeHtml(keywords)}" aria-describedby="operational-guidelines-keywords-hint">
                        <small id="operational-guidelines-keywords-hint">${escapeHtml(copy.keywordsHint)}</small>
                    </label>
                    <div class="operational-guide-editor-actions">
                        <button type="submit">${escapeHtml(copy.saveProtocol)}</button>
                        <button type="button" data-guideline-cancel-edit>${escapeHtml(copy.cancel)}</button>
                    </div>
                </form>
            </section>
        `;
    }

    renderSections(results, copy, sections = this.getSections()) {
        const resultIds = new Set(results.map((item) => item.id));
        return sections.map((section) => {
            const sectionItems = section.items.filter((item) => resultIds.has(item.id));
            if (!sectionItems.length) {
                return "";
            }

            return `
                <article class="operational-guide-section" id="guide-section-${escapeHtml(section.id)}">
                    <div class="operational-guide-section-heading">
                        <div>
                            <p class="operational-guide-section-kicker">${escapeHtml(section.title)}</p>
                            <h4>${escapeHtml(section.summary)}</h4>
                        </div>
                        <span>${sectionItems.length}</span>
                    </div>
                    <div class="operational-guide-protocols">
                        ${sectionItems.map((item) => this.renderListItem(item, copy)).join("")}
                    </div>
                </article>
            `;
        }).join("");
    }

    renderListItem(item, copy) {
        const activeClass = item.id === this.activeItemId ? " is-active" : "";
        return `
            <article class="operational-guide-protocol${activeClass}" id="guideline-${escapeHtml(item.id)}">
                <button type="button" data-guideline-select="${escapeHtml(item.id)}">
                    <span class="operational-guide-protocol-number">${escapeHtml(item.number)}</span>
                    <span>
                        <strong>${escapeHtml(item.title)}</strong>
                        <small>${escapeHtml(item.action)}</small>
                    </span>
                </button>
                <div>
                    <p>${escapeHtml(item.response)}</p>
                    <button type="button" data-guideline-copy="${escapeHtml(item.id)}">${escapeHtml(copy.copy)}</button>
                    <button type="button" data-guideline-edit="${escapeHtml(item.id)}">${escapeHtml(copy.edit)}</button>
                </div>
            </article>
        `;
    }

    bindEvents() {
        const input = this.documentRef.getElementById("operational-guidelines-search");
        input?.addEventListener("input", (event) => {
            const selectionStart = event.target.selectionStart;
            this.query = event.target.value;
            const first = searchOperationalGuidelines(this.query, { sections: this.getSections() })[0];
            if (first) {
                this.activeItemId = first.id;
            }
            this.render();
            const nextInput = this.documentRef.getElementById("operational-guidelines-search");
            nextInput?.focus();
            if (Number.isInteger(selectionStart)) {
                nextInput?.setSelectionRange(selectionStart, selectionStart);
            }
        });

        this.root.querySelectorAll("[data-guideline-suggestion]").forEach((button) => {
            button.addEventListener("click", () => {
                this.query = button.dataset.guidelineSuggestion || "";
                const first = searchOperationalGuidelines(this.query, { sections: this.getSections() })[0];
                this.activeItemId = first?.id || this.activeItemId;
                this.render();
            });
        });

        this.root.querySelectorAll("[data-guideline-select]").forEach((button) => {
            button.addEventListener("click", () => {
                this.activeItemId = button.dataset.guidelineSelect;
                this.render();
            });
        });

        this.root.querySelectorAll("[data-guideline-open]").forEach((button) => {
            button.addEventListener("click", () => {
                this.scrollToProtocol(button.dataset.guidelineOpen);
            });
        });

        this.root.querySelectorAll("[data-guideline-copy]").forEach((button) => {
            button.addEventListener("click", () => {
                this.copyResponse(button.dataset.guidelineCopy);
            });
        });

        this.root.querySelectorAll("[data-guideline-edit]").forEach((button) => {
            button.addEventListener("click", () => {
                this.editingItemId = button.dataset.guidelineEdit;
                this.isCreatingProtocol = false;
                this.render();
            });
        });

        this.root.querySelector("[data-guideline-create]")?.addEventListener("click", () => {
            this.editingItemId = null;
            this.isCreatingProtocol = true;
            this.render();
        });

        this.root.querySelectorAll("[data-guideline-cancel-edit]").forEach((button) => {
            button.addEventListener("click", () => {
                this.editingItemId = null;
                this.isCreatingProtocol = false;
                this.render();
            });
        });

        this.root.querySelector("[data-guideline-delete]")?.addEventListener("click", (event) => {
            const id = event.currentTarget.dataset.guidelineDelete;
            if (this.windowRef.confirm?.(getCopy().deleteConfirm) !== false) {
                this.deleteProtocol(id);
            }
        });

        this.root.querySelector("[data-guideline-reset]")?.addEventListener("click", () => {
            if (this.windowRef.confirm?.(getCopy().resetConfirm) !== false) {
                this.protocolEdits = [];
                this.deletedProtocolIds = [];
                this.editingItemId = null;
                this.isCreatingProtocol = false;
                this.saveStoredState();
                this.render();
            }
        });

        this.documentRef.getElementById("operational-guidelines-editor-form")?.addEventListener("submit", (event) => {
            event.preventDefault();
            this.saveProtocol(new FormData(event.currentTarget));
        });
    }

    scrollToProtocol(id) {
        const element = this.documentRef.getElementById(`guideline-${id}`);
        if (!element) {
            return;
        }
        element.scrollIntoView?.({ behavior: "smooth", block: "center" });
        element.classList.add("is-highlighted");
        this.windowRef.setTimeout?.(() => {
            element.classList.remove("is-highlighted");
        }, 1400);
    }

    async copyResponse(id) {
        const item = this.findItem(id);
        if (!item) {
            return;
        }

        try {
            await this.windowRef.navigator?.clipboard?.writeText?.(item.response);
        } catch {
            // Clipboard may be unavailable on non-secure local origins; keep the UI usable.
        }

        const feedback = this.documentRef.getElementById("operational-guidelines-copy-feedback");
        if (feedback) {
            feedback.textContent = getCopy().copied;
            clearTimeout(this.copyFeedbackTimer);
            this.copyFeedbackTimer = this.windowRef.setTimeout?.(() => {
                feedback.textContent = "";
            }, 1800);
        }
    }

    saveProtocol(formData) {
        const sectionId = String(formData.get("sectionId") || "custom");
        const section = localizeOperationalGuidelineSections(OPERATIONAL_GUIDELINE_SECTIONS, i18n?.getCurrentLanguage?.() || "en").find((entry) => entry.id === sectionId);
        const isNew = this.isCreatingProtocol || !this.editingItemId;
        const id = isNew ? `custom-${Date.now().toString(36)}` : this.editingItemId;
        const baseItem = this.findItem(id);
        const customCount = this.protocolEdits.filter((item) => item.isCustom).length + 1;
        const protocol = {
            id,
            number: baseItem?.number || `C${customCount}`,
            sectionId,
            sectionTitle: section?.title || getCopy().customSection,
            title: String(formData.get("title") || "").trim(),
            action: String(formData.get("action") || "").trim(),
            response: String(formData.get("response") || "").trim(),
            keywords: String(formData.get("keywords") || "")
                .split(",")
                .map((keyword) => keyword.trim())
                .filter(Boolean),
            isCustom: isNew || baseItem?.isCustom || id.startsWith("custom-"),
            isEdited: !isNew || Boolean(baseItem)
        };

        this.protocolEdits = [
            ...this.protocolEdits.filter((item) => item.id !== id),
            protocol
        ];
        this.deletedProtocolIds = this.deletedProtocolIds.filter((deletedId) => deletedId !== id);
        this.activeItemId = id;
        this.editingItemId = null;
        this.isCreatingProtocol = false;
        this.saveStoredState();
        this.render();
    }

    deleteProtocol(id) {
        if (!id) {
            return;
        }

        this.protocolEdits = this.protocolEdits.filter((item) => item.id !== id);
        if (!this.deletedProtocolIds.includes(id)) {
            this.deletedProtocolIds = [...this.deletedProtocolIds, id];
        }

        const nextItem = this.getItems().find((item) => item.id !== id);
        this.activeItemId = nextItem?.id || "";
        this.editingItemId = null;
        this.isCreatingProtocol = false;
        this.saveStoredState();
        this.render();
    }
}
