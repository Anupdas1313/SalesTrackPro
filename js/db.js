import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, getCountFromServer, limit, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const workspacesCol = collection(db, 'workspaces');
const usersCol = collection(db, 'users');
const filesCol = collection(db, 'loanFiles');

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
    await addDoc(usersCol, userData);
};

export const getAllUsers = async () => {
    const snapshot = await getDocs(usersCol);
    return mapSnapshot(snapshot);
};

import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { auth, googleProvider } from "./firebase-config.js";

export const loginWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
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
export const addEODReport = async (reportData) => {
    try {
        const docRef = await addDoc(collection(db, 'eod_reports'), reportData);
        return docRef.id;
    } catch (e) {
        console.error('Error adding EOD report: ', e);
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
