import { describe, test, assert } from '../../test-harness.js';
import {
  canAccessApplication,
  getAccessEntryApps,
  isApprovedAccessEntry
} from '../../../js/shared/access-control.js';

describe('Access control', () => {
  test('rejects missing access entries', () => {
    assert.equal(isApprovedAccessEntry(null), false);
    assert.equal(canAccessApplication(null, 'reservations'), false);
  });

  test('treats missing allowedApps as no application access', () => {
    const entry = { roles: [] };
    assert.deepEqual(getAccessEntryApps(entry), []);
    assert.equal(canAccessApplication(entry, 'welcomePacks'), false);
  });

  test('allows only explicitly granted applications for regular users', () => {
    const entry = { roles: ['employee'], allowedApps: ['welcomePacks'] };
    assert.equal(canAccessApplication(entry, 'welcomePacks'), true);
    assert.equal(canAccessApplication(entry, 'owners'), false);
  });

  test('allows privileged roles across applications', () => {
    const entry = { roles: ['manager'], allowedApps: [] };
    assert.equal(canAccessApplication(entry, 'owners'), true);
  });
});
