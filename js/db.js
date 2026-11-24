import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, limit, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const workspacesCol = collection(db, 'workspaces');
const usersCol = collection(db, 'users');
const filesCol = collection(db, 'loanFiles');
const invitationsCol = collection(db, 'invitations');
const publicLeadsCol = collection(db, 'publicLeads');

// --- Role Validation & Normalization ---
export const VALID_ROLES = ['super_admin', 'zsm', 'asm', 'sm', 'ro', 'dse'];

export const normaliseRole = (role) => {
    if (!role || typeof role !== 'string') return '';
    const clean = role.toLowerCase().trim();
    return VALID_ROLES.includes(clean) ? clean : clean;
};

// Helper to map snapshot to array with id
const mapSnapshot = (snapshot) => {
    return snapshot.docs
        .map(doc => {
            const data = { id: doc.id, ...doc.data() };
            if (data.role) data.role = normaliseRole(data.role);
            return data;
        })
        .filter(doc => !doc.deletedAt && doc.status !== 'deleted');
};

// --- Workspaces ---
export const addWorkspace = async (workspaceData) => {
    const docRef = await addDoc(workspacesCol, workspaceData);
    return docRef.id;
};

export const getWorkspace = async (id) => {
    const docRef = doc(db, 'workspaces', id);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...docSnap.data() };
};

export const getAllWorkspaces = async () => {
    const snapshot = await getDocs(workspacesCol);
    return mapSnapshot(snapshot);
};

export const updateWorkspace = async (id, updateData) => {
    const docRef = doc(db, 'workspaces', id);
    await updateDoc(docRef, updateData);
};

export const deleteWorkspace = async (id) => {
    const docRef = doc(db, 'workspaces', id);
    await deleteDoc(docRef);
};

export const getWorkspaceBySalesLinkId = async (salesLinkId) => {
    if (!salesLinkId) return null;
    try {
        const q = query(workspacesCol, where('salesLinkId', '==', salesLinkId.toUpperCase()), limit(1));
        const snap = await getDocs(q);
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch (e) {
        return null;
    }
};

export const getActiveWorkspaces = async () => {
    try {
        const q = query(workspacesCol, where('status', '==', 'active'));
        const snapshot = await getDocs(q);
        return mapSnapshot(snapshot);
    } catch (e) {
        console.warn("getActiveWorkspaces failed:", e);
        return [];
    }
};

// --- Users ---
export const getROUsersByTenant = async (tenantId) => {
    const q = query(usersCol, where('role', '==', 'ro'), where('tenantId', '==', tenantId));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
};

export const getUsersByTenant = async (tenantId) => {
    if (!tenantId) return [];
    try {
        const q = query(usersCol, where('tenantId', '==', tenantId));
        const snapshot = await getDocs(q);
        return mapSnapshot(snapshot);
    } catch (e) {
        console.warn("getUsersByTenant failed:", e);
        return [];
    }
};

export const getSMUserByTenant = async (tenantId) => {
    if (!tenantId) return null;
    try {
        const q = query(usersCol, where('tenantId', '==', tenantId), where('role', 'in', ['sm', 'admin']), limit(1));
        const snap = await getDocs(q);
        if (!snap.empty) {
            const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
            if (data.role) data.role = normaliseRole(data.role);
            return data;
        }
    } catch (e) {
        console.warn("getSMUserByTenant query failed:", e);
    }
    return null;
};

export const getUsersByRole = async (role) => {
    if (!role) return [];
    try {
        const q = query(usersCol, where('role', '==', normaliseRole(role)));
        const snapshot = await getDocs(q);
        return mapSnapshot(snapshot);
    } catch (e) {
        console.warn("getUsersByRole failed:", e);
        return [];
    }
};

// --- Identity Directory (Firestore Security Authorization) ---
export const upsertDirectoryEntry = async (uid, payload) => {
    if (!uid) return;
    try {
        const docRef = doc(db, 'directory', uid);
        await setDoc(docRef, {
            ...payload,
            updatedAt: new Date().toISOString()
        }, { merge: true });
    } catch (e) {
        console.warn("Could not upsert directory entry:", e);
    }
};

export const addUser = async (userData) => {
    const data = { ...userData };
    if (data.role) data.role = normaliseRole(data.role);
    const docRef = await addDoc(usersCol, data);
    return docRef.id;
};

export const getAllUsers = async () => {
    const snapshot = await getDocs(usersCol);
    return mapSnapshot(snapshot);
};

import { signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { auth, googleProvider } from "./firebase-config.js";
export { auth, onAuthStateChanged, signOut };

export const loginWithGoogle = async () => {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    
    // Safety timeout after 120 seconds to prevent indefinite UI hang while giving ample time
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error("Sign-in timed out. If your desktop browser blocks Google popups, please use the Direct Sign-In option below."));
        }, 120000);
    });

    const result = await Promise.race([
        signInWithPopup(auth, googleProvider),
        timeoutPromise
    ]);
    return result.user;
};

export const loginWithRedirect = async () => {
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    await signInWithRedirect(auth, googleProvider);
};

export const checkRedirectResult = async () => {
    try {
        const result = await getRedirectResult(auth);
        return result?.user || null;
    } catch (e) {
        console.warn("Redirect check error:", e);
        return null;
    }
};

export const getUserByEmail = async (email) => {
    const q = query(usersCol, where('email', '==', email.toLowerCase()), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    if (data.role) data.role = normaliseRole(data.role);
    return data;
};

export const getUserByEmployeeCode = async (employeeCode) => {
    if (!employeeCode) return null;
    const clean = employeeCode.trim().toUpperCase();
    if (!clean) return null;
    try {
        const q = query(usersCol, where('employeeCode', '==', clean), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            if (data.role) data.role = normaliseRole(data.role);
            return data;
        }
    } catch (e) {
        console.warn("Index query for employeeCode failed:", e);
    }
    return null;
};

export const getUserByPhone = async (phone) => {
    if (!phone) return null;
    const cleanDigits = String(phone).replace(/\D/g, '').slice(-10);
    if (!cleanDigits || cleanDigits.length < 10) return null;
    try {
        const candidates = [cleanDigits, '+91' + cleanDigits, '91' + cleanDigits];
        const q = query(usersCol, where('phone', 'in', candidates), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            if (data.role) data.role = normaliseRole(data.role);
            return data;
        }
    } catch (e) {
        console.warn("Query for phone failed:", e);
    }
    return null;
};

export const getSupervisorNameForUser = async (user) => {
    if (!user) return 'another Sales Manager';
    if (user.supervisorName) return user.supervisorName;
    if (user.supervisorId) {
        try {
            const sup = await getUserById(user.supervisorId);
            if (sup && sup.name) return sup.name;
        } catch (e) {}
    }
    if (user.role === 'sm' || user.role === 'admin') {
        return user.name ? `${user.name} (Sales Manager)` : 'a Sales Manager';
    }
    if (user.tenantId) {
        try {
            const sm = await getSMUserByTenant(user.tenantId);
            if (sm && sm.name) return sm.name;
        } catch (e) {}
    }
    return 'another Sales Manager';
};

export const getUserById = async (id) => {
    if (!id) return null;
    try {
        const docRef = doc(db, 'users', id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return null;
        const data = { id: snap.id, ...snap.data() };
        if (data.role) data.role = normaliseRole(data.role);
        return data;
    } catch (e) {
        console.warn("Error fetching user by ID:", e);
        return null;
    }
};

export const onUserSnapshot = (userId, callback) => {
    if (!userId) return () => {};
    const docRef = doc(db, 'users', userId);
    return onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            callback({ id: docSnap.id, ...docSnap.data() });
        } else {
            callback(null);
        }
    }, (err) => {
        console.warn("User security snapshot error:", err);
    });
};

export const updateUser = async (id, updateData) => {
    const data = { ...updateData };
    if (data.role) data.role = normaliseRole(data.role);
    const docRef = doc(db, 'users', id);
    await updateDoc(docRef, data);
};

export const deleteUser = async (id, soft = true) => {
    const docRef = doc(db, 'users', id);
    if (soft) {
        await updateDoc(docRef, {
            status: 'deleted',
            deletedAt: new Date().toISOString()
        });
    } else {
        await deleteDoc(docRef);
    }
};

// --- Loan Files ---
// (Used by Super Admin)
export const getAllLoanFiles = async () => {
    const snapshot = await getDocs(filesCol);
    return mapSnapshot(snapshot);
};

export const getLoanFilesByTenant = async (tenantId) => {
    const q = query(filesCol, where('tenantId', '==', tenantId));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
};

export const getLoanFilesByRO = async (roId) => {
    const q = query(filesCol, where('roId', '==', roId));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
};

export const addLoanFile = async (fileData) => {
    await addDoc(filesCol, fileData);
};

export const updateLoanFile = async (id, updateData) => {
    const docRef = doc(db, 'loanFiles', id);
    await updateDoc(docRef, updateData);
};

export const deleteLoanFile = async (id, soft = true) => {
    const docRef = doc(db, 'loanFiles', id);
    if (soft) {
        await updateDoc(docRef, {
            status: 'Deleted',
            deletedAt: new Date().toISOString()
        });
    } else {
        await deleteDoc(docRef);
    }
};

export const logAuditEvent = async (eventData) => {
    try {
        await addDoc(collection(db, 'auditLog'), {
            ...eventData,
            createdAt: new Date().toISOString()
        });
    } catch (e) {
        console.warn("Failed to write audit log:", e);
    }
};

// --- Dealership & DSE Ecosystem Queries ---
export const getLoanFilesByDSE = async (dseId) => {
    if (!dseId) return [];
    try {
        const q = query(filesCol, where('dseId', '==', dseId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn("Index query for getLoanFilesByDSE failed:", e);
        return [];
    }
};

export const addPublicLead = async (leadData) => {
    const docRef = await addDoc(publicLeadsCol, leadData);
    return docRef.id;
};

export const getPublicLeadsByTenant = async (tenantId) => {
    if (!tenantId) return [];
    try {
        const q = query(publicLeadsCol, where('tenantId', '==', tenantId));
        const snapshot = await getDocs(q);
        return mapSnapshot(snapshot);
    } catch (e) {
        console.warn("getPublicLeadsByTenant failed:", e);
        return [];
    }
};

export const getInboundShowroomFilesByTenant = async (tenantId) => {
    if (!tenantId) return [];
    try {
        const [loanFiles, publicLeads] = await Promise.all([
            getLoanFilesByTenant(tenantId),
            getPublicLeadsByTenant(tenantId)
        ]);
        const inboundLoanFiles = loanFiles.filter(f => f.origin === 'dealer_portal' || f.origin === 'showroom_qr' || f.origin === 'qr_inbound' || (f.allocationStatus && f.allocationStatus.includes('sm_dispatch')));
        
        // Merge pending publicLeads that have not yet been promoted to loanFiles
        const existingAppIds = new Set(loanFiles.map(f => f.appId).filter(Boolean));
        const unpromotedLeads = publicLeads
            .filter(l => !existingAppIds.has(l.appId) && l.status !== 'promoted' && l.status !== 'deleted')
            .map(l => ({ ...l, isPublicLead: true, origin: 'showroom_qr', allocationStatus: 'pending_sm_dispatch', status: 'Inbound' }));

        return [...unpromotedLeads, ...inboundLoanFiles];
    } catch (e) {
        console.warn("Failed to get inbound showroom files:", e);
        return [];
    }
};

export const assignInboundFileToRO = async (fileId, roUser, fileData = null) => {
    if (!fileId || !roUser) return;
    if (fileData && fileData.isPublicLead) {
        // Promote public lead into loanFiles
        const cleanFile = { ...fileData };
        delete cleanFile.id;
        delete cleanFile.isPublicLead;
        cleanFile.roId = roUser.id;
        cleanFile.roName = roUser.name;
        cleanFile.allocationStatus = 'dispatched_to_ro';
        cleanFile.status = 'Login';
        cleanFile.allocatedAt = new Date().toISOString();
        cleanFile.updatedAt = new Date().toISOString();
        await addDoc(filesCol, cleanFile);
        try {
            await updateDoc(doc(db, 'publicLeads', fileId), { status: 'promoted', updatedAt: new Date().toISOString() });
        } catch (e) {}
        return;
    }
    const docRef = doc(db, 'loanFiles', fileId);
    await updateDoc(docRef, {
        roId: roUser.id,
        roName: roUser.name,
        allocationStatus: 'dispatched_to_ro',
        status: 'Login',
        allocatedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
};

// --- System ---
export const getAnnouncement = async () => {
    const docRef = doc(db, 'system', 'announcement');
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return '';
    return docSnap.data().text || '';
};

export const setAnnouncement = async (text) => {
    const docRef = doc(db, 'system', 'announcement');
    await setDoc(docRef, { text, updatedAt: new Date().toISOString() });
};

export const getSystemOwners = async () => {
    try {
        const docRef = doc(db, 'system', 'owners');
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && Array.isArray(docSnap.data().emails)) {
            return docSnap.data().emails.map(e => String(e).toLowerCase().trim());
        }
    } catch (e) {
        console.warn('Could not fetch system owners, fallback to empty list', e);
    }
    return [];
};

export const addEODReport = async (reportData) => {
    try {
        const docRef = await addDoc(collection(db, 'eod_reports'), reportData);
        return docRef.id;
    } catch (e) {
        console.error('Error adding EOD report: ', e);
        throw e;
    }
};

export const updateEODReport = async (id, reportData) => {
    try {
        const docRef = doc(db, 'eod_reports', id);
        await updateDoc(docRef, reportData);
    } catch (e) {
        console.error('Error updating EOD report: ', e);
        throw e;
    }
};

export const getEODReportsByTenant = async (tenantId) => {
    try {
        const q = query(collection(db, 'eod_reports'), where('tenantId', '==', tenantId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
        console.error('Error getting EOD reports: ', e);
        return [];
    }
};

// --- Hierarchy & Invitations & ID Generators ---

export const generateSecureRandomCode = (len = 6) => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(len);
        crypto.getRandomValues(bytes);
        for (let i = 0; i < len; i++) {
            result += chars.charAt(bytes[i] % chars.length);
        }
    } else {
        for (let i = 0; i < len; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    return result;
};

export const generateSalesLinkId = (role = 'ro') => {
    const cleanRole = (role || 'ro').toUpperCase();
    const code = generateSecureRandomCode(6);
    return `SL-${cleanRole}-${code}`;
};

export const generateUniqueSalesLinkId = async (role = 'ro') => {
    for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateSalesLinkId(role);
        const existing = await getUserBySalesLinkId(candidate);
        if (!existing) return candidate;
    }
    const cleanRole = (role || 'ro').toUpperCase();
    return `SL-${cleanRole}-${generateSecureRandomCode(8)}`;
};

export const generateUniqueAppId = async (prefix = 'ALA') => {
    const chars = '0123456789';
    for (let attempt = 0; attempt < 5; attempt++) {
        let code = '';
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const bytes = new Uint8Array(6);
            crypto.getRandomValues(bytes);
            for (let i = 0; i < 6; i++) {
                code += chars.charAt(bytes[i] % 10);
            }
        } else {
            code = String(Math.floor(100000 + Math.random() * 900000));
        }
        const candidate = `${prefix}${code}`;
        try {
            const q = query(filesCol, where('appId', '==', candidate), limit(1));
            const snap = await getDocs(q);
            if (snap.empty) return candidate;
        } catch (e) {
            return candidate;
        }
    }
    return `${prefix}${Date.now().toString().slice(-6)}`;
};

export const getUserBySalesLinkId = async (salesLinkId) => {
    if (!salesLinkId) return null;
    const cleanId = salesLinkId.trim().toUpperCase();
    const q = query(usersCol, where('salesLinkId', '==', cleanId), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    if (data.role) data.role = normaliseRole(data.role);
    return data;
};

export const getUsersBySupervisor = async (supervisorId) => {
    if (!supervisorId) return [];
    const q = query(usersCol, where('supervisorId', '==', supervisorId));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
};

export const getLoanFilesByTenantIds = async (tenantIds) => {
    if (!tenantIds || tenantIds.length === 0) return [];
    const uniqueIds = Array.from(new Set(tenantIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    
    // Firestore 'in' query allows up to 30 items per batch
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 30) {
        chunks.push(uniqueIds.slice(i, i + 30));
    }
    const results = [];
    for (const chunk of chunks) {
        const q = query(filesCol, where('tenantId', 'in', chunk));
        const snapshot = await getDocs(q);
        results.push(...mapSnapshot(snapshot));
    }
    return results;
};

export const getEODReportsByTenantIds = async (tenantIds) => {
    if (!tenantIds || tenantIds.length === 0) return [];
    const uniqueIds = Array.from(new Set(tenantIds.filter(Boolean)));
    if (uniqueIds.length === 0) return [];
    
    const chunks = [];
    for (let i = 0; i < uniqueIds.length; i += 30) {
        chunks.push(uniqueIds.slice(i, i + 30));
    }
    const results = [];
    for (const chunk of chunks) {
        const q = query(collection(db, 'eod_reports'), where('tenantId', 'in', chunk));
        const snapshot = await getDocs(q);
        results.push(...snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }
    return results;
};

export const createInvitation = async (inviteData) => {
    const targetEmail = (inviteData.toEmail || '').trim().toLowerCase();
    const targetPhone = (inviteData.toPhone || '').replace(/\D/g, '').slice(-10);
    const targetEmp = (inviteData.toEmployeeCode || '').trim().toUpperCase();
    const targetSalesLinkId = (inviteData.toSalesLinkId || '').trim().toUpperCase();

    if (!targetEmail && !targetPhone && !targetEmp && !targetSalesLinkId) {
        throw new Error('Please provide a valid Phone Number, Email, Employee ID, or SalesLink ID.');
    }

    // Check if target user exists in database and is already supervised
    let targetUser = null;
    if (targetEmail) targetUser = await getUserByEmail(targetEmail);
    if (!targetUser && targetSalesLinkId) targetUser = await getUserBySalesLinkId(targetSalesLinkId);
    if (!targetUser && targetPhone) targetUser = await getUserByPhone(targetPhone);
    if (!targetUser && targetEmp) targetUser = await getUserByEmployeeCode(targetEmp);

    if (targetUser && targetUser.supervisorId && targetUser.supervisorId !== inviteData.fromUserId) {
        let mgrName = targetUser.supervisorName || 'another Area Sales Manager';
        throw new Error(`This manager is already reporting to ${mgrName}. They must disconnect first before joining your area.`);
    }

    const payload = {
        fromUserId: inviteData.fromUserId,
        fromName: inviteData.fromName || '',
        fromEmail: (inviteData.fromEmail || '').toLowerCase(),
        fromRole: inviteData.fromRole || 'asm',
        fromSalesLinkId: inviteData.fromSalesLinkId || '',
        toEmail: targetEmail || '',
        toPhone: targetPhone || '',
        toEmployeeCode: targetEmp || '',
        toSalesLinkId: targetSalesLinkId || '',
        toRole: inviteData.toRole || 'sm',
        territoryName: inviteData.territoryName || '',
        bankName: inviteData.bankName || '',
        division: inviteData.division || '',
        status: 'pending',
        createdAt: new Date().toISOString()
    };
    
    const docRef = await addDoc(invitationsCol, payload);
    return docRef.id;
};

export const getPendingInvitationsForEmail = async (email, phone, salesLinkId, employeeCode) => {
    if (!email && !phone && !salesLinkId && !employeeCode) return [];
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPhone = (phone || '').replace(/\D/g, '').slice(-10);
    const cleanId = (salesLinkId || '').trim().toUpperCase();
    const cleanEmp = (employeeCode || '').trim().toUpperCase();

    try {
        const q = query(invitationsCol, where('status', '==', 'pending'));
        const snapshot = await getDocs(q);
        const allPending = mapSnapshot(snapshot);

        return allPending.filter(inv => {
            const invEmail = (inv.toEmail || '').trim().toLowerCase();
            const invPhone = (inv.toPhone || '').replace(/\D/g, '').slice(-10);
            const invId = (inv.toSalesLinkId || '').trim().toUpperCase();
            const invEmp = (inv.toEmployeeCode || '').trim().toUpperCase();

            if (cleanEmail && invEmail && cleanEmail === invEmail) return true;
            if (cleanPhone && invPhone && cleanPhone === invPhone) return true;
            if (cleanId && invId && cleanId === invId) return true;
            if (cleanEmp && invEmp && cleanEmp === invEmp) return true;
            return false;
        });
    } catch (e) {
        console.warn("Could not fetch pending invitations:", e);
        return [];
    }
};

export const getInvitationsSentByUser = async (userId) => {
    if (!userId) return [];
    const q = query(invitationsCol, where('fromUserId', '==', userId));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
};

export const acceptInvitation = async (invitationId, recipientUserId) => {
    const invRef = doc(db, 'invitations', invitationId);
    const invSnap = await getDoc(invRef);
    if (!invSnap.exists()) throw new Error('Invitation not found.');
    
    const inv = invSnap.data();
    if (inv.status !== 'pending') {
        throw new Error(`Invitation is no longer pending (status: ${inv.status}).`);
    }

    const now = new Date().toISOString();
    
    // 1. Mark invitation as accepted
    await updateDoc(invRef, {
        status: 'accepted',
        respondedAt: now,
        acceptedByUserId: recipientUserId
    });

    // 2. Link supervisor on subordinate user
    const userRef = doc(db, 'users', recipientUserId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : null;

    const userUpdate = {
        supervisorId: inv.fromUserId,
        supervisorName: inv.fromName || '',
        supervisorRole: inv.fromRole || 'asm',
        supervisorSalesLinkId: inv.fromSalesLinkId || '',
        updatedAt: now
    };
    if (inv.fromRole === 'asm') {
        userUpdate.asmId = inv.fromUserId;
    } else if (inv.fromRole === 'zsm') {
        userUpdate.zsmId = inv.fromUserId;
    }
    await updateDoc(userRef, userUpdate);

    // 3. If subordinate is an SM with a workspace, link workspace to ASM/ZSM as well
    if (userData && userData.tenantId) {
        try {
            const wsRef = doc(db, 'workspaces', userData.tenantId);
            const wsUpdate = { updatedAt: now };
            if (inv.fromRole === 'asm') wsUpdate.asmId = inv.fromUserId;
            if (inv.fromRole === 'zsm') wsUpdate.zsmId = inv.fromUserId;
            await updateDoc(wsRef, wsUpdate);
        } catch (e) {
            console.warn('Could not update workspace with supervisor ID:', e);
        }
    }
    
    return true;
};

export const declineInvitation = async (invitationId) => {
    const invRef = doc(db, 'invitations', invitationId);
    await updateDoc(invRef, {
        status: 'declined',
        respondedAt: new Date().toISOString()
    });
    return true;
};

export const revokeInvitation = async (invitationId) => {
    const invRef = doc(db, 'invitations', invitationId);
    await updateDoc(invRef, {
        status: 'revoked',
        respondedAt: new Date().toISOString()
    });
    return true;
};

export const unlinkSupervisor = async (subordinateUserId) => {
    const userRef = doc(db, 'users', subordinateUserId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : null;

    await updateDoc(userRef, {
        supervisorId: null,
        supervisorName: null,
        supervisorRole: null,
        supervisorSalesLinkId: null,
        asmId: null,
        zsmId: null,
        updatedAt: new Date().toISOString()
    });

    if (userData && userData.tenantId) {
        try {
            const wsRef = doc(db, 'workspaces', userData.tenantId);
            await updateDoc(wsRef, {
                asmId: null,
                zsmId: null,
                updatedAt: new Date().toISOString()
            });
        } catch (e) {
            console.warn('Could not unlink supervisor from workspace:', e);
        }
    }
    return true;
};

export const linkSmToSupervisor = async (smUserId, supervisorIdentifier, preferredMethod = null) => {
    if (!smUserId || !supervisorIdentifier) throw new Error("SM User ID and Supervisor Identifier are required.");

    const cleanIdentifier = supervisorIdentifier.trim();
    const supervisor = await findUserByAnyIdentifier(cleanIdentifier, preferredMethod);

    if (!supervisor) {
        throw new Error(`No Area Sales Manager found with "${supervisorIdentifier}". Please verify the Phone, Email, Employee ID, or SalesLink ID and try again.`);
    }

    if (supervisor.status === 'resigned' || supervisor.status === 'suspended' || supervisor.status === 'inactive') {
        throw new Error(`Account Inactive: "${supervisor.name || supervisor.email}" is marked as ${supervisor.status} and cannot supervise a branch hub.`);
    }

    if (supervisor.role === 'ro') {
        throw new Error(`Role Conflict: "${supervisor.name || supervisor.email}" is registered as a Relationship Officer (RO). Only Area Sales Managers (ASM) or Zonal Managers (ZSM) can supervise a branch hub.`);
    }

    if (supervisor.role === 'sm') {
        throw new Error(`Role Conflict: "${supervisor.name || supervisor.email}" is registered as a Branch Sales Manager (SM). A branch hub cannot report to another Branch Sales Manager.`);
    }

    if (supervisor.role !== 'asm' && supervisor.role !== 'zsm' && supervisor.role !== 'super_admin') {
        throw new Error(`User "${supervisor.name || supervisor.email}" has role "${supervisor.role}". Only Area Sales Managers (ASM) or Zonal Managers (ZSM) can supervise a branch hub.`);
    }

    if (supervisor.id === smUserId) {
        throw new Error("You cannot set yourself as your own supervisor.");
    }

    const now = new Date().toISOString();
    const smRef = doc(db, 'users', smUserId);
    const smSnap = await getDoc(smRef);
    if (!smSnap.exists()) throw new Error("SM user record not found in database.");
    const smData = smSnap.data();

    // Link supervisor on SM user
    const userUpdate = {
        supervisorId: supervisor.id,
        supervisorName: supervisor.name || 'Area Manager',
        supervisorRole: supervisor.role,
        supervisorSalesLinkId: supervisor.salesLinkId || '',
        updatedAt: now
    };
    if (supervisor.role === 'asm') {
        userUpdate.asmId = supervisor.id;
    } else if (supervisor.role === 'zsm') {
        userUpdate.zsmId = supervisor.id;
    }
    await updateDoc(smRef, userUpdate);

    // Link workspace to supervisor
    if (smData.tenantId) {
        try {
            const wsRef = doc(db, 'workspaces', smData.tenantId);
            const wsUpdate = { updatedAt: now };
            if (supervisor.role === 'asm') wsUpdate.asmId = supervisor.id;
            if (supervisor.role === 'zsm') wsUpdate.zsmId = supervisor.id;
            await updateDoc(wsRef, wsUpdate);
        } catch (e) {
            console.warn("Could not link workspace to supervisor:", e);
        }
    }

    // Record connection event in invitations collection for historical audit
    try {
        await addDoc(invitationsCol, {
            fromUserId: smUserId,
            fromName: smData.name || '',
            fromRole: smData.role || 'sm',
            fromSalesLinkId: smData.salesLinkId || '',
            toUserId: supervisor.id,
            toName: supervisor.name || '',
            toEmail: supervisor.email,
            toSalesLinkId: supervisor.salesLinkId || '',
            targetRole: supervisor.role,
            status: 'accepted',
            initiatedBy: 'sm',
            createdAt: now,
            respondedAt: now
        });
    } catch (e) {
        console.warn("Could not log invitation audit doc:", e);
    }

    return supervisor;
};

export const directConnectSupervisorToSm = async (supervisorUser, smUserId) => {
    if (!supervisorUser || !smUserId) throw new Error("Supervisor user and SM User ID are required.");

    if (supervisorUser.id === smUserId) {
        throw new Error("You cannot set yourself as your own supervisor.");
    }

    const smRef = doc(db, 'users', smUserId);
    const smSnap = await getDoc(smRef);
    if (!smSnap.exists()) throw new Error("Branch Sales Manager record not found in database.");
    const smData = smSnap.data();

    // Verify if already supervised by someone else
    if (smData.supervisorId && smData.supervisorId !== supervisorUser.id) {
        throw new Error(`This Sales Manager is already reporting to ${smData.supervisorName || 'another Area Manager'}. They must disconnect first.`);
    }

    const now = new Date().toISOString();

    // 1. Link supervisor on SM user
    const userUpdate = {
        supervisorId: supervisorUser.id,
        supervisorName: supervisorUser.name || 'Area Manager',
        supervisorRole: supervisorUser.role || 'asm',
        supervisorSalesLinkId: supervisorUser.salesLinkId || '',
        updatedAt: now
    };
    if (supervisorUser.role === 'asm') {
        userUpdate.asmId = supervisorUser.id;
    } else if (supervisorUser.role === 'zsm') {
        userUpdate.zsmId = supervisorUser.id;
    }
    await updateDoc(smRef, userUpdate);

    // 2. Link workspace to supervisor
    if (smData.tenantId) {
        try {
            const wsRef = doc(db, 'workspaces', smData.tenantId);
            const wsUpdate = { updatedAt: now };
            if (supervisorUser.role === 'asm') wsUpdate.asmId = supervisorUser.id;
            if (supervisorUser.role === 'zsm') wsUpdate.zsmId = supervisorUser.id;
            await updateDoc(wsRef, wsUpdate);
        } catch (e) {
            console.warn("Could not link workspace to supervisor:", e);
        }
    }

    // 3. Record connection event in invitations collection for audit
    try {
        await addDoc(invitationsCol, {
            fromUserId: supervisorUser.id,
            fromName: supervisorUser.name || '',
            fromRole: supervisorUser.role || 'asm',
            fromSalesLinkId: supervisorUser.salesLinkId || '',
            toUserId: smUserId,
            toName: smData.name || '',
            toEmail: smData.email || '',
            toSalesLinkId: smData.salesLinkId || '',
            targetRole: smData.role || 'sm',
            status: 'accepted',
            initiatedBy: supervisorUser.role || 'asm',
            createdAt: now,
            respondedAt: now
        });
    } catch (e) {
        console.warn("Could not log direct connection audit doc:", e);
    }

    return smData;
};

export const findUserByAnyIdentifier = async (identifier, preferredMethod = null) => {
    if (!identifier) return null;
    const raw = identifier.trim();
    const cleanLower = raw.toLowerCase();
    const cleanDigits = raw.replace(/\D/g, '');
    const cleanUpper = raw.toUpperCase();

    const lookupSalesLinkId = async () => getUserBySalesLinkId(cleanUpper);
    const lookupEmail = async () => getUserByEmail(cleanLower);
    const lookupPhone = async () => {
        if (cleanDigits.length < 10) return null;
        return getUserByPhone(cleanDigits.slice(-10));
    };
    const lookupEmployeeCode = async () => {
        if (cleanUpper.length < 3) return null;
        return getUserByEmployeeCode(cleanUpper);
    };

    // Respect explicit method selected in UI first
    if (preferredMethod === 'phone') return await lookupPhone();
    if (preferredMethod === 'email') return await lookupEmail();
    if (preferredMethod === 'employeeCode') return await lookupEmployeeCode();
    if (preferredMethod === 'salesLinkId') return await lookupSalesLinkId();

    // Auto-detect order when no explicit method is supplied
    if (cleanUpper.startsWith('SL-')) {
        const byId = await lookupSalesLinkId();
        if (byId) return byId;
    }

    if (cleanLower.includes('@')) {
        const byEmail = await lookupEmail();
        if (byEmail) return byEmail;
    }

    if (cleanDigits.length >= 10) {
        const byPhone = await lookupPhone();
        if (byPhone) return byPhone;
    }

    if (cleanUpper.length >= 3) {
        const byEmp = await lookupEmployeeCode();
        if (byEmp) return byEmp;
    }

    return null;
};


// --- Enterprise Offboarding & Pipeline Handoff ---
export const offboardAndReassignRo = async ({ resignedUserId, replacementUserId, supervisorId, reason = 'resigned' }) => {
    if (!resignedUserId) throw new Error("Resigned User ID is required.");
    const now = new Date().toISOString();

    const resignedRef = doc(db, 'users', resignedUserId);
    const resignedSnap = await getDoc(resignedRef);
    if (!resignedSnap.exists()) throw new Error("Resigned officer record not found in database.");
    const resignedData = resignedSnap.data();

    let replacementData = null;
    if (replacementUserId) {
        const repRef = doc(db, 'users', replacementUserId);
        const repSnap = await getDoc(repRef);
        if (repSnap.exists()) {
            replacementData = repSnap.data();
        }
    }

    // Retrieve all candidate files in this branch hub to ensure both roId and roName matches are found
    let candidateFiles = [];
    if (resignedData.tenantId) {
        candidateFiles = await getLoanFilesByTenant(resignedData.tenantId);
    } else {
        const qFiles = query(filesCol, where('roId', '==', resignedUserId));
        const snapFiles = await getDocs(qFiles);
        candidateFiles = mapSnapshot(snapFiles);
    }

    const normalizedResignedName = (resignedData.name || '').trim().toUpperCase();
    const targetFiles = candidateFiles.filter(f => {
        const matchId = f.roId === resignedUserId;
        const matchName = normalizedResignedName && f.roName && f.roName.trim().toUpperCase() === normalizedResignedName;
        return matchId || matchName;
    });

    // Active pipeline files (not already Disbursed, Rejected, or Cancelled)
    const activeFiles = targetFiles.filter(f => {
        const s = (f.status || '').toLowerCase();
        return s !== 'disbursed' && s !== 'rejected' && s !== 'cancelled';
    });

    let transferredCount = 0;
    if (replacementData && activeFiles.length > 0) {
        for (const file of activeFiles) {
            try {
                const fRef = doc(db, 'loanFiles', file.id);
                await updateDoc(fRef, {
                    roId: replacementUserId,
                    roName: replacementData.name || 'Relationship Officer',
                    transferredFromRoId: resignedUserId,
                    transferredFromRoName: resignedData.name || 'Former Officer',
                    transferredAt: now,
                    updatedAt: now
                });
                transferredCount++;
            } catch (err) {
                console.warn(`Could not transfer file ${file.id}:`, err);
            }
        }
    }

    // Lock out and offboard the resigned employee immediately
    await updateDoc(resignedRef, {
        status: 'resigned',
        isResigned: true,
        resignedAt: now,
        offboardedBy: supervisorId || '',
        offboardReason: reason,
        transferredFilesCount: transferredCount,
        transferredToRoId: replacementUserId || null,
        transferredToRoName: replacementData ? replacementData.name : null,
        updatedAt: now
    });

    return {
        resignedUser: { id: resignedUserId, ...resignedData },
        replacementUser: replacementData ? { id: replacementUserId, ...replacementData } : null,
        transferredCount,
        totalFilesCount: targetFiles.length
    };
};


// --- Cascading Sales Targets & Sales Drives ---
const salesTargetsCol = collection(db, 'salesTargets');
const salesDrivesCol = collection(db, 'salesDrives');

export const saveSalesTarget = async (targetData) => {
    const cleanData = {
        ...targetData,
        updatedAt: new Date().toISOString()
    };
    if (targetData.id) {
        const docRef = doc(db, 'salesTargets', targetData.id);
        await setDoc(docRef, cleanData, { merge: true });
        return targetData.id;
    } else {
        cleanData.createdAt = new Date().toISOString();
        const docRef = await addDoc(salesTargetsCol, cleanData);
        return docRef.id;
    }
};

export const getSalesTargets = async (month) => {
    try {
        let q;
        if (month) {
            q = query(salesTargetsCol, where('month', '==', month));
        } else {
            q = salesTargetsCol;
        }
        const snap = await getDocs(q);
        return mapSnapshot(snap);
    } catch (e) {
        console.warn('Could not fetch sales targets:', e);
        return [];
    }
};

export const saveSalesDrive = async (driveData) => {
    const cleanData = {
        ...driveData,
        updatedAt: new Date().toISOString()
    };
    if (driveData.id) {
        const docRef = doc(db, 'salesDrives', driveData.id);
        await setDoc(docRef, cleanData, { merge: true });
        return driveData.id;
    } else {
        cleanData.createdAt = new Date().toISOString();
        const docRef = await addDoc(salesDrivesCol, cleanData);
        return docRef.id;
    }
};

export const getAllSalesDrives = async () => {
    try {
        const snap = await getDocs(salesDrivesCol);
        return mapSnapshot(snap);
    } catch (e) {
        console.warn('Could not fetch sales drives:', e);
        return [];
    }
};

export const deleteSalesDrive = async (id) => {
    try {
        const docRef = doc(db, 'salesDrives', id);
        await deleteDoc(docRef);
    } catch (e) {
        console.warn('Could not delete sales drive:', e);
    }
};
