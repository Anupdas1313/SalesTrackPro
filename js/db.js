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
    if (!targetEmail) {
        throw new Error('Please provide a valid recipient email address.');
    }
    
    const targetUser = await getUserByEmail(targetEmail);
    if (targetUser && targetUser.supervisorId) {
        let mgrName = 'another manager';
        try {
            const mgrSnap = await getDoc(doc(db, 'users', targetUser.supervisorId));
            if (mgrSnap.exists()) mgrName = mgrSnap.data().name || mgrName;
        } catch (e) {}
        throw new Error(`This user (${targetEmail}) is already reporting to ${mgrName}. They must disconnect first before linking to a new area.`);
    }

    const payload = {
        fromUserId: inviteData.fromUserId,
        fromName: inviteData.fromName || '',
        fromEmail: (inviteData.fromEmail || '').toLowerCase(),
        fromRole: inviteData.fromRole || 'asm',
        fromSalesLinkId: inviteData.fromSalesLinkId || '',
        toEmail: targetEmail,
        toSalesLinkId: inviteData.toSalesLinkId || '',
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

export const getPendingInvitationsForEmail = async (email) => {
    if (!email) return [];
    const cleanEmail = email.trim().toLowerCase();
    const q = query(invitationsCol, where('toEmail', '==', cleanEmail), where('status', '==', 'pending'));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
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
