import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, getCountFromServer, limit, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const workspacesCol = collection(db, 'workspaces');
const usersCol = collection(db, 'users');
const filesCol = collection(db, 'loanFiles');
const invitationsCol = collection(db, 'invitations');

// Helper to map snapshot to array with id
const mapSnapshot = (snapshot) => {
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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

// --- Users ---
export const getROUsersByTenant = async (tenantId) => {
    const q = query(usersCol, where('role', '==', 'ro'), where('tenantId', '==', tenantId));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
};

export const getUsersCount = async () => {
    const snapshot = await getCountFromServer(usersCol);
    return snapshot.data().count;
};

export const addUser = async (userData) => {
    const docRef = await addDoc(usersCol, userData);
    return docRef.id;
};

export const getAllUsers = async () => {
    const snapshot = await getDocs(usersCol);
    return mapSnapshot(snapshot);
};

import { signInWithPopup, signInWithRedirect, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { auth, googleProvider } from "./firebase-config.js";

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
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

export const updateUser = async (id, updateData) => {
    const docRef = doc(db, 'users', id);
    await updateDoc(docRef, updateData);
};

export const deleteUser = async (id) => {
    const docRef = doc(db, 'users', id);
    await deleteDoc(docRef);
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

export const deleteLoanFile = async (id) => {
    const docRef = doc(db, 'loanFiles', id);
    await deleteDoc(docRef);
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

export const getManagerSecurityKey = async () => {
    try {
        const docRef = doc(db, 'system', 'security');
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists() || !docSnap.data().managerKey) return 'AXIS-MGR-2026';
        return docSnap.data().managerKey;
    } catch (e) {
        console.warn('Could not fetch manager key, fallback to default', e);
        return 'AXIS-MGR-2026';
    }
};

export const setManagerSecurityKey = async (managerKey) => {
    const docRef = doc(db, 'system', 'security');
    await setDoc(docRef, { managerKey, updatedAt: new Date().toISOString() }, { merge: true });
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

// --- Hierarchy & Invitations ---

export const generateSalesLinkId = (role = 'ro') => {
    const cleanRole = (role || 'ro').toUpperCase();
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `SL-${cleanRole}-${code}`;
};

export const getUserBySalesLinkId = async (salesLinkId) => {
    if (!salesLinkId) return null;
    const cleanId = salesLinkId.trim().toUpperCase();
    const q = query(usersCol, where('salesLinkId', '==', cleanId), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
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
    if (!targetUser && (targetPhone || targetEmp)) {
        try {
            const all = await getAllUsers();
            targetUser = all.find(u => 
                (targetPhone && u.phone && u.phone.replace(/\D/g, '').endsWith(targetPhone)) ||
                (targetEmp && u.employeeCode && u.employeeCode.toUpperCase() === targetEmp)
            );
        } catch (e) {}
    }

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

export const linkSmToSupervisor = async (smUserId, supervisorIdentifier) => {
    if (!smUserId || !supervisorIdentifier) throw new Error("SM User ID and Supervisor Identifier are required.");

    const cleanIdentifier = supervisorIdentifier.trim();
    let supervisor = null;

    // 1. Try finding by salesLinkId
    if (cleanIdentifier.toUpperCase().startsWith('SL-')) {
        supervisor = await getUserBySalesLinkId(cleanIdentifier.toUpperCase());
    }
    // 2. If not found or not SL-, try finding by email
    if (!supervisor) {
        supervisor = await getUserByEmail(cleanIdentifier.toLowerCase());
    }
    // 3. Fallback: try salesLinkId without prefix check
    if (!supervisor) {
        supervisor = await getUserBySalesLinkId(cleanIdentifier.toUpperCase());
    }

    if (!supervisor) {
        throw new Error(`Supervisor not found with ID or Email "${supervisorIdentifier}". Please verify the identifier and try again.`);
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

export const findUserByAnyIdentifier = async (identifier) => {
    if (!identifier) return null;
    const raw = identifier.trim();
    const cleanLower = raw.toLowerCase();
    const cleanDigits = raw.replace(/\D/g, '');
    const cleanUpper = raw.toUpperCase();

    // 1. Check SalesLink ID
    if (cleanUpper.startsWith('SL-')) {
        const byId = await getUserBySalesLinkId(cleanUpper);
        if (byId) return byId;
    }

    // 2. Check Email
    if (cleanLower.includes('@')) {
        const byEmail = await getUserByEmail(cleanLower);
        if (byEmail) return byEmail;
    }

    // 3. Check Phone (if 10 digits)
    if (cleanDigits.length >= 10) {
        const qPhone = query(usersCol, where('phone', '==', cleanDigits.slice(-10)), limit(1));
        const snapPhone = await getDocs(qPhone);
        if (!snapPhone.empty) return { id: snapPhone.docs[0].id, ...snapPhone.docs[0].data() };
    }

    // 4. Check Employee Code
    if (cleanUpper.length >= 3) {
        const qEmp = query(usersCol, where('employeeCode', '==', cleanUpper), limit(1));
        const snapEmp = await getDocs(qEmp);
        if (!snapEmp.empty) return { id: snapEmp.docs[0].id, ...snapEmp.docs[0].data() };
    }

    // 5. Fallback scan all users if not found by index
    try {
        const all = await getAllUsers();
        const found = all.find(u => 
            (u.email && u.email.toLowerCase() === cleanLower) ||
            (u.salesLinkId && u.salesLinkId.toUpperCase() === cleanUpper) ||
            (u.phone && u.phone.replace(/\D/g, '').endsWith(cleanDigits.slice(-10))) ||
            (u.employeeCode && u.employeeCode.toUpperCase() === cleanUpper) ||
            (u.name && u.name.toLowerCase() === cleanLower)
        );
        if (found) return found;
    } catch (e) {}

    return null;
};

