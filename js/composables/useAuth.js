import * as db from '../db.js';

const { ref, computed } = Vue;

export function useAuth({
    currentTab,
    loadData = async () => {},
    loadDseData = async () => {},
    initUserSm = async () => {},
    allWorkspaces = ref([]),
    roUsers = ref([]),
    allFiles = ref([]),
    myFiles = ref([]),
    publicApplyWorkspace = ref(null)
} = {}) {

    const getInitialUser = () => {
        const savedUser = localStorage.getItem('axis_user');
        if (savedUser) {
            try {
                const parsed = JSON.parse(savedUser);
                if (parsed.status === 'resigned' || parsed.status === 'suspended' || parsed.status === 'inactive') {
                    localStorage.removeItem('axis_user');
                    return null;
                }
                if (!parsed.email && parsed.role !== 'ro') return null;
                return parsed;
            } catch(e) {}
        }
        return null;
    };
    const initialUser = getInitialUser();
    
    // --- State ---
    const currentUser = ref(initialUser);
    const originalUser = ref(null);

    // --- Real-time Security & Account Sync Gatekeeper ---
    let userSecurityUnsub = null;

    const generateSessionId = () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    };

    const handleSecurityLockout = async (reason) => {
        console.warn("Security Lockout Triggered:", reason);
        if (userSecurityUnsub) {
            userSecurityUnsub();
            userSecurityUnsub = null;
        }
        try {
            if (db.auth) await db.signOut(db.auth);
        } catch (e) {}
        localStorage.removeItem('axis_user');
        localStorage.removeItem('axis_active_session_id');
        currentUser.value = null;
        alert(`⛔ Security Alert: Access Terminated\n\n${reason}`);
        window.location.reload();
    };

    const startUserSecurityListener = (userId) => {
        if (userSecurityUnsub) {
            userSecurityUnsub();
            userSecurityUnsub = null;
        }
        if (!userId) return;

        userSecurityUnsub = db.onUserSnapshot(userId, (freshUser) => {
            if (!freshUser) {
                handleSecurityLockout('Your user profile has been removed by the administrator.');
                return;
            }

            // Check 1: Real-time Account Status (Freeze / Suspend / Resign by Admin/Supervisor)
            if (freshUser.status === 'suspended' || freshUser.status === 'resigned' || freshUser.status === 'inactive') {
                const statusText = freshUser.status === 'suspended' ? 'FROZEN & LOCKED' : 'REVOKED (Offboarded)';
                handleSecurityLockout(`Your account has been ${statusText} by your Sales Manager (${freshUser.supervisorName || 'Supervisor'}). Access is immediately terminated.`);
                return;
            }

            // Dynamic Sync of Supervisor, Tenant, and Profile changes in real-time
            if (currentUser.value) {
                if (freshUser.supervisorName) currentUser.value.supervisorName = freshUser.supervisorName;
                if (freshUser.supervisorId) currentUser.value.supervisorId = freshUser.supervisorId;
                if (freshUser.tenantId) currentUser.value.tenantId = freshUser.tenantId;
            }

            // Sync directory entry on real-time profile changes
            if (db.auth?.currentUser?.uid && freshUser) {
                db.upsertDirectoryEntry(db.auth.currentUser.uid, {
                    email: freshUser.email,
                    role: freshUser.role,
                    tenantId: freshUser.tenantId || null,
                    status: freshUser.status || 'active',
                    userId: freshUser.id
                }).catch(() => {});
            }
        });
    };

    const loginForm = ref({ username: '' });
    const loginError = ref('');
    const isLoggingIn = ref(false);
    const loginStage = ref(''); // '' | 'selecting' | 'verifying'
    const isRegistering = ref(false);
    const registerStage = ref(''); // '' | 'selecting' | 'setting_up'
    const showRegisterMode = ref(false);
    const loginPortalMode = ref('bank'); // 'bank' | 'dealer'
    const showMobileFeatures = ref(false);
    const showBankSelector = ref(false);
    const registerForm = ref({ role: 'sm', name: '', employeeCode: '', region: '', phone: '', bankName: 'Axis Bank', customBankName: '', division: 'Auto Loans (Car Loans)' });
    const registerStep = ref(1);
    const registerConfirmed = ref(false);

    // --- Role Helpers ---
    const isSuperAdmin = computed(() => currentUser.value?.role === 'super_admin');
    const isZSM = computed(() => currentUser.value?.role === 'zsm');
    const isASM = computed(() => currentUser.value?.role === 'asm');
    const isSM = computed(() => currentUser.value?.role === 'sm' || currentUser.value?.role === 'admin');
    const isRO = computed(() => currentUser.value?.role === 'ro' || !currentUser.value?.role);
    const isDSE = computed(() => currentUser.value?.role === 'dse');
    const isDealerAdmin = computed(() => (currentUser.value?.role || '').toLowerCase() === 'dealer_admin');

    const currentRoleLabel = computed(() => {
        if (!currentUser.value) return 'Guest';
        switch (currentUser.value.role) {
            case 'super_admin': return 'Super Admin (Owner)';
            case 'zsm': return 'Zonal Sales Manager (ZSM)';
            case 'asm': return 'Area Sales Manager (ASM)';
            case 'sm':
            case 'admin': return 'Sales Manager (Branch Head)';
            case 'dse': return 'Dealership Sales Executive (DSE)';
            case 'ro': return 'Relationship Officer (RO)';
            default: return 'Sales Executive';
        }
    });

    const impersonateUser = async (user) => {
        if (!user) return;

        // Server-verified super_admin check
        const actorEmail = (originalUser.value?.email || currentUser.value?.email || '').toLowerCase();
        const actorDoc = await db.getUserByEmail(actorEmail);
        if (!actorDoc || actorDoc.role !== 'super_admin') {
            alert("Access Denied: Impersonation requires verified super_admin authority.");
            return;
        }

        if (!originalUser.value && currentUser.value.role === 'super_admin') {
            originalUser.value = { ...currentUser.value };
        }

        // Write immutable audit log event
        try {
            await db.logAuditEvent({
                action: 'impersonate_user',
                actorEmail: actorEmail,
                actorId: actorDoc.id,
                targetEmail: user.email,
                targetRole: user.role,
                targetId: user.id,
                at: new Date().toISOString()
            });
        } catch (auditErr) {
            console.warn("Audit logging notice:", auditErr);
        }
        
        const sessionUser = { 
            id: user.id, 
            email: user.email, 
            username: user.name, 
            role: user.role, 
            name: user.name, 
            salesLinkId: user.salesLinkId || null,
            supervisorId: user.supervisorId || null,
            supervisorName: user.supervisorName || null,
            supervisorRole: user.supervisorRole || null,
            supervisorSalesLinkId: user.supervisorSalesLinkId || null,
            tenantId: user.tenantId || user.id,
            phone: user.phone || '',
            bankName: user.bankName,
            division: user.division,
            region: user.region,
            employeeCode: user.employeeCode || '',
            designation: user.designation || '',
            branchAddress: user.branchAddress || '',
            createdAt: user.createdAt || ''
        };
        localStorage.setItem('axis_user', JSON.stringify(sessionUser));
        currentUser.value = sessionUser;
        
        allWorkspaces.value = [];
        roUsers.value = [];
        allFiles.value = [];
        myFiles.value = [];
        
        await loadData();
        
        if (sessionUser.role === 'sm') currentTab.value = 'dashboard';
        else if (sessionUser.role === 'ro') currentTab.value = 'ro-dashboard';
    };

    const stopImpersonation = async () => {
        if (originalUser.value) {
            localStorage.setItem('axis_user', JSON.stringify(originalUser.value));
            currentUser.value = originalUser.value;
            originalUser.value = null;
            
            allWorkspaces.value = [];
            roUsers.value = [];
            allFiles.value = [];
            myFiles.value = [];
            
            await loadData();
            currentTab.value = 'super-admin-dashboard';
        }
    };

    const selectRegisterRole = (role) => {
        registerForm.value.role = role;
        if (role === 'dse') {
            registerForm.value.showroomBrand = registerForm.value.showroomBrand || 'Maruti Suzuki Arena';
            registerForm.value.dealershipName = registerForm.value.dealershipName || '';
        }
        registerStep.value = 2;
        registerError.value = '';
        registerConfirmed.value = true;
    };

    const divisionOptions = [
        'Auto Loans (Car Loans)',
        'Personal Loans (PL)',
        'Home Loans & LAP (Mortgage)',
        'Business Loans & SME Finance',
        'Commercial Vehicle & CE (CV/CE)',
        'Two-Wheeler Loans (2W)',
        'Gold Loans',
        'General Retail Assets'
    ];

    const bankOptions = {
        private: [
            'HDFC Bank', 'ICICI Bank', 'Kotak Mahindra Bank', 'IndusInd Bank', 'Yes Bank',
            'IDFC FIRST Bank', 'Federal Bank', 'Bandhan Bank', 'RBL Bank', 'South Indian Bank',
            'City Union Bank', 'Karur Vysya Bank', 'Karnataka Bank', 'Tamilnad Mercantile Bank',
            'CSB Bank', 'DCB Bank', 'Jammu & Kashmir Bank', 'Dhanlaxmi Bank', 'Nainital Bank'
        ],
        public: [
            'State Bank of India (SBI)', 'Punjab National Bank (PNB)', 'Bank of Baroda (BOB)',
            'Canara Bank', 'Union Bank of India', 'Bank of India (BOI)', 'Indian Bank',
            'Central Bank of India', 'Indian Overseas Bank (IOB)', 'UCO Bank',
            'Bank of Maharashtra', 'Punjab & Sind Bank'
        ],
        nbfc: [
            'Bajaj Finance', 'Tata Capital', 'Mahindra & Mahindra Financial Services',
            'Cholamandalam Investment and Finance', 'Shriram Finance', 'Sundaram Finance',
            'L&T Finance', 'Piramal Capital & Housing Finance', 'Aditya Birla Finance',
            'Muthoot Finance', 'Manappuram Finance', 'Hero FinCorp', 'TVS Credit Services',
            'HDB Financial Services', 'SMFG India Credit (Fullerton)', 'Poonawalla Fincorp'
        ]
    };

    const loginRedirect = async () => {
        loginError.value = '';
        isLoggingIn.value = true;
        loginStage.value = 'redirecting';
        try {
            await db.loginWithRedirect();
        } catch (error) {
            console.error("Redirect Login Error:", error);
            loginError.value = error.message;
            isLoggingIn.value = false;
            loginStage.value = '';
        }
    };

    const registerSM = async () => {
        if (isRegistering.value) return;
        registerError.value = '';

        const chosenRole = registerForm.value.role || 'sm';

        if (chosenRole === 'dse') {
            const dseBrand = registerForm.value.showroomBrand?.trim() || 'Maruti Suzuki Arena';
            const dseDealership = registerForm.value.dealershipName?.trim();
            const dseName = registerForm.value.name?.trim();
            const dseCode = registerForm.value.employeeCode?.trim();
            const dseCity = registerForm.value.region?.trim();
            const dsePhone = registerForm.value.phone?.trim() || '';

            if (!dseDealership) {
                registerError.value = 'Dealership / Showroom Name is mandatory.';
                return;
            }
            if (!dseName) {
                registerError.value = 'Sales Consultant Full Name is mandatory.';
                return;
            }
            if (!dseCode) {
                registerError.value = 'Official Staff / Employee ID is mandatory.';
                return;
            }
            if (!dseCity) {
                registerError.value = 'Showroom Location / City is mandatory.';
                return;
            }
            if (!dsePhone || dsePhone.replace(/\D/g, '').length < 10) {
                registerError.value = 'Please provide a valid 10-digit mobile number.';
                return;
            }

            isRegistering.value = true;
            registerStage.value = 'selecting';
            try {
                const googleUser = await db.loginWithGoogle();
                registerStage.value = 'setting_up';
                const email = googleUser.email.toLowerCase();

                const existing = await db.getUserByEmail(email);
                if (existing) {
                    if (googleUser?.uid) {
                        db.upsertDirectoryEntry(googleUser.uid, {
                            email: email,
                            role: 'dse',
                            tenantId: null,
                            status: 'active',
                            userId: existing.id
                        }).catch(() => {});
                    }
                    if (existing.role === 'dse') {
                        localStorage.setItem('axis_user', JSON.stringify(existing));
                        currentUser.value = existing;
                        currentTab.value = 'dse-dashboard';
                        await loadDseData();
                        showRegisterMode.value = false;
                        registerStep.value = 1;
                        registerConfirmed.value = false;
                        return;
                    } else {
                        const updatePayload = {
                            role: 'dse',
                            name: dseName || existing.name,
                            dealershipName: dseDealership,
                            showroomBrand: dseBrand,
                            employeeCode: dseCode,
                            region: dseCity,
                            phone: dsePhone,
                            designation: 'Dealership Sales Executive (DSE)',
                            status: 'active'
                        };
                        await db.updateUser(existing.id, updatePayload);
                        const sessionUser = { ...existing, ...updatePayload };
                        localStorage.setItem('axis_user', JSON.stringify(sessionUser));
                        currentUser.value = sessionUser;
                        currentTab.value = 'dse-dashboard';
                        await loadDseData();
                        showRegisterMode.value = false;
                        registerStep.value = 1;
                        registerConfirmed.value = false;
                        return;
                    }
                }

                const newSalesLinkId = db.generateSalesLinkId('dse');

                const newUserId = await db.addUser({
                    email: email,
                    role: 'dse',
                    name: dseName,
                    dealershipName: dseDealership,
                    showroomBrand: dseBrand,
                    employeeCode: dseCode,
                    region: dseCity,
                    phone: dsePhone,
                    salesLinkId: newSalesLinkId,
                    status: 'active',
                    createdAt: new Date().toISOString()
                });

                if (googleUser?.uid) {
                    db.upsertDirectoryEntry(googleUser.uid, {
                        email: email,
                        role: 'dse',
                        tenantId: null,
                        status: 'active',
                        userId: newUserId || email
                    }).catch(() => {});
                }

                const sessionUser = {
                    id: newUserId || email,
                    email: email,
                    username: dseName,
                    role: 'dse',
                    name: dseName,
                    dealershipName: dseDealership,
                    showroomBrand: dseBrand,
                    employeeCode: dseCode,
                    region: dseCity,
                    phone: dsePhone,
                    salesLinkId: newSalesLinkId,
                    tenantId: null
                };

                localStorage.setItem('axis_user', JSON.stringify(sessionUser));
                currentUser.value = sessionUser;
                currentTab.value = 'dse-dashboard';
                await loadDseData();

                showRegisterMode.value = false;
                registerStep.value = 1;
                registerConfirmed.value = false;
                registerForm.value = { role: 'sm', name: '', region: '', phone: '', bankName: 'Axis Bank', customBankName: '', division: 'Auto Loans (Car Loans)' };
                return;
            } catch (error) {
                console.error("DSE Registration Error:", error);
                if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('popup-closed')) {
                    return;
                }
                registerError.value = error.message || 'Error creating account.';
                return;
            } finally {
                isRegistering.value = false;
                registerStage.value = '';
            }
        }

        const smName = registerForm.value.name.trim();
        const smBank = registerForm.value.bankName === 'Other' ? registerForm.value.customBankName.trim() : registerForm.value.bankName;
        const smDivision = registerForm.value.division;
        const smRegion = registerForm.value.region.trim();
        const smPhone = registerForm.value.phone.trim();

        if (!smName) {
            registerError.value = 'Full Name is mandatory.';
            return;
        }
        if (!smBank) {
            registerError.value = 'Please select or specify your Bank Organization.';
            return;
        }
        if (!smRegion) {
            registerError.value = 'Operating Region / Zone is mandatory.';
            return;
        }
        if (!smPhone) {
            registerError.value = 'Contact Phone / WhatsApp number is mandatory.';
            return;
        }
        if (smPhone.replace(/\D/g, '').length < 10) {
            registerError.value = 'Please provide a valid 10-digit mobile number.';
            return;
        }

        const wsName = smBank === 'Axis Bank' ? `${smRegion} Hub` : `${smBank} - ${smRegion} Hub`;

        isRegistering.value = true;
        registerStage.value = 'selecting';
        try {
            const googleUser = await db.loginWithGoogle();
            registerStage.value = 'setting_up';
            const email = googleUser.email.toLowerCase();

            const existing = await db.getUserByEmail(email);
            if (existing) {
                if (existing.role === 'ro') {
                    registerError.value = `This account (${email}) is already registered as a Relationship Officer (RO). Please switch back to "Sign In" to access your workspace.`;
                } else {
                    registerError.value = `The Google account (${email}) is already registered. Please sign in normally.`;
                }
                return;
            }
            
            let workspaceId = '';
            if (chosenRole === 'sm') {
                workspaceId = await db.addWorkspace({
                    name: wsName,
                    bankName: smBank,
                    division: smDivision,
                    region: smRegion,
                    managerName: smName,
                    status: 'active',
                    createdAt: new Date().toISOString()
                });
            }

            const newSalesLinkId = db.generateSalesLinkId(chosenRole);

            const newUserId = await db.addUser({
                email: email,
                role: chosenRole,
                name: smName,
                bankName: smBank,
                division: smDivision,
                region: smRegion,
                phone: smPhone,
                salesLinkId: newSalesLinkId,
                tenantId: workspaceId || null,
                status: 'active',
                createdAt: new Date().toISOString()
            });

            if (googleUser?.uid) {
                db.upsertDirectoryEntry(googleUser.uid, {
                    email: email,
                    role: chosenRole,
                    tenantId: workspaceId || null,
                    status: 'active',
                    userId: newUserId || email
                }).catch(() => {});
            }

            // Auto sign-in new user
            const sessionUser = {
                id: newUserId || email,
                email: email,
                username: smName,
                role: chosenRole,
                name: smName,
                bankName: smBank,
                division: smDivision,
                region: smRegion,
                salesLinkId: newSalesLinkId,
                tenantId: workspaceId || null
            };

            localStorage.setItem('axis_user', JSON.stringify(sessionUser));
            currentUser.value = sessionUser;
            initUserSm();
            if (chosenRole === 'zsm') currentTab.value = 'zsm-dashboard';
            else if (chosenRole === 'asm') currentTab.value = 'asm-dashboard';
            else currentTab.value = 'dashboard';
            await loadData();

            showRegisterMode.value = false;
            registerStep.value = 1;
            registerConfirmed.value = false;
            registerForm.value = { role: 'sm', name: '', region: '', phone: '', bankName: 'Axis Bank', customBankName: '', division: 'Auto Loans (Car Loans)' };
        } catch (error) {
            console.error("Registration Error:", error);
            if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('popup-closed')) {
                return;
            }
            registerError.value = error.message || 'Error creating account.';
        } finally {
            isRegistering.value = false;
            registerStage.value = '';
        }
    };

    const processUserLogin = async (googleUser) => {
        const email = (googleUser.email || '').toLowerCase().trim();
        let user = await db.getUserByEmail(email);

        // Ensure super_admin can be bootstrapped from data-driven system/owners document
        if (!user) {
            const owners = await db.getSystemOwners();
            if (owners.includes(email)) {
                const ownerData = {
                    email: email,
                    role: 'super_admin',
                    name: googleUser.displayName || 'Platform Owner',
                    status: 'active',
                    createdAt: new Date().toISOString()
                };
                await db.addUser(ownerData);
                user = await db.getUserByEmail(email);
            }
        }
        
        if (user) {
            // Upsert identity directory entry for Firestore rules authorization
            const authUid = googleUser?.uid || (db.auth?.currentUser ? db.auth.currentUser.uid : null);
            if (authUid) {
                db.upsertDirectoryEntry(authUid, {
                    email: user.email,
                    role: user.role,
                    tenantId: user.tenantId || null,
                    status: user.status || 'active',
                    userId: user.id
                }).catch(e => console.warn("Directory upsert notice:", e));
            }

            // Validate role against known roles
            const validRoles = ['super_admin', 'zsm', 'asm', 'sm', 'ro', 'dse'];
            const role = (user.role || '').toLowerCase().trim();
            if (!validRoles.includes(role)) {
                loginError.value = `Access Denied: Unrecognized account role "${user.role}". Please contact platform administration.`;
                return;
            }

            // Check if account has been frozen/locked or resigned
            if (user.status === 'suspended') {
                const sup = user.supervisorName || 'your Sales Manager';
                loginError.value = `⛔ Account Locked: Your access has been frozen by your Sales Manager (${sup}). Please contact your supervisor to unlock your account.`;
                return;
            }
            if (user.status === 'resigned' || user.status === 'inactive') {
                loginError.value = '⛔ Access Revoked: This account has been offboarded due to resignation. Pipeline has been reassigned.';
                return;
            }

            // Check workspace status for SM and RO
            if (user.role !== 'super_admin' && user.tenantId) {
                const workspace = await db.getWorkspace(user.tenantId);
                if (workspace && workspace.status === 'frozen') {
                    loginError.value = '⛔ Branch Workspace Locked: Your branch workspace is currently frozen by the administrator.';
                    return;
                }
            }

            // If RO, ensure supervisor linkage is maintained
            if (user.role === 'ro' && user.tenantId && (!user.supervisorId || !user.supervisorName)) {
                try {
                    const smUser = await db.getSMUserByTenant(user.tenantId);
                    if (smUser) {
                        user.supervisorId = smUser.id;
                        user.supervisorName = smUser.name;
                        user.supervisorSalesLinkId = smUser.salesLinkId || null;
                        await db.updateUser(user.id, {
                            supervisorId: smUser.id,
                            supervisorName: smUser.name,
                            supervisorSalesLinkId: smUser.salesLinkId || null
                        });
                    }
                } catch (e) {
                    console.warn("Could not backfill supervisor on login:", e);
                }
            }

            // Auto assign SalesLink ID if missing (backward compatibility)
            if (!user.salesLinkId) {
                try {
                    const newSalesLinkId = db.generateSalesLinkId(user.role);
                    await db.updateUser(user.id, { salesLinkId: newSalesLinkId });
                    user.salesLinkId = newSalesLinkId;
                } catch (e) {
                    console.warn('Could not backfill salesLinkId:', e);
                }
            }

            // Record login timestamp
            const newSessionId = generateSessionId();
            localStorage.setItem('axis_active_session_id', newSessionId);
            try {
                await db.updateUser(user.id, {
                    lastLoginAt: new Date().toISOString()
                });
            } catch (e) {
                console.warn("Could not write lastLoginAt to Firestore:", e);
            }

            // Store user session
            const sessionUser = {
                id: user.id,
                email: user.email,
                username: user.name,
                role: user.role,
                name: user.name,
                salesLinkId: user.salesLinkId,
                supervisorId: user.supervisorId || null,
                supervisorName: user.supervisorName || null,
                supervisorRole: user.supervisorRole || null,
                supervisorSalesLinkId: user.supervisorSalesLinkId || null,
                tenantId: user.tenantId || null,
                phone: user.phone || '',
                bankName: user.bankName,
                division: user.division,
                dealershipName: user.dealershipName || '',
                showroomBrand: user.showroomBrand || '',
                region: user.region,
                employeeCode: user.employeeCode || '',
                designation: user.designation || '',
                branchAddress: user.branchAddress || '',
                createdAt: user.createdAt || '',
                activeSessionId: newSessionId
            };
            localStorage.setItem('axis_user', JSON.stringify(sessionUser));
            currentUser.value = sessionUser;
            initUserSm();

            // Start real-time security gatekeeper
            startUserSecurityListener(user.id);
            
            if (isSuperAdmin.value) currentTab.value = 'super-admin-dashboard';
            else if (isZSM.value) currentTab.value = 'zsm-dashboard';
            else if (isASM.value) currentTab.value = 'asm-dashboard';
            else if (isSM.value) currentTab.value = 'dashboard';
            else if (isDSE.value) currentTab.value = 'dse-dashboard';
            else currentTab.value = 'ro-dashboard';

            await loadData();
        } else {
            loginError.value = `⛔ Account Not Registered: The Google account (${email}) is not registered in SalesLink. If you are a Sales Manager, please register your workspace below, or ask your supervisor to invite your account.`;
        }
    };

    const login = async () => {
        if (isLoggingIn.value) return;
        loginError.value = '';
        isLoggingIn.value = true;
        loginStage.value = 'selecting';

        try {
            const googleUser = await db.loginWithGoogle();
            loginStage.value = 'verifying';
            await processUserLogin(googleUser);
        } catch (error) {
            console.error("Google Login Error:", error);
            if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('popup-closed')) {
                return;
            }
            loginError.value = error.message || 'Login failed. Please try again.';
        } finally {
            isLoggingIn.value = false;
            loginStage.value = '';
        }
    };

    const loginDirect = async () => {
        if (isLoggingIn.value) return;
        loginError.value = '';
        isLoggingIn.value = true;
        loginStage.value = 'selecting';

        try {
            await db.loginWithRedirect();
        } catch (error) {
            console.error("Redirect Login Error:", error);
            loginError.value = error.message;
            isLoggingIn.value = false;
            loginStage.value = '';
        }
    };

    const logout = async () => {
        if (userSecurityUnsub) {
            userSecurityUnsub();
            userSecurityUnsub = null;
        }
        try {
            if (db.auth) await db.signOut(db.auth);
        } catch (e) {
            console.warn("Firebase signOut error on logout:", e);
        }
        localStorage.removeItem('axis_user');
        localStorage.removeItem('axis_active_session_id');
        currentUser.value = null;
        loginForm.value = { username: '' };
        allWorkspaces.value = [];
        roUsers.value = [];
        allFiles.value = [];
        myFiles.value = [];
        currentTab.value = 'dashboard';
    };

    return {
        // State
        currentUser,
        originalUser,
        loginForm,
        loginError,
        isLoggingIn,
        loginStage,
        isRegistering,
        registerStage,
        showRegisterMode,
        loginPortalMode,
        showMobileFeatures,
        showBankSelector,
        registerForm,
        registerStep,
        registerConfirmed,

        // Computed Roles
        isSuperAdmin,
        isZSM,
        isASM,
        isSM,
        isRO,
        isDSE,
        isDealerAdmin,
        currentRoleLabel,

        // Registration helpers & options
        selectRegisterRole,
        registerError,
        bankOptions,
        divisionOptions,

        // Methods
        generateSessionId,
        handleSecurityLockout,
        startUserSecurityListener,
        login,
        loginDirect,
        loginRedirect,
        logout,
        registerSM,
        processUserLogin,
        impersonateUser,
        stopImpersonation
    };
}
