/**
 * SalesLink - Legacy Tenant ID Inventory & Backfill Utility (Phase 0.3 & 0.4)
 * 
 * Can be pasted directly into DevTools Console on https://saleslink.in (while logged in as Super Admin)
 * OR executed via Node.js with Firebase credentials.
 * 
 * Safely inspects and optionally backfills `tenantId` on legacy `users` and `loanFiles` documents.
 */

export async function runTenantInventory({ dryRun = true } = {}) {
    console.log(`[SalesLink] Starting Legacy Tenant ID Inventory (mode: ${dryRun ? 'DRY-RUN' : 'LIVE BACKFILL'})...`);

    // In browser, db and Firestore SDK are available on window or app scope
    const firestore = window.db || (await import('./js/db.js'));
    const { collection, getDocs, doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js");
    const rawDb = (await import('./js/firebase-config.js')).db;

    // 1. Fetch all workspaces to map valid branches/tenants
    console.log('[1/4] Fetching workspaces...');
    const wsSnap = await getDocs(collection(rawDb, 'workspaces'));
    const workspaces = [];
    const wsByManagerEmail = new Map();
    const wsById = new Map();

    wsSnap.forEach(d => {
        const data = { id: d.id, ...d.data() };
        workspaces.push(data);
        wsById.set(d.id, data);
        if (data.managerEmail) {
            wsByManagerEmail.set(data.managerEmail.toLowerCase().trim(), data.id);
        }
    });
    console.log(`Found ${workspaces.length} workspace(s).`);

    // 2. Scan users without tenantId
    console.log('[2/4] Scanning users for missing tenantId...');
    const usersSnap = await getDocs(collection(rawDb, 'users'));
    const legacyUsers = [];
    const userTenantMap = new Map();

    usersSnap.forEach(d => {
        const u = { id: d.id, ...d.data() };
        if (u.tenantId) {
            userTenantMap.set(u.id, u.tenantId);
            if (u.email) userTenantMap.set(u.email.toLowerCase().trim(), u.tenantId);
        } else {
            // Super admins are expected to not have tenantId (global scope)
            if (u.role === 'super_admin') {
                return;
            }
            legacyUsers.push(u);
        }
    });

    console.log(`Found ${legacyUsers.length} legacy user(s) lacking tenantId.`);

    // 3. Scan loanFiles without tenantId
    console.log('[3/4] Scanning loanFiles for missing tenantId...');
    const filesSnap = await getDocs(collection(rawDb, 'loanFiles'));
    const legacyFiles = [];

    filesSnap.forEach(d => {
        const f = { id: d.id, ...d.data() };
        if (!f.tenantId) {
            legacyFiles.push(f);
        }
    });

    console.log(`Found ${legacyFiles.length} legacy loan file(s) lacking tenantId.`);

    // 4. Match & Report
    console.log('\n--- INVENTORY REPORT ---');
    console.log(`Total Workspaces: ${workspaces.length}`);
    console.log(`Legacy Users without tenantId: ${legacyUsers.length}`);
    console.log(`Legacy Loan Files without tenantId: ${legacyFiles.length}`);

    // Map legacy users
    const userUpdates = [];
    for (const u of legacyUsers) {
        let matchedTenant = null;
        if (u.workspaceId && wsById.has(u.workspaceId)) {
            matchedTenant = u.workspaceId;
        } else if (u.email && wsByManagerEmail.has(u.email.toLowerCase().trim())) {
            matchedTenant = wsByManagerEmail.get(u.email.toLowerCase().trim());
        } else if (u.branchName) {
            const match = workspaces.find(w => (w.branchName || w.name || '').toLowerCase() === u.branchName.toLowerCase());
            if (match) matchedTenant = match.id;
        }

        userUpdates.push({
            id: u.id,
            email: u.email,
            name: u.name,
            role: u.role,
            matchedTenantId: matchedTenant
        });
        if (matchedTenant) {
            userTenantMap.set(u.id, matchedTenant);
            if (u.email) userTenantMap.set(u.email.toLowerCase().trim(), matchedTenant);
        }
    }

    // Map legacy files
    const fileUpdates = [];
    for (const f of legacyFiles) {
        let matchedTenant = null;
        if (f.roId && userTenantMap.has(f.roId)) {
            matchedTenant = userTenantMap.get(f.roId);
        } else if (f.userEmail && userTenantMap.has(f.userEmail.toLowerCase().trim())) {
            matchedTenant = userTenantMap.get(f.userEmail.toLowerCase().trim());
        } else if (f.dseId && userTenantMap.has(f.dseId)) {
            matchedTenant = userTenantMap.get(f.dseId);
        }

        fileUpdates.push({
            id: f.id,
            customerName: f.customerName,
            roName: f.roName,
            matchedTenantId: matchedTenant
        });
    }

    console.table(userUpdates);
    console.table(fileUpdates);

    if (dryRun) {
        console.log('\n[DRY RUN COMPLETE] No records were modified. Pass { dryRun: false } to apply updates.');
        return { legacyUsers, legacyFiles, userUpdates, fileUpdates };
    }

    // Apply backfill
    console.log('\n[APPLYING BACKFILL] Writing tenantId to matched records...');
    let usersUpdated = 0;
    for (const u of userUpdates) {
        if (u.matchedTenantId) {
            await updateDoc(doc(rawDb, 'users', u.id), {
                tenantId: u.matchedTenantId,
                updatedAt: new Date().toISOString(),
                _backfilledAt: new Date().toISOString()
            });
            usersUpdated++;
        }
    }

    let filesUpdated = 0;
    for (const f of fileUpdates) {
        if (f.matchedTenantId) {
            await updateDoc(doc(rawDb, 'loanFiles', f.id), {
                tenantId: f.matchedTenantId,
                updatedAt: new Date().toISOString(),
                _backfilledAt: new Date().toISOString()
            });
            filesUpdated++;
        }
    }

    console.log(`[BACKFILL COMPLETE] Updated ${usersUpdated}/${userUpdates.length} users and ${filesUpdated}/${fileUpdates.length} loan files.`);
    return { usersUpdated, filesUpdated };
}

if (typeof window !== 'undefined') {
    window.runTenantInventory = runTenantInventory;
    console.log('[SalesLink] Utility loaded. Run `await runTenantInventory({ dryRun: true })` in console.');
}
