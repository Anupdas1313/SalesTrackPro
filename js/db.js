import { collection, getDocs, addDoc, updateDoc, doc, query, where, getCountFromServer, limit, getDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";
import { db } from "./firebase-config.js";

const usersCol = collection(db, 'users');
const filesCol = collection(db, 'loanFiles');

// Helper to map snapshot to array with id
const mapSnapshot = (snapshot) => {
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getAllLoanFiles = async () => {
    const snapshot = await getDocs(filesCol);
    return mapSnapshot(snapshot);
};

export const getROUsers = async () => {
    const q = query(usersCol, where('role', '==', 'ro'));
    const snapshot = await getDocs(q);
    return mapSnapshot(snapshot);
};

export const getLoanFilesByRO = async (roId) => {
    const q = query(filesCol, where('roId', '==', roId));
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

export const getUserByUsername = async (username) => {
    const q = query(usersCol, where('username', '==', username), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
};

export const updateUser = async (id, updateData) => {
    const docRef = doc(db, 'users', id);
    await updateDoc(docRef, updateData);
};

export const addLoanFile = async (fileData) => {
    await addDoc(filesCol, fileData);
};

export const updateLoanFile = async (id, updateData) => {
    const docRef = doc(db, 'loanFiles', id);
    await updateDoc(docRef, updateData);
};
