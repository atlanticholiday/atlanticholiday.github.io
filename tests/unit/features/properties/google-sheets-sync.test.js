import { describe, test, assert } from '../../../test-harness.js';
import { parseGoogleSheetPropertyRows } from '../../../../js/features/properties/google-sheets-sync.js';

describe('Google Sheets property sync', () => {
    test('parses Alojamentos B3:D rows', () => {
        const result = parseGoogleSheetPropertyRows([
            ['Sunset Apartment', 'Downtown Lisboa', 'T 2'],
            ['Ocean View House', 'Porto Beach', 'v3']
        ]);

        assert.equal(result.properties.length, 2);
        assert.equal(result.properties[0].typology, 'T2');
        assert.equal(result.properties[0].type, 'apartment');
        assert.equal(result.properties[0].rooms, 2);
        assert.equal(result.properties[1].type, 'villa');
        assert.equal(result.errors.length, 0);
    });

    test('rejects malformed and duplicate rows without discarding valid rows', () => {
        const result = parseGoogleSheetPropertyRows([
            [],
            ['Casa Azul', 'Lagos', 'T1'],
            ['Casa Azul', 'Lagos', 'T1'],
            ['Missing type', 'Lisboa', '']
        ]);

        assert.equal(result.properties.length, 1);
        assert.equal(result.errors.length, 2);
        assert.ok(result.errors[0].includes('duplicate property name'));
        assert.ok(result.errors[1].includes('expected name, location'));
    });
});
