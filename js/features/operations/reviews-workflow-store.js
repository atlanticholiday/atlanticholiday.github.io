import { applyWorkChange, followUpId, reviewKey } from './reviews-workflow-utils.js';

// Reviews access is required to read internal notes; only management can write.
// One document per work item keeps edits independent; transactions reject stale forms.
export class ReviewsWorkflowStore {
  constructor(db, { getContext, canManage, sdk = null } = {}) {
    this.db = db; this.getContext = getContext; this.canManage = canManage; this.sdk = sdk;
    this.subscriptions = []; this.generation = 0;
  }
  async api() { return this.sdk || (this.sdk = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js')); }
  stop() { this.generation++; this.subscriptions.splice(0).forEach(unsubscribe => unsubscribe()); }
  async listen(onRecords, onTasks, onError, onDepartments = () => {}) {
    this.stop();
    const generation = this.generation, context = this.getContext?.();
    if (!this.db || !context?.uid) return;
    try {
      const api = await this.api();
      if (generation !== this.generation) return;
      const guard = fn => value => { if (generation === this.generation) fn(value); };
      this.subscriptions.push(api.onSnapshot(api.collection(this.db, 'reviewWorkflows'), guard(snapshot => onRecords(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))), guard(onError)));
      this.subscriptions.push(api.onSnapshot(api.collection(this.db, 'taskDepartments'), guard(snapshot => onDepartments(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))), guard(onError)));
      const tasks = api.collection(this.db, 'tasks');
      const taskQuery = this.canManage() ? tasks : api.query(tasks, api.where(new api.FieldPath('assigneeAccess', context.email.toLowerCase()), '==', true));
      this.subscriptions.push(api.onSnapshot(taskQuery, guard(snapshot => onTasks(snapshot.docs.map(d => ({ ...d.data(), id: d.id })))), guard(onError)));
    } catch (error) { if (generation === this.generation) onError(error); }
  }
  actor() {
    const context = this.getContext?.();
    if (!this.db || !context?.uid || !this.canManage?.()) throw new Error('readOnly');
    return { uid: context.uid, email: context.email || '', name: context.linkedEmployee?.name || context.email || '' };
  }
  async saveWork(draft) {
    const actor = this.actor(), api = await this.api(), ref = api.doc(this.db, 'reviewWorkflows', draft.id);
    return api.runTransaction(this.db, async transaction => {
      const snapshot = await transaction.get(ref), current = snapshot.exists() ? snapshot.data() : null;
      if ((current?.revision || 0) !== (draft.revision || 0)) throw new Error('conflict');
      const next = { ...applyWorkChange(current, draft, actor), reviewsWorkspace: true };
      if (this.actor().uid !== actor.uid) throw new Error('readOnly');
      transaction.set(ref, next);
      return next;
    });
  }
  async saveFollowUp(propertyId, review, draft) {
    const actor = this.actor(), api = await this.api(), id = await followUpId(propertyId, review);
    const ref = api.doc(this.db, 'reviewWorkflows', id);
    return api.runTransaction(this.db, async transaction => {
      const snapshot = await transaction.get(ref), current = snapshot.exists() ? snapshot.data() : null;
      if ((current?.revision || 0) !== (draft.revision || 0)) throw new Error('conflict');
      const now = new Date().toISOString();
      if (!['open', 'handled'].includes(draft.status)) throw new Error('invalidWork');
      const next = { id, recordType: 'followUp', reviewsWorkspace: true, propertyId, reviewKey: reviewKey(review),
        assigneeId: draft.assigneeId || '', assigneeName: draft.assigneeName || '', status: draft.status,
        updatedAt: now, updatedBy: actor, createdAt: current?.createdAt || now, createdBy: current?.createdBy || actor,
        revision: (current?.revision || 0) + 1,
        history: [...(current?.history || []), { at: now, actor, action: draft.status, note: String(draft.note || '').trim().slice(0, 8000), assigneeName: draft.assigneeName || '' }] };
      if (this.actor().uid !== actor.uid) throw new Error('readOnly');
      transaction.set(ref, next);
      return next;
    });
  }
  async linkTask(work, { taskId = '', departmentId = 'general', departmentName = 'General', assigneeAccess = {} } = {}) {
    const actor = this.actor(), api = await this.api();
    const workRef = api.doc(this.db, 'reviewWorkflows', work.id);
    const linkedId = taskId || work.id;
    const taskRef = api.doc(this.db, 'tasks', linkedId);
    return api.runTransaction(this.db, async transaction => {
      const workSnapshot = await transaction.get(workRef);
      const taskSnapshot = await transaction.get(taskRef);
      if (!workSnapshot.exists()) throw new Error('saveFirst');
      const current = workSnapshot.data();
      if (current.linkedTaskId) return current;
      if (current.revision !== work.revision) throw new Error('conflict');
      if (taskId && !taskSnapshot.exists()) throw new Error('taskUnavailable');
      if (!taskId && taskSnapshot.exists() && taskSnapshot.data().reviewImprovementId !== current.id) throw new Error('taskUnavailable');
      const now = new Date().toISOString();
      if (this.actor().uid !== actor.uid) throw new Error('readOnly');
      if (!taskSnapshot.exists()) transaction.set(taskRef, {
        title: current.title, description: `${current.propertyName}\n${(current.evidence || []).map(e => e.excerpt).join('\n\n')}`,
        departmentId, departmentName, section: 'Reviews & Ratings', status: 'todo', priority: current.priority, dueDate: current.dueDate,
        assigneeIds: current.assigneeId ? [current.assigneeId] : [], assignees: current.assigneeId ? [{ id: current.assigneeId, name: current.assigneeName }] : [],
        assigneeAccess, attachments: [], createdAt: now, createdBy: actor, updatedAt: now, updatedBy: actor, completedAt: '',
        reviewImprovementId: current.id, propertyId: current.propertyId
      });
      const next = { ...current, linkedTaskId: linkedId, updatedAt: now, updatedBy: actor, revision: current.revision + 1,
        history: [...current.history, { at: now, actor, action: 'linkedTask', taskId: linkedId, note: '' }] };
      transaction.set(workRef, next);
      return next;
    });
  }
}
