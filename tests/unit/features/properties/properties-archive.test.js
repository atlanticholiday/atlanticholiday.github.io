import { describe, test, assert } from '../../../test-harness.js';
import { PropertiesManager } from '../../../../js/features/properties/properties-manager.js';
import { compareAlojamentosProperties, parseAhWorkbookImport } from '../../../../js/features/properties/property-import-utils.js';

describe('PropertiesManager - Archiving & Import Prevention', () => {
    test('isPropertyArchived correctly identifies archived properties', () => {
        const pm = new PropertiesManager(null);

        assert.equal(pm.isPropertyArchived(null), false);
        assert.equal(pm.isPropertyArchived({ name: 'Active Villa' }), false);
        assert.equal(pm.isPropertyArchived({ name: 'Active Flat', status: 'available' }), false);
        assert.equal(pm.isPropertyArchived({ name: 'Archived Villa', archived: true }), true);
        assert.equal(pm.isPropertyArchived({ name: 'Archived Flat', status: 'archived' }), true);
        assert.equal(pm.isPropertyArchived({ name: 'Both Villa', archived: true, status: 'archived' }), true);
    });

    test('archiveProperty and unarchiveProperty update property documents', async () => {
        const pm = new PropertiesManager(null);
        const updates = [];
        pm.updateProperty = async (id, data) => {
            updates.push({ id, data });
        };

        await pm.archiveProperty('prop-1');
        assert.equal(updates.length, 1);
        assert.equal(updates[0].id, 'prop-1');
        assert.equal(updates[0].data.archived, true);
        assert.equal(updates[0].data.status, 'archived');
        assert.ok(updates[0].data.archivedAt instanceof Date);

        await pm.unarchiveProperty('prop-1');
        assert.equal(updates.length, 2);
        assert.equal(updates[1].id, 'prop-1');
        assert.equal(updates[1].data.archived, false);
        assert.equal(updates[1].data.status, 'available');
        assert.ok(updates[1].data.unarchivedAt instanceof Date);
    });

    test('importFromGoogleSheets strictly skips archived properties without creating or updating', async () => {
        const added = [];
        const updated = [];

        const pm = new PropertiesManager(null, {
            fetchPropertiesFromGoogleSheet: async () => ({
                properties: [
                    { name: 'Active Apartment', location: 'Funchal New', typology: 'T2', type: 'apartment', rooms: 2 },
                    { name: 'Archived House', location: 'Calheta Updated', typology: 'V3', type: 'villa', rooms: 3 },
                    { name: 'Brand New Place', location: 'Machico', typology: 'T1', type: 'apartment', rooms: 1 }
                ],
                errors: []
            })
        });

        pm.properties = [
            { id: 'p1', name: 'Active Apartment', location: 'Funchal Old', typology: 'T2', type: 'apartment', rooms: 2 },
            { id: 'p2', name: 'Archived House', location: 'Calheta Old', typology: 'V3', type: 'villa', rooms: 3, archived: true, status: 'archived' }
        ];

        pm.addProperty = async (data) => {
            added.push(data);
            return 'new-id';
        };
        pm.updateProperty = async (id, data) => {
            updated.push({ id, data });
        };

        const result = await pm.importFromGoogleSheets();

        // 1 created (Brand New Place), 1 updated (Active Apartment), 0 unchanged, 1 skippedArchived (Archived House)
        assert.equal(result.created, 1);
        assert.equal(result.updated, 1);
        assert.equal(result.skippedArchived, 1);
        assert.equal(result.successful, 2);

        // Verify that Archived House was NOT added and NOT updated
        assert.equal(added.length, 1);
        assert.equal(added[0].name, 'Brand New Place');

        assert.equal(updated.length, 1);
        assert.equal(updated[0].id, 'p1');
        assert.equal(updated[0].data.location, 'Funchal New');
    });

    test('bulkAddProperties rejects archived properties with informative error message', async () => {
        const added = [];
        const pm = new PropertiesManager(null);

        pm.properties = [
            { id: 'p1', name: 'Existing Active', location: 'Funchal', typology: 'T1' },
            { id: 'p2', name: 'Existing Archived', location: 'Calheta', typology: 'V2', archived: true, status: 'archived' }
        ];

        pm.addProperty = async (data) => {
            added.push(data);
            return 'new-id';
        };

        const result = await pm.bulkAddProperties([
            { name: 'Existing Active', location: 'Funchal', typology: 'T1', type: 'apartment', rooms: 1 },
            { name: 'Existing Archived', location: 'Calheta', typology: 'V2', type: 'villa', rooms: 2 },
            { name: 'New Property', location: 'Machico', typology: 'T3', type: 'apartment', rooms: 3 }
        ]);

        assert.equal(result.successful, 1);
        assert.equal(result.failed, 2);
        assert.equal(result.skippedArchived, 1);
        assert.ok(result.errors.some((err) => err.includes('Property is archived and cannot be imported')));
        assert.ok(result.errors.some((err) => err.includes('Already exists')));
        assert.equal(added.length, 1);
        assert.equal(added[0].name, 'New Property');
    });

    test('applyFiltersAndSort filters by archive status', () => {
        const pm = new PropertiesManager(null);
        pm.properties = [
            { id: 'p1', name: 'Active Apartment', location: 'Funchal', type: 'apartment', rooms: 2 },
            { id: 'p2', name: 'Archived Villa', location: 'Calheta', type: 'villa', rooms: 3, archived: true, status: 'archived' }
        ];

        // Default: active only
        pm.currentArchiveFilter = 'active';
        pm.applyFiltersAndSort();
        assert.equal(pm.filteredProperties.length, 1);
        assert.equal(pm.filteredProperties[0].name, 'Active Apartment');

        // Archived only
        pm.currentArchiveFilter = 'archived';
        pm.applyFiltersAndSort();
        assert.equal(pm.filteredProperties.length, 1);
        assert.equal(pm.filteredProperties[0].name, 'Archived Villa');

        // All properties
        pm.currentArchiveFilter = 'all';
        pm.applyFiltersAndSort();
        assert.equal(pm.filteredProperties.length, 2);
    });

    test('compareAlojamentosProperties and parseAhWorkbookImport skip archived properties', () => {
        const comparison = compareAlojamentosProperties(
            [
                { name: 'Active Loft', location: 'Funchal', typology: 'T1' },
                { name: 'Archived House', location: 'Machico', typology: 'T2', archived: true, status: 'archived' }
            ],
            [
                { name: 'Active Loft', location: 'Funchal', typology: 'T1' },
                { name: 'Archived House', location: 'Machico', typology: 'T2' },
                { name: 'New Property', location: 'Calheta', typology: 'V3' }
            ]
        );

        // Archived House should NOT be treated as matched active property
        assert.equal(comparison.totals.matched, 1);
        assert.equal(comparison.matched[0].existing.name, 'Active Loft');
        // New Property is missing in app
        assert.equal(comparison.totals.missingInApp, 1);
        assert.equal(comparison.missingInApp[0].name, 'New Property');

        // Workbook import test
        const wbResult = parseAhWorkbookImport(
            {
                'Vídeos check-in': [
                    ['Alojamentos', 'Video de check-in', 'Link dos vídeos'],
                    ['Active Loft', 'Sim', 'https://example.com/active'],
                    ['Archived House', 'Sim', 'https://example.com/archived']
                ]
            },
            [
                { id: 'p1', name: 'Active Loft' },
                { id: 'p2', name: 'Archived House', archived: true, status: 'archived' }
            ]
        );

        // Only Active Loft should be queued for updates
        assert.equal(wbResult.updates.length, 1);
        assert.equal(wbResult.updates[0].property.id, 'p1');
    });
});
