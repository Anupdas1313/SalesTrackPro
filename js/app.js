import * as db from './db.js';
const { createApp, ref, computed, onMounted, watch } = Vue;

const app = createApp({
    setup() {
        const showMobileFilterDrawer = ref(false);
        // --- State ---
        const currentUser = ref(null);
        const loginForm = ref({ username: '', password: '' });
        const loginError = ref('');
        const showRegisterMode = ref(false);
        const registerForm = ref({ username: '', password: '', name: '', workspaceName: '' });
        const registerError = ref('');
        const currentTab = ref('');
        const mobileMenuOpen = ref(false);

        // Data arrays
        const roUsers = ref([]);
        const allFiles = ref([]);
        const myFiles = ref([]); // For ROs
        const allWorkspaces = ref([]); // For Super Admin

        // Modals & Forms
        const showAddRoModal = ref(false);
        const newRoForm = ref({ name: '', username: '', password: '' });
        const addRoError = ref('');

        // Date Helpers
        const getTodayDateStr = () => {
            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const getYesterdayDateStr = () => {
            const d = new Date();
            d.setDate(d.getDate() - 1);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const STANDARD_STATUSES = ['Lead', 'FI', 'FCU', 'UW', 'Approved', 'Rejected', 'Disbursed', 'Cancelled'];
        const defaultSmName = ref(localStorage.getItem('axis_default_sm') || '');
        const newFileForm = ref({
            appId: 'ALA00000',
            customerName: '',
            nclUcl: 'NCL',
            sourcingChannel: 'DSA',
            loginDate: getTodayDateStr(),
            loanAmount: '',
            status: 'FI',
            customStatus: '',
            ppc: '',
            smName: defaultSmName.value,
            vcip: '',
            mi: ''
        });
        
        // Full File Edit Modal (RO & Admin)
        const showEditFileModal = ref(false);
        const editFileForm = ref({
            id: '',
            appId: '',
            customerName: '',
            nclUcl: 'NCL',
            sourcingChannel: 'DSA',
            loginDate: getTodayDateStr(),
            loanAmount: '',
            status: 'FI',
            customStatus: '',
            ppc: '',
            smName: '',
            vcip: '',
            mi: ''
        });

        const showUpdateStatusModal = ref(false);
        const selectedFile = ref(null);
        const statusUpdateForm = ref({ status: '', customStatus: '', note: '' });

        const showViewFileModal = ref(false);

        // Filters (Admin Tracking)
        const filters = ref({ search: '', status: '', roId: '' });
        
        // Filters & Sorting (RO Tracking)
        const roFilters = ref({
            search: '',
            status: '',
            nclUcl: '',
            sourcingChannel: '',
            timeline: 'this-month', // 'today', 'yesterday', 'this-week', 'this-month', 'all', 'custom'
            customDate: '',
            sortBy: 'newest' // 'newest', 'oldest', 'amount-desc', 'amount-asc', 'name-asc'
        });

        // Helper: Date timeline matching (supports YYYY-MM-DD strings and ISO timestamps)
        const matchesTimeline = (fileDateStr, timeline, customDate) => {
            if (!fileDateStr) return timeline === 'all';
            
            let fileYear, fileMonth, fileDate;
            if (typeof fileDateStr === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fileDateStr)) {
                const parts = fileDateStr.substring(0, 10).split('-').map(Number);
                fileYear = parts[0];
                fileMonth = parts[1] - 1;
                fileDate = parts[2];
            } else {
                const fileD = new Date(fileDateStr);
                if (isNaN(fileD.getTime())) return true;
                fileYear = fileD.getFullYear();
                fileMonth = fileD.getMonth();
                fileDate = fileD.getDate();
            }

            const now = new Date();
            const nowYear = now.getFullYear();
            const nowMonth = now.getMonth();
            const nowDate = now.getDate();

            const todayDateObj = new Date(nowYear, nowMonth, nowDate);
            const fileDateObj = new Date(fileYear, fileMonth, fileDate);
            const diffDays = Math.round((todayDateObj - fileDateObj) / (1000 * 60 * 60 * 24));

            switch (timeline) {
                case 'today':
                    return diffDays === 0;
                case 'yesterday':
                    return diffDays === 1;
                case 'this-week':
                    return diffDays >= 0 && diffDays <= 7;
                case 'this-month':
                    return fileYear === nowYear && fileMonth === nowMonth;
                case 'custom':
                    if (!customDate) return true;
                    const [cYear, cMonth, cDay] = customDate.split('-').map(Number);
                    return fileYear === cYear && fileMonth === (cMonth - 1) && fileDate === cDay;
                case 'all':
                default:
                    return true;
            }
        };

        // --- Computed ---
        const isSuperAdmin = computed(() => currentUser.value?.role === 'super_admin');
        const isSM = computed(() => currentUser.value?.role === 'sm' || currentUser.value?.role === 'admin'); // fallback for legacy
        const isRO = computed(() => currentUser.value?.role === 'ro');



        // Loan Amount in Lakhs normalization and formatters
        const toLakhs = (value) => {
            if (value === null || value === undefined || value === '') return 0;
            const num = Number(value);
            if (isNaN(num)) return 0;
            // Auto-normalize legacy entries stored in full rupees (>= 1000)
            return num >= 1000 ? num / 100000 : num;
        };

        const formatCurrency = (value) => {
            const lakhs = toLakhs(value);
            return lakhs.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + ' L';
        };

        const formatLakhsToRupees = (value) => {
            const lakhs = toLakhs(value);
            if (!lakhs) return '₹0';
            const rupees = Math.round(lakhs * 100000);
            return '₹' + rupees.toLocaleString('en-IN');
        };

        // Admin Stats
        const stats = computed(() => {
            const files = allFiles.value;
            const approved = files.filter(f => f.status === 'Approved');
            return {
                totalFiles: files.length,
                approvedFiles: approved.length,
                totalValue: files.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0)
            };
        });

        // RO Overview State
        const roOverviewTimeline = ref('this-month');
        const roOverviewCustomDate = ref('');

        // RO Overview KPIs
        const roStats = computed(() => {
            const files = myFiles.value.filter(f => matchesTimeline(f.loginDate || f.createdAt || f.updatedAt, roOverviewTimeline.value, roOverviewCustomDate.value));
            const approved = files.filter(f => f.status === 'Approved');
            const disbursed = files.filter(f => f.status === 'Disbursed');
            const login = files.filter(f => f.status === 'FI');
            const rejected = files.filter(f => f.status === 'Rejected');
            const ncl = files.filter(f => f.nclUcl === 'NCL');
            const ucl = files.filter(f => f.nclUcl === 'UCL');

            const totalAmount = files.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const approvedAmount = approved.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const disbursedAmount = disbursed.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const loginAmount = login.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const rejectedAmount = rejected.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const nclAmount = ncl.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const uclAmount = ucl.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const approvalRate = files.length ? Math.round(((approved.length + disbursed.length) / files.length) * 100) : 0;

            return {
                totalFiles: files.length,
                totalAmount,
                approvedCount: approved.length,
                approvedAmount,
                disbursedCount: disbursed.length,
                disbursedAmount,
                loginCount: login.length,
                loginAmount,
                rejectedCount: rejected.length,
                rejectedAmount,
                nclCount: ncl.length,
                nclAmount,
                uclCount: ucl.length,
                uclAmount,
                approvalRate
            };
        });

        const recentFiles = computed(() => {
            return [...allFiles.value].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
        });

        const filteredFiles = computed(() => {
            const q = roFilters.value.search.trim().toLowerCase();
            let list = allFiles.value.filter(file => {
                const matchSearch = !q || 
                    (file.customerName && file.customerName.toLowerCase().includes(q)) || 
                    (file.appId && file.appId.toLowerCase().includes(q)) ||
                    (file.smName && file.smName.toLowerCase().includes(q)) ||
                    (file.roName && file.roName.toLowerCase().includes(q)) ||
                    (file.sourcingChannel && file.sourcingChannel.toLowerCase().includes(q)) ||
                    (file.status && file.status.toLowerCase().includes(q)) ||
                    (file.ppc && file.ppc.toLowerCase().includes(q));
                const matchStatus = roFilters.value.status 
                    ? (roFilters.value.status === 'Custom' ? !STANDARD_STATUSES.includes(file.status) : file.status === roFilters.value.status) 
                    : true;
                const matchCategory = roFilters.value.nclUcl ? file.nclUcl === roFilters.value.nclUcl : true;
                const matchSourcing = roFilters.value.sourcingChannel ? file.sourcingChannel === roFilters.value.sourcingChannel : true;
                const matchRo = filters.value.roId ? file.roId === filters.value.roId : true;
                const matchTime = matchesTimeline(file.loginDate || file.createdAt || file.updatedAt, roFilters.value.timeline, roFilters.value.customDate);
                return matchSearch && matchStatus && matchCategory && matchSourcing && matchRo && matchTime;
            });

            // Sorting
            return list.sort((a, b) => {
                const dateA = a.loginDate ? new Date(a.loginDate + 'T00:00:00') : new Date(a.createdAt || a.updatedAt);
                const dateB = b.loginDate ? new Date(b.loginDate + 'T00:00:00') : new Date(b.createdAt || b.updatedAt);
                switch (roFilters.value.sortBy) {
                    case 'newest':
                        return dateB - dateA;
                    case 'oldest':
                        return dateA - dateB;
                    case 'amount-desc':
                        return toLakhs(b.loanAmount) - toLakhs(a.loanAmount);
                    case 'amount-asc':
                        return toLakhs(a.loanAmount) - toLakhs(b.loanAmount);
                    case 'name-asc':
                        return (a.customerName || '').localeCompare(b.customerName || '');
                    default:
                        return dateB - dateA;
                }
            });
        });

        // RO Pipeline & Overview Tracking (with filtering, timeline & sorting)
        const filteredMyFiles = computed(() => {
            const q = roFilters.value.search.trim().toLowerCase();
            let list = myFiles.value.filter(file => {
                const matchSearch = !q ||
                    (file.customerName && file.customerName.toLowerCase().includes(q)) ||
                    (file.appId && file.appId.toLowerCase().includes(q)) ||
                    (file.smName && file.smName.toLowerCase().includes(q)) ||
                    (file.sourcingChannel && file.sourcingChannel.toLowerCase().includes(q)) ||
                    (file.status && file.status.toLowerCase().includes(q)) ||
                    (file.ppc && file.ppc.toLowerCase().includes(q));
                const matchStatus = roFilters.value.status 
                    ? (roFilters.value.status === 'Custom' ? !STANDARD_STATUSES.includes(file.status) : file.status === roFilters.value.status) 
                    : true;
                const matchCategory = roFilters.value.nclUcl ? file.nclUcl === roFilters.value.nclUcl : true;
                const matchSourcing = roFilters.value.sourcingChannel ? file.sourcingChannel === roFilters.value.sourcingChannel : true;
                const matchTime = matchesTimeline(file.loginDate || file.createdAt || file.updatedAt, roFilters.value.timeline, roFilters.value.customDate);
                return matchSearch && matchStatus && matchCategory && matchSourcing && matchTime;
            });

            // Sorting
            return list.sort((a, b) => {
                const dateA = a.loginDate ? new Date(a.loginDate + 'T00:00:00') : new Date(a.createdAt || a.updatedAt);
                const dateB = b.loginDate ? new Date(b.loginDate + 'T00:00:00') : new Date(b.createdAt || b.updatedAt);
                switch (roFilters.value.sortBy) {
                    case 'newest':
                        return dateB - dateA;
                    case 'oldest':
                        return dateA - dateB;
                    case 'amount-desc':
                        return toLakhs(b.loanAmount) - toLakhs(a.loanAmount);
                    case 'amount-asc':
                        return toLakhs(a.loanAmount) - toLakhs(b.loanAmount);
                    case 'name-asc':
                        return (a.customerName || '').localeCompare(b.customerName || '');
                    default:
                        return dateB - dateA;
                }
            });
        });


        // --- Methods ---

        // Helpers

        const formatDateOnly = (dateStr) => {
            if (!dateStr) return '';
            if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                const [y, m, d] = dateStr.split('-');
                return `${d}/${m}/${y}`;
            }
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-IN');
        };

        const formatDate = (isoString) => {
            if (!isoString) return '';
            const d = new Date(isoString);
            return d.toLocaleDateString('en-IN') + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        };

        const getStatusBadgeClass = (status) => {
            switch (status) {
                case 'Lead': return 'px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[11px] font-semibold';
                case 'FI': return 'px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-semibold';
                case 'FCU': return 'px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[11px] font-semibold';
                case 'UW': return 'px-2.5 py-0.5 bg-violet-50 text-violet-700 rounded-full text-[11px] font-semibold';
                case 'Cancelled': return 'px-2.5 py-0.5 bg-stone-50 text-stone-700 rounded-full text-[11px] font-semibold';
                case 'Approved': return 'px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-semibold';
                case 'Rejected': return 'px-2.5 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[11px] font-semibold';
                case 'Disbursed': return 'px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-semibold';
                default: return 'px-2.5 py-0.5 bg-fuchsia-50 text-fuchsia-700 rounded-full text-[11px] font-semibold';
            }
        };

        const getTabTitle = (tab) => {
            switch (tab) {
                case 'ro-dashboard': return 'Portfolio Overview';
                case 'ro-tracking': return 'Saved Login Details';
                case 'ro-add-file': return 'New Customer Login';
                case 'dashboard': return 'Global Dashboard';
                case 'tracking': return 'Live File Tracking';
                case 'users': return 'User Management';
                default: return tab ? tab.replace('-', ' ') : '';
            }
        };

        const getTimelineLabel = (timeline) => {
            switch (timeline) {
                case 'today': return 'Today';
                case 'yesterday': return 'Yesterday';
                case 'this-week': return 'This Week';
                case 'this-month': return 'This Month';
                case 'custom': return roFilters.value.customDate ? `Date: ${roFilters.value.customDate}` : 'Custom Date';
                case 'all': return 'All Time';
                default: return 'This Month';
            }
        };

        const getSortLabel = (sortBy) => {
            switch (sortBy) {
                case 'oldest': return 'Oldest First';
                case 'amount-desc': return 'Amount: High to Low';
                case 'amount-asc': return 'Amount: Low to High';
                case 'name-asc': return 'Name: A to Z';
                default: return 'Newest First';
            }
        };

        const resetRoFilters = () => {
            roFilters.value = {
                search: '',
                status: '',
                nclUcl: '',
                sourcingChannel: '',
                timeline: 'this-month',
                customDate: '',
                sortBy: 'newest'
            };
            filters.value.roId = '';
            showCustomDateInput.value = false;
        };

        // Data Loading
        const loadSuperAdminData = async () => {
            allWorkspaces.value = await db.getAllWorkspaces();
            roUsers.value = await db.getAllUsers();
            allFiles.value = await db.getAllLoanFiles();
        };

        const loadSmData = async () => {
            if (!currentUser.value?.tenantId) return;
            allFiles.value = await db.getLoanFilesByTenant(currentUser.value.tenantId);
            roUsers.value = await db.getROUsersByTenant(currentUser.value.tenantId);
        };

        const loadRoData = async () => {
            if (!currentUser.value) return;
            myFiles.value = await db.getLoanFilesByRO(currentUser.value.id);
        };

        const loadData = async () => {
            if (!currentUser.value) return;
            if (isSuperAdmin.value) {
                await loadSuperAdminData();
            } else if (isSM.value) {
                await loadSmData();
            } else {
                await loadRoData();
            }
        };

        const initUserSm = () => {
            if (currentUser.value) {
                const savedSm = localStorage.getItem('axis_default_sm_' + currentUser.value.id) || localStorage.getItem('axis_default_sm') || '';
                if (savedSm) {
                    defaultSmName.value = savedSm.toUpperCase();
                    if (!newFileForm.value.smName) {
                        newFileForm.value.smName = savedSm.toUpperCase();
                    }
                }
            }
        };

        // Auth & Registration
        const registerSM = async () => {
            registerError.value = '';
            try {
                if (!registerForm.value.username || !registerForm.value.password || !registerForm.value.workspaceName) {
                    registerError.value = 'Please fill all required fields.';
                    return;
                }
                const existing = await db.getUserByUsername(registerForm.value.username);
                if (existing) {
                    registerError.value = 'Username already exists.';
                    return;
                }
                
                const workspaceId = await db.addWorkspace({
                    name: registerForm.value.workspaceName.trim(),
                    status: 'active',
                    createdAt: new Date().toISOString()
                });

                await db.addUser({
                    username: registerForm.value.username.trim().toLowerCase(),
                    password: registerForm.value.password.trim(),
                    role: 'sm',
                    name: registerForm.value.name.trim(),
                    tenantId: workspaceId,
                    status: 'active',
                    createdAt: new Date().toISOString()
                });

                alert('Account created successfully! You can now log in.');
                showRegisterMode.value = false;
                registerForm.value = { username: '', password: '', name: '', workspaceName: '' };
            } catch (error) {
                console.error("Registration Error:", error);
                registerError.value = 'Error creating account.';
            }
        };

        const login = async () => {
            loginError.value = '';
            try {
                // Ensure super_admin exists (for testing/first time)
                const count = await db.getUsersCount();
                if (count === 0) {
                    await db.addUser({
                        username: 'owner',
                        password: 'password123',
                        role: 'super_admin',
                        name: 'Platform Owner',
                        status: 'active',
                        createdAt: new Date().toISOString()
                    });
                }

                const inputUsername = loginForm.value.username.trim().toLowerCase();
                const user = await db.getUserByUsername(inputUsername);
                
                if (user && user.password === loginForm.value.password.trim()) {
                    if (user.status === 'suspended') {
                        loginError.value = 'Account is suspended. Contact Administrator.';
                        return;
                    }

                    // Check workspace status for SM and RO
                    if (user.role !== 'super_admin' && user.tenantId) {
                        const workspace = await db.getWorkspace(user.tenantId);
                        if (workspace && workspace.status === 'frozen') {
                            loginError.value = 'Your workspace is currently frozen. Contact support.';
                            return;
                        }
                    }

                    // Store user session
                    const sessionUser = { id: user.id, username: user.username, role: user.role, name: user.name, tenantId: user.tenantId };
                    localStorage.setItem('axis_user', JSON.stringify(sessionUser));
                    currentUser.value = sessionUser;
                    initUserSm();
                    
                    if (isSuperAdmin.value) currentTab.value = 'super-admin-dashboard';
                    else if (isSM.value) currentTab.value = 'dashboard';
                    else currentTab.value = 'ro-dashboard';

                    await loadData();
                } else {
                    loginError.value = 'Invalid username or password';
                }
            } catch (error) {
                console.error("Login Error:", error);
                loginError.value = 'An error occurred during login. Check console.';
            }
        };

        const logout = () => {
            localStorage.removeItem('axis_user');
            currentUser.value = null;
            loginForm.value = { username: '', password: '' };
        };

        // Admin/SM: Users & Workspaces
        const saveNewRo = async () => {
            addRoError.value = '';
            const existing = await db.getUserByUsername(newRoForm.value.username);
            if (existing) {
                addRoError.value = 'Username already exists';
                return;
            }
            
            await db.addUser({
                username: (newRoForm.value.username || '').trim(),
                password: newRoForm.value.password,
                role: 'ro',
                name: (newRoForm.value.name || '').trim().toUpperCase(),
                tenantId: currentUser.value.tenantId,
                status: 'active',
                createdAt: new Date().toISOString()
            });
            
            showAddRoModal.value = false;
            newRoForm.value = { name: '', username: '', password: '' };
            await loadData();
        };

        const toggleUserStatus = async (user) => {
            const newStatus = user.status === 'active' ? 'suspended' : 'active';
            await db.updateUser(user.id, { status: newStatus });
            await loadData();
        };

        const toggleWorkspaceStatus = async (workspace) => {
            const newStatus = workspace.status === 'active' ? 'frozen' : 'active';
            await db.updateWorkspace(workspace.id, { status: newStatus });
            await loadData();
        };

        // RO: Add File
        const resetNewFileForm = () => {
            newFileForm.value = {
                appId: 'ALA00000',
                customerName: '',
                nclUcl: 'NCL',
                sourcingChannel: 'DSA',
                loginDate: getTodayDateStr(),
                loanAmount: '',
                status: 'FI',
                customStatus: '',
                ppc: '',
                smName: (defaultSmName.value || '').toUpperCase(),
                vcip: '',
                mi: ''
            };
        };

        const saveNewFile = async () => {
            if (!currentUser.value) return;
            
            const rawSm = (newFileForm.value.smName ? newFileForm.value.smName.trim() : (defaultSmName.value || '')).toUpperCase();
            if (rawSm) {
                defaultSmName.value = rawSm;
                localStorage.setItem('axis_default_sm_' + currentUser.value.id, defaultSmName.value);
                localStorage.setItem('axis_default_sm', defaultSmName.value);
            }

            const chosenDate = newFileForm.value.loginDate || getTodayDateStr();
            const now = new Date();
            const timeStr = now.toTimeString().split(' ')[0];
            const createdAtIso = `${chosenDate}T${timeStr}.000Z`;
            
            let finalStatus = newFileForm.value.status || 'FI';
            if (finalStatus === 'Custom' && newFileForm.value.customStatus) {
                finalStatus = newFileForm.value.customStatus.trim().toUpperCase();
            }
            
            const newFile = {
                appId: (newFileForm.value.appId || 'ALA00000').trim().toUpperCase(),
                customerName: (newFileForm.value.customerName || '').trim().toUpperCase(),
                nclUcl: (newFileForm.value.nclUcl || 'NCL').trim().toUpperCase(),
                sourcingChannel: (newFileForm.value.sourcingChannel || 'DSA').trim().toUpperCase(),
                loginDate: chosenDate,
                loanAmount: Number(newFileForm.value.loanAmount) || 0,
                status: finalStatus,
                ppc: (newFileForm.value.ppc || '').trim().toUpperCase(),
                smName: rawSm,
                vcip: (newFileForm.value.vcip || '').trim().toUpperCase(),
                mi: (newFileForm.value.mi || '').trim().toUpperCase(),
                roId: currentUser.value.id,
                roName: currentUser.value.name,
                tenantId: currentUser.value.tenantId,
                createdAt: createdAtIso,
                updatedAt: new Date().toISOString()
            };
            
            await db.addLoanFile(newFile);
            resetNewFileForm();
            currentTab.value = 'ro-tracking';
            await loadRoData();
        };

        // Full File Edit Modal (RO & Admin)
        const openEditFileModal = (file) => {
            let fDate = file.loginDate;
            if (!fDate && file.createdAt) {
                fDate = file.createdAt.substring(0, 10);
            }
            const isStandard = STANDARD_STATUSES.includes(file.status);
            editFileForm.value = {
                id: file.id,
                appId: (file.appId || '').toUpperCase(),
                customerName: (file.customerName || '').toUpperCase(),
                nclUcl: (file.nclUcl || 'NCL').toUpperCase(),
                sourcingChannel: (file.sourcingChannel || 'DSA').toUpperCase(),
                loginDate: fDate || getTodayDateStr(),
                loanAmount: toLakhs(file.loanAmount),
                status: isStandard ? file.status : 'Custom',
                customStatus: isStandard ? '' : file.status,
                ppc: (file.ppc || '').toUpperCase(),
                smName: (file.smName || defaultSmName.value || '').toUpperCase(),
                vcip: (file.vcip || '').toUpperCase(),
                mi: (file.mi || '').toUpperCase()
            };
            showEditFileModal.value = true;
        };

        const saveEditedFile = async () => {
            if (!editFileForm.value.id) return;
            
            let finalStatus = editFileForm.value.status;
            if (finalStatus === 'Custom' && editFileForm.value.customStatus) {
                finalStatus = editFileForm.value.customStatus.trim().toUpperCase();
            }
            
            const updatedData = {
                appId: (editFileForm.value.appId || '').trim().toUpperCase(),
                customerName: (editFileForm.value.customerName || '').trim().toUpperCase(),
                nclUcl: (editFileForm.value.nclUcl || 'NCL').trim().toUpperCase(),
                sourcingChannel: (editFileForm.value.sourcingChannel || 'DSA').trim().toUpperCase(),
                loginDate: editFileForm.value.loginDate || getTodayDateStr(),
                loanAmount: Number(editFileForm.value.loanAmount) || 0,
                status: finalStatus,
                ppc: (editFileForm.value.ppc || '').trim().toUpperCase(),
                smName: (editFileForm.value.smName || '').trim().toUpperCase(),
                vcip: (editFileForm.value.vcip || '').trim().toUpperCase(),
                mi: (editFileForm.value.mi || '').trim().toUpperCase(),
                updatedAt: new Date().toISOString()
            };
            
            await db.updateLoanFile(editFileForm.value.id, updatedData);
            showEditFileModal.value = false;
            if (isSM.value) {
                await loadData();
            } else {
                await loadRoData();
            }
        };

        const deleteFile = async (file) => {
            if (confirm(`Are you sure you want to delete the file for "${file.customerName}" (#${file.appId || 'No ID'})?`)) {
                await db.deleteLoanFile(file.id);
                if (isSM.value) {
                    await loadData();
                } else {
                    await loadRoData();
                }
            }
        };

        // Export RO Files to Excel
        const exportRoFilesToExcel = () => {
            if (filteredMyFiles.value.length === 0) {
                alert("No files to export based on current filters.");
                return;
            }

            const exportData = filteredMyFiles.value.map(file => ({
                'Login Date': file.loginDate || (file.createdAt ? file.createdAt.substring(0, 10) : ''),
                'App ID': file.appId || '',
                'Customer Name': file.customerName || '',
                'Category': file.nclUcl || '',
                'Channel': file.sourcingChannel || 'DSA',
                'Loan Amount (Rs)': Math.round(toLakhs(file.loanAmount) * 100000),
                'Status': file.status || '',
                'SM Name': file.smName || '',
                'PPC': file.ppc || '',
                'VCIP': file.vcip || '',
                'MI': file.mi || '',
                'RO Name': file.roName || '',
                'Created At': formatDate(file.createdAt),
                'Last Updated': formatDate(file.updatedAt || file.createdAt)
            }));

            const headers = [
                'Login Date',
                'App ID',
                'Customer Name',
                'Category',
                'Channel',
                'Loan Amount (Rs)',
                'Status',
                'SM Name',
                'PPC',
                'VCIP',
                'MI',
                'RO Name',
                'Created At',
                'Last Updated'
            ];

            const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers });
            worksheet['!cols'] = [
                { wch: 14 },
                { wch: 12 },
                { wch: 24 },
                { wch: 10 },
                { wch: 10 },
                { wch: 18 },
                { wch: 14 },
                { wch: 18 },
                { wch: 12 },
                { wch: 12 },
                { wch: 12 },
                { wch: 18 },
                { wch: 20 },
                { wch: 20 }
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "My_Login_Details");
            
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `AxisAuto_Login_Details_${currentUser.value?.name || 'RO'}_${dateStr}.xlsx`;
            XLSX.writeFile(workbook, filename);
        };

        // File Management (Status Only)
        const openEditStatusModal = (file) => {
            selectedFile.value = file;
            const isStandard = STANDARD_STATUSES.includes(file.status);
            statusUpdateForm.value = { 
                status: isStandard ? file.status : 'Custom', 
                customStatus: isStandard ? '' : file.status,
                note: '' 
            };
            showUpdateStatusModal.value = true;
        };

        const saveFileStatus = async () => {
            if (!selectedFile.value) return;
            
            let finalStatus = statusUpdateForm.value.status;
            if (finalStatus === 'Custom' && statusUpdateForm.value.customStatus) {
                finalStatus = statusUpdateForm.value.customStatus.trim().toUpperCase();
            }
            
            await db.updateLoanFile(selectedFile.value.id, {
                status: finalStatus,
                note: (statusUpdateForm.value.note || '').trim().toUpperCase(),
                updatedAt: new Date().toISOString()
            });
            
            showUpdateStatusModal.value = false;
            if (isSM.value) {
                await loadData();
            } else {
                await loadRoData();
            }
        };

        // View Detail
        const openViewFileModal = (file) => {
            selectedFile.value = file;
            showViewFileModal.value = true;
        };

        // Export to Excel (Admin)
        const exportToExcel = () => {
            if (filteredFiles.value.length === 0) {
                alert("No data to export based on current filters.");
                return;
            }

            const exportData = filteredFiles.value.map(file => ({
                'Login Date': file.loginDate || (file.createdAt ? file.createdAt.substring(0, 10) : ''),
                'App ID': file.appId || '',
                'Customer Name': file.customerName || '',
                'Category': file.nclUcl || '',
                'Channel': file.sourcingChannel || 'DSA',
                'Loan Amount (Rs)': Math.round(toLakhs(file.loanAmount) * 100000),
                'Status': file.status || '',
                'SM Name': file.smName || '',
                'PPC': file.ppc || '',
                'VCIP': file.vcip || '',
                'MI': file.mi || '',
                'RO Name': file.roName || '',
                'Created At': formatDate(file.createdAt),
                'Last Updated': formatDate(file.updatedAt || file.createdAt)
            }));

            const headers = [
                'Login Date',
                'App ID',
                'Customer Name',
                'Category',
                'Channel',
                'Loan Amount (Rs)',
                'Status',
                'SM Name',
                'PPC',
                'VCIP',
                'MI',
                'RO Name',
                'Created At',
                'Last Updated'
            ];

            const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers });
            worksheet['!cols'] = [
                { wch: 14 },
                { wch: 12 },
                { wch: 24 },
                { wch: 10 },
                { wch: 10 },
                { wch: 18 },
                { wch: 14 },
                { wch: 18 },
                { wch: 12 },
                { wch: 12 },
                { wch: 12 },
                { wch: 18 },
                { wch: 20 },
                { wch: 20 }
            ];

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Loan Files");
            
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `AxisAuto_CRM_Export_${dateStr}.xlsx`;
            XLSX.writeFile(workbook, filename);
        };


        // --- Lifecycle ---
        onMounted(async () => {
            // Check for existing session
            const savedUser = localStorage.getItem('axis_user');
            if (savedUser) {
                currentUser.value = JSON.parse(savedUser);
                initUserSm();
                if (isSuperAdmin.value) currentTab.value = 'super-admin-dashboard';
                else if (isSM.value) currentTab.value = 'dashboard';
                else currentTab.value = 'ro-dashboard';
                await loadData();
            }
        });

        // Return everything needed by the template
        return {
            currentUser, loginForm, loginError, currentTab, mobileMenuOpen, defaultSmName,
            isSuperAdmin, isSM, isRO, stats, roStats, recentFiles, filteredFiles, filteredMyFiles, roUsers, myFiles, allWorkspaces,
            showRegisterMode, registerForm, registerError, registerSM, toggleWorkspaceStatus,
            showAddRoModal, newRoForm, addRoError,
            newFileForm, showEditFileModal, editFileForm, showUpdateStatusModal, selectedFile, statusUpdateForm,
            showViewFileModal, filters, roFilters, showMobileFilterDrawer, roOverviewTimeline, roOverviewCustomDate,
            formatCurrency, formatLakhsToRupees, toLakhs, formatDate, formatDateOnly, getStatusBadgeClass, getTabTitle, getTimelineLabel, getSortLabel, resetRoFilters,
            getTodayDateStr, getYesterdayDateStr,
            login, logout, saveNewRo, toggleUserStatus,
            resetNewFileForm, saveNewFile, openEditFileModal, saveEditedFile, deleteFile,
            openEditStatusModal, saveFileStatus, openViewFileModal, exportToExcel, exportRoFilesToExcel
        };
    }
});

app.mount('#app');


