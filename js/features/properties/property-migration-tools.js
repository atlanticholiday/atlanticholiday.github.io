function sleep(delayMs) {
    return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function checkAndMigrateUserProperties({
    db,
    getPropertiesManager = () => null,
    firestore,
    waitDelayMs = 100,
    maxWaitIterations = 30,
    maxUsersToCheck = 10
}) {
    if (!db) {
        console.log('Database not available for auto-migration');
        return;
    }

    const { collection, getDocs, addDoc } = firestore;

    try {
        console.log('[FIRESTORE READ TRACKING] Starting migration check...');
        let totalReads = 0;
        let existingProperties = [];
        let waitCount = 0;

        while (waitCount < maxWaitIterations) {
            const propertiesManager = getPropertiesManager();
            if (propertiesManager?.properties) {
                existingProperties = propertiesManager.properties;
                if (existingProperties.length > 0) {
                    break;
                }
            }

            await sleep(waitDelayMs);
            waitCount += 1;
        }

        if (existingProperties.length === 0) {
            const propertiesManager = getPropertiesManager();
            existingProperties = propertiesManager?.properties ?? [];
        }

        if (existingProperties.length > 0) {
            console.log(`[OPTIMIZATION] Using existing PropertiesManager data: ${existingProperties.length} properties (0 additional reads)`);
        } else {
            console.log('[OPTIMIZATION] PropertiesManager data not available, falling back to direct query');
            const existingPropertiesRef = collection(db, 'properties');
            const existingSnapshots = await getDocs(existingPropertiesRef);
            const migrationReadCount = existingSnapshots.docs.length || 1;
            totalReads += migrationReadCount;
            existingProperties = existingSnapshots.docs.map((docSnapshot) => docSnapshot.data());
            console.log(`[FIRESTORE READ] Found ${existingProperties.length} existing properties (${totalReads} reads so far)`);
        }

        if (existingProperties.length >= 10) {
            console.log(`[FIRESTORE READ TRACKING] Migration skipped - ${existingProperties.length} properties exist, Total reads: ${totalReads}`);
            return;
        }

        try {
            console.log('[PERMISSION CHECK] Testing access to users collection...');
            await getDocs(collection(db, 'users'));
            console.log('[PERMISSION CHECK] Access granted to users collection');
        } catch (permissionError) {
            console.log('[PERMISSION CHECK] No access to users collection, skipping migration:', permissionError.message);
            console.log(`[FIRESTORE READ TRACKING] Migration skipped due to permissions - Total reads: ${totalReads}`);
            return;
        }

        const usersRef = collection(db, 'users');
        const userSnapshots = await getDocs(usersRef);
        totalReads += userSnapshots.docs.length || 1;

        console.log(`[FIRESTORE READ] Found ${userSnapshots.docs.length} user collections (${totalReads} reads so far)`);

        if (userSnapshots.docs.length > maxUsersToCheck) {
            console.log(`Limited migration check to first ${maxUsersToCheck} users to prevent excessive reads`);
        }

        const usersToCheck = userSnapshots.docs.slice(0, maxUsersToCheck);
        let totalMigrated = 0;

        for (const userDoc of usersToCheck) {
            const userIdToCheck = userDoc.id;

            try {
                const userPropertiesRef = collection(db, `users/${userIdToCheck}/properties`);
                const propertySnapshots = await getDocs(userPropertiesRef);
                totalReads += propertySnapshots.docs.length || 1;

                console.log(`[FIRESTORE READ] User ${userIdToCheck}: ${propertySnapshots.docs.length} properties (${totalReads} reads so far)`);

                if (propertySnapshots.docs.length === 0) {
                    continue;
                }

                for (const propertyDoc of propertySnapshots.docs) {
                    try {
                        const propertyData = propertyDoc.data();
                        const alreadyExists = existingProperties.some((existingProperty) => (
                            existingProperty.name === propertyData.name
                            && existingProperty.location === propertyData.location
                            && existingProperty.migratedFrom === userIdToCheck
                        ));

                        if (alreadyExists) {
                            continue;
                        }

                        await addDoc(collection(db, 'properties'), {
                            ...propertyData,
                            migratedFrom: userIdToCheck,
                            migratedAt: new Date(),
                            autoMigrated: true
                        });

                        existingProperties.push({
                            ...propertyData,
                            migratedFrom: userIdToCheck
                        });
                        totalMigrated += 1;
                    } catch (error) {
                        console.error(`Error auto-migrating property ${propertyDoc.id}:`, error);
                    }
                }
            } catch (error) {
                console.log(`No properties collection for user ${userIdToCheck} or access denied`);
            }
        }

        if (totalMigrated > 0) {
            console.log(`Auto-migration complete. Migrated ${totalMigrated} properties total to shared collection`);
            const propertiesManager = getPropertiesManager();
            if (propertiesManager) {
                setTimeout(() => {
                    propertiesManager.listenForPropertyChanges();
                }, 500);
            }
            return;
        }

        console.log('No new properties to migrate - all users are using shared collection');
    } catch (error) {
        console.error('Auto-migration failed:', error);
    }
}

export function registerPropertyMigrationDebugTools({
    windowRef = window,
    db,
    getPropertiesManager = () => null,
    firestore
}) {
    const { collection, getDocs } = firestore;

    windowRef.migratePropertiesToShared = async function migratePropertiesToShared() {
        console.warn('[MIGRATION DISABLED] This function has been disabled to prevent excessive Firestore reads.');
        console.warn('If you need to migrate properties, use the auto-migration feature that runs once per session.');
        return { success: false, error: 'Migration disabled to prevent excessive reads' };
    };

    windowRef.checkPropertiesForMigration = async function checkPropertiesForMigration() {
        console.warn('[DRY RUN DISABLED] This function has been disabled to prevent excessive Firestore reads.');
        console.warn('Use the console logs from auto-migration instead for information about migrations.');
        return { success: false, error: 'Dry run disabled to prevent excessive reads' };
    };

    windowRef.refreshPropertiesView = function refreshPropertiesView() {
        const propertiesManager = getPropertiesManager();
        if (!propertiesManager) {
            console.error('Properties manager not initialized. Please log in first.');
            return;
        }

        propertiesManager.listenForPropertyChanges();
    };

    windowRef.checkSharedProperties = async function checkSharedProperties() {
        if (!db) {
            console.error('Database not initialized. Please log in first.');
            return;
        }

        try {
            const sharedPropertiesRef = collection(db, 'properties');
            const snapshot = await getDocs(sharedPropertiesRef);

            console.log(`Found ${snapshot.docs.length} properties in shared collection:`);
            snapshot.docs.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                console.log(`  ${data.name} - ${data.location} (ID: ${docSnapshot.id})`);
            });

            if (snapshot.docs.length === 0) {
                console.log('No properties found in shared collection.');
            }
        } catch (error) {
            console.error('Error checking shared properties:', error);
        }
    };
}
