import * as db from './db.js';
const { createApp, ref, computed, onMounted, watch } = Vue;

const app = createApp({
    setup() {
        const showMobileFilterDrawer = ref(false);
        const getInitialUser = () => {
            const savedUser = localStorage.getItem('axis_user');
            if (savedUser) {
                try {
                    const parsed = JSON.parse(savedUser);
                    if (!parsed.email && parsed.role !== 'ro') return null;
                    return parsed;
                } catch(e) {}
            }
            return null;
        };
        const initialUser = getInitialUser();
        
        // --- State ---
        const currentUser = ref(initialUser);
        const loginForm = ref({ username: '', password: '' });
        const loginError = ref('');
        const isLoggingIn = ref(false);
        const loginStage = ref(''); // '' | 'selecting' | 'verifying'
        const isRegistering = ref(false);
        const registerStage = ref(''); // '' | 'selecting' | 'setting_up'
        const showRegisterMode = ref(false);
        const registerForm = ref({ name: '', region: '', phone: '', passcode: '', bankName: 'Axis Bank', customBankName: '', division: 'Auto Loans (Car Loans)' });
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
                'HDFC Bank',
                'ICICI Bank',
                'Kotak Mahindra Bank',
                'IndusInd Bank',
                'Yes Bank',
                'IDFC FIRST Bank',
                'Federal Bank',
                'Bandhan Bank',
                'RBL Bank',
                'South Indian Bank',
                'City Union Bank',
                'Karur Vysya Bank',
                'Karnataka Bank',
                'Tamilnad Mercantile Bank',
                'CSB Bank',
                'DCB Bank',
                'Jammu & Kashmir Bank',
                'Dhanlaxmi Bank',
                'Nainital Bank'
            ],
            public: [
                'State Bank of India (SBI)',
                'Punjab National Bank (PNB)',
                'Bank of Baroda (BOB)',
                'Canara Bank',
                'Union Bank of India',
                'Bank of India (BOI)',
                'Indian Bank',
                'Central Bank of India',
                'Indian Overseas Bank (IOB)',
                'UCO Bank',
                'Bank of Maharashtra',
                'Punjab & Sind Bank'
            ],
            sfb: [
                'AU Small Finance Bank',
                'Equitas Small Finance Bank',
                'Ujjivan Small Finance Bank',
                'Jana Small Finance Bank',
                'Capital Small Finance Bank',
                'ESAF Small Finance Bank',
                'Suryoday Small Finance Bank',
                'Utkarsh Small Finance Bank',
                'Unity Small Finance Bank',
                'Shivalik Small Finance Bank',
                'Fincare Small Finance Bank',
                'North East Small Finance Bank'
            ],
            nbfc: [
                'Bajaj Finance Ltd',
                'Tata Capital',
                'Mahindra & Mahindra Financial Services (Mahindra Finance)',
                'Cholamandalam Investment and Finance (Chola)',
                'Shriram Finance Ltd',
                'Muthoot Finance',
                'Manappuram Finance',
                'Sundaram Finance',
                'L&T Finance Holdings',
                'Poonawalla Fincorp',
                'Aditya Birla Finance',
                'Piramal Capital & Housing Finance',
                'Hero FinCorp',
                'HDB Financial Services',
                'TVS Credit Services',
                'SMFG India Credit (Fullerton India)',
                'IIFL Finance',
                'InCred Financial Services',
                'DMI Finance',
                'Clix Capital',
                'Capri Global Capital',
                'Fedbank Financial Services (Fedfina)',
                'Five-Star Business Finance',
                'SK Finance',
                'Kogta Financial',
                'MAS Financial Services',
                'Northern Arc Capital',
                'Navi Finserv',
                'KreditBee / KrazyBee',
                'Moneyview (Whizdm Innovations)',
                'Protium Finance',
                'Oxyzo Financial Services',
                'Vivriti Capital',
                'Aye Finance',
                'Kinara Capital',
                'NeoGrowth Credit',
                'Lendingkart Finance',
                'Avanse Financial Services',
                'Auxilo Finserve',
                'Hiranandani Financial Services'
            ],
            hfc: [
                'LIC Housing Finance',
                'PNB Housing Finance',
                'Can Fin Homes',
                'Aavas Financiers',
                'Home First Finance Company (HFFC)',
                'Aptus Value Housing Finance',
                'Repco Home Finance',
                'GIC Housing Finance',
                'Vastu Housing Finance',
                'Shubham Housing Development Finance',
                'Grihum Housing Finance',
                'India Shelter Finance Corporation',
                'Svatantra Housing Finance',
                'Star Housing Finance'
            ],
            foreign: [
                'Standard Chartered Bank',
                'Citibank India',
                'HSBC Bank India',
                'Barclays Bank',
                'Deutsche Bank',
                'DBS Bank India',
                'Bank of America',
                'JP Morgan Chase Bank',
                'BNP Paribas',
                'State Bank of Mauritius (SBM Bank India)'
            ]
        };
        const registerError = ref('');
        
        const getInitialTab = () => {
            if (!initialUser) return '';
            if (initialUser.role === 'super_admin') return 'super-admin-dashboard';
            if (initialUser.role === 'sm' || initialUser.role === 'admin') return 'dashboard';
            return 'ro-dashboard';
        };
        const currentTab = ref(getInitialTab());
        const mobileMenuOpen = ref(false);

        // Data arrays
        const roUsers = ref([]);
        const allFiles = ref([]);
        const myFiles = ref([]); // For ROs
        const allWorkspaces = ref([]); // For Super Admin

        // Modals & Forms
        const showAddRoModal = ref(false);
        const newRoForm = ref({ name: '', email: '' });
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
            smName: defaultSmName.value || '',
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
            smName: defaultSmName.value || '',
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
            timeline: 'today', // 'today', 'yesterday', 'this-week', 'this-month', 'all', 'custom'
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

        // SM Overview State
        const smOverviewTimeline = ref('this-month');
        const smOverviewCustomDate = ref('');

        // Admin Stats
        const stats = computed(() => {
            const files = allFiles.value.filter(f => matchesTimeline(f.loginDate || f.createdAt || f.updatedAt, smOverviewTimeline.value, smOverviewCustomDate.value));
            const approved = files.filter(f => f.status === 'Approved');
            const disbursed = files.filter(f => f.status === 'Disbursed');
            const login = files.filter(f => f.status === 'FI');
            const rejected = files.filter(f => f.status === 'Rejected');
            
            const totalAmount = files.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const approvedAmount = approved.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const disbursedAmount = disbursed.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const loginAmount = login.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const rejectedAmount = rejected.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const approvalRate = files.length ? Math.round(((approved.length + disbursed.length) / files.length) * 100) : 0;

            return {
                totalFiles: files.length,
                totalValue: totalAmount,
                approvedFiles: approved.length,
                approvedCount: approved.length,
                approvedAmount,
                disbursedCount: disbursed.length,
                disbursedAmount,
                loginCount: login.length,
                loginAmount,
                rejectedCount: rejected.length,
                rejectedAmount,
                approvalRate
            };
        });

        // SM Leaderboard
        const smLeaderboard = computed(() => {
            if (!roUsers.value || roUsers.value.length === 0) return [];
            
            const files = allFiles.value.filter(f => matchesTimeline(f.loginDate || f.createdAt || f.updatedAt, smOverviewTimeline.value, smOverviewCustomDate.value));
            
            return roUsers.value.map(ro => {
                const roFiles = files.filter(f => f.roId === ro.id);
                const approvedFiles = roFiles.filter(f => f.status === 'Approved' || f.status === 'Disbursed');
                const disbursedFiles = roFiles.filter(f => f.status === 'Disbursed');
                
                const totalAmount = roFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
                const disbursedAmount = disbursedFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
                
                return {
                    id: ro.id,
                    name: ro.name,
                    email: ro.email,
                    user: ro,
                    totalFiles: roFiles.length,
                    totalAmount,
                    approvedFiles: approvedFiles.length,
                    disbursedAmount,
                    conversionRate: roFiles.length > 0 ? Math.round((disbursedFiles.length / roFiles.length) * 100) : 0
                };
            }).sort((a, b) => b.disbursedAmount - a.disbursedAmount || b.totalFiles - a.totalFiles);
        });

        // Split active and suspended ROs for clear visual separation
        const activeRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status !== 'suspended');
        });

        const suspendedRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status === 'suspended');
        });

        // RO 360 Inspector Drawer State & Logic (For SM Monitoring)
        const selectedRoForInspection = ref(null);
        const showRoInspectorDrawer = ref(false);
        const roInspectorActiveTab = ref('overview'); // 'overview' | 'pipeline' | 'stalled'

        const openRoInspector = (ro) => {
            const roUser = roUsers.value.find(u => u.id === (ro.id || ro)) || ro;
            selectedRoForInspection.value = roUser;
            roInspectorActiveTab.value = 'overview';
            showRoInspectorDrawer.value = true;
        };

        const closeRoInspector = () => {
            showRoInspectorDrawer.value = false;
            selectedRoForInspection.value = null;
        };

        const selectedRoAnalytics = computed(() => {
            if (!selectedRoForInspection.value) return null;
            const ro = selectedRoForInspection.value;
            const roId = ro.id;
            const roName = (ro.name || '').trim().toUpperCase();

            // All files for this RO across entire tenant
            const roAllFiles = allFiles.value.filter(f => f.roId === roId || (f.roName && f.roName.trim().toUpperCase() === roName));
            
            // Today's files
            const today = new Date().toISOString().split('T')[0];
            const todayLogins = roAllFiles.filter(f => (f.createdAt && f.createdAt.startsWith(today)) || f.loginDate === today);
            const todayDisb = roAllFiles.filter(f => f.status === 'Disbursed' && ((f.updatedAt && f.updatedAt.startsWith(today)) || (f.loginDate === today)));
            const todayLoginsCount = todayLogins.length;
            const todayLoginsVolume = todayLogins.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const todayDisbCount = todayDisb.length;
            const todayDisbVolume = todayDisb.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            // Today's EOD Report for this RO
            const todayEod = smEods.value.find(e => e.userId === roId && e.date === today);
            const hasSubmittedToday = Boolean(todayEod);

            // MTD Files (Current Month)
            const now = new Date();
            const currentYear = now.getFullYear();
            const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
            const currentYearMonth = `${currentYear}-${currentMonth}`;

            const mtdFiles = roAllFiles.filter(f => {
                const d = f.loginDate || f.createdAt;
                return d && d.startsWith(currentYearMonth);
            });

            const mtdCount = mtdFiles.length;
            const mtdVolume = mtdFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const mtdApproved = mtdFiles.filter(f => f.status === 'Approved');
            const mtdApprovedCount = mtdApproved.length;
            const mtdApprovedVolume = mtdApproved.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const mtdDisbursed = mtdFiles.filter(f => f.status === 'Disbursed');
            const mtdDisbCount = mtdDisbursed.length;
            const mtdDisbVolume = mtdDisbursed.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            // Conversion rate: Disbursed / Total MTD Logins
            const conversionRate = mtdCount > 0 ? Math.round((mtdDisbCount / mtdCount) * 100) : 0;
            const approvalRate = mtdCount > 0 ? Math.round(((mtdApprovedCount + mtdDisbCount) / mtdCount) * 100) : 0;

            // NCL vs UCL split
            const nclFiles = mtdFiles.filter(f => (f.nclUcl || '').toUpperCase() === 'NCL');
            const uclFiles = mtdFiles.filter(f => (f.nclUcl || '').toUpperCase() === 'UCL');
            const nclCount = nclFiles.length;
            const uclCount = uclFiles.length;
            const nclVolume = nclFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const uclVolume = uclFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            // Active / Open Pipeline (Not Disbursed, Cancelled, Rejected)
            const activePipelineFiles = roAllFiles.filter(f => !['Disbursed', 'Cancelled', 'Rejected'].includes(f.status));

            // Stalled / Attention cases for this RO (> 3 days in Lead/FI/UW or > 4 days in Approved)
            const stalledFiles = roAllFiles.filter(f => {
                if (['Cancelled', 'Rejected', 'Disbursed'].includes(f.status)) return false;
                const updatedTime = new Date(f.updatedAt || f.createdAt || Date.now());
                const diffDays = Math.floor((now - updatedTime) / (1000 * 60 * 60 * 24));
                if (f.status === 'Approved' && diffDays >= 4) return true;
                if (['Lead', 'FI', 'FCU', 'UW'].includes(f.status) && diffDays >= 3) return true;
                return false;
            }).map(f => {
                const updatedTime = new Date(f.updatedAt || f.createdAt || Date.now());
                const daysStalled = Math.max(1, Math.floor((now - updatedTime) / (1000 * 60 * 60 * 24)));
                return { ...f, daysStalled };
            });

            return {
                ro,
                todayLoginsCount,
                todayLoginsVolume,
                todayDisbCount,
                todayDisbVolume,
                hasSubmittedToday,
                todayEod,
                mtdCount,
                mtdVolume,
                mtdApprovedCount,
                mtdApprovedVolume,
                mtdDisbCount,
                mtdDisbVolume,
                conversionRate,
                approvalRate,
                nclCount,
                uclCount,
                nclVolume,
                uclVolume,
                activePipelineFiles,
                stalledFiles
            };
        });

        const generateSmNudgeWhatsApp = (type) => {
            if (!selectedRoAnalytics.value) return '';
            const a = selectedRoAnalytics.value;
            const roName = a.ro.name || 'RO';
            const today = new Date().toLocaleDateString('en-GB');

            let msg = '';
            if (type === 'eod_pending') {
                msg = `*URGENT: Daily EOD Pending*\n\nHi ${roName},\nYour Daily EOD report for today (${today}) is still pending on Sales Link.\n\nPlease log in and submit your final login/disbursement numbers and tomorrow's commitment as soon as possible.\n\n— Sales Manager`;
            } else if (type === 'stalled_cases') {
                msg = `*ALERT: Stalled Pipeline Cases*\n\nHi ${roName},\nYou currently have ${a.stalledFiles.length} file(s) pending movement in Underwriting/Approval on Sales Link:\n`;
                a.stalledFiles.slice(0, 5).forEach((f, i) => {
                    msg += `${i+1}. ${f.customerName} (#${f.appId || 'NoID'}) - Rs.${formatCurrency(f.loanAmount)} (${f.status}, ${f.daysStalled || 3}d stuck)\n`;
                });
                msg += `\nPlease coordinate with credit and dealers today to get these approved/disbursed.\n\n— Sales Manager`;
            } else if (type === 'performance_review') {
                msg = `*Sales Link: Performance Check*\n\nHi ${roName},\nHere is your MTD performance snapshot:\n• Logins MTD: ${a.mtdCount} (Rs.${formatCurrency(a.mtdVolume)})\n• Disbursed MTD: ${a.mtdDisbCount} (Rs.${formatCurrency(a.mtdDisbVolume)})\n• Conversion Rate: ${a.conversionRate}%\n• Active Pipeline: ${a.activePipelineFiles.length} files\n\nLet's push hard on pending cases before month-end!\n\n— Sales Manager`;
            } else if (type === 'kudos') {
                msg = `*Great Job Today! 🌟*\n\nKudos ${roName}!\nAwesome performance today with ${a.todayLoginsCount} logins (Rs.${formatCurrency(a.todayLoginsVolume)}) and ${a.todayDisbCount} disbursement(s).\nKeep leading from the front! 🚀\n\n— Sales Manager`;
            }
            return encodeURIComponent(msg);
        };

        const generateFileAlertWhatsApp = (file) => {
            if (!file || !selectedRoAnalytics.value) return '';
            const roName = selectedRoAnalytics.value.ro.name || 'RO';
            const msg = `*Urgent File Movement Alert*\n\nHi ${roName},\nCase #${file.appId || 'NoID'} for ${file.customerName} (Rs.${formatCurrency(file.loanAmount)}) has been stuck in ${file.status} for ${file.daysStalled || 3} days.\n\nPlease check immediately with credit and update status.\n\n— Sales Manager`;
            return encodeURIComponent(msg);
        };

        // SaaS Owner (Super Admin) Overview State
        const saasOverviewTimeline = ref('this-month');
        const saasOverviewCustomDate = ref('');

        const saasStats = computed(() => {
            const files = allFiles.value.filter(f => matchesTimeline(f.loginDate || f.createdAt || f.updatedAt, saasOverviewTimeline.value, saasOverviewCustomDate.value));
            
            // To calculate Active Users in the selected timeframe, we find unique roIds in the files logged in that timeframe.
            const activeUserIds = new Set(files.filter(f => f.roId).map(f => f.roId));
            
            // Workspaces created in the selected timeframe
            const newWorkspaces = allWorkspaces.value.filter(w => matchesTimeline(w.createdAt, saasOverviewTimeline.value, saasOverviewCustomDate.value));
            
            return {
                totalWorkspaces: allWorkspaces.value.length,
                newWorkspaces: newWorkspaces.length,
                totalUsers: roUsers.value.length,
                activeUsers: activeUserIds.size,
                totalFiles: files.length,
                filesAllTime: allFiles.value.length
            };
        });

        const tenantHealthList = computed(() => {
            return allWorkspaces.value.map(workspace => {
                const wUsers = roUsers.value.filter(u => u.tenantId === workspace.id);
                const wFiles = allFiles.value.filter(f => f.tenantId === workspace.id || (!f.tenantId && f.smName === workspace.id));
                
                let lastActive = null;
                if (wFiles.length > 0) {
                    const sortedFiles = [...wFiles].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    lastActive = sortedFiles[0].createdAt;
                }
                
                return {
                    ...workspace,
                    bankName: workspace.bankName || 'Axis Bank',
                    division: workspace.division || 'Auto Loans (Car Loans)',
                    roCount: wUsers.length,
                    fileCount: wFiles.length,
                    lastActive
                };
            }).sort((a, b) => b.fileCount - a.fileCount);
        });

        const userSearchQuery = ref('');
        const userFilterStatus = ref('all');
        const expandedWorkspaces = ref([]);
        
        const toggleWorkspaceExpansion = (workspaceId) => {
            const index = expandedWorkspaces.value.indexOf(workspaceId);
            if (index > -1) expandedWorkspaces.value.splice(index, 1);
            else expandedWorkspaces.value.push(workspaceId);
        };
        
        const expandAllWorkspaces = () => {
            expandedWorkspaces.value = allWorkspaces.value.map(w => w.id);
            expandedWorkspaces.value.push('system');
        };
        
        const collapseAllWorkspaces = () => {
            expandedWorkspaces.value = [];
        };

        watch(allWorkspaces, (newVal) => {
            if (expandedWorkspaces.value.length === 0 && newVal.length > 0) {
                expandAllWorkspaces();
            }
        }, { immediate: true });

        const groupedUsers = computed(() => {
            let allPlatformUsers = roUsers.value.filter(u => u.role !== 'super_admin' && u.email !== 'anupdas8354@gmail.com');
            
            if (userFilterStatus.value !== 'all') {
                allPlatformUsers = allPlatformUsers.filter(u => (u.status || 'active') === userFilterStatus.value);
            }
            if (userSearchQuery.value) {
                const q = userSearchQuery.value.toLowerCase();
                allPlatformUsers = allPlatformUsers.filter(u => 
                    u.name.toLowerCase().includes(q) || 
                    (u.email && u.email.toLowerCase().includes(q))
                );
            }

            const systemUsers = allPlatformUsers.filter(u => !u.tenantId);
            
            const grouped = allWorkspaces.value.map(workspace => {
                const wUsers = allPlatformUsers.filter(u => u.tenantId === workspace.id);
                
                const enhancedUsers = wUsers.map(u => {
                    const uFiles = allFiles.value.filter(f => f.userId === u.id);
                    let lastActive = null;
                    if (uFiles.length > 0) {
                        lastActive = [...uFiles].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt;
                    }
                    return { ...u, fileCount: uFiles.length, lastActive };
                });
                
                return {
                    workspace,
                    isExpanded: expandedWorkspaces.value.includes(workspace.id),
                    smUsers: enhancedUsers.filter(u => u.role === 'sm'),
                    roUsers: enhancedUsers.filter(u => u.role === 'ro' || u.role !== 'sm') // Catch-all for non-sm
                };
            }).filter(group => group.smUsers.length > 0 || group.roUsers.length > 0)
              .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name));
            
            if (systemUsers.length > 0) {
                const enhancedSystem = systemUsers.map(u => {
                    const uFiles = allFiles.value.filter(f => f.userId === u.id);
                    let lastActive = null;
                    if (uFiles.length > 0) {
                        lastActive = [...uFiles].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt;
                    }
                    return { ...u, fileCount: uFiles.length, lastActive };
                });
                grouped.push({
                    workspace: { id: 'system', name: 'System / Unassigned', status: 'active' },
                    isExpanded: expandedWorkspaces.value.includes('system'),
                    smUsers: enhancedSystem.filter(u => u.role === 'sm'),
                    roUsers: enhancedSystem.filter(u => u.role !== 'sm')
                });
            }
            
            return grouped;
        });

        const showEditUserModal = ref(false);
        const editUserForm = ref({ id: '', name: '', email: '', tenantId: '', role: '' });

        const openEditUserModal = (user) => {
            editUserForm.value = {
                id: user.id || '',
                name: user.name || '',
                email: user.email || '',
                tenantId: user.tenantId || '',
                role: user.role || 'ro'
            };
            showEditUserModal.value = true;
        };

        const saveUserEdit = async () => {
            try {
                const cleanedName = (editUserForm.value.name || '').trim();
                const cleanedEmail = (editUserForm.value.email || '').trim().toLowerCase();

                if (!cleanedName) {
                    alert("User full name is required.");
                    return;
                }
                if (!cleanedEmail) {
                    alert("A valid Google Email address is required.");
                    return;
                }

                const updatePayload = {
                    name: cleanedName,
                    email: cleanedEmail
                };
                if (editUserForm.value.role) {
                    updatePayload.role = editUserForm.value.role;
                }
                if (editUserForm.value.tenantId !== undefined) {
                    updatePayload.tenantId = editUserForm.value.tenantId;
                }

                await db.updateUser(editUserForm.value.id, updatePayload);

                const index = roUsers.value.findIndex(u => u.id === editUserForm.value.id);
                if (index !== -1) {
                    roUsers.value[index] = {
                        ...roUsers.value[index],
                        name: cleanedName,
                        email: cleanedEmail,
                        role: updatePayload.role || roUsers.value[index].role,
                        tenantId: updatePayload.tenantId !== undefined ? updatePayload.tenantId : roUsers.value[index].tenantId
                    };
                }

                await loadData();
                showEditUserModal.value = false;
                alert('User details updated successfully!');
            } catch (error) {
                console.error("Error saving user edit", error);
                alert("Failed to save user changes: " + (error.message || error));
            }
        };

        // RO Overview State
        const roOverviewTimeline = ref('today');
        const roOverviewCustomDate = ref('');

        // RO Overview KPIs
        const roStats = computed(() => {
            const files = myFiles.value.filter(f => matchesTimeline(f.loginDate || f.createdAt || f.updatedAt, roOverviewTimeline.value, roOverviewCustomDate.value));
            const approved = files.filter(f => f.status === 'Approved');
            const disbursed = files.filter(f => f.status === 'Disbursed');
            const inProcess = files.filter(f => ['Lead', 'FI', 'FCU', 'UW'].includes(f.status));
            const login = files.filter(f => f.status === 'FI');
            const rejected = files.filter(f => f.status === 'Rejected');
            const ncl = files.filter(f => f.nclUcl === 'NCL');
            const ucl = files.filter(f => f.nclUcl === 'UCL');

            const totalAmount = files.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const approvedAmount = approved.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const disbursedAmount = disbursed.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const inProcessAmount = inProcess.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const loginAmount = login.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const rejectedAmount = rejected.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const nclAmount = ncl.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const uclAmount = ucl.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const approvalRate = files.length ? Math.round(((approved.length + disbursed.length) / files.length) * 100) : 0;

            const todayStr = getTodayDateStr();
            const todayLogged = myFiles.value.filter(f => (f.loginDate === todayStr) || (f.createdAt && f.createdAt.startsWith(todayStr)));
            const todayDisb = myFiles.value.filter(f => f.status === 'Disbursed' && ((f.loginDate === todayStr) || (f.updatedAt && f.updatedAt.startsWith(todayStr))));

            const stages = {
                Lead: files.filter(f => f.status === 'Lead').length,
                FI: files.filter(f => f.status === 'FI').length,
                FCU: files.filter(f => f.status === 'FCU').length,
                UW: files.filter(f => f.status === 'UW').length,
                Approved: approved.length,
                Disbursed: disbursed.length,
                Rejected: rejected.length
            };

            return {
                totalFiles: files.length,
                totalAmount,
                approvedCount: approved.length,
                approvedAmount,
                disbursedCount: disbursed.length,
                disbursedAmount,
                inProcessCount: inProcess.length,
                inProcessAmount,
                loginCount: login.length,
                loginAmount,
                rejectedCount: rejected.length,
                rejectedAmount,
                nclCount: ncl.length,
                nclAmount,
                uclCount: ucl.length,
                uclAmount,
                approvalRate,
                stages,
                todayLoggedCount: todayLogged.length,
                todayLoggedAmount: todayLogged.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0),
                todayDisbCount: todayDisb.length,
                todayDisbAmount: todayDisb.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0)
            };
        });

        const myRecentFiles = computed(() => {
            return [...myFiles.value].sort((a, b) => new Date(b.createdAt || b.loginDate || 0) - new Date(a.createdAt || a.loginDate || 0)).slice(0, 4);
        });

        const navigateRoStatusFilter = (status) => {
            roFilters.value.status = status;
            currentTab.value = 'ro-tracking';
        };
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
                    ? (roFilters.value.status === 'Custom' ? !STANDARD_STATUSES.includes(file.status) : (file.status || '').toLowerCase() === roFilters.value.status.toLowerCase()) 
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
                    ? (roFilters.value.status === 'Custom' ? !STANDARD_STATUSES.includes(file.status) : (file.status || '').toLowerCase() === roFilters.value.status.toLowerCase()) 
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
                timeline: 'today',
                customDate: '',
                sortBy: 'newest'
            };
            filters.value.roId = '';
            showCustomDateInput.value = false;
        };

        // --- EOD Logic ---
        const metricsConfig = [
            { label: 'Open Market', key: 'loginOpenMarket', category: 'Login', type: 'both' },
            { label: 'Branch', key: 'loginBranch', category: 'Login', type: 'both' },
            { label: 'Branch Sanction', key: 'loginBranchSanction', category: 'Login', type: 'both' },
            { label: 'Used Car', key: 'loginUsedCar', category: 'Login', type: 'both' },
            { label: 'Open Market', key: 'disbOpenMarket', category: 'Disbursement', type: 'both' },
            { label: 'Branch', key: 'disbBranch', category: 'Disbursement', type: 'both' },
            { label: 'Used Car', key: 'disbUsedCar', category: 'Disbursement', type: 'both' },
            { label: 'VICP/CRM', key: 'vicpCrm', category: 'Other', type: 'count' },
            { label: 'TD', key: 'td', category: 'Other', type: 'count' },
            { label: 'MI', key: 'mi', category: 'Other', type: 'count' },
            { label: 'Maruti Login', key: 'marutiLogin', category: 'Other', type: 'both' },
            { label: 'Maruti Disb', key: 'marutiDisb', category: 'Other', type: 'both' }
        ];

        const validateEOD = (metrics) => {
            const errs = [];
            const keys = Object.keys(metrics);
            keys.forEach(k => {
                const m = metrics[k];
                if (m?.count !== undefined && (m.count < 0 || !Number.isFinite(m.count))) {
                    errs.push(`${k} count must be a non-negative number`);
                }
                if (m?.amount !== undefined) {
                    if (m.amount < 0 || isNaN(Number(m.amount))) {
                        errs.push(`${k} amount must be a non-negative number`);
                    }
                    if (!Number.isInteger(m.amount * 100)) {
                        errs.push(`${k} amount must have at most 2 decimal places`);
                    }
                }
            });
            const anyFilled = keys.some(k => {
                const m = metrics[k];
                return (m?.count && m.count > 0) || (m?.amount && m.amount > 0);
            });
            if (!anyFilled) errs.push('Enter at least one metric before submitting');
            return errs;
        };

        const eodForm = ref({
            loginOpenMarket: { count: 0, amount: 0 },
            loginBranch: { count: 0, amount: 0 },
            loginBranchSanction: { count: 0, amount: 0 },
            loginUsedCar: { count: 0, amount: 0 },
            disbOpenMarket: { count: 0, amount: 0 },
            disbBranch: { count: 0, amount: 0 },
            disbUsedCar: { count: 0, amount: 0 },
            vicpCrm: { count: 0 },
            td: { count: 0 },
            marutiLogin: { count: 0, amount: 0 },
            marutiDisb: { count: 0, amount: 0 },
            mi: { count: 0 }
        });
        
        const dealerVisitsInput = ref(0);
        const tomorrowLoginsInput = ref('');
        const tomorrowDisbInput = ref('');
        const remarksInput = ref('');
        const isEditingTodayEod = ref(false);
        const showTodayFilesBreakdown = ref(false);
        const eodCopiedToast = ref(false);
        const eodResyncSuccess = ref(false);
        const eodSubTab = ref('form');

        // RO Personal Target & Pacing State
        const roTargetFiles = ref(Number(localStorage.getItem('ro_target_files') || 25));
        const roTargetVolume = ref(Number(localStorage.getItem('ro_target_volume') || 150)); // in Lakhs
        const showEditTargetModal = ref(false);
        const targetInputFiles = ref(roTargetFiles.value);
        const targetInputVolume = ref(roTargetVolume.value);

        const openEditTargetModal = () => {
            targetInputFiles.value = roTargetFiles.value;
            targetInputVolume.value = roTargetVolume.value;
            showEditTargetModal.value = true;
        };

        const saveRoTarget = () => {
            roTargetFiles.value = Math.max(1, Number(targetInputFiles.value) || 25);
            roTargetVolume.value = Math.max(1, Number(targetInputVolume.value) || 150);
            localStorage.setItem('ro_target_files', roTargetFiles.value);
            localStorage.setItem('ro_target_volume', roTargetVolume.value);
            showEditTargetModal.value = false;
        };

        // Files Logged & Disbursed Today for Live Audit Tray
        const todayLoginsFiles = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return myFiles.value.filter(f => (f.createdAt && f.createdAt.startsWith(today)) || f.loginDate === today);
        });

        const todayDisbFiles = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return myFiles.value.filter(f => f.status === 'Disbursed' && ((f.updatedAt && f.updatedAt.startsWith(today)) || (f.loginDate === today)));
        });

        // Stale & Attention Cases Radar for RO
        const roNeedsAttentionFiles = computed(() => {
            const now = new Date();
            return myFiles.value.filter(f => {
                if (f.status === 'Cancelled' || f.status === 'Rejected' || f.status === 'Disbursed') return false;
                const updatedTime = new Date(f.updatedAt || f.createdAt || Date.now());
                const diffDays = Math.floor((now - updatedTime) / (1000 * 60 * 60 * 24));
                // Approved > 4 days without disbursal
                if (f.status === 'Approved' && diffDays >= 4) return true;
                // In FI, FCU, UW for > 3 days without movement
                if (['Lead', 'FI', 'FCU', 'UW'].includes(f.status) && diffDays >= 3) return true;
                return false;
            });
        });

        // RO Target Pacing Calculation
        const roTargetPacing = computed(() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
            const currentDay = now.getDate();
            const daysRemaining = Math.max(1, totalDaysInMonth - currentDay);

            // MTD files from myFiles for current month
            const thisMonthFiles = myFiles.value.filter(f => {
                const d = f.loginDate || f.createdAt;
                if (!d) return false;
                const parts = d.substring(0, 10).split('-').map(Number);
                return parts[0] === year && parts[1] === (month + 1);
            });

            const mtdFilesCount = thisMonthFiles.length;
            const mtdVolumeLakhs = thisMonthFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const targetFiles = roTargetFiles.value || 25;
            const targetVolume = roTargetVolume.value || 150;

            const filesPercent = Math.min(100, Math.round((mtdFilesCount / targetFiles) * 100));
            const volumePercent = Math.min(100, Math.round((mtdVolumeLakhs / targetVolume) * 100));

            const expectedProgressPercent = Math.round((currentDay / totalDaysInMonth) * 100);
            const filesRemaining = Math.max(0, targetFiles - mtdFilesCount);
            const volumeRemaining = Math.max(0, targetVolume - mtdVolumeLakhs);

            const requiredDailyFiles = (filesRemaining / daysRemaining).toFixed(1);
            const requiredDailyVolume = (volumeRemaining / daysRemaining).toFixed(1);

            let paceStatus = 'on-track';
            let paceBadgeText = '⚡ On Pace';
            let paceColorClass = 'text-blue-700 bg-blue-50 border-blue-200';

            if (filesPercent >= expectedProgressPercent + 10) {
                paceStatus = 'ahead';
                paceBadgeText = '🔥 Ahead of Target Pace';
                paceColorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
            } else if (filesPercent < expectedProgressPercent - 10) {
                paceStatus = 'behind';
                paceBadgeText = '⚠️ Behind Target Pace';
                paceColorClass = 'text-amber-700 bg-amber-50 border-amber-200';
            }

            return {
                totalDaysInMonth,
                currentDay,
                daysRemaining,
                mtdFilesCount,
                mtdVolumeLakhs,
                targetFiles,
                targetVolume,
                filesPercent,
                volumePercent,
                expectedProgressPercent,
                filesRemaining,
                volumeRemaining,
                requiredDailyFiles,
                requiredDailyVolume,
                paceStatus,
                paceBadgeText,
                paceColorClass
            };
        });
        
        const eodSubmitError = ref('');
        const eodSubmitSuccess = ref(false);
        const submitting = ref(false);
        const myEods = ref([]);
        const smEods = ref([]);
        
        const hasSubmittedToday = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            return myEods.value.some(e => e.date === today);
        });

        const eodTotals = computed(() => {
            const f = eodForm.value;
            return {
                loginCount: (f.loginOpenMarket.count||0) + (f.loginBranch.count||0) + (f.loginUsedCar.count||0),
                loginAmount: (f.loginOpenMarket.amount||0) + (f.loginBranch.amount||0) + (f.loginUsedCar.amount||0),
                disbCount: (f.disbOpenMarket.count||0) + (f.disbBranch.count||0) + (f.disbUsedCar.count||0),
                disbAmount: (f.disbOpenMarket.amount||0) + (f.disbBranch.amount||0) + (f.disbUsedCar.amount||0),
                sanctionCount: (f.loginBranchSanction?.count || 0),
                sanctionAmt: (f.loginBranchSanction?.amount || 0),
                vcipCount: (f.vicpCrm?.count || 0),
                tdCount: (f.td?.count || 0),
                miCount: (f.mi?.count || 0)
            };
        });

        // 100% Accurate MTD calculation engine
        const getRoMtdForDate = (eodDate, currentMetrics = null) => {
            const targetDate = eodDate || getTodayDateStr();
            const currentMonth = targetDate.substring(0, 7);

            const m = {
                loginOpenMarket: { count: 0, amount: 0 },
                loginBranch: { count: 0, amount: 0 },
                loginBranchSanction: { count: 0, amount: 0 },
                loginUsedCar: { count: 0, amount: 0 },
                disbOpenMarket: { count: 0, amount: 0 },
                disbBranch: { count: 0, amount: 0 },
                disbUsedCar: { count: 0, amount: 0 },
                vicpCrm: { count: 0 },
                td: { count: 0 },
                marutiLogin: { count: 0, amount: 0 },
                marutiDisb: { count: 0, amount: 0 },
                mi: { count: 0 }
            };

            // 1. Files in current month prior to targetDate
            const priorFiles = (myFiles.value || []).filter(f => {
                const fDate = f.loginDate || (f.createdAt ? f.createdAt.split('T')[0] : '');
                return fDate && fDate.startsWith(currentMonth) && fDate < targetDate;
            });

            priorFiles.forEach(f => {
                const amt = toLakhs(f.loanAmount) || 0;
                const chan = (f.sourcingChannel || '').toUpperCase();
                const cat = (f.nclUcl || '').toUpperCase();

                if (cat === 'UCL') {
                    m.loginUsedCar.count += 1;
                    m.loginUsedCar.amount += amt;
                } else if (chan === 'BRANCH') {
                    m.loginBranch.count += 1;
                    m.loginBranch.amount += amt;
                } else {
                    m.loginOpenMarket.count += 1;
                    m.loginOpenMarket.amount += amt;
                }

                if (chan === 'BRANCH' && (f.status === 'Approved' || f.status === 'Disbursed')) {
                    m.loginBranchSanction.count += 1;
                    m.loginBranchSanction.amount += amt;
                }

                if (f.status === 'Disbursed') {
                    if (cat === 'UCL') {
                        m.disbUsedCar.count += 1;
                        m.disbUsedCar.amount += amt;
                    } else if (chan === 'BRANCH') {
                        m.disbBranch.count += 1;
                        m.disbBranch.amount += amt;
                    } else {
                        m.disbOpenMarket.count += 1;
                        m.disbOpenMarket.amount += amt;
                    }
                }

                let vcipVal = f.vcip ? String(f.vcip).trim().toLowerCase() : '';
                if (vcipVal && vcipVal !== '0' && vcipVal !== 'no' && vcipVal !== 'n/a' && vcipVal !== 'false') {
                    m.vicpCrm.count += 1;
                }
                let miVal = f.mi ? String(f.mi).trim().toLowerCase() : '';
                if (miVal && miVal !== '0' && miVal !== 'no' && miVal !== 'n/a' && miVal !== 'false') {
                    m.mi.count += 1;
                }
            });

            // 2. Prior EODs in current month
            const priorEods = (myEods.value || []).filter(e => e.date && e.date.startsWith(currentMonth) && e.date < targetDate);
            priorEods.forEach(e => {
                if (!e.metrics) return;
                m.td.count += (e.metrics.td?.count || 0);
                m.marutiLogin.count += (e.metrics.marutiLogin?.count || 0);
                m.marutiLogin.amount += (e.metrics.marutiLogin?.amount || 0);
                m.marutiDisb.count += (e.metrics.marutiDisb?.count || 0);
                m.marutiDisb.amount += (e.metrics.marutiDisb?.amount || 0);
            });

            // 3. Add current metrics for the target date
            const f = currentMetrics || eodForm.value;
            if (f) {
                Object.keys(f).forEach(k => {
                    if (!m[k]) return;
                    m[k].count += (f[k].count || 0);
                    if (m[k].amount !== undefined) {
                        m[k].amount += (f[k].amount || 0);
                    }
                });
            }

            return m;
        };

        const currentRoMtd = computed(() => {
            return getRoMtdForDate(getTodayDateStr(), eodForm.value);
        });

        const eodMtdTotals = computed(() => {
            const m = currentRoMtd.value;
            const loginCount = (m.loginOpenMarket.count || 0) + (m.loginBranch.count || 0) + (m.loginUsedCar.count || 0);
            const loginAmount = (m.loginOpenMarket.amount || 0) + (m.loginBranch.amount || 0) + (m.loginUsedCar.amount || 0);
            const disbCount = (m.disbOpenMarket.count || 0) + (m.disbBranch.count || 0) + (m.disbUsedCar.count || 0);
            const disbAmount = (m.disbOpenMarket.amount || 0) + (m.disbBranch.amount || 0) + (m.disbUsedCar.amount || 0);
            return { loginCount, loginAmount, disbCount, disbAmount };
        });

        const smEodSummary = computed(() => {
            const today = new Date().toISOString().split('T')[0];
            const currentMonth = today.substring(0, 7); // YYYY-MM

            const summaryMap = {};
            roUsers.value.forEach(ro => {
                summaryMap[ro.id] = {
                    id: ro.id,
                    name: ro.name,
                    submittedToday: false,
                    ftd: {
                        loginOpenMarket: { count: 0, amount: 0 },
                        loginBranch: { count: 0, amount: 0 },
                        loginBranchSanction: { count: 0, amount: 0 },
                        loginUsedCar: { count: 0, amount: 0 },
                        disbOpenMarket: { count: 0, amount: 0 },
                        disbBranch: { count: 0, amount: 0 },
                        disbUsedCar: { count: 0, amount: 0 },
                        vicpCrm: { count: 0 }, td: { count: 0 },
                        marutiLogin: { count: 0, amount: 0 }, marutiDisb: { count: 0, amount: 0 }, mi: { count: 0 }
                    },
                    mtd: {
                        loginOpenMarket: { count: 0, amount: 0 },
                        loginBranch: { count: 0, amount: 0 },
                        loginBranchSanction: { count: 0, amount: 0 },
                        loginUsedCar: { count: 0, amount: 0 },
                        disbOpenMarket: { count: 0, amount: 0 },
                        disbBranch: { count: 0, amount: 0 },
                        disbUsedCar: { count: 0, amount: 0 },
                        vicpCrm: { count: 0 }, td: { count: 0 },
                        marutiLogin: { count: 0, amount: 0 }, marutiDisb: { count: 0, amount: 0 }, mi: { count: 0 }
                    }
                };
            });

            smEods.value.forEach(eod => {
                if (!summaryMap[eod.userId]) return;
                const isToday = eod.date === today;
                const isCurrentMonth = eod.date.startsWith(currentMonth);

                if (!isCurrentMonth) return;

                if (isToday) summaryMap[eod.userId].submittedToday = true;

                // Sum metrics
                Object.keys(eod.metrics).forEach(key => {
                    const m = eod.metrics[key];
                    if (isToday) {
                        summaryMap[eod.userId].ftd[key].count += (m.count || 0);
                        if (m.amount !== undefined) summaryMap[eod.userId].ftd[key].amount += (m.amount || 0);
                    }
                    summaryMap[eod.userId].mtd[key].count += (m.count || 0);
                    if (m.amount !== undefined) summaryMap[eod.userId].mtd[key].amount += (m.amount || 0);
                });
            });

            return Object.values(summaryMap);
        });

        const missingEods = computed(() => {
            return smEodSummary.value.filter(s => !s.submittedToday);
        });

        const generateEodWhatsApp = () => {
            const today = new Date().toLocaleDateString('en-IN');
            let text = `*Daily EOD Summary - ${today}*\n\n`;

            let totalFtdLogin = { count: 0, amount: 0 };
            let totalMtdLogin = { count: 0, amount: 0 };
            let totalFtdDisb = { count: 0, amount: 0 };
            let totalMtdDisb = { count: 0, amount: 0 };

            smEodSummary.value.forEach(s => {
                const fl = s.ftd.loginOpenMarket.count + s.ftd.loginBranch.count + s.ftd.loginUsedCar.count;
                const fla = s.ftd.loginOpenMarket.amount + s.ftd.loginBranch.amount + s.ftd.loginUsedCar.amount;
                const ml = s.mtd.loginOpenMarket.count + s.mtd.loginBranch.count + s.mtd.loginUsedCar.count;
                const mla = s.mtd.loginOpenMarket.amount + s.mtd.loginBranch.amount + s.mtd.loginUsedCar.amount;
                
                totalFtdLogin.count += fl; totalFtdLogin.amount += fla;
                totalMtdLogin.count += ml; totalMtdLogin.amount += mla;

                const fd = s.ftd.disbOpenMarket.count + s.ftd.disbBranch.count + s.ftd.disbUsedCar.count;
                const fda = s.ftd.disbOpenMarket.amount + s.ftd.disbBranch.amount + s.ftd.disbUsedCar.amount;
                const md = s.mtd.disbOpenMarket.count + s.mtd.disbBranch.count + s.mtd.disbUsedCar.count;
                const mda = s.mtd.disbOpenMarket.amount + s.mtd.disbBranch.amount + s.mtd.disbUsedCar.amount;

                totalFtdDisb.count += fd; totalFtdDisb.amount += fda;
                totalMtdDisb.count += md; totalMtdDisb.amount += mda;
            });

            text += `*Logins:*\nFTD: ${totalFtdLogin.count} (${totalFtdLogin.amount.toFixed(2)}L)\nMTD: ${totalMtdLogin.count} (${totalMtdLogin.amount.toFixed(2)}L)\n\n`;
            text += `*Disb:*\nFTD: ${totalFtdDisb.count} (${totalFtdDisb.amount.toFixed(2)}L)\nMTD: ${totalMtdDisb.count} (${totalMtdDisb.amount.toFixed(2)}L)\n\n`;
            
            text += `*RO Breakdown (FTD/MTD)*\n`;
            smEodSummary.value.forEach(s => {
                const fl = s.ftd.loginOpenMarket.count + s.ftd.loginBranch.count + s.ftd.loginUsedCar.count;
                const ml = s.mtd.loginOpenMarket.count + s.mtd.loginBranch.count + s.mtd.loginUsedCar.count;
                const fd = s.ftd.disbOpenMarket.count + s.ftd.disbBranch.count + s.ftd.disbUsedCar.count;
                const md = s.mtd.disbOpenMarket.count + s.mtd.disbBranch.count + s.mtd.disbUsedCar.count;
                
                text += `${s.name} - L: ${fl}/${ml} | D: ${fd}/${md}\n`;
            });

            return encodeURIComponent(text);
        };

        const generateRoWhatsAppText = (eod) => {
            if (!eod || !eod.metrics) return '';

            const m = getRoMtdForDate(eod.date, eod.metrics);
            const f = eod.metrics;

            let dateStr = '';
            if (eod.date) {
                const parts = eod.date.split('-');
                if (parts.length === 3) {
                    dateStr = `${parts[2]}/${parts[1]}/${parts[0]}`;
                } else {
                    dateStr = new Date(eod.date).toLocaleDateString('en-GB');
                }
            } else {
                const now = new Date();
                dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
            }

            const formatVal = (count, amt) => {
                const c = Number(count) || 0;
                const a = Number(amt) || 0;
                if (c === 0 && a === 0) return '0/0.0cr';
                return `${c}/${a.toFixed(2)}L`;
            };

            const tlFtd = (f.loginOpenMarket.count || 0) + (f.loginBranch.count || 0) + (f.loginUsedCar.count || 0);
            const tlaFtd = (f.loginOpenMarket.amount || 0) + (f.loginBranch.amount || 0) + (f.loginUsedCar.amount || 0);
            const tlMtd = (m.loginOpenMarket.count || 0) + (m.loginBranch.count || 0) + (m.loginUsedCar.count || 0);
            const tlaMtd = (m.loginOpenMarket.amount || 0) + (m.loginBranch.amount || 0) + (m.loginUsedCar.amount || 0);

            const tdFtd = (f.disbOpenMarket.count || 0) + (f.disbBranch.count || 0) + (f.disbUsedCar.count || 0);
            const tdaFtd = (f.disbOpenMarket.amount || 0) + (f.disbBranch.amount || 0) + (f.disbUsedCar.amount || 0);
            const tdMtd = (m.disbOpenMarket.count || 0) + (m.disbBranch.count || 0) + (m.disbUsedCar.count || 0);
            const tdaMtd = (m.disbOpenMarket.amount || 0) + (m.disbBranch.amount || 0) + (m.disbUsedCar.amount || 0);

            let text = `${dateStr}\n`;
            text += `*Login :*\n`;
            text += `*Open Market :*\n`;
            text += `FTD : ${formatVal(f.loginOpenMarket.count, f.loginOpenMarket.amount)}\n`;
            text += `MTD: ${formatVal(m.loginOpenMarket.count, m.loginOpenMarket.amount)}\n`;
            text += `*Branch*\n`;
            text += `FTD : ${formatVal(f.loginBranch.count, f.loginBranch.amount)}\n`;
            text += `MTD:  ${formatVal(m.loginBranch.count, m.loginBranch.amount)}\n`;
            text += `Sanction: ${formatVal(f.loginBranchSanction.count, f.loginBranchSanction.amount)}\n`;
            text += `MTD sanction: ${m.loginBranchSanction.count || 0}\n`;
            text += `*Used Car*\n`;
            text += `FTD - ${formatVal(f.loginUsedCar.count, f.loginUsedCar.amount)}\n`;
            text += `MTD - ${formatVal(m.loginUsedCar.count, m.loginUsedCar.amount)}\n\n`;

            text += `Total FTD :  ${formatVal(tlFtd, tlaFtd)}\n`;
            text += `Total MTD: ${formatVal(tlMtd, tlaMtd)} \n\n`;

            text += `*Disb :*\n`;
            text += `*Open Market :* \n`;
            text += `FTD : ${formatVal(f.disbOpenMarket.count, f.disbOpenMarket.amount)}\n`;
            text += `MTD: ${formatVal(m.disbOpenMarket.count, m.disbOpenMarket.amount)}\n`;
            text += `*Branch :*\n`;
            text += `FTD : ${formatVal(f.disbBranch.count, f.disbBranch.amount)}\n`;
            text += `MTD: ${formatVal(m.disbBranch.count, m.disbBranch.amount)}\n`;
            text += `*Used :*\n`;
            text += `FTD : ${f.disbUsedCar.count || 0}\n`;
            text += `MTD: ${m.disbUsedCar.count || 0}\n\n`;

            text += `Total FTD : ${formatVal(tdFtd, tdaFtd)}\n`;
            text += `Total MTD: ${formatVal(tdMtd, tdaMtd)}\n\n`;

            text += `FTD vicp/CRM: ${f.vicpCrm?.count || 0}\n`;
            text += `MTD vicp/CRM: ${m.vicpCrm?.count || 0}\n`;
            text += `FTD TD : ${f.td?.count || 0}\n`;
            text += `MTD TD : ${m.td?.count || 0}\n\n`;

            text += `*Maruti*\n`;
            text += `Login FTD/MTD- ${f.marutiLogin?.count || 0}/${m.marutiLogin?.count || 0}\n`;
            text += `Disb Ftd /Mtd  :  ${f.marutiDisb?.count || 0}/${m.marutiDisb?.count || 0}\n\n`;

            text += `MI FTD - ${f.mi?.count || 0}\n`;
            text += `MI MTD - ${m.mi?.count || 0}\n`;

            return text;
        };

        const generateRoWhatsApp = (eod) => {
            const raw = generateRoWhatsAppText(eod);
            return encodeURIComponent(raw);
        };

        const copyRoEodToClipboard = async (eod) => {
            const raw = generateRoWhatsAppText(eod);
            if (!raw) return;
            try {
                if (navigator?.clipboard?.writeText) {
                    await navigator.clipboard.writeText(raw);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = raw;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                eodCopiedToast.value = true;
                setTimeout(() => { eodCopiedToast.value = false; }, 3000);
            } catch (err) {
                console.error('Clipboard error:', err);
            }
        };

        const startReviseTodayEod = () => {
            const today = new Date().toISOString().split('T')[0];
            const todayEod = myEods.value.find(e => e.date === today);
            if (todayEod && todayEod.metrics) {
                eodForm.value = JSON.parse(JSON.stringify(todayEod.metrics));
                dealerVisitsInput.value = todayEod.dealerVisits || 0;
                tomorrowLoginsInput.value = todayEod.tomorrowLogins || '';
                tomorrowDisbInput.value = todayEod.tomorrowDisb || '';
                remarksInput.value = todayEod.remarks || '';
            } else {
                autoFillEOD();
            }
            isEditingTodayEod.value = true;
            eodSubmitError.value = '';
            eodSubmitSuccess.value = false;
        };

        const cancelReviseTodayEod = () => {
            isEditingTodayEod.value = false;
            eodSubmitError.value = '';
        };

        const triggerResyncEod = () => {
            autoFillEOD();
            eodResyncSuccess.value = true;
            setTimeout(() => { eodResyncSuccess.value = false; }, 2500);
        };
        
        const autoFillEOD = () => {
            const today = new Date().toISOString().split('T')[0];
            resetEodForm();
            
            const loginsToday = myFiles.value.filter(f => (f.createdAt && f.createdAt.startsWith(today)) || f.loginDate === today);
            loginsToday.forEach(f => {
                const amt = toLakhs(f.loanAmount) || 0;
                const chan = (f.sourcingChannel || '').toUpperCase();
                const cat = (f.nclUcl || '').toUpperCase();

                if (cat === 'UCL') {
                    eodForm.value.loginUsedCar.count += 1;
                    eodForm.value.loginUsedCar.amount += amt;
                } else if (chan === 'BRANCH') {
                    eodForm.value.loginBranch.count += 1;
                    eodForm.value.loginBranch.amount += amt;
                } else {
                    eodForm.value.loginOpenMarket.count += 1;
                    eodForm.value.loginOpenMarket.amount += amt;
                }

                let vcipVal = f.vcip ? String(f.vcip).trim().toLowerCase() : '';
                if (vcipVal && vcipVal !== '0' && vcipVal !== 'no' && vcipVal !== 'n/a' && vcipVal !== 'false') {
                    eodForm.value.vicpCrm.count += 1;
                }
                
                let miVal = f.mi ? String(f.mi).trim().toLowerCase() : '';
                if (miVal && miVal !== '0' && miVal !== 'no' && miVal !== 'n/a' && miVal !== 'false') {
                    eodForm.value.mi.count += 1;
                }
            });

            const disbToday = myFiles.value.filter(f => f.status === 'Disbursed' && ((f.updatedAt && f.updatedAt.startsWith(today)) || (f.loginDate === today)));
            disbToday.forEach(f => {
                const amt = toLakhs(f.loanAmount) || 0;
                const chan = (f.sourcingChannel || '').toUpperCase();
                const cat = (f.nclUcl || '').toUpperCase();

                if (cat === 'UCL') {
                    eodForm.value.disbUsedCar.count += 1;
                    eodForm.value.disbUsedCar.amount += amt;
                } else if (chan === 'BRANCH') {
                    eodForm.value.disbBranch.count += 1;
                    eodForm.value.disbBranch.amount += amt;
                } else {
                    eodForm.value.disbOpenMarket.count += 1;
                    eodForm.value.disbOpenMarket.amount += amt;
                }
            });
            
            Object.keys(eodForm.value).forEach(k => {
                if (eodForm.value[k].amount !== undefined) {
                    eodForm.value[k].amount = parseFloat(eodForm.value[k].amount.toFixed(2));
                }
            });
        };

        watch(currentTab, async (newTab) => {
            if (newTab === 'ro-eod' && isRO.value) {
                const today = new Date().toISOString().split('T')[0];
                const alreadySubmitted = myEods.value.some(e => e.date === today);
                if (!alreadySubmitted) {
                    autoFillEOD();
                }
            } else if (newTab === 'ro-add-file' && isRO.value) {
                if (!newFileForm.value.appId) {
                    newFileForm.value.appId = 'ALA00000';
                }
                if (!newFileForm.value.smName) {
                    await initUserSm();
                }
            }
        });

        const resetEodForm = () => {
            eodForm.value = {
                loginOpenMarket: { count: 0, amount: 0 },
                loginBranch: { count: 0, amount: 0 },
                loginBranchSanction: { count: 0, amount: 0 },
                loginUsedCar: { count: 0, amount: 0 },
                disbOpenMarket: { count: 0, amount: 0 },
                disbBranch: { count: 0, amount: 0 },
                disbUsedCar: { count: 0, amount: 0 },
                vicpCrm: { count: 0 },
                td: { count: 0 },
                marutiLogin: { count: 0, amount: 0 },
                marutiDisb: { count: 0, amount: 0 },
                mi: { count: 0 }
            };
            eodSubmitError.value = '';
            eodSubmitSuccess.value = false;
        };

        const submitEOD = async (isRevision = false) => {
            console.log("Submit EOD button clicked!");
            eodSubmitError.value = '';
            eodSubmitSuccess.value = false;
            
            if (!currentUser.value?.id) {
                eodSubmitError.value = 'You must be logged in to submit an EOD report.';
                return;
            }

            const validationErrors = validateEOD(eodForm.value);
            if (validationErrors.length) {
                eodSubmitError.value = validationErrors.join(' | ');
                return;
            }

            submitting.value = true;
            try {
                const today = new Date().toISOString().split('T')[0];
                const existingEodIndex = myEods.value.findIndex(e => e.date === today);
                const alreadySubmitted = existingEodIndex !== -1;

                if (alreadySubmitted && !isRevision && !isEditingTodayEod.value) {
                    eodSubmitError.value = 'You have already submitted your EOD report for today. Click Revise to edit.';
                    return;
                }

                const report = {
                    userId: currentUser.value.id,
                    userName: currentUser.value.name,
                    tenantId: currentUser.value.tenantId,
                    date: today,
                    updatedAt: new Date().toISOString(),
                    metrics: JSON.parse(JSON.stringify(eodForm.value)),
                    dealerVisits: Number(dealerVisitsInput.value) || 0,
                    tomorrowLogins: tomorrowLoginsInput.value || '',
                    tomorrowDisb: tomorrowDisbInput.value || '',
                    remarks: remarksInput.value || '',
                    isRevised: Boolean(isRevision || isEditingTodayEod.value)
                };

                if (alreadySubmitted && (isRevision || isEditingTodayEod.value)) {
                    const existingId = myEods.value[existingEodIndex].id;
                    await db.updateEODReport(existingId, report);
                    myEods.value[existingEodIndex] = { ...report, id: existingId };
                    isEditingTodayEod.value = false;
                    eodSubmitSuccess.value = true;
                } else {
                    report.createdAt = new Date().toISOString();
                    const newId = await db.addEODReport(report);
                    myEods.value.unshift({ ...report, id: newId });
                    eodSubmitSuccess.value = true;
                }
            } catch (e) {
                console.error('Submit EOD Error:', e);
                eodSubmitError.value = 'Error: ' + (e.message || 'Failed to submit EOD. Please try again.');
            } finally {
                submitting.value = false;
            }
        };

        // Data Loading
        const loadSuperAdminData = async () => {
            allWorkspaces.value = await db.getAllWorkspaces();
            roUsers.value = await db.getAllUsers();
            allFiles.value = await db.getAllLoanFiles();
        };

        const loadSmData = async () => {
            if (!currentUser.value?.tenantId) {
                // Legacy SM data load (accounts without tenantId)
                const files = await db.getAllLoanFiles();
                allFiles.value = files.filter(f => !f.tenantId);
                const allU = await db.getAllUsers();
                roUsers.value = allU.filter(u => u.role === 'ro' && !u.tenantId);
                smEods.value = [];
                return;
            }
            allFiles.value = await db.getLoanFilesByTenant(currentUser.value.tenantId);
            roUsers.value = await db.getROUsersByTenant(currentUser.value.tenantId);
            smEods.value = await db.getEODReportsByTenant(currentUser.value.tenantId);
        };

        const loadRoData = async () => {
            if (!currentUser.value) return;
            await initUserSm();
            myFiles.value = await db.getLoanFilesByRO(currentUser.value.id);
            const tenantEods = await db.getEODReportsByTenant(currentUser.value.tenantId);
            myEods.value = tenantEods.filter(e => e.userId === currentUser.value.id);
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

        const originalUser = ref(null);

        const impersonateUser = async (user) => {
            if (!originalUser.value && currentUser.value.role === 'super_admin') {
                originalUser.value = { ...currentUser.value };
            }
            
            const sessionUser = { id: user.id, email: user.email, username: user.name, role: user.role, name: user.name, tenantId: user.tenantId || user.id }; // Workspaces use id as tenantId
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

        const initUserSm = async () => {
            if (!currentUser.value) return;

            let smName = '';

            // 1. If SM or Admin, their own name is the SM Name
            if (isSM.value) {
                smName = currentUser.value.name || currentUser.value.username || '';
            } else if (currentUser.value.tenantId) {
                // 2. Fetch from Workspace (managerName)
                try {
                    const ws = await db.getWorkspace(currentUser.value.tenantId);
                    if (ws && ws.managerName) {
                        smName = ws.managerName.trim();
                    }
                } catch (e) {
                    console.warn("Could not fetch workspace managerName:", e);
                }

                // 3. Fallback: Search SM in users of same workspace
                if (!smName) {
                    try {
                        const allUsers = await db.getAllUsers();
                        const smUser = allUsers.find(u => u.tenantId === currentUser.value.tenantId && (u.role === 'sm' || u.role === 'admin'));
                        if (smUser && smUser.name) {
                            smName = smUser.name.trim();
                        }
                    } catch (e) {
                        console.warn("Could not fetch SM user for tenant:", e);
                    }
                }
            }

            // 4. Fallback to localStorage if still not found
            if (!smName) {
                smName = localStorage.getItem('axis_default_sm_' + currentUser.value.id) || localStorage.getItem('axis_default_sm') || '';
            }

            if (smName) {
                const upperSm = smName.toUpperCase();
                defaultSmName.value = upperSm;
                newFileForm.value.smName = upperSm;
                localStorage.setItem('axis_default_sm_' + currentUser.value.id, upperSm);
                localStorage.setItem('axis_default_sm', upperSm);
            }
        };

        const systemAnnouncement = ref('');
        const adminAnnouncementInput = ref('');
        
        const saveAnnouncement = async () => {
            try {
                await db.setAnnouncement(adminAnnouncementInput.value);
                systemAnnouncement.value = adminAnnouncementInput.value;
                alert('Announcement updated successfully!');
            } catch(e) {
                console.error("Error saving announcement", e);
                alert("Failed to save announcement");
            }
        };

        // Manager Security Key Access Control
        const activeManagerPasscode = ref('AXIS-MGR-2026');
        const managerPasscodeInput = ref('AXIS-MGR-2026');
        const showManagerKeySecret = ref(false);
        const managerKeySavedToast = ref(false);

        const saveManagerPasscode = async () => {
            const newKey = managerPasscodeInput.value?.trim().toUpperCase();
            if (!newKey) {
                alert("Manager Security Passcode cannot be blank.");
                return;
            }
            try {
                await db.setManagerSecurityKey(newKey);
                activeManagerPasscode.value = newKey;
                managerPasscodeInput.value = newKey;
                managerKeySavedToast.value = true;
                setTimeout(() => { managerKeySavedToast.value = false; }, 4000);
            } catch(e) {
                console.error("Error saving manager key", e);
                alert("Failed to save manager security key: " + (e.message || e));
            }
        };

        const generateRandomManagerKey = () => {
            const randomSuffix = Math.floor(1000 + Math.random() * 9000);
            const currentBank = (registerForm.value.bankName || 'MGR').replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'MGR';
            managerPasscodeInput.value = `${currentBank}-${randomSuffix}`;
        };

        const copyManagerKey = async () => {
            try {
                await navigator.clipboard.writeText(managerPasscodeInput.value);
                alert(`Copied manager key "${managerPasscodeInput.value}" to clipboard!`);
            } catch (e) {
                alert(`Manager Key: ${managerPasscodeInput.value}`);
            }
        };

        // Auth & Registration
        const registerSM = async () => {
            if (isRegistering.value) return;
            registerError.value = '';

            const smName = registerForm.value.name?.trim();
            const smRegion = registerForm.value.region?.trim();
            const smPhone = registerForm.value.phone?.trim() || '';
            const smPasscode = registerForm.value.passcode?.trim();
            let smBank = registerForm.value.bankName?.trim() || 'Axis Bank';
            if (smBank === 'Other') {
                smBank = registerForm.value.customBankName?.trim();
            }
            const smDivision = registerForm.value.division?.trim() || 'Auto Loans (Car Loans)';

            if (!smBank) {
                registerError.value = 'Please select or specify your Bank or Financial Institution.';
                return;
            }
            if (!smDivision) {
                registerError.value = 'Please select your Sales Division / Asset Vertical.';
                return;
            }
            if (!smName) {
                registerError.value = 'Sales Manager Name is mandatory.';
                return;
            }
            if (!smRegion) {
                registerError.value = 'Operating Region / Zone is mandatory.';
                return;
            }

            let validPasscode = activeManagerPasscode.value || 'AXIS-MGR-2026';
            try {
                const remoteKey = await db.getManagerSecurityKey();
                if (remoteKey) validPasscode = remoteKey;
            } catch (e) {}

            if (!smPasscode || smPasscode.toUpperCase() !== validPasscode.toUpperCase()) {
                registerError.value = 'Invalid Manager Security Key. If you are an RO, please click "Back to Sign In" and sign in with Google.';
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
                
                const workspaceId = await db.addWorkspace({
                    name: wsName,
                    bankName: smBank,
                    division: smDivision,
                    region: smRegion,
                    managerName: smName,
                    status: 'active',
                    createdAt: new Date().toISOString()
                });

                const newUserId = await db.addUser({
                    email: email,
                    role: 'sm',
                    name: smName,
                    bankName: smBank,
                    division: smDivision,
                    region: smRegion,
                    phone: smPhone,
                    tenantId: workspaceId,
                    status: 'active',
                    createdAt: new Date().toISOString()
                });

                // Auto sign-in new Sales Manager
                const sessionUser = {
                    id: newUserId || email,
                    email: email,
                    username: smName,
                    role: 'sm',
                    name: smName,
                    bankName: smBank,
                    division: smDivision,
                    region: smRegion,
                    tenantId: workspaceId
                };
                localStorage.setItem('axis_user', JSON.stringify(sessionUser));
                currentUser.value = sessionUser;
                initUserSm();
                currentTab.value = 'dashboard';
                await loadData();

                showRegisterMode.value = false;
                registerForm.value = { name: '', region: '', phone: '', passcode: '', bankName: 'Axis Bank', customBankName: '', division: 'Auto Loans (Car Loans)' };
            } catch (error) {
                console.error("Registration Error:", error);
                if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('popup-closed')) {
                    // User closed popup without selecting an account
                    return;
                }
                registerError.value = error.message || 'Error creating account.';
            } finally {
                isRegistering.value = false;
                registerStage.value = '';
            }
        };

        const processUserLogin = async (googleUser) => {
            const email = googleUser.email.toLowerCase();
            let user = await db.getUserByEmail(email);

            // Ensure super_admin exists (hardcoded mapping)
            if (email === 'anupdas8354@gmail.com' && !user) {
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
            
            if (user) {
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
                const sessionUser = { id: user.id, email: user.email, username: user.name, role: user.role, name: user.name, tenantId: user.tenantId };
                localStorage.setItem('axis_user', JSON.stringify(sessionUser));
                currentUser.value = sessionUser;
                initUserSm();
                
                if (isSuperAdmin.value) currentTab.value = 'super-admin-dashboard';
                else if (isSM.value) currentTab.value = 'dashboard';
                else currentTab.value = 'ro-dashboard';

                await loadData();
            } else {
                loginError.value = 'Account not found. Ask your manager to invite you.';
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
                console.error("Login Error:", error);
                if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('popup-closed')) {
                    // User closed popup without selecting an account
                    return;
                }
                loginError.value = error.message;
            } finally {
                isLoggingIn.value = false;
                loginStage.value = '';
            }
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

        const logout = () => {
            localStorage.removeItem('axis_user');
            currentUser.value = null;
            loginForm.value = { username: '', password: '' };
            allWorkspaces.value = [];
            roUsers.value = [];
            allFiles.value = [];
            myFiles.value = [];
            currentTab.value = 'dashboard';
        };

        // Admin/SM: Users & Workspaces
        const saveNewRo = async () => {
            addRoError.value = '';
            const email = (newRoForm.value.email || '').trim().toLowerCase();
            if (!email) {
                addRoError.value = 'Please provide a valid Gmail address';
                return;
            }

            const existing = await db.getUserByEmail(email);
            if (existing) {
                addRoError.value = 'Email already exists. They are already in the system.';
                return;
            }
            
            await db.addUser({
                email: email,
                role: 'ro',
                name: (newRoForm.value.name || '').trim().toUpperCase(),
                tenantId: currentUser.value.tenantId,
                status: 'active',
                createdAt: new Date().toISOString()
            });
            
            showAddRoModal.value = false;
            newRoForm.value = { name: '', email: '' };
            await loadData();
        };

        const toggleUserStatus = async (user) => {
            const newStatus = user.status === 'active' ? 'suspended' : 'active';
            await db.updateUser(user.id, { status: newStatus });
            await loadData();
        };

        const deleteRoUser = async (user) => {
            if (!user || !user.id) return;

            // Check if this RO has historical logged files
            const filesCount = (allFiles.value || []).filter(f => f.roId === user.id || (f.roName && f.roName.trim().toUpperCase() === (user.name || '').trim().toUpperCase())).length;

            let confirmMsg = '';
            if (filesCount > 0) {
                confirmMsg = `⚠️ IMPORTANT RESIGNATION ADVICE:\n\nOfficer "${user.name || 'User'}" has ${filesCount} loan file(s) logged in the branch pipeline!\n\n👉 If this officer has RESIGNED or left the company, please click CANCEL and use "SUSPEND" instead!\nSuspending locks their login immediately while safely preserving their loan history, disbursals, and Cockpit performance for audits.\n\nOnly use "DELETE" if this was an accidental typo or duplicate profile.\n\nDo you still wish to permanently delete this profile?`;
            } else {
                confirmMsg = `Are you sure you want to permanently delete profile "${user.name || 'User'}" (${user.email})?\n\nThis will remove their profile and login access immediately. This action cannot be undone.`;
            }

            if (!confirm(confirmMsg)) return;

            try {
                await db.deleteUser(user.id);
                roUsers.value = roUsers.value.filter(u => u.id !== user.id);
                await loadData();
                alert(`User ${user.name || user.email} was successfully deleted.`);
            } catch (error) {
                console.error("Error deleting user:", error);
                alert("Failed to delete user: " + (error.message || error));
            }
        };

        const toggleWorkspaceStatus = async (workspace) => {
            const newStatus = workspace.status === 'active' ? 'frozen' : 'active';
            await db.updateWorkspace(workspace.id, { status: newStatus });
            await loadData();
        };

        const deleteWorkspace = async (workspace) => {
            if (!workspace || !workspace.id) return;
            if (workspace.id === 'default-tenant') {
                alert("The default system workspace cannot be deleted.");
                return;
            }

            let confirmMsg = `Are you sure you want to permanently delete workspace "${workspace.name}" (ID: ${workspace.id})?`;
            if ((workspace.fileCount && workspace.fileCount > 0) || (workspace.roCount && workspace.roCount > 0)) {
                confirmMsg += `\n\n⚠️ Caution: This workspace currently contains ${workspace.roCount || 0} user(s) and ${workspace.fileCount || 0} file(s). Please ensure any real users have been reassigned in Global User Directory before deleting.`;
            }
            if (!confirm(confirmMsg)) return;

            try {
                await db.deleteWorkspace(workspace.id);
                allWorkspaces.value = allWorkspaces.value.filter(w => w.id !== workspace.id);
                await loadData();
                alert(`Workspace "${workspace.name}" has been permanently deleted.`);
            } catch (err) {
                console.error("Error deleting workspace:", err);
                alert("Failed to delete workspace: " + (err.message || err));
            }
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
                smName: defaultSmName.value || '',
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

        const shareFileWhatsApp = (file) => {
            const dateStr = file.loginDate ? formatDateOnly(file.loginDate) : formatDateOnly(file.createdAt);
            const loanAmtStr = formatCurrency(file.loanAmount);
            
            let msg = `*Sales Link - Login Details*\n\n`;
            msg += `*App ID:* #${file.appId || 'N/A'}\n`;
            msg += `*Customer Name:* ${file.customerName}\n`;
            msg += `*Loan Amount:* Rs. ${loanAmtStr}\n`;
            msg += `*Category:* ${file.nclUcl || 'N/A'}\n`;
            msg += `*Channel:* ${file.sourcingChannel || 'N/A'}\n`;
            if (file.ppc) msg += `*PPC:* ${file.ppc}\n`;
            if (file.vcip) msg += `*VCIP:* ${file.vcip}\n`;
            if (file.mi) msg += `*MI:* ${file.mi}\n`;
            msg += `*Status:* ${file.status}\n`;
            msg += `*Login Date:* ${dateStr}\n`;
            
            const encodedMsg = encodeURIComponent(msg);
            window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
        };

        const shareBulkWhatsApp = () => {
            if (!filteredMyFiles.value || filteredMyFiles.value.length === 0) return;
            
            let msg = `*Sales Link - Bulk Login Details*\n`;
            msg += `*Total Files:* ${filteredMyFiles.value.length}\n`;
            msg += `*Date:* ${getTodayDateStr()}\n\n`;
            
            filteredMyFiles.value.forEach((file, index) => {
                const dateStr = file.loginDate ? formatDateOnly(file.loginDate) : formatDateOnly(file.createdAt);
                const loanAmtStr = formatCurrency(file.loanAmount);
                
                msg += `*${index + 1}. Customer:* ${file.customerName} (#${file.appId || 'N/A'})\n`;
                msg += `   *Amount:* Rs. ${loanAmtStr} | *Category:* ${file.nclUcl || 'N/A'} | *Channel:* ${file.sourcingChannel || 'N/A'}\n`;
                if (file.ppc || file.vcip || file.mi) {
                    msg += `   `;
                    if (file.ppc) msg += `*PPC:* ${file.ppc} `;
                    if (file.vcip) msg += `*VCIP:* ${file.vcip} `;
                    if (file.mi) msg += `*MI:* ${file.mi} `;
                    msg += `\n`;
                }
                msg += `   *Status:* ${file.status} | *Login Date:* ${dateStr}\n\n`;
            });
            
            const encodedMsg = encodeURIComponent(msg);
            window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
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
            const filename = `SalesLink_Login_Details_${currentUser.value?.name || 'RO'}_${dateStr}.xlsx`;
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
            const filename = `SalesLink_Export_${dateStr}.xlsx`;
            XLSX.writeFile(workbook, filename);
        };


        let growthChartInstance = null;

        const renderGrowthChart = () => {
            if (!isSuperAdmin.value || currentTab.value !== 'super-admin-dashboard') return;
            
            // Wait for DOM
            setTimeout(() => {
                const ctx = document.getElementById('saasGrowthChart');
                if (!ctx) return;
                
                // Prepare data: count files by date for last 30 days
                const last30Days = [...Array(30)].map((_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (29 - i));
                    return d.toISOString().split('T')[0];
                });
                
                const fileCounts = last30Days.map(dateStr => {
                    return allFiles.value.filter(f => {
                        const d = f.createdAt || f.updatedAt;
                        return d && d.startsWith(dateStr);
                    }).length;
                });
                
                if (growthChartInstance) {
                    growthChartInstance.destroy();
                }
                
                // Only create if Chart is defined (loaded via CDN)
                if (typeof window.Chart !== 'undefined') {
                    growthChartInstance = new window.Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: last30Days.map(d => d.substring(5)), // MM-DD
                            datasets: [{
                                label: 'New Files',
                                data: fileCounts,
                                borderColor: '#97144D',
                                backgroundColor: 'rgba(151, 20, 77, 0.1)',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.4,
                                pointBackgroundColor: '#97144D'
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                                x: { grid: { display: false } }
                            }
                        }
                    });
                }
            }, 100);
        };

        watch([allFiles, currentTab], renderGrowthChart);

        // --- Lifecycle ---
        onMounted(async () => {
            try {
                systemAnnouncement.value = await db.getAnnouncement();
                adminAnnouncementInput.value = systemAnnouncement.value;
                activeManagerPasscode.value = await db.getManagerSecurityKey();
                managerPasscodeInput.value = activeManagerPasscode.value;
            } catch(e) { console.error(e); }

            // Check if returning from Direct Sign-In (Redirect)
            try {
                const redirectUser = await db.checkRedirectResult();
                if (redirectUser) {
                    isLoggingIn.value = true;
                    loginStage.value = 'verifying';
                    await processUserLogin(redirectUser);
                    isLoggingIn.value = false;
                    loginStage.value = '';
                }
            } catch (e) {
                console.error("Redirect login processing error:", e);
                loginError.value = e.message;
                isLoggingIn.value = false;
                loginStage.value = '';
            }

            // Check for existing session
            if (currentUser.value) {
                initUserSm();
                
                try {
                    await loadData();
                } catch (e) {
                    console.error("Failed to load initial data, you may need to re-login:", e);
                }
            } else {
                localStorage.removeItem('axis_user');
            }
        });

        // Return everything needed by the template
        return {
            currentUser, loginForm, loginError, isLoggingIn, loginStage, isRegistering, registerStage, currentTab, mobileMenuOpen, defaultSmName,
            isSuperAdmin, isSM, isRO, stats, smLeaderboard, roStats, saasOverviewTimeline, saasOverviewCustomDate, saasStats, tenantHealthList, groupedUsers, recentFiles, filteredFiles, filteredMyFiles, roUsers, activeRoUsers, suspendedRoUsers, myFiles, allWorkspaces, allFiles,
            userSearchQuery, userFilterStatus, expandedWorkspaces, toggleWorkspaceExpansion, expandAllWorkspaces, collapseAllWorkspaces, showEditUserModal, editUserForm, openEditUserModal, saveUserEdit,
            showRegisterMode, registerForm, registerError, registerSM, bankOptions, divisionOptions, toggleWorkspaceStatus, deleteWorkspace,
            showAddRoModal, newRoForm, addRoError,
            newFileForm, showEditFileModal, editFileForm, showUpdateStatusModal, selectedFile, statusUpdateForm,
            showViewFileModal, filters, roFilters, showMobileFilterDrawer, roOverviewTimeline, roOverviewCustomDate, smOverviewTimeline, smOverviewCustomDate,
            formatCurrency, formatLakhsToRupees, toLakhs, formatDate, formatDateOnly, getStatusBadgeClass, getTabTitle, getTimelineLabel, getSortLabel, resetRoFilters,
            getTodayDateStr, getYesterdayDateStr,
            login, loginRedirect, logout, saveNewRo, toggleUserStatus, deleteRoUser,
            resetNewFileForm, saveNewFile, openEditFileModal, saveEditedFile, deleteFile, shareFileWhatsApp, shareBulkWhatsApp,
            originalUser, impersonateUser, stopImpersonation,
            systemAnnouncement, adminAnnouncementInput, saveAnnouncement,
            activeManagerPasscode, managerPasscodeInput, showManagerKeySecret, managerKeySavedToast,
            saveManagerPasscode, generateRandomManagerKey, copyManagerKey,
            openEditStatusModal, saveFileStatus, openViewFileModal, exportToExcel, exportRoFilesToExcel,
            eodForm, eodSubmitError, eodSubmitSuccess, submitting, metricsConfig, validateEOD, myEods, smEods, submitEOD,
            smEodSummary, missingEods, generateEodWhatsApp, generateRoWhatsApp, hasSubmittedToday, eodTotals,
            dealerVisitsInput, tomorrowLoginsInput, tomorrowDisbInput, remarksInput,
            isEditingTodayEod, startReviseTodayEod, cancelReviseTodayEod,
            showTodayFilesBreakdown, todayLoginsFiles, todayDisbFiles,
            eodSubTab, eodCopiedToast, copyRoEodToClipboard, eodResyncSuccess, triggerResyncEod,
            roTargetFiles, roTargetVolume, showEditTargetModal, targetInputFiles, targetInputVolume, openEditTargetModal, saveRoTarget, roTargetPacing,
            roNeedsAttentionFiles,
            selectedRoForInspection, showRoInspectorDrawer, roInspectorActiveTab, openRoInspector, closeRoInspector, selectedRoAnalytics, generateSmNudgeWhatsApp, generateFileAlertWhatsApp, myRecentFiles, navigateRoStatusFilter, currentRoMtd, eodMtdTotals, getRoMtdForDate
        };
    }
});

app.mount('#app');


