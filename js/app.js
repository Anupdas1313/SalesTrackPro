import * as db from './db.js';
const { createApp, ref, computed, onMounted, watch } = Vue;

const app = createApp({
    setup() {
        // --- State ---
        const currentUser = ref(null);
        const loginForm = ref({ username: '', password: '' });
        const loginError = ref('');
        const currentTab = ref('');
        const mobileMenuOpen = ref(false);

        // Data arrays
        const roUsers = ref([]);
        const allFiles = ref([]);
        const myFiles = ref([]); // For ROs

        // Modals & Forms
        const showAddRoModal = ref(false);
        const newRoForm = ref({ name: '', username: '', password: '' });
        const addRoError = ref('');

        const defaultSmName = ref(localStorage.getItem('axis_default_sm') || '');
        const newFileForm = ref({ appId: 'ALA00000', customerName: '', nclUcl: 'NCL', loanAmount: '', status: 'Login', ppc: '', smName: defaultSmName.value, vcip: '', mi: '' });
        
        // Full File Edit Modal (RO & Admin)
        const showEditFileModal = ref(false);
        const editFileForm = ref({ id: '', appId: '', customerName: '', nclUcl: 'NCL', loanAmount: '', status: 'Login', ppc: '', smName: '', vcip: '', mi: '' });

        const showUpdateStatusModal = ref(false);
        const selectedFile = ref(null);
        const statusUpdateForm = ref({ status: '', note: '' });

        const showViewFileModal = ref(false);

        // Filters (Admin Tracking)
        const filters = ref({ search: '', status: '', roId: '' });
        
        // Filters & Sorting (RO Tracking)
        const roFilters = ref({
            search: '',
            status: '',
            nclUcl: '',
            timeline: 'today', // 'today', 'yesterday', 'this-week', 'this-month', 'all', 'custom'
            customDate: '',
            sortBy: 'newest' // 'newest', 'oldest', 'amount-desc', 'amount-asc', 'name-asc'
        });
        const showMobileFilters = ref(false);
        const showCustomDateInput = ref(false);
        const mySearch = ref('');

        // Helper: Date timeline matching
        const matchesTimeline = (fileDateStr, timeline, customDate) => {
            if (!fileDateStr) return timeline === 'all';
            
            const fileD = new Date(fileDateStr);
            if (isNaN(fileD.getTime())) return true;

            const fileYear = fileD.getFullYear();
            const fileMonth = fileD.getMonth();
            const fileDate = fileD.getDate();

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
        const isAdmin = computed(() => currentUser.value?.role === 'admin');

        const activeFilterCount = computed(() => {
            let count = 0;
            if (roFilters.value.nclUcl) count++;
            if (roFilters.value.sortBy && roFilters.value.sortBy !== 'newest') count++;
            if (roFilters.value.timeline && roFilters.value.timeline !== 'today') count++;
            if (roFilters.value.status) count++;
            return count;
        });

        // Timeline File Counts
        const timelineCounts = computed(() => {
            const files = myFiles.value;
            return {
                today: files.filter(f => matchesTimeline(f.createdAt || f.updatedAt, 'today')).length,
                yesterday: files.filter(f => matchesTimeline(f.createdAt || f.updatedAt, 'yesterday')).length,
                thisWeek: files.filter(f => matchesTimeline(f.createdAt || f.updatedAt, 'this-week')).length,
                thisMonth: files.filter(f => matchesTimeline(f.createdAt || f.updatedAt, 'this-month')).length,
                all: files.length
            };
        });

        // Admin Stats
        const stats = computed(() => {
            const files = allFiles.value;
            const approved = files.filter(f => f.status === 'Approved');
            return {
                totalFiles: files.length,
                approvedFiles: approved.length,
                totalValue: files.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0)
            };
        });

        // RO Overview KPIs
        const roStats = computed(() => {
            const files = myFiles.value;
            const approved = files.filter(f => f.status === 'Approved');
            const disbursed = files.filter(f => f.status === 'Disbursed');
            const login = files.filter(f => f.status === 'Login');
            const rejected = files.filter(f => f.status === 'Rejected');
            const ncl = files.filter(f => f.nclUcl === 'NCL');
            const ucl = files.filter(f => f.nclUcl === 'UCL');

            const totalAmount = files.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
            const approvedAmount = approved.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
            const disbursedAmount = disbursed.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
            const loginAmount = login.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
            const rejectedAmount = rejected.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);

            const nclAmount = ncl.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
            const uclAmount = ucl.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);

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
            const q = filters.value.search.trim().toLowerCase();
            return allFiles.value.filter(file => {
                const matchSearch = !q || 
                    (file.customerName && file.customerName.toLowerCase().includes(q)) || 
                    (file.appId && file.appId.toLowerCase().includes(q)) ||
                    (file.smName && file.smName.toLowerCase().includes(q)) ||
                    (file.roName && file.roName.toLowerCase().includes(q));
                const matchStatus = filters.value.status ? file.status === filters.value.status : true;
                const matchRo = filters.value.roId ? file.roId === filters.value.roId : true;
                return matchSearch && matchStatus && matchRo;
            }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
        });

        // RO Pipeline & Overview Tracking (with filtering, timeline & sorting)
        const filteredMyFiles = computed(() => {
            const q = (roFilters.value.search || mySearch.value).trim().toLowerCase();
            let list = myFiles.value.filter(file => {
                const matchSearch = !q ||
                    (file.customerName && file.customerName.toLowerCase().includes(q)) ||
                    (file.appId && file.appId.toLowerCase().includes(q)) ||
                    (file.smName && file.smName.toLowerCase().includes(q)) ||
                    (file.ppc && file.ppc.toLowerCase().includes(q));
                const matchStatus = roFilters.value.status ? file.status === roFilters.value.status : true;
                const matchCategory = roFilters.value.nclUcl ? file.nclUcl === roFilters.value.nclUcl : true;
                const matchTime = matchesTimeline(file.createdAt || file.updatedAt, roFilters.value.timeline, roFilters.value.customDate);
                return matchSearch && matchStatus && matchCategory && matchTime;
            });

            // Sorting
            return list.sort((a, b) => {
                switch (roFilters.value.sortBy) {
                    case 'newest':
                        return new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt);
                    case 'oldest':
                        return new Date(a.createdAt || a.updatedAt) - new Date(b.createdAt || b.updatedAt);
                    case 'amount-desc':
                        return (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0);
                    case 'amount-asc':
                        return (Number(a.loanAmount) || 0) - (Number(b.loanAmount) || 0);
                    case 'name-asc':
                        return (a.customerName || '').localeCompare(b.customerName || '');
                    default:
                        return new Date(b.createdAt || b.updatedAt) - new Date(a.createdAt || a.updatedAt);
                }
            });
        });


        // --- Methods ---

        // Helpers
        const formatCurrency = (value) => {
            if (!value) return "0.00";
            return Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
        };

        const formatDate = (isoString) => {
            if (!isoString) return '';
            const d = new Date(isoString);
            return d.toLocaleDateString('en-IN') + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        };

        const getStatusBadgeClass = (status) => {
            switch (status) {
                case 'Lead': return 'px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[11px] font-semibold';
                case 'Login': return 'px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-semibold';
                case 'Approved': return 'px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[11px] font-semibold';
                case 'Rejected': return 'px-2.5 py-0.5 bg-rose-50 text-rose-700 rounded-full text-[11px] font-semibold';
                case 'Disbursed': return 'px-2.5 py-0.5 bg-purple-50 text-purple-700 rounded-full text-[11px] font-semibold';
                default: return 'px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[11px] font-semibold';
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
                default: return 'Today';
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
                timeline: 'today',
                customDate: '',
                sortBy: 'newest'
            };
            showCustomDateInput.value = false;
        };

        // Data Loading
        const loadAdminData = async () => {
            allFiles.value = await db.getAllLoanFiles();
            roUsers.value = await db.getROUsers();
        };

        const loadRoData = async () => {
            if (!currentUser.value) return;
            myFiles.value = await db.getLoanFilesByRO(currentUser.value.id);
        };

        const loadData = async () => {
            if (!currentUser.value) return;
            if (isAdmin.value) {
                await loadAdminData();
            } else {
                await loadRoData();
            }
        };

        const initUserSm = () => {
            if (currentUser.value) {
                const savedSm = localStorage.getItem('axis_default_sm_' + currentUser.value.id) || localStorage.getItem('axis_default_sm') || '';
                if (savedSm) {
                    defaultSmName.value = savedSm;
                    if (!newFileForm.value.smName) {
                        newFileForm.value.smName = savedSm;
                    }
                }
            }
        };

        // Auth
        const login = async () => {
            loginError.value = '';
            try {
                // Ensure the database has the admin user (just in case seeding failed earlier)
                const count = await db.getUsersCount();
                if (count === 0) {
                    await db.addUser({
                        username: 'admin',
                        password: 'password123',
                        role: 'admin',
                        name: 'System Admin',
                        status: 'active',
                        createdAt: new Date().toISOString()
                    });
                }

                const inputUsername = loginForm.value.username.trim().toLowerCase();
                const allUsers = await db.getAllUsers();
                const user = allUsers.find(u => u.username.toLowerCase() === inputUsername);
                
                if (user && user.password === loginForm.value.password.trim()) {
                    if (user.status === 'suspended') {
                        loginError.value = 'Account is suspended. Contact Administrator.';
                        return;
                    }
                    // Store user session
                    const sessionUser = { id: user.id, username: user.username, role: user.role, name: user.name };
                    localStorage.setItem('axis_user', JSON.stringify(sessionUser));
                    currentUser.value = sessionUser;
                    initUserSm();
                    
                    currentTab.value = isAdmin.value ? 'dashboard' : 'ro-dashboard';
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

        // Admin: Users
        const saveNewRo = async () => {
            addRoError.value = '';
            const existing = await db.getUserByUsername(newRoForm.value.username);
            if (existing) {
                addRoError.value = 'Username already exists';
                return;
            }
            
            await db.addUser({
                username: newRoForm.value.username,
                password: newRoForm.value.password,
                role: 'ro',
                name: newRoForm.value.name,
                status: 'active',
                createdAt: new Date().toISOString()
            });
            
            showAddRoModal.value = false;
            newRoForm.value = { name: '', username: '', password: '' };
            await loadAdminData();
        };

        const toggleUserStatus = async (user) => {
            const newStatus = user.status === 'active' ? 'suspended' : 'active';
            await db.updateUser(user.id, { status: newStatus });
            await loadAdminData();
        };

        // RO: Add File
        const resetNewFileForm = () => {
            newFileForm.value = {
                appId: 'ALA00000',
                customerName: '',
                nclUcl: 'NCL',
                loanAmount: '',
                status: 'Login',
                ppc: '',
                smName: defaultSmName.value || '',
                vcip: '',
                mi: ''
            };
        };

        const saveNewFile = async () => {
            if (!currentUser.value) return;
            
            if (newFileForm.value.smName && newFileForm.value.smName.trim()) {
                defaultSmName.value = newFileForm.value.smName.trim();
                localStorage.setItem('axis_default_sm_' + currentUser.value.id, defaultSmName.value);
                localStorage.setItem('axis_default_sm', defaultSmName.value);
            }
            
            const smToSave = newFileForm.value.smName ? newFileForm.value.smName.trim() : (defaultSmName.value || '');
            
            const newFile = {
                ...newFileForm.value,
                smName: smToSave,
                roId: currentUser.value.id,
                roName: currentUser.value.name,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            await db.addLoanFile(newFile);
            resetNewFileForm();
            currentTab.value = 'ro-tracking';
            await loadRoData();
        };

        // Full File Edit Modal (RO & Admin)
        const openEditFileModal = (file) => {
            editFileForm.value = {
                id: file.id,
                appId: file.appId || '',
                customerName: file.customerName || '',
                nclUcl: file.nclUcl || 'NCL',
                loanAmount: file.loanAmount || 0,
                status: file.status || 'Login',
                ppc: file.ppc || '',
                smName: file.smName || defaultSmName.value || '',
                vcip: file.vcip || '',
                mi: file.mi || ''
            };
            showEditFileModal.value = true;
        };

        const saveEditedFile = async () => {
            if (!editFileForm.value.id) return;
            
            const updatedData = {
                appId: editFileForm.value.appId,
                customerName: editFileForm.value.customerName,
                nclUcl: editFileForm.value.nclUcl,
                loanAmount: editFileForm.value.loanAmount,
                status: editFileForm.value.status,
                ppc: editFileForm.value.ppc,
                smName: editFileForm.value.smName,
                vcip: editFileForm.value.vcip,
                mi: editFileForm.value.mi,
                updatedAt: new Date().toISOString()
            };
            
            await db.updateLoanFile(editFileForm.value.id, updatedData);
            showEditFileModal.value = false;
            if (isAdmin.value) {
                await loadAdminData();
            } else {
                await loadRoData();
            }
        };

        const deleteFile = async (file) => {
            if (confirm(`Are you sure you want to delete the file for "${file.customerName}" (#${file.appId || 'No ID'})?`)) {
                await db.deleteLoanFile(file.id);
                if (isAdmin.value) {
                    await loadAdminData();
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
                'App ID': file.appId || '',
                'Customer Name': file.customerName,
                'NCL / UCL': file.nclUcl || '',
                'Loan Amount (INR)': file.loanAmount,
                'Status': file.status,
                'PPC': file.ppc || '',
                'SM Name': file.smName || '',
                'RO Name': file.roName,
                'VCIP': file.vcip || '',
                'MI': file.mi || '',
                'Created At': formatDate(file.createdAt),
                'Last Updated': formatDate(file.updatedAt || file.createdAt)
            }));

            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "My_Login_Details");
            
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `AxisAuto_Login_Details_${currentUser.value?.name || 'RO'}_${dateStr}.xlsx`;
            XLSX.writeFile(workbook, filename);
        };

        // File Management (Status Only)
        const openEditStatusModal = (file) => {
            selectedFile.value = file;
            statusUpdateForm.value = { status: file.status, note: '' };
            showUpdateStatusModal.value = true;
        };

        const saveFileStatus = async () => {
            if (!selectedFile.value) return;
            
            await db.updateLoanFile(selectedFile.value.id, {
                status: statusUpdateForm.value.status,
                updatedAt: new Date().toISOString()
            });
            
            showUpdateStatusModal.value = false;
            if (isAdmin.value) {
                await loadAdminData();
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
                'App ID': file.appId || '',
                'Customer Name': file.customerName,
                'NCL/UCL': file.nclUcl || '',
                'Loan Amount (Rs)': file.loanAmount,
                'Status': file.status,
                'Ppc': file.ppc || '',
                'SM Name': file.smName || '',
                'RO Name': file.roName,
                'VCIP': file.vcip || '',
                'MI': file.mi || '',
                'Created At': formatDate(file.createdAt),
                'Last Updated': formatDate(file.updatedAt || file.createdAt)
            }));

            const worksheet = XLSX.utils.json_to_sheet(exportData);
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
                currentTab.value = isAdmin.value ? 'dashboard' : 'ro-dashboard';
                await loadData();
            }
        });

        // Return everything needed by the template
        return {
            currentUser, loginForm, loginError, currentTab, mobileMenuOpen, defaultSmName,
            isAdmin, stats, roStats, recentFiles, filteredFiles, filteredMyFiles, roUsers, myFiles,
            showAddRoModal, newRoForm, addRoError,
            newFileForm, showEditFileModal, editFileForm, showUpdateStatusModal, selectedFile, statusUpdateForm,
            showViewFileModal, filters, roFilters, showMobileFilters, showCustomDateInput, activeFilterCount, timelineCounts, mySearch,
            formatCurrency, formatDate, getStatusBadgeClass, getTabTitle, getTimelineLabel, getSortLabel, resetRoFilters,
            login, logout, saveNewRo, toggleUserStatus,
            resetNewFileForm, saveNewFile, openEditFileModal, saveEditedFile, deleteFile,
            openEditStatusModal, saveFileStatus, openViewFileModal, exportToExcel, exportRoFilesToExcel
        };
    }
});

app.mount('#app');


