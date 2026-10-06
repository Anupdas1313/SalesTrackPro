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

        const newFileForm = ref({ appId: '', customerName: '', nclUcl: '', loanAmount: '', status: 'Login', ppc: '', smName: '', vcip: '', mi: '' });
        
        const showUpdateStatusModal = ref(false);
        const selectedFile = ref(null);
        const statusUpdateForm = ref({ status: '', note: '' });

        const showViewFileModal = ref(false);

        // Filters (Admin Tracking)
        const filters = ref({ search: '', status: '', roId: '' });
        const mySearch = ref('');

        // --- Computed ---
        const isAdmin = computed(() => currentUser.value?.role === 'admin');

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

        const recentFiles = computed(() => {
            return [...allFiles.value].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
        });

        const filteredFiles = computed(() => {
            return allFiles.value.filter(file => {
                const matchSearch = file.customerName.toLowerCase().includes(filters.value.search.toLowerCase()) || 
                                    (file.phone && file.phone.includes(filters.value.search));
                const matchStatus = filters.value.status ? file.status === filters.value.status : true;
                const matchRo = filters.value.roId ? file.roId === filters.value.roId : true;
                return matchSearch && matchStatus && matchRo;
            }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
        });

        // RO Pipeline
        const filteredMyFiles = computed(() => {
            return myFiles.value.filter(file => {
                return file.customerName.toLowerCase().includes(mySearch.value.toLowerCase());
            }).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
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
                case 'Lead': return 'px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold';
                case 'Login': return 'px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-semibold';
                case 'Approved': return 'px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold';
                case 'Rejected': return 'px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold';
                case 'Disbursed': return 'px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-semibold';
                default: return 'px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-semibold';
            }
        };

        const getTabTitle = (tab) => {
            return tab.replace('-', ' ');
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
            newFileForm.value = { appId: '', customerName: '', nclUcl: '', loanAmount: '', status: 'Login', ppc: '', smName: '', vcip: '', mi: '' };
        };

        const saveNewFile = async () => {
            if (!currentUser.value) return;
            
            const newFile = {
                ...newFileForm.value,
                roId: currentUser.value.id,
                roName: currentUser.value.name,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            
            await db.addLoanFile(newFile);
            resetNewFileForm();
            currentTab.value = 'ro-dashboard';
            await loadRoData();
        };

        // File Management (Status)
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
                // In a real app, you might append the note to an audit log array
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

        // Export to Excel
        const exportToExcel = () => {
            if (filteredFiles.value.length === 0) {
                alert("No data to export based on current filters.");
                return;
            }

            // Map data to a clean format for Excel
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

            // Create worksheet and workbook
            const worksheet = XLSX.utils.json_to_sheet(exportData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Loan Files");
            
            // Generate filename with current date
            const dateStr = new Date().toISOString().split('T')[0];
            const filename = `AxisAuto_CRM_Export_${dateStr}.xlsx`;

            // Trigger download
            XLSX.writeFile(workbook, filename);
        };


        // --- Lifecycle ---
        onMounted(async () => {
            // Check for existing session
            const savedUser = localStorage.getItem('axis_user');
            if (savedUser) {
                currentUser.value = JSON.parse(savedUser);
                currentTab.value = isAdmin.value ? 'dashboard' : 'ro-dashboard';
                await loadData();
            }
        });

        // Return everything needed by the template
        return {
            currentUser, loginForm, loginError, currentTab, mobileMenuOpen,
            isAdmin, stats, recentFiles, filteredFiles, filteredMyFiles, roUsers, myFiles,
            showAddRoModal, newRoForm, addRoError,
            newFileForm, showUpdateStatusModal, selectedFile, statusUpdateForm,
            showViewFileModal, filters, mySearch,
            formatCurrency, formatDate, getStatusBadgeClass, getTabTitle,
            login, logout, saveNewRo, toggleUserStatus,
            resetNewFileForm, saveNewFile, openEditStatusModal, saveFileStatus,
            openViewFileModal, exportToExcel
        };
    }
});

app.mount('#app');


