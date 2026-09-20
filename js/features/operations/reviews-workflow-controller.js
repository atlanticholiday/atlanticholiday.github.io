import { ReviewsWorkflowStore } from './reviews-workflow-store.js';
import { createWorkSeed, collectWorkEvidence, mergeEvidence, reviewKey } from './reviews-workflow-utils.js';
import { getAllPropertyReviews } from './reviews-ratings-utils.js';
import { reviewText as t } from './reviews-ratings-copy.js';

export class ReviewsWorkflowController {
  constructor(host, { getDataManager = () => null, getTaskManager = () => null, store = null } = {}) {
    this.host = host; this.getDataManager = getDataManager; this.getTaskManager = getTaskManager;
    this.store = store || new ReviewsWorkflowStore(host.db, { getContext: () => this.context(), canManage: () => this.canManage() });
    this.session = ''; this.injectedStore = Boolean(store);
    Object.assign(host.state, { workItems: [], followUps: [], linkedTasks: [], taskDepartments: [], workflowLoading: false, workflowError: '',
      workFilter: 'open', workSearch: '', workOwner: 'all', workPage: 1, workDraft: null, followUpDraft: null, selectedInboxReview: null, workflowSaving: false,
      inbox: { search: '', platform: 'all', property: 'all', response: 'all', rating: 'all', owner: 'all', work: 'all', sort: 'newest', from: '', to: '', page: 1 } });
  }
  context() { return this.getDataManager()?.getCurrentUserContext?.() || {}; }
  canManage() { return Boolean(this.host.hasAccess() && this.context().uid && this.getDataManager()?.hasPrivilegedRole?.() && (this.host.db || this.injectedStore)); }
  employees() { return this.getDataManager()?.getActiveEmployees?.() || []; }
  start(reconnect = false) {
    const context = this.context();
    const session = this.host.hasAccess() && context.uid ? `${context.uid}:${this.canManage()}` : '';
    if (session === this.session && !reconnect) return;
    const changedIdentity = session !== this.session;
    this.store.stop(); this.session = session;
    if (changedIdentity) Object.assign(this.host.state, { workItems: [], followUps: [], linkedTasks: [], taskDepartments: [], workDraft: null, followUpDraft: null, selectedInboxReview: null, workflowSaving: false });
    Object.assign(this.host.state, { workflowError: '', workflowLoading: false });
    if (!session) return;
    this.host.state.workflowLoading = true;
    this.store.listen(records => {
      if (session !== this.session) return;
      this.host.state.workItems = records.filter(r => r.recordType === 'improvement');
      this.host.state.followUps = records.filter(r => r.recordType === 'followUp');
      this.host.state.workflowLoading = false; this.host.state.workflowError = '';
      // Drafts stay untouched: optimistic revision checks protect against concurrent edits.
      this.host.render();
    }, tasks => { if (session === this.session) { this.host.state.linkedTasks = tasks; this.host.render(); } }, error => {
      if (session !== this.session) return;
      console.warn('[Reviews workflow]', error);
      this.host.state.workflowLoading = false; this.host.state.workflowError = t('sharedUnavailable'); this.host.render();
    }, departments => { if (session === this.session) { this.host.state.taskDepartments = departments; this.host.render(); } });
  }
  viewState() { return { canManageWork: this.canManage(), employees: this.employees(), workflowConnected: Boolean(this.session) }; }
  openWork(propertyId, category, id = null) {
    const property = this.host.state.rawProperties.find(p => p.id === propertyId);
    if (!property) return;
    const existing = this.host.state.workItems.find(w => id ? w.id === id : w.propertyId === propertyId && w.category === category);
    if (!existing && !this.canManage()) return;
    const draft = existing || createWorkSeed(property, category, `${property.name} · ${t(`${category}Category`)}`);
    this.host.state.workDraft = { ...draft, evidence: mergeEvidence(draft.evidence, collectWorkEvidence(property, draft.category)), note: '' };
    this.host.state.selectedProperty = property; this.host.state.activeModalTab = 'work';
    this.host.state.selectedInboxReview = null; this.host.state.followUpDraft = null;
    this.host.render();
  }
  openReview(propertyId, key) {
    const property = this.host.state.rawProperties.find(p => p.id === propertyId);
    const review = property && getAllPropertyReviews(property).find(r => reviewKey(r) === key);
    if (!review) return;
    const followUp = this.host.state.followUps.find(f => f.propertyId === propertyId && f.reviewKey === key);
    this.host.state.selectedProperty = property; this.host.state.activeModalTab = 'followUp';
    this.host.state.selectedInboxReview = { ...review, propertyId };
    this.host.state.followUpDraft = { ...(followUp || { revision: 0, reviewKey: key, status: 'open', assigneeId: '' }), note: '' };
    if (this.host.state.workDraft?.propertyId !== propertyId) this.host.state.workDraft = null;
    this.host.render();
  }
  async runSave(action) {
    if (!this.canManage() || this.host.state.workflowSaving || this.host.state.workflowLoading || this.host.state.workflowError) return;
    const session = this.session;
    this.host.state.workflowSaving = true; this.host.render();
    try {
      await action(() => session === this.session);
      if (session === this.session) this.host.showToast(t('sharedSaved'));
    } catch (error) {
      if (session === this.session) this.host.showToast(t(['conflict', 'invalidWork', 'invalidDate', 'completionRequired', 'dismissalRequired', 'saveFirst', 'taskUnavailable', 'readOnly'].includes(error.message) ? error.message : 'sharedSaveFailed'), 'error');
    } finally { if (session === this.session) { this.host.state.workflowSaving = false; this.host.render(); } }
  }
  async saveWork() {
    const draft = this.host.state.workDraft;
    if (!draft) return;
    return this.runSave(async isCurrent => {
      const employee = this.employees().find(e => e.id === draft.assigneeId);
      if (draft.assigneeId && !employee && draft.assigneeId !== this.host.state.workItems.find(w => w.id === draft.id)?.assigneeId) throw new Error('invalidWork');
      const saved = await this.store.saveWork({ ...draft, assigneeName: employee?.name || draft.assigneeName || '' });
      if (!isCurrent()) return;
      this.replaceRecord(saved);
      if (this.host.state.workDraft === draft) this.host.state.workDraft = { ...saved, note: '' };
    });
  }
  async saveFollowUp() {
    const state = this.host.state, draft = state.followUpDraft, review = state.selectedInboxReview;
    if (!draft || !review) return;
    return this.runSave(async isCurrent => {
      const employee = this.employees().find(e => e.id === draft.assigneeId);
      const previous = state.followUps.find(f => f.propertyId === review.propertyId && f.reviewKey === draft.reviewKey);
      if (draft.assigneeId && !employee && previous?.assigneeId !== draft.assigneeId) throw new Error('invalidWork');
      const saved = await this.store.saveFollowUp(review.propertyId, review, { ...draft, assigneeName: employee?.name || draft.assigneeName || '' });
      if (!isCurrent()) return;
      this.replaceRecord(saved);
      if (state.followUpDraft === draft) state.followUpDraft = { ...saved, note: '' };
    });
  }
  replaceRecord(record) {
    const key = record.recordType === 'improvement' ? 'workItems' : 'followUps';
    this.host.state[key] = [...this.host.state[key].filter(r => r.id !== record.id), record];
  }
  async linkTask(taskId, departmentId) {
    const draft = this.host.state.workDraft;
    if (!draft?.revision) { this.host.showToast(t('saveFirst'), 'error'); return; }
    const savedWork = this.host.state.workItems.find(w => w.id === draft.id);
    if (draft.note || ['title', 'status', 'assigneeId', 'dueDate', 'priority', 'completionEvidence'].some(key => draft[key] !== savedWork?.[key])) {
      this.host.showToast(t('saveFirst'), 'error'); return;
    }
    return this.runSave(async isCurrent => {
      const department = this.host.state.taskDepartments.find(d => d.id === departmentId);
      const employee = this.employees().find(e => e.id === draft.assigneeId);
      const assigneeAccess = employee?.email ? { [employee.email.trim().toLowerCase()]: true } : {};
      const saved = await this.store.linkTask(draft, { taskId, departmentId: department?.id || 'general', departmentName: department?.name || t('generalDepartment'), assigneeAccess });
      if (!isCurrent()) return;
      this.replaceRecord(saved);
      if (this.host.state.workDraft === draft) this.host.state.workDraft = { ...saved, note: '' };
    });
  }
  async openTask(id) {
    if (!this.host.state.linkedTasks.some(t => t.id === id)) { this.host.showToast(t('taskUnavailable'), 'error'); return; }
    const taskManager = this.getTaskManager();
    if (!taskManager) return;
    this.host.state.selectedProperty = null; this.host.render();
    this.host.navigationManager?.showTasksPage?.();
    await taskManager.openLinkedTask(id);
  }
  handlers() {
    const state = this.host.state;
    return {
      onWorkOpen: (propertyId, category, id) => this.openWork(propertyId, category, id),
      onWorkField: (field, value) => { if (state.workDraft) state.workDraft[field] = value; },
      onWorkSave: () => this.saveWork(),
      onWorkReload: () => { const w = state.workDraft; if (w) this.openWork(w.propertyId, w.category, w.id); },
      onWorkFilter: (key, value) => { state[key] = value; state.workPage = 1; this.host.render(); },
      onWorkPage: page => { state.workPage = page; this.host.render(); },
      onInboxFilter: (key, value) => { state.inbox[key] = value; if (key !== 'page') state.inbox.page = 1; this.host.render(); },
      onInboxOpen: (id, key) => this.openReview(id, key),
      onFollowUpField: (key, value) => { if (state.followUpDraft) state.followUpDraft[key] = value; },
      onFollowUpSave: () => this.saveFollowUp(),
      onFollowUpReload: () => { if (state.selectedInboxReview) this.openReview(state.selectedInboxReview.propertyId, reviewKey(state.selectedInboxReview)); },
      onLinkTask: (id, department) => this.linkTask(id, department),
      onOpenLinkedTask: id => this.openTask(id)
    };
  }
}
