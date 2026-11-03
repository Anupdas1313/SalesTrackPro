import * as db from './db.js';
const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
    setup() {
        const showMobileFilterDrawer = ref(false);
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

        // --- Bank-Grade Security & Session Gatekeeper ---
        let userSecurityUnsub = null;
        let inactivityTimer = null;
        const INACTIVITY_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes auto-lock

        const generateSessionId = () => {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
            return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
        };

        const handleSecurityLockout = (reason) => {
            console.warn("Security Lockout Triggered:", reason);
            if (userSecurityUnsub) {
                userSecurityUnsub();
                userSecurityUnsub = null;
            }
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
                inactivityTimer = null;
            }
            localStorage.removeItem('axis_user');
            localStorage.removeItem('axis_active_session_id');
            currentUser.value = null;
            alert(`⛔ Security Alert: Access Terminated\n\n${reason}`);
            window.location.reload();
        };

        const resetInactivityTimer = () => {
            if (inactivityTimer) clearTimeout(inactivityTimer);
            if (!currentUser.value?.id) return;

            inactivityTimer = setTimeout(() => {
                handleSecurityLockout('Your session has timed out due to 20 minutes of inactivity for banking data privacy.');
            }, INACTIVITY_TIMEOUT_MS);
        };

        // Attach global user activity listeners for inactivity auto-lock
        if (typeof window !== 'undefined') {
            ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
                window.addEventListener(evt, () => {
                    if (currentUser.value?.id) resetInactivityTimer();
                }, { passive: true });
            });
        }

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

                // Check 1: Real-time Account Status (Freeze / Suspend / Resign)
                if (freshUser.status === 'suspended' || freshUser.status === 'resigned' || freshUser.status === 'inactive') {
                    const statusText = freshUser.status === 'suspended' ? 'FROZEN & LOCKED' : 'REVOKED (Offboarded)';
                    handleSecurityLockout(`Your account has been ${statusText} by your Sales Manager (${freshUser.supervisorName || 'Supervisor'}). Access is immediately terminated.`);
                    return;
                }

                // Check 2: Single-Device Concurrency (Credential Sharing Protection)
                const currentLocalSessionId = localStorage.getItem('axis_active_session_id');
                if (freshUser.activeSessionId && currentLocalSessionId && freshUser.activeSessionId !== currentLocalSessionId) {
                    handleSecurityLockout('Your account was logged in from another device. SalesLink allows only one active device session per officer to prevent credential sharing.');
                    return;
                }

                // Check 3: Dynamic Sync of Supervisor and Tenant changes
                if (currentUser.value) {
                    if (freshUser.supervisorName) currentUser.value.supervisorName = freshUser.supervisorName;
                    if (freshUser.supervisorId) currentUser.value.supervisorId = freshUser.supervisorId;
                    if (freshUser.tenantId) currentUser.value.tenantId = freshUser.tenantId;
                }
            });

            // Start Inactivity Timer for Banking Privacy
            resetInactivityTimer();
        };
        const loginForm = ref({ username: '', password: '' });
        const loginError = ref('');
        const isLoggingIn = ref(false);
        const loginStage = ref(''); // '' | 'selecting' | 'verifying' | 'enter_otp' | 'linking_phone'
        const isRegistering = ref(false);
        const registerStage = ref(''); // '' | 'selecting' | 'setting_up'
        const showRegisterMode = ref(false);
        const registerForm = ref({ role: 'sm', name: '', region: '', phone: '', bankName: 'Axis Bank', customBankName: '', division: 'Auto Loans (Car Loans)' });

        // Mandatory Phone OTP & 2-Factor Authentication Gatekeeper State
        const phoneLoginForm = ref({ phone: '' });
        const otpCode = ref('');
        const phoneConfirmationResult = ref(null);
        const pendingOtpUser = ref(null);
        const otpTargetPhoneDisplay = ref('');
        const isSendingOtp = ref(false);
        const isVerifyingOtp = ref(false);
        const otpResendCountdown = ref(0);
        let otpCountdownTimer = null;
        const missingPhoneInput = ref('');
        const showMissingPhoneModal = ref(false);
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
            if (initialUser.role === 'zsm') return 'zsm-dashboard';
            if (initialUser.role === 'asm') return 'asm-dashboard';
            if (initialUser.role === 'sm' || initialUser.role === 'admin') return 'dashboard';
            return 'ro-dashboard';
        };
        const currentTab = ref(getInitialTab());
        const goToTab = (tab) => {
            if (tab) {
                currentTab.value = tab;
                if (tab === 'profile') {
                    initProfileForm();
                    profileActiveTab.value = 'overview';
                }
                nextTick(() => {
                    const scrollContainer = document.querySelector('.overflow-y-auto');
                    if (scrollContainer) scrollContainer.scrollTop = 0;
                });
            }
        };
        const mobileMenuOpen = ref(false);

        // Data arrays
        const roUsers = ref([]);
        const allFiles = ref([]);
        const myFiles = ref([]); // For ROs
        const allWorkspaces = ref([]); // For Super Admin

        // Modals & Forms
        const showAddRoModal = ref(false);
        const addRoStep = ref('form'); // 'form' | 'success'
        const newRoForm = ref({ name: '', email: '', phone: '', employeeCode: '' });
        const addRoError = ref('');
        const isSavingRo = ref(false);
        const newlyCreatedRo = ref(null);
        const copyRoInviteSuccess = ref(false);

        const openAddRoModal = () => {
            addRoStep.value = 'form';
            newRoForm.value = { name: '', email: '', phone: '', employeeCode: '' };
            addRoError.value = '';
            newlyCreatedRo.value = null;
            copyRoInviteSuccess.value = false;
            showAddRoModal.value = true;
        };

        const closeAddRoModal = () => {
            showAddRoModal.value = false;
            addRoStep.value = 'form';
            newRoForm.value = { name: '', email: '', phone: '', employeeCode: '' };
            addRoError.value = '';
            newlyCreatedRo.value = null;
            copyRoInviteSuccess.value = false;
        };

        const appendGmailDomain = () => {
            if (!newRoForm.value.email) {
                newRoForm.value.email = '@gmail.com';
                return;
            }
            const clean = newRoForm.value.email.trim();
            if (!clean.includes('@')) {
                newRoForm.value.email = clean + '@gmail.com';
            }
        };

        const getRoInviteWhatsAppText = (ro) => {
            if (!ro) return '';
            const smName = currentUser.value ? (currentUser.value.name || 'Sales Manager') : 'Sales Manager';
            const staffCodeLine = ro.employeeCode ? `\n👔 *Staff Code:* ${ro.employeeCode}` : '';
            return `👋 *Hi ${ro.name}*,\n\nWelcome to the team! You have been onboarded as a Relationship Officer on *SalesLink*.\n\n🔗 *Login Portal:* https://saleslink.in\n📧 *Google Account:* ${ro.email}\n🆔 *SalesLink ID:* ${ro.salesLinkId || 'Pending'}${staffCodeLine}\n\n👉 *Instructions:* Tap the login link above and click *"Sign in with Google"* using ${ro.email} to start logging customer files & daily EOD.\n\nBest regards,\n${smName}`;
        };

        const shareRoInviteWhatsApp = (ro) => {
            if (!ro || !ro.phone) return;
            const text = getRoInviteWhatsAppText(ro);
            const phone = String(ro.phone).replace(/\D/g, '').slice(-10);
            const url = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
        };

        const copyRoInviteMessage = async (ro) => {
            if (!ro) return;
            const text = getRoInviteWhatsAppText(ro);
            try {
                await navigator.clipboard.writeText(text);
                copyRoInviteSuccess.value = true;
                setTimeout(() => {
                    copyRoInviteSuccess.value = false;
                }, 2500);
            } catch (e) {
                console.error('Clipboard copy error:', e);
            }
        };

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

        const STANDARD_STATUSES = ['Lead', 'FI', 'FCU', 'UW', 'Sanction', 'Approved', 'Rejected', 'Disbursed', 'Cancelled'];
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
            timeline: 'this-month', // 'today', 'yesterday', 'this-week', 'this-month', 'all', 'custom'
            customDate: '',
            sortBy: 'newest' // 'newest', 'oldest', 'amount-desc', 'amount-asc', 'name-asc'
        });

                // Helper: Sanction / Disbursal status matchers
        const isSanctionStatus = (status) => {
            if (!status) return false;
            const s = String(status).trim().toLowerCase();
            return s === 'approved' || s === 'sanction' || s === 'sanctioned';
        };

        const isDisbursedStatus = (status) => {
            if (!status) return false;
            const s = String(status).trim().toLowerCase();
            return s === 'disbursed';
        };

        const matchesFileTimeline = (f, timeline, customDate) => {
            if (!f) return false;
            if (timeline === 'all') return true;
            if (f.loginDate && matchesTimeline(f.loginDate, timeline, customDate)) return true;
            if (f.updatedAt && matchesTimeline(f.updatedAt, timeline, customDate)) return true;
            if (f.createdAt && matchesTimeline(f.createdAt, timeline, customDate)) return true;
            return false;
        };

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
        const isSuperAdmin = computed(() => (currentUser.value?.role || '').toLowerCase() === 'super_admin');
        const isSM = computed(() => {
            const r = (currentUser.value?.role || '').toLowerCase();
            return r === 'sm' || r === 'admin';
        }); // fallback for legacy
        const isRO = computed(() => (currentUser.value?.role || '').toLowerCase() === 'ro');
        const isASM = computed(() => (currentUser.value?.role || '').toLowerCase() === 'asm');
        const isZSM = computed(() => (currentUser.value?.role || '').toLowerCase() === 'zsm');



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

        // Split active, suspended, and resigned/offboarded ROs for clear visual separation & governance
        const activeRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status !== 'suspended' && u.status !== 'resigned');
        });

        const suspendedRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status === 'suspended');
        });

        const resignedRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status === 'resigned');
        });

        // SM User Management Filter & Tab State
        const smUsersTab = ref('active'); // 'active' | 'suspended' | 'resigned'
        const smUsersSearch = ref('');

        const filteredActiveRos = computed(() => {
            const q = (smUsersSearch.value || '').trim().toLowerCase();
            if (!q) return activeRoUsers.value;
            return activeRoUsers.value.filter(u => 
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.employeeCode && String(u.employeeCode).toLowerCase().includes(q)) ||
                (u.phone && String(u.phone).includes(q))
            );
        });

        const filteredSuspendedRos = computed(() => {
            const q = (smUsersSearch.value || '').trim().toLowerCase();
            if (!q) return suspendedRoUsers.value;
            return suspendedRoUsers.value.filter(u => 
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.employeeCode && String(u.employeeCode).toLowerCase().includes(q)) ||
                (u.phone && String(u.phone).includes(q))
            );
        });

        const filteredResignedRos = computed(() => {
            const q = (smUsersSearch.value || '').trim().toLowerCase();
            if (!q) return resignedRoUsers.value;
            return resignedRoUsers.value.filter(u => 
                (u.name && u.name.toLowerCase().includes(q)) ||
                (u.email && u.email.toLowerCase().includes(q)) ||
                (u.employeeCode && String(u.employeeCode).toLowerCase().includes(q)) ||
                (u.transferredToRoName && u.transferredToRoName.toLowerCase().includes(q))
            );
        });

        // --- Employee Resignation & Pipeline Handoff State ---
        const showOffboardModal = ref(false);
        const userToOffboard = ref(null);
        const offboardReplacementRoId = ref('');
        const offboardReason = ref('resigned');
        const offboardConfirm = ref(false);
        const isOffboarding = ref(false);
        const offboardError = ref('');
        const offboardSuccess = ref('');

        const availableReplacementRos = computed(() => {
            if (!userToOffboard.value) return activeRoUsers.value;
            return activeRoUsers.value.filter(u => u.id !== userToOffboard.value.id);
        });

        const offboardCandidateFiles = computed(() => {
            if (!userToOffboard.value) return [];
            const uid = userToOffboard.value.id;
            const uName = (userToOffboard.value.name || '').trim().toUpperCase();
            return (allFiles.value || []).filter(f => f.roId === uid || (uName && f.roName && f.roName.trim().toUpperCase() === uName));
        });

        const offboardActiveFiles = computed(() => {
            return offboardCandidateFiles.value.filter(f => {
                const s = (f.status || '').toLowerCase();
                return s !== 'disbursed' && s !== 'rejected' && s !== 'cancelled';
            });
        });

        const offboardDisbursedFiles = computed(() => {
            return offboardCandidateFiles.value.filter(f => (f.status || '').toLowerCase() === 'disbursed');
        });

        const offboardActiveFilesVolume = computed(() => {
            return offboardActiveFiles.value.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
        });

        const openOffboardModal = (user) => {
            userToOffboard.value = user;
            offboardReplacementRoId.value = '';
            offboardReason.value = 'resigned';
            offboardConfirm.value = false;
            offboardError.value = '';
            offboardSuccess.value = '';
            isOffboarding.value = false;
            showOffboardModal.value = true;
        };

        const submitOffboardUser = async () => {
            if (!userToOffboard.value) return;
            offboardError.value = '';
            offboardSuccess.value = '';

            if (offboardActiveFiles.value.length > 0 && !offboardReplacementRoId.value) {
                offboardError.value = 'Please select an active officer to inherit this active loan pipeline.';
                return;
            }

            if (!offboardConfirm.value) {
                offboardError.value = 'Please confirm the employee resignation and credential revocation checkbox.';
                return;
            }

            isOffboarding.value = true;
            try {
                const result = await db.offboardAndReassignRo({
                    resignedUserId: userToOffboard.value.id,
                    replacementUserId: offboardReplacementRoId.value || null,
                    supervisorId: currentUser.value?.id || '',
                    reason: offboardReason.value
                });

                const repName = result.replacementUser?.name || 'designated officer';
                offboardSuccess.value = `✓ Offboarding complete! Reassigned ${result.transferredCount} active files to ${repName} and permanently revoked login access for ${result.resignedUser.name}.`;

                await loadData();

                setTimeout(() => {
                    showOffboardModal.value = false;
                    userToOffboard.value = null;
                    offboardSuccess.value = '';
                }, 2800);
            } catch (err) {
                console.error("Offboard error:", err);
                offboardError.value = err.message || 'Failed to offboard employee.';
            } finally {
                isOffboarding.value = false;
            }
        };

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
                employeeCode: user.employeeCode || '',
                phone: user.phone || '',
                tenantId: user.tenantId || '',
                role: user.role || 'ro'
            };
            showEditUserModal.value = true;
        };

        const saveUserEdit = async () => {
            try {
                const cleanedName = formatCapitalizeName(editUserForm.value.name);
                const cleanedEmail = (editUserForm.value.email || '').trim().toLowerCase();
                const cleanedEmp = (editUserForm.value.employeeCode || '').trim().toUpperCase();
                const cleanedPhone = (editUserForm.value.phone || '').trim().replace(/\D/g, '').slice(-10);

                if (!cleanedName) {
                    alert("User full name is required.");
                    return;
                }
                if (!cleanedEmail) {
                    alert("A valid Google Email address is required.");
                    return;
                }

                // Verify Employee ID uniqueness across other users/SMs
                if (cleanedEmp) {
                    const existingEmp = await db.getUserByEmployeeCode(cleanedEmp);
                    if (existingEmp && existingEmp.id !== editUserForm.value.id) {
                        const supName = await db.getSupervisorNameForUser(existingEmp);
                        alert(`⚠️ This Employee ID (${cleanedEmp}) is already linked with another Sales Manager (${supName}) for officer "${existingEmp.name || 'Staff'}". Duplicate Employee IDs cannot be assigned.`);
                        return;
                    }
                }

                // Verify Email uniqueness across other users/SMs
                const existingEmail = await db.getUserByEmail(cleanedEmail);
                if (existingEmail && existingEmail.id !== editUserForm.value.id) {
                    const supName = await db.getSupervisorNameForUser(existingEmail);
                    alert(`⚠️ Google email (${cleanedEmail}) is already linked with another Sales Manager (${supName}).`);
                    return;
                }

                const updatePayload = {
                    name: cleanedName,
                    email: cleanedEmail,
                    employeeCode: cleanedEmp,
                    phone: cleanedPhone
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
                        employeeCode: cleanedEmp,
                        phone: cleanedPhone,
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
        const roOverviewTimeline = ref('this-month');
        const roOverviewCustomDate = ref('');

        // RO Overview KPIs
        const roStats = computed(() => {
            const files = myFiles.value.filter(f => matchesFileTimeline(f, roOverviewTimeline.value, roOverviewCustomDate.value));
            const approved = files.filter(f => isSanctionStatus(f.status));
            const disbursed = files.filter(f => isDisbursedStatus(f.status));
            const inProcess = files.filter(f => ['lead', 'fi', 'fcu', 'uw'].includes((f.status || '').toLowerCase()));
            const login = files.filter(f => (f.status || '').toLowerCase() === 'fi');
            const rejected = files.filter(f => (f.status || '').toLowerCase() === 'rejected');
            const ncl = files.filter(f => (f.nclUcl || '').toUpperCase() === 'NCL');
            const ucl = files.filter(f => (f.nclUcl || '').toUpperCase() === 'UCL');

            const totalAmount = files.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const approvedAmount = approved.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const disbursedAmount = disbursed.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const inProcessAmount = inProcess.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const loginAmount = login.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const rejectedAmount = rejected.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const nclAmount = ncl.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const uclAmount = ucl.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            // EOD alignment fallback: ensures metrics from EOD reports reflect even if files haven't been separately logged
            const eodSancCount = (roOverviewTimeline.value === 'this-month') 
                ? (eodMtdTotals.value?.sanctionCount || 0)
                : (roOverviewTimeline.value === 'today' ? (eodTotals.value?.sanctionCount || 0) : 0);
            const eodSancAmt = (roOverviewTimeline.value === 'this-month')
                ? (eodMtdTotals.value?.sanctionAmount || 0)
                : (roOverviewTimeline.value === 'today' ? (eodTotals.value?.sanctionAmount || 0) : 0);

            const eodDisbCount = (roOverviewTimeline.value === 'this-month') 
                ? (eodMtdTotals.value?.disbCount || 0)
                : (roOverviewTimeline.value === 'today' ? (eodTotals.value?.disbCount || 0) : 0);
            const eodDisbAmt = (roOverviewTimeline.value === 'this-month')
                ? (eodMtdTotals.value?.disbAmount || 0)
                : (roOverviewTimeline.value === 'today' ? (eodTotals.value?.disbAmount || 0) : 0);

            const eodLoginCount = (roOverviewTimeline.value === 'this-month') 
                ? (eodMtdTotals.value?.loginCount || 0)
                : (roOverviewTimeline.value === 'today' ? (eodTotals.value?.loginCount || 0) : 0);
            const eodLoginAmt = (roOverviewTimeline.value === 'this-month')
                ? (eodMtdTotals.value?.loginAmount || 0)
                : (roOverviewTimeline.value === 'today' ? (eodTotals.value?.loginAmount || 0) : 0);

            const finalApprovedCount = Math.max(approved.length, eodSancCount);
            const finalApprovedAmount = Math.max(approvedAmount, eodSancAmt);
            const finalDisbCount = Math.max(disbursed.length, eodDisbCount);
            const finalDisbAmount = Math.max(disbursedAmount, eodDisbAmt);
            const finalTotalFiles = Math.max(files.length, eodLoginCount, finalApprovedCount);
            const finalTotalAmount = Math.max(totalAmount, eodLoginAmt, finalApprovedAmount);

            const approvalRate = finalTotalFiles ? Math.round(((finalApprovedCount + finalDisbCount) / finalTotalFiles) * 100) : 0;

            const todayStr = getTodayDateStr();
            const todayLogged = myFiles.value.filter(f => (f.loginDate === todayStr) || (f.createdAt && f.createdAt.startsWith(todayStr)));
            const todayDisb = myFiles.value.filter(f => isDisbursedStatus(f.status) && ((f.loginDate === todayStr) || (f.updatedAt && f.updatedAt.startsWith(todayStr))));

            const stages = {
                Lead: files.filter(f => (f.status || '').toLowerCase() === 'lead').length,
                FI: files.filter(f => (f.status || '').toLowerCase() === 'fi').length,
                FCU: files.filter(f => (f.status || '').toLowerCase() === 'fcu').length,
                UW: files.filter(f => (f.status || '').toLowerCase() === 'uw').length,
                Approved: finalApprovedCount,
                Sanction: finalApprovedCount,
                Disbursed: finalDisbCount,
                Rejected: rejected.length
            };

            return {
                totalFiles: finalTotalFiles,
                totalAmount: finalTotalAmount,
                approvedCount: finalApprovedCount,
                approvedAmount: finalApprovedAmount,
                sanctionCount: finalApprovedCount,
                sanctionAmount: finalApprovedAmount,
                disbursedCount: finalDisbCount,
                disbursedAmount: finalDisbAmount,
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
            roFilters.value.timeline = roOverviewTimeline.value;
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
                    ? (['approved', 'sanction', 'sanctioned'].includes(roFilters.value.status.toLowerCase()) ? isSanctionStatus(file.status) : (roFilters.value.status === 'Custom' ? !STANDARD_STATUSES.includes(file.status) : (file.status || '').toLowerCase() === roFilters.value.status.toLowerCase())) 
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
                    ? (['approved', 'sanction', 'sanctioned'].includes(roFilters.value.status.toLowerCase()) ? isSanctionStatus(file.status) : (roFilters.value.status === 'Custom' ? !STANDARD_STATUSES.includes(file.status) : (file.status || '').toLowerCase() === roFilters.value.status.toLowerCase())) 
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

        const formatCapitalizeName = (str) => {
            if (!str) return '';
            return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        };

        const getStatusBadgeClass = (status) => {
            switch (status) {
                case 'Lead': return 'px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[11px] font-semibold';
                case 'FI': return 'px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[11px] font-semibold';
                case 'FCU': return 'px-2.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-[11px] font-semibold';
                case 'UW': return 'px-2.5 py-0.5 bg-violet-50 text-violet-700 rounded-full text-[11px] font-semibold';
                case 'Cancelled': return 'px-2.5 py-0.5 bg-stone-50 text-stone-700 rounded-full text-[11px] font-semibold';
                case 'Sanction':
                case 'Sanctioned':
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
                case 'ro-eod': return 'Daily EOD Report';
                case 'sm-eod': return 'RO Daily EOD Submissions';
                case 'dashboard': return 'Global Dashboard';
                case 'tracking': return 'Live File Tracking';
                case 'users': return 'User Management';
                case 'asm-dashboard': return 'Area Dashboard';
                case 'asm-tracking': return 'File Tracking';
                case 'asm-team': return 'Team Users';
                case 'asm-eod': return 'SM Daily EODs';
                case 'zsm-dashboard': return 'Zonal Operations Cockpit';
                case 'zsm-team': return 'Supervised Area Managers';
                case 'profile': return 'My Profile & Account';
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
            { label: 'Used Car', key: 'loginUsedCar', category: 'Login', type: 'both' },
            { label: 'Open Market', key: 'sanctionOpenMarket', category: 'Sanction', type: 'both' },
            { label: 'Branch', key: 'loginBranchSanction', category: 'Sanction', type: 'both' },
            { label: 'Used Car', key: 'sanctionUsedCar', category: 'Sanction', type: 'both' },
            { label: 'Open Market', key: 'disbOpenMarket', category: 'Disbursement', type: 'both' },
            { label: 'Branch', key: 'disbBranch', category: 'Disbursement', type: 'both' },
            { label: 'Used Car', key: 'disbUsedCar', category: 'Disbursement', type: 'both' },
            { label: 'VICP/CRM', key: 'vicpCrm', category: 'Other', type: 'count' },
            { label: 'MI', key: 'mi', category: 'Other', type: 'count' },
            { label: 'Maruti Login', key: 'marutiLogin', category: 'Maruti', type: 'both' },
            { label: 'Maruti Disb', key: 'marutiDisb', category: 'Maruti', type: 'both' }
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
            loginUsedCar: { count: 0, amount: 0 },
            sanctionOpenMarket: { count: 0, amount: 0 },
            loginBranchSanction: { count: 0, amount: 0 },
            sanctionUsedCar: { count: 0, amount: 0 },
            disbOpenMarket: { count: 0, amount: 0 },
            disbBranch: { count: 0, amount: 0 },
            disbUsedCar: { count: 0, amount: 0 },
            vicpCrm: { count: 0 },
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
            const sCount = (f.sanctionOpenMarket?.count || 0) + (f.loginBranchSanction?.count || 0) + (f.sanctionUsedCar?.count || 0);
            const sAmt = (f.sanctionOpenMarket?.amount || 0) + (f.loginBranchSanction?.amount || 0) + (f.sanctionUsedCar?.amount || 0);
            return {
                loginCount: (f.loginOpenMarket.count||0) + (f.loginBranch.count||0) + (f.loginUsedCar.count||0),
                loginAmount: (f.loginOpenMarket.amount||0) + (f.loginBranch.amount||0) + (f.loginUsedCar.amount||0),
                disbCount: (f.disbOpenMarket.count||0) + (f.disbBranch.count||0) + (f.disbUsedCar.count||0),
                disbAmount: (f.disbOpenMarket.amount||0) + (f.disbBranch.amount||0) + (f.disbUsedCar.amount||0),
                sanctionCount: sCount,
                sanctionAmt: sAmt,
                sanctionAmount: sAmt,
                vcipCount: (f.vicpCrm?.count || 0),
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
                loginUsedCar: { count: 0, amount: 0 },
                sanctionOpenMarket: { count: 0, amount: 0 },
                loginBranchSanction: { count: 0, amount: 0 },
                sanctionUsedCar: { count: 0, amount: 0 },
                disbOpenMarket: { count: 0, amount: 0 },
                disbBranch: { count: 0, amount: 0 },
                disbUsedCar: { count: 0, amount: 0 },
                vicpCrm: { count: 0 },
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

                if (isSanctionStatus(f.status) || isDisbursedStatus(f.status)) {
                    if (cat === 'UCL') {
                        m.sanctionUsedCar.count += 1;
                        m.sanctionUsedCar.amount += amt;
                    } else if (chan === 'BRANCH') {
                        m.loginBranchSanction.count += 1;
                        m.loginBranchSanction.amount += amt;
                    } else {
                        m.sanctionOpenMarket.count += 1;
                        m.sanctionOpenMarket.amount += amt;
                    }
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
            const m = currentRoMtd.value || {};
            const loginCount = (m.loginOpenMarket?.count || 0) + (m.loginBranch?.count || 0) + (m.loginUsedCar?.count || 0);
            const loginAmount = (m.loginOpenMarket?.amount || 0) + (m.loginBranch?.amount || 0) + (m.loginUsedCar?.amount || 0);
            const disbCount = (m.disbOpenMarket?.count || 0) + (m.disbBranch?.count || 0) + (m.disbUsedCar?.count || 0);
            const disbAmount = (m.disbOpenMarket?.amount || 0) + (m.disbBranch?.amount || 0) + (m.disbUsedCar?.amount || 0);
            const sanctionCount = (m.sanctionOpenMarket?.count || 0) + (m.loginBranchSanction?.count || 0) + (m.sanctionUsedCar?.count || 0);
            const sanctionAmount = (m.sanctionOpenMarket?.amount || 0) + (m.loginBranchSanction?.amount || 0) + (m.sanctionUsedCar?.amount || 0);
            return { loginCount, loginAmount, disbCount, disbAmount, sanctionCount, sanctionAmount, sanctionAmt: sanctionAmount };
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
                        loginUsedCar: { count: 0, amount: 0 },
                        sanctionOpenMarket: { count: 0, amount: 0 },
                        loginBranchSanction: { count: 0, amount: 0 },
                        sanctionUsedCar: { count: 0, amount: 0 },
                        disbOpenMarket: { count: 0, amount: 0 },
                        disbBranch: { count: 0, amount: 0 },
                        disbUsedCar: { count: 0, amount: 0 },
                        vicpCrm: { count: 0 },
                        marutiLogin: { count: 0, amount: 0 }, marutiDisb: { count: 0, amount: 0 }, mi: { count: 0 }
                    },
                    mtd: {
                        loginOpenMarket: { count: 0, amount: 0 },
                        loginBranch: { count: 0, amount: 0 },
                        loginUsedCar: { count: 0, amount: 0 },
                        sanctionOpenMarket: { count: 0, amount: 0 },
                        loginBranchSanction: { count: 0, amount: 0 },
                        sanctionUsedCar: { count: 0, amount: 0 },
                        disbOpenMarket: { count: 0, amount: 0 },
                        disbBranch: { count: 0, amount: 0 },
                        disbUsedCar: { count: 0, amount: 0 },
                        vicpCrm: { count: 0 },
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

            const sTotalFtd = (f.sanctionOpenMarket?.count || 0) + (f.loginBranchSanction?.count || 0) + (f.sanctionUsedCar?.count || 0);
            const sTotalAmountFtd = (f.sanctionOpenMarket?.amount || 0) + (f.loginBranchSanction?.amount || 0) + (f.sanctionUsedCar?.amount || 0);
            const sTotalMtd = (m.sanctionOpenMarket?.count || 0) + (m.loginBranchSanction?.count || 0) + (m.sanctionUsedCar?.count || 0);
            const sTotalAmountMtd = (m.sanctionOpenMarket?.amount || 0) + (m.loginBranchSanction?.amount || 0) + (m.sanctionUsedCar?.amount || 0);

            let text = `${dateStr}\n`;
            text += `*Login :*\n`;
            text += `*Open Market :*\n`;
            text += `FTD : ${formatVal(f.loginOpenMarket.count, f.loginOpenMarket.amount)}\n`;
            text += `MTD: ${formatVal(m.loginOpenMarket.count, m.loginOpenMarket.amount)}\n`;
            text += `*Branch*\n`;
            text += `FTD : ${formatVal(f.loginBranch.count, f.loginBranch.amount)}\n`;
            text += `MTD:  ${formatVal(m.loginBranch.count, m.loginBranch.amount)}\n`;
            text += `Sanction: ${formatVal(f.loginBranchSanction?.count, f.loginBranchSanction?.amount)}\n`;
            text += `MTD sanction: ${m.loginBranchSanction?.count || 0}\n`;
            text += `*Used Car*\n`;
            text += `FTD - ${formatVal(f.loginUsedCar.count, f.loginUsedCar.amount)}\n`;
            text += `MTD - ${formatVal(m.loginUsedCar.count, m.loginUsedCar.amount)}\n\n`;

            text += `Total FTD :  ${formatVal(tlFtd, tlaFtd)}\n`;
            text += `Total MTD: ${formatVal(tlMtd, tlaMtd)} \n\n`;

            text += `*Sanction :*\n`;
            text += `*Open Market :* FTD: ${formatVal(f.sanctionOpenMarket?.count, f.sanctionOpenMarket?.amount)} | MTD: ${formatVal(m.sanctionOpenMarket?.count, m.sanctionOpenMarket?.amount)}\n`;
            text += `*Branch :* FTD: ${formatVal(f.loginBranchSanction?.count, f.loginBranchSanction?.amount)} | MTD: ${formatVal(m.loginBranchSanction?.count, m.loginBranchSanction?.amount)}\n`;
            text += `*Used Car :* FTD: ${formatVal(f.sanctionUsedCar?.count, f.sanctionUsedCar?.amount)} | MTD: ${formatVal(m.sanctionUsedCar?.count, m.sanctionUsedCar?.amount)}\n`;
            text += `Total Sanction FTD: ${formatVal(sTotalFtd, sTotalAmountFtd)} | MTD: ${formatVal(sTotalMtd, sTotalAmountMtd)}\n\n`;

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
            text += `MTD vicp/CRM: ${m.vicpCrm?.count || 0}\n\n`;

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

            const approvedToday = myFiles.value.filter(f => (isSanctionStatus(f.status) || isDisbursedStatus(f.status)) && ((f.updatedAt && f.updatedAt.startsWith(today)) || (f.loginDate === today)));
            approvedToday.forEach(f => {
                const amt = toLakhs(f.loanAmount) || 0;
                const chan = (f.sourcingChannel || '').toUpperCase();
                const cat = (f.nclUcl || '').toUpperCase();

                if (cat === 'UCL') {
                    eodForm.value.sanctionUsedCar.count += 1;
                    eodForm.value.sanctionUsedCar.amount += amt;
                } else if (chan === 'BRANCH') {
                    eodForm.value.loginBranchSanction.count += 1;
                    eodForm.value.loginBranchSanction.amount += amt;
                } else {
                    eodForm.value.sanctionOpenMarket.count += 1;
                    eodForm.value.sanctionOpenMarket.amount += amt;
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
                loginUsedCar: { count: 0, amount: 0 },
                sanctionOpenMarket: { count: 0, amount: 0 },
                loginBranchSanction: { count: 0, amount: 0 },
                sanctionUsedCar: { count: 0, amount: 0 },
                disbOpenMarket: { count: 0, amount: 0 },
                disbBranch: { count: 0, amount: 0 },
                disbUsedCar: { count: 0, amount: 0 },
                vicpCrm: { count: 0 },
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

        // --- SalesLink Identity & Invitation Handshake State ---
        const copiedSalesLinkIdToast = ref(false);
        const copySalesLinkId = async (id) => {
            const targetId = id || currentUser.value?.salesLinkId;
            if (!targetId || targetId === 'Syncing...' || targetId.includes('...')) return;
            try {
                await navigator.clipboard.writeText(targetId);
                copiedSalesLinkIdToast.value = true;
                setTimeout(() => { copiedSalesLinkIdToast.value = false; }, 2500);
            } catch (e) {
                console.warn('Could not copy SalesLink ID to clipboard:', e);
            }
        };

        const pendingInvitations = ref([]);
        const isRespondingInvite = ref(false);

        const acceptSupervisorInvite = async (invitation) => {
            if (!invitation || !currentUser.value) return;
            isRespondingInvite.value = true;
            try {
                await db.acceptInvitation(invitation.id, currentUser.value.id);
                currentUser.value.supervisorId = invitation.fromUserId;
                currentUser.value.supervisorName = invitation.fromName;
                currentUser.value.supervisorRole = invitation.fromRole;
                currentUser.value.supervisorSalesLinkId = invitation.fromSalesLinkId;
                localStorage.setItem('axis_user', JSON.stringify(currentUser.value));
                pendingInvitations.value = pendingInvitations.value.filter(i => i.id !== invitation.id);
                await loadData();
            } catch (e) {
                console.error('Accept invite error:', e);
                alert(e.message || 'Error accepting invitation');
            } finally {
                isRespondingInvite.value = false;
            }
        };

        const declineSupervisorInvite = async (invitation) => {
            if (!invitation) return;
            if (!confirm(`Are you sure you want to decline this invitation from ${invitation.fromName || 'Manager'}?`)) return;
            isRespondingInvite.value = true;
            try {
                await db.declineInvitation(invitation.id);
                pendingInvitations.value = pendingInvitations.value.filter(i => i.id !== invitation.id);
            } catch (e) {
                console.error('Decline invite error:', e);
            } finally {
                isRespondingInvite.value = false;
            }
        };


        // --- SM Self-Connect to Supervisor State & Handlers (Dynamic Dropdown + Instant Conflict Detection) ---
        const showConnectSupervisorModal = ref(false);
        const connectSupervisorMethod = ref('phone'); // 'phone' | 'email' | 'employeeCode' | 'salesLinkId'
        const connectSupervisorInput = ref('');
        const connectSupervisorWarning = ref('');
        const isConnectingSupervisor = ref(false);
        const connectSupervisorError = ref('');
        const connectSupervisorSuccess = ref('');
        const connectedSupervisorData = ref(null);

        const onConnectSupervisorMethodChange = () => {
            connectSupervisorInput.value = '';
            connectSupervisorWarning.value = '';
            connectSupervisorError.value = '';
            connectSupervisorSuccess.value = '';
            connectedSupervisorData.value = null;
        };

        const resetConnectSupervisorModal = () => {
            connectSupervisorMethod.value = 'phone';
            connectSupervisorInput.value = '';
            connectSupervisorWarning.value = '';
            connectSupervisorError.value = '';
            connectSupervisorSuccess.value = '';
            connectedSupervisorData.value = null;
            isConnectingSupervisor.value = false;
        };

        const openConnectSupervisorModal = () => {
            resetConnectSupervisorModal();
            showConnectSupervisorModal.value = true;
        };

        const submitConnectSupervisor = async () => {
            if (!currentUser.value?.id) return;
            connectSupervisorWarning.value = '';
            connectSupervisorError.value = '';
            connectSupervisorSuccess.value = '';
            connectedSupervisorData.value = null;

            const val = (connectSupervisorInput.value || '').trim();
            if (!val) {
                if (connectSupervisorMethod.value === 'phone') connectSupervisorError.value = 'Please enter your Area Manager’s 10-digit mobile number.';
                else if (connectSupervisorMethod.value === 'email') connectSupervisorError.value = 'Please enter your Area Manager’s Gmail address.';
                else if (connectSupervisorMethod.value === 'employeeCode') connectSupervisorError.value = 'Please enter your Area Manager’s Employee / Staff ID.';
                else connectSupervisorError.value = 'Please enter your Area Manager’s SalesLink ID.';
                return;
            }

            // Client-side validations
            if (connectSupervisorMethod.value === 'phone') {
                const digits = val.replace(/\D/g, '');
                if (digits.length < 10) {
                    connectSupervisorError.value = 'Please enter a valid 10-digit mobile number.';
                    return;
                }
            } else if (connectSupervisorMethod.value === 'email') {
                if (!val.includes('@') || !val.includes('.')) {
                    connectSupervisorError.value = 'Please enter a valid Google email address.';
                    return;
                }
            } else if (connectSupervisorMethod.value === 'employeeCode') {
                if (val.length < 3) {
                    connectSupervisorError.value = 'Please enter a valid Employee / Staff ID (at least 3 characters).';
                    return;
                }
            }

            isConnectingSupervisor.value = true;
            try {
                const supervisor = await db.linkSmToSupervisor(currentUser.value.id, val);
                connectedSupervisorData.value = supervisor;

                currentUser.value.supervisorId = supervisor.id;
                currentUser.value.supervisorName = supervisor.name || 'Area Sales Manager';
                currentUser.value.supervisorRole = supervisor.role;
                currentUser.value.supervisorSalesLinkId = supervisor.salesLinkId || '';
                localStorage.setItem('axis_user', JSON.stringify(currentUser.value));

                const roleLabel = supervisor.role === 'asm' ? 'Area Sales Manager (ASM)' : (supervisor.role === 'zsm' ? 'Zonal Sales Manager (ZSM)' : 'Area Supervisor');
                connectSupervisorSuccess.value = `✓ Successfully linked branch hub to ${supervisor.name || 'Area Manager'} (${roleLabel})!`;

                try {
                    await loadData();
                } catch (e) {
                    console.warn("Error refreshing data after supervisor link:", e);
                }

                setTimeout(() => {
                    if (showConnectSupervisorModal.value && !connectSupervisorError.value) {
                        showConnectSupervisorModal.value = false;
                        resetConnectSupervisorModal();
                    }
                }, 3000);
            } catch (err) {
                console.error("Connect supervisor error:", err);
                const msg = err.message || 'Failed to connect to Area Manager.';
                if (msg.includes('Role Conflict') || msg.includes('registered as a Relationship Officer') || msg.includes('registered as a Branch Sales Manager')) {
                    connectSupervisorWarning.value = msg;
                } else {
                    connectSupervisorError.value = msg;
                }
            } finally {
                isConnectingSupervisor.value = false;
            }
        };

        const openAsmWhatsAppNotify = (asm) => {
            if (!asm || !asm.phone) return;
            const cleanPhone = asm.phone.replace(/\D/g, '').slice(-10);
            if (!cleanPhone) return;
            const branchName = currentUser.value?.region || 'our branch hub';
            const smName = currentUser.value?.name || 'Sales Manager';
            const text = encodeURIComponent(`Hi ${asm.name || 'Area Manager'}, I (${smName}) have connected our branch hub (${branchName}) to your Area supervision on SalesLink. Looking forward to working together!`);
            window.open(`https://wa.me/91${cleanPhone}?text=${text}`, '_blank');
        };



        const unlinkFromSupervisor = async () => {
            if (!confirm('Are you sure you want to disconnect from your Area Sales Manager? You will need a new invite to reconnect.')) return;
            try {
                await db.unlinkSupervisor(currentUser.value.id);
                currentUser.value.supervisorId = null;
                currentUser.value.supervisorName = null;
                currentUser.value.supervisorRole = null;
                currentUser.value.supervisorSalesLinkId = null;
                localStorage.setItem('axis_user', JSON.stringify(currentUser.value));
                await loadData();
            } catch (e) {
                console.error('Unlink error:', e);
                alert(e.message || 'Error disconnecting');
            }
        };


        // --- User Profile State & Firestore Operations ---
        const assignedSm = ref({ name: '', phone: '', email: '', salesLinkId: '' });
        const profileForm = ref({
            name: '',
            phone: '',
            employeeCode: '',
            designation: '',
            branchAddress: '',
            bankName: 'Axis Bank',
            division: 'Auto Loans (Car Loans)',
            region: ''
        });
        const profileActiveTab = ref('overview'); // 'overview' | 'edit'
        const isSavingProfile = ref(false);
        const profileSaveSuccess = ref(false);
        const profileSaveError = ref('');

        const initProfileForm = () => {
            if (!currentUser.value) return;
            const defaultRoleDesignation = isSuperAdmin.value ? 'Platform Administrator' : (isZSM.value ? 'Zonal Sales Manager' : (isASM.value ? 'Area Sales Manager' : (isSM.value ? 'SM (Sales Manager)' : 'Relationship Officer')));
            profileForm.value = {
                name: currentUser.value.name || currentUser.value.username || '',
                phone: currentUser.value.phone || '',
                employeeCode: currentUser.value.employeeCode || '',
                designation: currentUser.value.designation || defaultRoleDesignation,
                branchAddress: currentUser.value.branchAddress || '',
                bankName: currentUser.value.bankName || 'Axis Bank',
                division: currentUser.value.division || 'Auto Loans (Car Loans)',
                region: currentUser.value.region || ''
            };
        };

        const profileCompletion = computed(() => {
            if (!currentUser.value) return { percentage: 0, items: [] };
            const u = currentUser.value;
            const items = [
                { label: 'Google Account', completed: !!u.email, icon: 'fab fa-google' },
                { label: 'Mobile Number', completed: !!(u.phone && u.phone.replace(/\D/g, '').length >= 10), icon: 'fas fa-phone' },
                { label: 'Bank & Division', completed: !!(u.bankName && u.division), icon: 'fas fa-building-columns' },
                { label: 'Operating Hub', completed: !!u.region, icon: 'fas fa-location-dot' },
                { label: 'Staff Code', completed: !!u.employeeCode, icon: 'fas fa-id-card' },
                { 
                    label: isRO.value ? 'Supervisor Linked' : (isSM.value ? 'Area ASM Connected' : 'Jurisdiction Defined'), 
                    completed: isRO.value ? !!defaultSmName.value : (isSM.value ? !!u.supervisorName : !!u.region),
                    icon: 'fas fa-sitemap'
                }
            ];
            const completedCount = items.filter(i => i.completed).length;
            const percentage = Math.round((completedCount / items.length) * 100);
            return { percentage, items, completedCount, totalCount: items.length };
        });

        const openRoWhatsAppChat = (ro) => {
            if (!ro?.phone) return;
            const cleanPhone = ro.phone.replace(/\D/g, '');
            const num = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
            const text = encodeURIComponent(`Hi ${ro.name || 'Officer'}, checking in regarding today's loan files and logins for ${currentUser.value?.region || 'our branch'}.`);
            window.open(`https://wa.me/${num}?text=${text}`, '_blank');
        };

        const openSmWhatsAppChat = () => {
            if (!assignedSm.value?.phone) return;
            const cleanPhone = assignedSm.value.phone.replace(/\D/g, '');
            const num = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
            const text = encodeURIComponent(`Hi ${assignedSm.value.name || 'Manager'}, checking in regarding loan files from ${currentUser.value?.name || 'RO'}.`);
            window.open(`https://wa.me/${num}?text=${text}`, '_blank');
        };

        const isResyncingProfile = ref(false);
        const profileResyncSuccess = ref(false);
        const triggerProfileResync = async () => {
            if (isResyncingProfile.value) return;
            isResyncingProfile.value = true;
            try {
                await loadData();
                if (isRO.value) await initUserSm();
                initProfileForm();
                profileResyncSuccess.value = true;
                setTimeout(() => { profileResyncSuccess.value = false; }, 3500);
            } catch (e) {
                console.error("Resync failed:", e);
                alert("Could not refresh data: " + (e.message || e));
            } finally {
                isResyncingProfile.value = false;
            }
        };

        watch(currentUser, (newVal) => {
            if (newVal) {
                initProfileForm();
            }
        }, { immediate: true });

        const saveUserProfile = async () => {
            if (!currentUser.value?.id) return;
            profileSaveError.value = '';
            profileSaveSuccess.value = false;

            const trimmedName = formatCapitalizeName(profileForm.value.name);
            if (!trimmedName) {
                profileSaveError.value = 'Full name is mandatory.';
                return;
            }

            const trimmedPhone = profileForm.value.phone?.trim();
            if (!trimmedPhone) {
                profileSaveError.value = 'Contact Phone / WhatsApp number is mandatory.';
                return;
            }
            if (trimmedPhone.replace(/\D/g, '').length < 10) {
                profileSaveError.value = 'Please provide a valid 10-digit mobile number.';
                return;
            }

            const empCode = (profileForm.value.employeeCode || '').trim().toUpperCase();
            if (empCode) {
                const existingEmp = await db.getUserByEmployeeCode(empCode);
                if (existingEmp && existingEmp.id !== currentUser.value.id) {
                    const supName = await db.getSupervisorNameForUser(existingEmp);
                    profileSaveError.value = `This Employee ID (${empCode}) is already linked with another account under Sales Manager (${supName}). Duplicate Employee IDs are not permitted.`;
                    return;
                }
            }

            isSavingProfile.value = true;
            try {
                const updatePayload = {
                    name: trimmedName,
                    phone: trimmedPhone,
                    employeeCode: empCode,
                    designation: (profileForm.value.designation || '').trim(),
                    branchAddress: (profileForm.value.branchAddress || '').trim(),
                    bankName: profileForm.value.bankName?.trim() || 'Axis Bank',
                    division: profileForm.value.division?.trim() || 'Auto Loans (Car Loans)',
                    region: profileForm.value.region?.trim() || '',
                    updatedAt: new Date().toISOString()
                };

                // 1. Update user in Firestore users collection
                await db.updateUser(currentUser.value.id, updatePayload);

                // 2. If SM and has workspace, sync workspace metadata
                if (isSM.value && currentUser.value.tenantId) {
                    try {
                        await db.updateWorkspace(currentUser.value.tenantId, {
                            managerName: trimmedName,
                            bankName: updatePayload.bankName,
                            division: updatePayload.division,
                            region: updatePayload.region,
                            branchAddress: updatePayload.branchAddress
                        });
                    } catch (wsErr) {
                        console.warn('Workspace sync warning:', wsErr);
                    }
                }

                // 3. Update active session state & local storage
                currentUser.value.name = trimmedName;
                currentUser.value.phone = updatePayload.phone;
                currentUser.value.employeeCode = updatePayload.employeeCode;
                currentUser.value.designation = updatePayload.designation;
                currentUser.value.branchAddress = updatePayload.branchAddress;
                currentUser.value.bankName = updatePayload.bankName;
                currentUser.value.division = updatePayload.division;
                currentUser.value.region = updatePayload.region;
                localStorage.setItem('axis_user', JSON.stringify(currentUser.value));

                profileSaveSuccess.value = true;
                profileActiveTab.value = 'overview';
                setTimeout(() => { profileSaveSuccess.value = false; }, 4000);
            } catch (err) {
                console.error('Error saving profile:', err);
                profileSaveError.value = err.message || 'Failed to save profile changes.';
            } finally {
                isSavingProfile.value = false;
            }
        };



        // --- Area Sales Manager (ASM) State & Operations ---
        const supervisedSMs = ref([]);
        const areaFiles = ref([]);
        const areaEods = ref([]);
        const areaInvitations = ref([]);
        const showInviteSmModal = ref(false);
        const inviteSmForm = ref({ email: '', phone: '', salesLinkId: '', territoryName: '' });
        const inviteSmError = ref('');
        const inviteSmSuccess = ref('');
        const isInvitingSm = ref(false);
        const selectedSmDrilldown = ref(null);
        const asmSearchQuery = ref('');
        const asmStatusFilter = ref('All');
        const asmHubFilter = ref('All');
        const asmTimelineFilter = ref('all'); // 'all' | 'today' | 'yesterday' | 'this-week' | 'this-month'
        const asmCategoryFilter = ref('All'); // 'All' | 'NCL' | 'UCL'
        const asmChannelFilter = ref('All');  // 'All' | 'DSA' | 'Branch'
        const asmSortBy = ref('newest');      // 'newest' | 'oldest' | 'amount-desc' | 'amount-asc' | 'name-asc'

        const resetAsmFilters = () => {
            asmSearchQuery.value = '';
            asmStatusFilter.value = 'All';
            asmHubFilter.value = 'All';
            asmTimelineFilter.value = 'all';
            asmCategoryFilter.value = 'All';
            asmChannelFilter.value = 'All';
            asmSortBy.value = 'newest';
        };

        // Simple Dynamic Connector State (Dropdown method + dynamic input box + conflict warning)
        const allRegisteredSMs = ref([]);
        const inviteMethod = ref('phone'); // 'phone' | 'email' | 'employeeCode' | 'salesLinkId'
        const inviteInputValue = ref('');
        const inviteWarning = ref('');
        const linkedManagerDetails = ref(null);
        const isSubmittingInvite = ref(false);
        const connectSmError = ref('');
        const connectSmSuccess = ref('');

        const onInviteMethodChange = () => {
            inviteInputValue.value = '';
            inviteWarning.value = '';
            connectSmError.value = '';
            connectSmSuccess.value = '';
            linkedManagerDetails.value = null;
        };

        const resetInviteModal = () => {
            inviteMethod.value = 'phone';
            inviteInputValue.value = '';
            inviteWarning.value = '';
            connectSmError.value = '';
            connectSmSuccess.value = '';
            linkedManagerDetails.value = null;
            isSubmittingInvite.value = false;
        };

        const openConnectSmModal = () => {
            resetInviteModal();
            showInviteSmModal.value = true;
        };

        const submitInviteSm = async () => {
            inviteWarning.value = '';
            connectSmError.value = '';
            connectSmSuccess.value = '';
            linkedManagerDetails.value = null;

            const val = (inviteInputValue.value || '').trim();
            if (!val) {
                if (inviteMethod.value === 'phone') connectSmError.value = 'Please enter a 10-digit mobile number.';
                else if (inviteMethod.value === 'email') connectSmError.value = 'Please enter a valid Gmail address.';
                else if (inviteMethod.value === 'employeeCode') connectSmError.value = 'Please enter an Employee / Staff ID.';
                else connectSmError.value = 'Please enter a SalesLink ID.';
                return;
            }

            if (inviteMethod.value === 'phone' && val.replace(/\D/g, '').length < 10) {
                connectSmError.value = 'Please enter a valid 10-digit mobile number.';
                return;
            }
            if (inviteMethod.value === 'email' && !val.includes('@')) {
                connectSmError.value = 'Please enter a valid email address.';
                return;
            }

            isSubmittingInvite.value = true;
            try {
                // 1. Check existing users in-memory and in Firestore
                let foundUser = null;
                const cleanLower = val.toLowerCase();
                const cleanDigits = val.replace(/\D/g, '');
                const cleanUpper = val.toUpperCase();

                // Search in allRegisteredSMs memory
                foundUser = allRegisteredSMs.value.find(u => {
                    if (inviteMethod.value === 'phone') {
                        return u.phone && u.phone.replace(/\D/g, '').endsWith(cleanDigits.slice(-10));
                    } else if (inviteMethod.value === 'email') {
                        return u.email && u.email.toLowerCase() === cleanLower;
                    } else if (inviteMethod.value === 'employeeCode') {
                        return u.employeeCode && u.employeeCode.toUpperCase() === cleanUpper;
                    } else {
                        return u.salesLinkId && u.salesLinkId.toUpperCase() === cleanUpper;
                    }
                });

                // If not found in memory, query database
                if (!foundUser) {
                    foundUser = await db.findUserByAnyIdentifier(val);
                }

                const methodLabel = inviteMethod.value === 'phone' ? 'Phone Number' : (inviteMethod.value === 'email' ? 'Gmail ID' : (inviteMethod.value === 'employeeCode' ? 'Employee ID' : 'SalesLink ID'));

                // 2. SCENARIO: User found in database!
                if (foundUser) {
                    linkedManagerDetails.value = foundUser;

                    if (foundUser.role !== 'sm' && foundUser.role !== 'admin') {
                        connectSmError.value = `This user (${foundUser.name || val}) has role "${foundUser.role}". Only Branch Sales Managers (SM) can be connected under an Area.`;
                        return;
                    }

                    // CHECK FOR CONFLICT (LINKED TO ANOTHER SM/SUPERVISOR):
                    if (foundUser.supervisorId && foundUser.supervisorId !== currentUser.value.id) {
                        const supName = foundUser.supervisorName || 'another Area Sales Manager';
                        inviteWarning.value = `This ${methodLabel} (${val}) is already linked to Sales Manager "${foundUser.name || 'Manager'}" (${foundUser.region || 'Branch Hub'}) who is currently reporting to ${supName}. They must be disconnected from their current supervisor before they can join your Area.`;
                        return;
                    }

                    // CHECK IF ALREADY LINKED TO THIS ASM:
                    if (foundUser.supervisorId === currentUser.value.id) {
                        inviteWarning.value = `Sales Manager "${foundUser.name}" (${foundUser.region || 'Branch Hub'}) is already connected under your Area Cluster.`;
                        return;
                    }

                    // UNASSIGNED SM FOUND: DIRECT CONNECT IMMEDIATELY!
                    await db.directConnectSupervisorToSm(currentUser.value, foundUser.id);
                    connectSmSuccess.value = `✓ Connected! Sales Manager "${foundUser.name}" (${foundUser.region || 'Branch Hub'}) has been successfully attached to your Area Cluster.`;
                    await loadAsmData();
                    setTimeout(() => {
                        showInviteSmModal.value = false;
                        resetInviteModal();
                    }, 2500);
                    return;
                }

                // 3. SCENARIO: User not registered yet (Queue area invitation)
                const invitePayload = {
                    fromUserId: currentUser.value.id,
                    fromName: currentUser.value.name,
                    fromEmail: currentUser.value.email,
                    fromRole: 'asm',
                    fromSalesLinkId: currentUser.value.salesLinkId || '',
                    toRole: 'sm',
                    territoryName: currentUser.value.region || 'Area Jurisdiction',
                    bankName: currentUser.value.bankName || 'Axis Bank',
                    division: currentUser.value.division || 'Auto Loans (Car Loans)'
                };

                if (inviteMethod.value === 'phone') {
                    invitePayload.toPhone = cleanDigits.slice(-10);
                } else if (inviteMethod.value === 'email') {
                    invitePayload.toEmail = cleanLower;
                } else if (inviteMethod.value === 'employeeCode') {
                    invitePayload.toEmployeeCode = cleanUpper;
                } else {
                    invitePayload.toSalesLinkId = cleanUpper;
                }

                await db.createInvitation(invitePayload);
                connectSmSuccess.value = `✓ Area Invitation sent! As soon as this Sales Manager signs into SalesLink with this ${methodLabel} (${val}), their branch hub will be automatically connected to your Area.`;
                areaInvitations.value = await db.getInvitationsSentByUser(currentUser.value.id);
                setTimeout(() => {
                    showInviteSmModal.value = false;
                    resetInviteModal();
                }, 2800);
            } catch (err) {
                console.error("Invite / Connect error:", err);
                connectSmError.value = err.message || 'Failed to submit invitation.';
            } finally {
                isSubmittingInvite.value = false;
            }
        };

        const openSmWhatsAppNotify = (sm) => {
            const target = sm || matchedSm.value;
            if (!target?.phone) return;
            const cleanPhone = target.phone.replace(/\D/g, '');
            const num = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
            const text = encodeURIComponent(`Hi ${target.name || 'Manager'}, your ${target.region || 'branch'} hub has been connected under my Area Cluster (${currentUser.value?.region || 'Area Jurisdiction'}) on SalesLink. You can view your updated Area ASM directly in your SalesLink Profile.`);
            window.open(`https://wa.me/${num}?text=${text}`, '_blank');
        };

        const loadAsmData = async () => {
            if (!currentUser.value?.id) return;
            try {
                supervisedSMs.value = await db.getUsersBySupervisor(currentUser.value.id);
                const wsIds = supervisedSMs.value.map(s => s.tenantId).filter(Boolean);
                areaFiles.value = await db.getLoanFilesByTenantIds(wsIds);
                areaEods.value = await db.getEODReportsByTenantIds(wsIds);
                areaInvitations.value = await db.getInvitationsSentByUser(currentUser.value.id);
                pendingInvitations.value = await db.getPendingInvitationsForEmail(currentUser.value.email, currentUser.value.phone, currentUser.value.salesLinkId, currentUser.value.employeeCode);

                // Fetch all registered SM users for dropdown and live multi-identifier matching
                try {
                    const allUsers = await db.getAllUsers();
                    allRegisteredSMs.value = allUsers.filter(u => u.role === 'sm' && u.id !== currentUser.value.id);
                } catch (smErr) {
                    console.warn("Could not load all SMs:", smErr);
                }
            } catch (e) {
                console.error('Error loading ASM data:', e);
            }
        };

        const sendSmInvitation = async () => {
            inviteSmError.value = '';
            inviteSmSuccess.value = '';
            connectSmError.value = '';
            connectSmSuccess.value = '';

            const email = (inviteSmForm.value.email || '').trim().toLowerCase();
            if (!email) {
                connectSmError.value = 'Please enter a valid Gmail address.';
                return;
            }
            isInvitingSm.value = true;
            try {
                await db.createInvitation({
                    fromUserId: currentUser.value.id,
                    fromName: currentUser.value.name,
                    fromEmail: currentUser.value.email,
                    fromRole: 'asm',
                    fromSalesLinkId: currentUser.value.salesLinkId || '',
                    toEmail: email,
                    toPhone: (inviteSmForm.value.phone || '').trim(),
                    toSalesLinkId: (inviteSmForm.value.salesLinkId || '').trim().toUpperCase(),
                    toRole: 'sm',
                    territoryName: inviteSmForm.value.territoryName || currentUser.value.region || 'Area Hub',
                    bankName: currentUser.value.bankName || 'Axis Bank',
                    division: currentUser.value.division || 'Auto Loans (Car Loans)'
                });
                connectSmSuccess.value = `✓ Invitation successfully queued for ${email}! They will be prompted to connect when they log in.`;
                inviteSmForm.value = { email: '', phone: '', salesLinkId: '', territoryName: '' };
                areaInvitations.value = await db.getInvitationsSentByUser(currentUser.value.id);
                setTimeout(() => {
                    showInviteSmModal.value = false;
                    connectSmSuccess.value = '';
                }, 2500);
            } catch (e) {
                console.error('Send invite error:', e);
                connectSmError.value = e.message || 'Failed to send invitation.';
            } finally {
                isInvitingSm.value = false;
            }
        };

        const cancelInvitation = async (invId) => {
            if (!confirm('Are you sure you want to cancel this pending invitation?')) return;
            try {
                await db.revokeInvitation(invId);
                areaInvitations.value = await db.getInvitationsSentByUser(currentUser.value.id);
            } catch (e) {
                console.error('Revoke invite error:', e);
            }
        };

        const releaseSm = async (smUser) => {
            if (!confirm(`Are you sure you want to release Sales Manager "${smUser.name || smUser.email}" from your Area? Their files and hub will be unlinked from your dashboard.`)) return;
            try {
                await db.unlinkSupervisor(smUser.id);
                await loadAsmData();
            } catch (e) {
                console.error('Release SM error:', e);
            }
        };

        const asmStats = computed(() => {
            const files = areaFiles.value || [];
            const now = new Date();
            const curY = now.getFullYear();
            const curM = now.getMonth();
            
            const mtdFiles = files.filter(f => {
                const dStr = f.loginDate || f.createdAt;
                if (!dStr) return false;
                const d = new Date(dStr);
                return d.getFullYear() === curY && d.getMonth() === curM;
            });

            const mtdLoginCount = mtdFiles.length;
            const mtdLoginVol = mtdFiles.reduce((acc, f) => acc + toLakhs(f.loanAmount), 0);

            const mtdSancFiles = mtdFiles.filter(f => isSanctionStatus(f.status));
            const mtdSancCount = mtdSancFiles.length;
            const mtdSancVol = mtdSancFiles.reduce((acc, f) => acc + toLakhs(f.loanAmount), 0);

            const mtdDisbFiles = mtdFiles.filter(f => isDisbursedStatus(f.status));
            const mtdDisbCount = mtdDisbFiles.length;
            const mtdDisbVol = mtdDisbFiles.reduce((acc, f) => acc + toLakhs(f.loanAmount), 0);

            const activeHubsCount = supervisedSMs.value.length;

            return {
                mtdLoginCount,
                mtdLoginVol,
                mtdSancCount,
                mtdSancVol,
                mtdDisbCount,
                mtdDisbVol,
                activeHubsCount
            };
        });

        const smPerformanceList = computed(() => {
            const todayStr = getTodayDateStr();
            return (supervisedSMs.value || []).map(sm => {
                const smFiles = (areaFiles.value || []).filter(f => f.tenantId === sm.tenantId);
                const now = new Date();
                const curY = now.getFullYear();
                const curM = now.getMonth();
                const mtdF = smFiles.filter(f => {
                    const dStr = f.loginDate || f.createdAt;
                    if (!dStr) return false;
                    const d = new Date(dStr);
                    return d.getFullYear() === curY && d.getMonth() === curM;
                });
                const mtdLogins = mtdF.length;
                const mtdLoginVol = mtdF.reduce((acc, f) => acc + toLakhs(f.loanAmount), 0);
                const mtdSanc = mtdF.filter(f => isSanctionStatus(f.status));
                const mtdSancVol = mtdSanc.reduce((acc, f) => acc + toLakhs(f.loanAmount), 0);
                const mtdDisb = mtdF.filter(f => isDisbursedStatus(f.status));
                const mtdDisbVol = mtdDisb.reduce((acc, f) => acc + toLakhs(f.loanAmount), 0);

                const smTodayEods = (areaEods.value || []).filter(e => e.tenantId === sm.tenantId && e.date === todayStr);

                return {
                    id: sm.id,
                    name: sm.name || 'Sales Manager',
                    email: sm.email,
                    phone: sm.phone || '-',
                    salesLinkId: sm.salesLinkId || 'SL-SM-PENDING',
                    tenantId: sm.tenantId,
                    region: sm.region || 'Branch Hub',
                    bankName: sm.bankName || 'Axis Bank',
                    mtdLoginCount: mtdLogins,
                    mtdLoginVol: mtdLoginVol,
                    mtdSancCount: mtdSanc.length,
                    mtdSancVol: mtdSancVol,
                    mtdDisbCount: mtdDisb.length,
                    mtdDisbVol: mtdDisbVol,
                    todayEodsCount: smTodayEods.length,
                    allFilesCount: smFiles.length
                };
            });
        });

        // Computed SM Distribution & Breakdown for Frictionless Navigation
        const asmSmDistribution = computed(() => {
            return (supervisedSMs.value || []).map(sm => {
                const smFiles = (areaFiles.value || []).filter(f => f.tenantId === sm.tenantId);
                const totalFiles = smFiles.length;
                const totalVolume = smFiles.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
                const disbursedFiles = smFiles.filter(f => (f.status || '').toLowerCase() === 'disbursed');
                const disbursedVolume = disbursedFiles.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);
                const pipelineFiles = smFiles.filter(f => (f.status || '').toLowerCase() !== 'disbursed' && (f.status || '').toLowerCase() !== 'rejected' && (f.status || '').toLowerCase() !== 'cancelled');
                const pipelineVolume = pipelineFiles.reduce((sum, f) => sum + (Number(f.loanAmount) || 0), 0);

                return {
                    id: sm.id,
                    name: sm.name || 'Branch Manager',
                    region: sm.region || 'Branch Hub',
                    tenantId: sm.tenantId,
                    phone: sm.phone || '',
                    totalFiles,
                    totalVolume,
                    disbursedCount: disbursedFiles.length,
                    disbursedVolume,
                    pipelineCount: pipelineFiles.length,
                    pipelineVolume
                };
            });
        });

        // Stage counts matching active hub filter (or all hubs)
        const asmStatusCounts = computed(() => {
            let files = areaFiles.value || [];
            if (asmHubFilter.value && asmHubFilter.value !== 'All') {
                files = files.filter(f => f.tenantId === asmHubFilter.value);
            }
            const all = files.length;
            const logged = files.filter(f => (f.status || '').toLowerCase() === 'logged' || (f.status || '').toLowerCase() === 'lead').length;
            const fi = files.filter(f => (f.status || '').toLowerCase() === 'fi').length;
            const fcu = files.filter(f => (f.status || '').toLowerCase() === 'fcu').length;
            const uw = files.filter(f => (f.status || '').toLowerCase() === 'uw').length;
            const sanctioned = files.filter(f => (f.status || '').toLowerCase() === 'approved' || (f.status || '').toLowerCase() === 'sanction').length;
            const disbursed = files.filter(f => (f.status || '').toLowerCase() === 'disbursed').length;
            const rejected = files.filter(f => (f.status || '').toLowerCase() === 'rejected' || (f.status || '').toLowerCase() === 'cancelled').length;

            return { all, logged, fi, fcu, uw, sanctioned, disbursed, rejected };
        });

        const filteredAreaFiles = computed(() => {
            let list = (areaFiles.value || []).map(f => {
                const sm = supervisedSMs.value.find(s => s.tenantId === f.tenantId);
                return {
                    ...f,
                    hubName: sm ? (sm.region || sm.name) : (f.branchName || 'Branch Hub'),
                    smDisplayName: sm ? sm.name : (f.smName || 'Branch Manager'),
                    smPhone: sm ? sm.phone : ''
                };
            });

            // 1. Hub / SM Filter
            if (asmHubFilter.value && asmHubFilter.value !== 'All') {
                list = list.filter(f => f.tenantId === asmHubFilter.value);
            }

            // 2. Status Stage Filter
            if (asmStatusFilter.value && asmStatusFilter.value !== 'All') {
                const s = asmStatusFilter.value.toLowerCase();
                if (s === 'logged') {
                    list = list.filter(f => (f.status || '').toLowerCase() === 'logged' || (f.status || '').toLowerCase() === 'lead');
                } else if (s === 'sanction' || s === 'approved') {
                    list = list.filter(f => (f.status || '').toLowerCase() === 'approved' || (f.status || '').toLowerCase() === 'sanction');
                } else if (s === 'rejected' || s === 'cancelled') {
                    list = list.filter(f => (f.status || '').toLowerCase() === 'rejected' || (f.status || '').toLowerCase() === 'cancelled');
                } else {
                    list = list.filter(f => (f.status || '').toLowerCase() === s);
                }
            }

            // 3. Search Query
            if (asmSearchQuery.value) {
                const q = asmSearchQuery.value.trim().toLowerCase();
                list = list.filter(f => 
                    (f.customerName || '').toLowerCase().includes(q) ||
                    (f.appId || '').toLowerCase().includes(q) ||
                    (f.roName || '').toLowerCase().includes(q) ||
                    (f.smDisplayName || '').toLowerCase().includes(q) ||
                    (f.hubName || '').toLowerCase().includes(q) ||
                    (f.vehicleModel || '').toLowerCase().includes(q)
                );
            }

            // 4. Timeline Filter
            if (asmTimelineFilter.value && asmTimelineFilter.value !== 'all') {
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
                const startOfYesterday = startOfToday - 86400000;
                const startOfWeek = startOfToday - (now.getDay() === 0 ? 6 : now.getDay() - 1) * 86400000;
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

                list = list.filter(f => {
                    const dateStr = f.loginDate || f.createdAt;
                    if (!dateStr) return false;
                    const t = new Date(dateStr).getTime();
                    if (asmTimelineFilter.value === 'today') return t >= startOfToday;
                    if (asmTimelineFilter.value === 'yesterday') return t >= startOfYesterday && t < startOfToday;
                    if (asmTimelineFilter.value === 'this-week') return t >= startOfWeek;
                    if (asmTimelineFilter.value === 'this-month') return t >= startOfMonth;
                    return true;
                });
            }

            // 5. Category Filter
            if (asmCategoryFilter.value && asmCategoryFilter.value !== 'All') {
                list = list.filter(f => (f.nclUcl || '').toUpperCase() === asmCategoryFilter.value.toUpperCase());
            }

            // 6. Channel Filter
            if (asmChannelFilter.value && asmChannelFilter.value !== 'All') {
                list = list.filter(f => (f.sourcingChannel || '').toLowerCase() === asmChannelFilter.value.toLowerCase());
            }

            // 7. Sort
            list = [...list].sort((a, b) => {
                if (asmSortBy.value === 'newest') {
                    return new Date(b.loginDate || b.createdAt || 0) - new Date(a.loginDate || a.createdAt || 0);
                } else if (asmSortBy.value === 'oldest') {
                    return new Date(a.loginDate || a.createdAt || 0) - new Date(b.loginDate || b.createdAt || 0);
                } else if (asmSortBy.value === 'amount-desc') {
                    return (Number(b.loanAmount) || 0) - (Number(a.loanAmount) || 0);
                } else if (asmSortBy.value === 'amount-asc') {
                    return (Number(a.loanAmount) || 0) - (Number(b.loanAmount) || 0);
                } else if (asmSortBy.value === 'name-asc') {
                    return (a.customerName || '').localeCompare(b.customerName || '');
                }
                return 0;
            });

            return list;
        });

        const sendFileAlertToSm = (file) => {
            const sm = supervisedSMs.value.find(s => s.tenantId === file.tenantId);
            const targetPhone = sm?.phone || file.smPhone || file.roPhone;
            if (!targetPhone) {
                alert("No phone number on file for this branch manager or relationship officer.");
                return;
            }
            const cleanPhone = targetPhone.replace(/\D/g, '').slice(-10);
            const text = encodeURIComponent(`Hi ${sm?.name || 'Manager'}, regarding file #${file.appId || ''} (${file.customerName} - ₹${formatCurrency(file.loanAmount)}) at ${file.hubName || 'branch hub'}. Current status is "${file.status}". Please provide an update.`);
            window.open(`https://wa.me/91${cleanPhone}?text=${text}`, '_blank');
        };

        // --- Zonal Sales Manager (ZSM) State & Operations ---
        const supervisedASMs = ref([]);
        const zsmInvitations = ref([]);
        const showInviteAsmModal = ref(false);
        const inviteAsmForm = ref({ email: '', salesLinkId: '', territoryName: '' });
        const inviteAsmError = ref('');
        const inviteAsmSuccess = ref('');
        const isInvitingAsm = ref(false);
        const selectedAsmDrilldown = ref(null);

        const loadZsmData = async () => {
            if (!currentUser.value?.id) return;
            try {
                supervisedASMs.value = await db.getUsersBySupervisor(currentUser.value.id);
                zsmInvitations.value = await db.getInvitationsSentByUser(currentUser.value.id);
                pendingInvitations.value = await db.getPendingInvitationsForEmail(currentUser.value.email);
            } catch (e) {
                console.error('Error loading ZSM data:', e);
            }
        };

        const sendAsmInvitation = async () => {
            inviteAsmError.value = '';
            inviteAsmSuccess.value = '';
            const email = (inviteAsmForm.value.email || '').trim().toLowerCase();
            if (!email) {
                inviteAsmError.value = 'Please enter a valid Gmail address.';
                return;
            }
            isInvitingAsm.value = true;
            try {
                await db.createInvitation({
                    fromUserId: currentUser.value.id,
                    fromName: currentUser.value.name,
                    fromEmail: currentUser.value.email,
                    fromRole: 'zsm',
                    fromSalesLinkId: currentUser.value.salesLinkId || '',
                    toEmail: email,
                    toSalesLinkId: (inviteAsmForm.value.salesLinkId || '').trim().toUpperCase(),
                    toRole: 'asm',
                    territoryName: inviteAsmForm.value.territoryName || currentUser.value.region || 'Zonal Area',
                    bankName: currentUser.value.bankName || 'Axis Bank',
                    division: currentUser.value.division || 'Auto Loans (Car Loans)'
                });
                inviteAsmSuccess.value = `Invitation successfully sent to ${email}!`;
                inviteAsmForm.value = { email: '', salesLinkId: '', territoryName: '' };
                zsmInvitations.value = await db.getInvitationsSentByUser(currentUser.value.id);
                setTimeout(() => {
                    showInviteAsmModal.value = false;
                    inviteAsmSuccess.value = '';
                }, 2500);
            } catch (e) {
                console.error('Send invite error:', e);
                inviteAsmError.value = e.message || 'Failed to send invitation.';
            } finally {
                isInvitingAsm.value = false;
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
            } else {
                allFiles.value = await db.getLoanFilesByTenant(currentUser.value.tenantId);
                roUsers.value = await db.getROUsersByTenant(currentUser.value.tenantId);
                smEods.value = await db.getEODReportsByTenant(currentUser.value.tenantId);
            }

            // Ensure salesLinkId exists for SM
            if (currentUser.value && !currentUser.value.salesLinkId && currentUser.value.email) {
                try {
                    const fresh = await db.getUserByEmail(currentUser.value.email);
                    if (fresh) {
                        if (!fresh.salesLinkId) {
                            const newId = db.generateSalesLinkId('sm');
                            await db.updateUser(fresh.id, { salesLinkId: newId });
                            fresh.salesLinkId = newId;
                        }
                        currentUser.value.salesLinkId = fresh.salesLinkId;
                        localStorage.setItem('axis_user', JSON.stringify(currentUser.value));
                    }
                } catch (e) {
                    console.warn('Could not sync SM salesLinkId:', e);
                }
            }

            try {
                pendingInvitations.value = await db.getPendingInvitationsForEmail(currentUser.value.email);
            } catch (e) {
                console.warn('Could not fetch pending invitations for SM:', e);
            }
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

            // Real-Time Security Gatekeeper: Verify current user status directly from Firestore
            if (currentUser.value?.id) {
                try {
                    const freshUser = await db.getUserById(currentUser.value.id);
                    if (freshUser && (freshUser.status === 'suspended' || freshUser.status === 'resigned' || freshUser.status === 'inactive')) {
                        console.warn("Security Kill-Switch: Account suspended or revoked by supervisor.");
                        localStorage.removeItem('axis_user');
                        currentUser.value = null;
                        alert("⚠️ Access Revoked: Your account has been locked by your Sales Manager. All session data has been wiped.");
                        window.location.reload();
                        return;
                    }
                } catch (e) {
                    console.warn("User status check error in loadData:", e);
                }
            }
            if (isSuperAdmin.value) {
                await loadSuperAdminData();
            } else if (isZSM.value) {
                await loadZsmData();
            } else if (isASM.value) {
                await loadAsmData();
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

        const initUserSm = async () => {
            if (!currentUser.value) return;

            let smName = '';
            let smObj = { name: '', phone: '', email: '', salesLinkId: '' };

            // 1. If SM or Admin, their own name is the SM Name
            if (isSM.value) {
                smName = currentUser.value.name || currentUser.value.username || '';
                smObj = {
                    name: smName,
                    phone: currentUser.value.phone || '',
                    email: currentUser.value.email || '',
                    salesLinkId: currentUser.value.salesLinkId || ''
                };
            } else if (currentUser.value.tenantId) {
                // 2. Look in users collection for SM of this tenant
                try {
                    const allUsers = await db.getAllUsers();
                    const smUser = allUsers.find(u => u.tenantId === currentUser.value.tenantId && (u.role === 'sm' || u.role === 'admin'));
                    if (smUser) {
                        smName = smUser.name ? smUser.name.trim() : '';
                        smObj = {
                            name: smUser.name || '',
                            phone: smUser.phone || '',
                            email: smUser.email || '',
                            salesLinkId: smUser.salesLinkId || ''
                        };
                    }
                } catch (e) {
                    console.warn("Could not fetch SM user for tenant:", e);
                }

                // 3. Fallback: Fetch from Workspace (managerName)
                if (!smName) {
                    try {
                        const ws = await db.getWorkspace(currentUser.value.tenantId);
                        if (ws && ws.managerName) {
                            smName = ws.managerName.trim();
                            smObj.name = smName;
                        }
                    } catch (e) {
                        console.warn("Could not fetch workspace managerName:", e);
                    }
                }
            }

            // 4. Fallback to localStorage if still not found
            if (!smName) {
                smName = localStorage.getItem('axis_default_sm_' + currentUser.value.id) || localStorage.getItem('axis_default_sm') || '';
                smObj.name = smName;
            }

            if (smName) {
                const upperSm = smName.toUpperCase();
                defaultSmName.value = upperSm;
                smObj.name = upperSm;
                newFileForm.value.smName = upperSm;
                localStorage.setItem('axis_default_sm_' + currentUser.value.id, upperSm);
                localStorage.setItem('axis_default_sm', upperSm);
            }
            assignedSm.value = smObj;
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

        // Auth & Registration
        const registerSM = async () => {
            if (isRegistering.value) return;
            registerError.value = '';

            const smName = registerForm.value.name?.trim();
            const smRegion = registerForm.value.region?.trim();
            const smPhone = registerForm.value.phone?.trim() || '';
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
                
                const chosenRole = registerForm.value.role || 'sm';
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
                registerForm.value = { role: 'sm', name: '', region: '', phone: '', bankName: 'Axis Bank', customBankName: '', division: 'Auto Loans (Car Loans)' };
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

        // --- OTP Resend Timer Helper ---
        const startOtpCountdown = (seconds = 30) => {
            if (otpCountdownTimer) clearInterval(otpCountdownTimer);
            otpResendCountdown.value = seconds;
            otpCountdownTimer = setInterval(() => {
                if (otpResendCountdown.value > 0) {
                    otpResendCountdown.value--;
                } else {
                    clearInterval(otpCountdownTimer);
                    otpCountdownTimer = null;
                }
            }, 1000);
        };

        const handleCancelOtp = () => {
            loginStage.value = '';
            phoneConfirmationResult.value = null;
            pendingOtpUser.value = null;
            otpCode.value = '';
            loginError.value = '';
            showMissingPhoneModal.value = false;
            missingPhoneInput.value = '';
            if (otpCountdownTimer) {
                clearInterval(otpCountdownTimer);
                otpCountdownTimer = null;
            }
        };

        // Complete verified login and bind device session
        const completeLogin = async (user) => {
            if (!user) return;

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
                    const allUsers = await db.getAllUsers();
                    const smUser = allUsers.find(u => u.tenantId === user.tenantId && (u.role === 'sm' || u.role === 'admin'));
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

            // Record login timestamp
            try {
                await db.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
            } catch (e) {}

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

            // Generate & Bind Single-Device Session ID
            const newSessionId = generateSessionId();
            localStorage.setItem('axis_active_session_id', newSessionId);
            try {
                await db.updateUser(user.id, {
                    activeSessionId: newSessionId,
                    lastLoginAt: new Date().toISOString()
                });
            } catch (e) {
                console.warn("Could not write activeSessionId to Firestore:", e);
            }

            // Store user session
            const sessionUser = {
                id: user.id,
                email: user.email || '',
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
            else currentTab.value = 'ro-dashboard';

            await loadData();
        };

        // --- Direct Phone Number + SMS OTP Sign-In ---
        const handleSendPhoneOtp = async () => {
            loginError.value = '';
            const rawPhone = phoneLoginForm.value.phone;
            const cleanDigits = String(rawPhone || '').replace(/\D/g, '').slice(-10);

            if (!cleanDigits || cleanDigits.length < 10) {
                loginError.value = 'Please enter a valid 10-digit Indian mobile number.';
                return;
            }

            isSendingOtp.value = true;
            try {
                // Step 1: Pre-verify user exists in database
                const user = await db.getUserByPhone(cleanDigits);
                if (!user) {
                    loginError.value = `⛔ Access Denied: Mobile number (+91 ${cleanDigits}) is not registered in SalesLink. Only officers onboarded by their Sales Manager or registered Managers can sign in.`;
                    isSendingOtp.value = false;
                    return;
                }

                // Step 2: Check account status
                if (user.status === 'suspended') {
                    const sup = user.supervisorName || 'your Sales Manager';
                    loginError.value = `⛔ Account Locked: Your access has been frozen by your Sales Manager (${sup}). Please contact your supervisor to unlock your account.`;
                    isSendingOtp.value = false;
                    return;
                }
                if (user.status === 'resigned' || user.status === 'inactive') {
                    loginError.value = '⛔ Access Revoked: This account has been offboarded due to resignation.';
                    isSendingOtp.value = false;
                    return;
                }

                // Step 3: Trigger Firebase Phone Auth OTP
                const confirmation = await db.sendPhoneOtp(cleanDigits, 'recaptcha-container');
                phoneConfirmationResult.value = confirmation;
                pendingOtpUser.value = user;
                otpTargetPhoneDisplay.value = `+91 ${cleanDigits.slice(0, 2)}••••${cleanDigits.slice(-4)}`;
                otpCode.value = '';
                loginStage.value = 'enter_otp';
                startOtpCountdown(30);
            } catch (error) {
                console.error("Phone OTP Send Error:", error);
                if (error.code === 'auth/invalid-phone-number') {
                    loginError.value = 'Invalid phone number format.';
                } else if (error.code === 'auth/too-many-requests') {
                    loginError.value = 'Too many attempts. Please wait a few minutes before trying again.';
                } else if (error.code === 'auth/quota-exceeded') {
                    loginError.value = 'SMS service quota exceeded. Please contact platform support.';
                } else if (error.code === 'auth/captcha-check-failed') {
                    loginError.value = 'reCAPTCHA verification failed. Please refresh the page and try again.';
                } else {
                    loginError.value = error.message || 'Failed to send OTP. Please check your connection and try again.';
                }
            } finally {
                isSendingOtp.value = false;
            }
        };

        const handleResendOtp = async () => {
            if (otpResendCountdown.value > 0 || isSendingOtp.value) return;
            loginError.value = '';
            isSendingOtp.value = true;
            try {
                const phone = pendingOtpUser.value?.phone || phoneLoginForm.value.phone || missingPhoneInput.value;
                const cleanDigits = String(phone).replace(/\D/g, '').slice(-10);
                const confirmation = await db.sendPhoneOtp(cleanDigits, 'recaptcha-container');
                phoneConfirmationResult.value = confirmation;
                startOtpCountdown(30);
            } catch (error) {
                console.error("Resend OTP Error:", error);
                loginError.value = error.message || 'Failed to resend OTP.';
            } finally {
                isSendingOtp.value = false;
            }
        };

        const handleVerifyOtp = async () => {
            if (isVerifyingOtp.value) return;
            loginError.value = '';

            const cleanOtp = String(otpCode.value || '').trim().replace(/\D/g, '');
            if (cleanOtp.length !== 6) {
                loginError.value = 'Please enter the complete 6-digit OTP code.';
                return;
            }

            if (!phoneConfirmationResult.value) {
                loginError.value = 'OTP session has expired. Please request a new OTP.';
                loginStage.value = '';
                return;
            }

            isVerifyingOtp.value = true;
            try {
                await db.verifyPhoneOtp(phoneConfirmationResult.value, cleanOtp);

                if (!pendingOtpUser.value) {
                    throw new Error("User record not found for verified number.");
                }

                // Finalize session into dashboard
                await completeLogin(pendingOtpUser.value);

                // Clean up OTP state
                loginStage.value = '';
                phoneConfirmationResult.value = null;
                pendingOtpUser.value = null;
                otpCode.value = '';
                phoneLoginForm.value = { phone: '' };
                if (otpCountdownTimer) {
                    clearInterval(otpCountdownTimer);
                    otpCountdownTimer = null;
                }
            } catch (error) {
                console.error("OTP Verification Error:", error);
                if (error.code === 'auth/invalid-verification-code') {
                    loginError.value = 'Incorrect 6-digit OTP code. Please check SMS and enter again.';
                } else if (error.code === 'auth/code-expired') {
                    loginError.value = 'The OTP code has expired. Please tap "Resend OTP" to get a fresh code.';
                } else {
                    loginError.value = error.message || 'OTP verification failed. Please try again.';
                }
            } finally {
                isVerifyingOtp.value = false;
            }
        };

        // --- Google SSO with Mandatory 2-Factor OTP Gatekeeper ---
        const processGoogleUserWithOtp = async (googleUser) => {
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

            if (!user) {
                loginError.value = `⛔ Access Denied: The Google account (${email}) is not registered in SalesLink. Only officers added by their Sales Manager in the SM portal are authorized to log in.`;
                loginStage.value = '';
                return;
            }

            if (user.status === 'suspended') {
                const sup = user.supervisorName || 'your Sales Manager';
                loginError.value = `⛔ Account Locked: Your access has been frozen by your Sales Manager (${sup}). Please contact your supervisor to unlock your account.`;
                loginStage.value = '';
                return;
            }
            if (user.status === 'resigned' || user.status === 'inactive') {
                loginError.value = '⛔ Access Revoked: This account has been offboarded due to resignation. Pipeline has been reassigned.';
                loginStage.value = '';
                return;
            }

            // MANDATORY OTP VERIFICATION:
            // All users from RO to ZSM must complete phone OTP verification
            if (user.phone && String(user.phone).replace(/\D/g, '').length >= 10) {
                const cleanDigits = String(user.phone).replace(/\D/g, '').slice(-10);
                try {
                    isSendingOtp.value = true;
                    const confirmation = await db.sendPhoneOtp(cleanDigits, 'recaptcha-container');
                    phoneConfirmationResult.value = confirmation;
                    pendingOtpUser.value = user;
                    otpTargetPhoneDisplay.value = `+91 ${cleanDigits.slice(0, 2)}••••${cleanDigits.slice(-4)}`;
                    otpCode.value = '';
                    loginStage.value = 'enter_otp';
                    startOtpCountdown(30);
                } catch (err) {
                    console.error("Error sending 2FA OTP to Google user:", err);
                    loginError.value = `Failed to send mandatory SMS OTP to registered phone (+91 ${cleanDigits}): ${err.message}`;
                    loginStage.value = '';
                } finally {
                    isSendingOtp.value = false;
                }
            } else {
                // If user is missing a phone number in DB, prompt to link their mobile number for 2FA
                pendingOtpUser.value = user;
                missingPhoneInput.value = '';
                showMissingPhoneModal.value = true;
                loginStage.value = 'linking_phone';
            }
        };

        const handleLinkPhoneAndSendOtp = async () => {
            const cleanDigits = String(missingPhoneInput.value || '').replace(/\D/g, '').slice(-10);
            if (!cleanDigits || cleanDigits.length < 10) {
                loginError.value = 'Please enter a valid 10-digit mobile number.';
                return;
            }
            isSendingOtp.value = true;
            try {
                const confirmation = await db.sendPhoneOtp(cleanDigits, 'recaptcha-container');
                phoneConfirmationResult.value = confirmation;
                if (pendingOtpUser.value) {
                    pendingOtpUser.value.phone = cleanDigits;
                    await db.updateUser(pendingOtpUser.value.id, { phone: cleanDigits });
                }
                otpTargetPhoneDisplay.value = `+91 ${cleanDigits.slice(0, 2)}••••${cleanDigits.slice(-4)}`;
                otpCode.value = '';
                showMissingPhoneModal.value = false;
                loginStage.value = 'enter_otp';
                startOtpCountdown(30);
            } catch (err) {
                console.error("Error sending OTP for phone linking:", err);
                loginError.value = err.message || 'Failed to send OTP.';
            } finally {
                isSendingOtp.value = false;
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
                await processGoogleUserWithOtp(googleUser);
            } catch (error) {
                console.error("Login Error:", error);
                if (error.code === 'auth/popup-closed-by-user' || error.message?.includes('popup-closed')) {
                    return;
                }
                loginError.value = error.message;
                loginStage.value = '';
            } finally {
                isLoggingIn.value = false;
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
            if (userSecurityUnsub) {
                userSecurityUnsub();
                userSecurityUnsub = null;
            }
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
                inactivityTimer = null;
            }
            db.logoutUser();
            localStorage.removeItem('axis_user');
            localStorage.removeItem('axis_active_session_id');
            currentUser.value = null;
            loginForm.value = { username: '', password: '' };
            phoneLoginForm.value = { phone: '' };
            otpCode.value = '';
            phoneConfirmationResult.value = null;
            pendingOtpUser.value = null;
            loginStage.value = '';
            allWorkspaces.value = [];
            roUsers.value = [];
            allFiles.value = [];
            myFiles.value = [];
            currentTab.value = 'dashboard';
        };

        // Admin/SM: Users & Workspaces
        const saveNewRo = async () => {
            addRoError.value = '';
            if (isSavingRo.value) return;

            const rawName = (newRoForm.value.name || '').trim();
            const rawEmail = (newRoForm.value.email || '').trim().toLowerCase();
            const rawPhone = (newRoForm.value.phone || '').trim();
            const empCode = (newRoForm.value.employeeCode || '').trim().toUpperCase();

            if (!rawName) {
                addRoError.value = 'Officer full name is mandatory.';
                return;
            }

            const name = formatCapitalizeName(rawName);

            if (!rawEmail || !rawEmail.includes('@')) {
                addRoError.value = 'Please provide a valid Gmail address.';
                return;
            }

            const cleanDigits = rawPhone.replace(/\D/g, '');
            if (cleanDigits.length < 10) {
                addRoError.value = 'Please enter a valid 10-digit mobile number.';
                return;
            }
            const phone = cleanDigits.slice(-10);

            try {
                isSavingRo.value = true;

                // 1. Check if Employee ID is entered and already linked with another user / SM
                if (empCode) {
                    const existingEmp = await db.getUserByEmployeeCode(empCode);
                    if (existingEmp) {
                        const supName = await db.getSupervisorNameForUser(existingEmp);
                        addRoError.value = `⚠️ This Employee ID (${empCode}) is already linked with another Sales Manager (${supName}) for officer "${existingEmp.name || 'Staff'}". Duplicate Employee IDs are not permitted.`;
                        isSavingRo.value = false;
                        return;
                    }
                }

                // 2. Check if Email already exists in the system
                const existingEmail = await db.getUserByEmail(rawEmail);
                if (existingEmail) {
                    const supName = await db.getSupervisorNameForUser(existingEmail);
                    addRoError.value = `⚠️ Account with Google email (${rawEmail}) is already registered under Sales Manager "${supName}". Duplicate email accounts are not permitted.`;
                    isSavingRo.value = false;
                    return;
                }

                // 3. Check if Mobile / Phone is already linked to another officer
                const existingPhone = await db.getUserByPhone(phone);
                if (existingPhone) {
                    const supName = await db.getSupervisorNameForUser(existingPhone);
                    addRoError.value = `⚠️ Mobile number (+91 ${phone}) is already registered under Sales Manager "${supName}" for officer "${existingPhone.name}".`;
                    isSavingRo.value = false;
                    return;
                }

                const generatedSalesLinkId = db.generateSalesLinkId ? db.generateSalesLinkId('ro') : ('RO-' + Math.random().toString(36).substring(2, 8).toUpperCase());

                const newRoData = {
                    email: rawEmail,
                    role: 'ro',
                    name: name,
                    phone: phone,
                    employeeCode: empCode,
                    salesLinkId: generatedSalesLinkId,
                    tenantId: currentUser.value.tenantId,
                    supervisorId: currentUser.value.id || null,
                    supervisorName: currentUser.value.name || 'Sales Manager',
                    supervisorSalesLinkId: currentUser.value.salesLinkId || null,
                    status: 'active',
                    createdAt: new Date().toISOString()
                };

                const docRef = await db.addUser(newRoData);
                newlyCreatedRo.value = {
                    id: (docRef && docRef.id) ? docRef.id : '',
                    ...newRoData
                };

                addRoStep.value = 'success';
                await loadData();
            } catch (err) {
                console.error('Error adding RO:', err);
                addRoError.value = err.message || 'Failed to add Relationship Officer. Please try again.';
            } finally {
                isSavingRo.value = false;
            }
        };

        const toggleUserStatus = async (user) => {
            const isLocking = user.status === 'active';
            const actionVerb = isLocking ? 'FREEZE & LOCK' : 'ACTIVATE & UNLOCK';
            const confirmMsg = isLocking 
                ? `Are you sure you want to FREEZE & LOCK ${user.name}'s account?\n\n• Their login access will be blocked immediately.\n• Active sessions will be revoked.\n• Customer files will remain safely preserved.`
                : `Are you sure you want to UNLOCK ${user.name}'s account?\n\n• Their login access will be restored immediately.`;
            
            if (!confirm(confirmMsg)) return;

            try {
                const now = new Date().toISOString();
                const updatePayload = {
                    status: isLocking ? 'suspended' : 'active',
                    statusUpdatedAt: now,
                    statusUpdatedBy: currentUser.value?.id || '',
                    statusUpdatedByName: currentUser.value?.name || 'Sales Manager'
                };
                if (isLocking) {
                    updatePayload.suspendedAt = now;
                    updatePayload.suspendedBy = currentUser.value?.id || '';
                    updatePayload.suspendedByName = currentUser.value?.name || 'Sales Manager';
                } else {
                    updatePayload.reactivatedAt = now;
                    updatePayload.reactivatedBy = currentUser.value?.id || '';
                }

                await db.updateUser(user.id, updatePayload);
                await loadData();

                alert(`✅ Account for ${user.name} has been ${isLocking ? 'LOCKED / FROZEN' : 'UNLOCKED / ACTIVATED'} successfully.`);
            } catch (err) {
                console.error("Toggle user status error:", err);
                alert("Failed to update officer status: " + err.message);
            }
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

        // Export to Excel (Supports ASM Area Files & SM Files)
        const exportToExcel = () => {
            if (isASM.value) {
                if (filteredAreaFiles.value.length === 0) {
                    alert("No area loan files to export based on current filters.");
                    return;
                }
                const exportData = filteredAreaFiles.value.map(file => ({
                    'Branch Hub': file.hubName || '',
                    'Sales Manager': file.smDisplayName || '',
                    'Relationship Officer': file.roName || '',
                    'App ID': file.appId || '',
                    'Customer Name': file.customerName || '',
                    'Category': file.nclUcl || '',
                    'Channel': file.sourcingChannel || 'DSA',
                    'Loan Amount (Rs)': Math.round(toLakhs(file.loanAmount) * 100000),
                    'Status': file.status || '',
                    'Login Date': file.loginDate || (file.createdAt ? file.createdAt.substring(0, 10) : ''),
                    'Last Updated': file.updatedAt || ''
                }));
                const worksheet = XLSX.utils.json_to_sheet(exportData);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Area_Files");
                const dateStr = new Date().toISOString().split('T')[0];
                const filename = `SalesLink_Area_Files_${currentUser.value?.region || 'Area'}_${dateStr}.xlsx`;
                XLSX.writeFile(workbook, filename);
                return;
            }

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
                                borderColor: '#4F46E5',
                                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                                borderWidth: 2,
                                fill: true,
                                tension: 0.4,
                                pointBackgroundColor: '#4F46E5'
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

        // --- PWA (Progressive Web App) Install State ---
        const deferredInstallPrompt = ref(null);
        const showInstallBanner = ref(false);
        const showIosInstallModal = ref(false);
        const isStandalone = ref(false);
        const isIos = ref(false);

        const checkStandalone = () => {
            return window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone === true ||
                   document.referrer.includes('android-app://');
        };

        const installPwaApp = async () => {
            if (deferredInstallPrompt.value) {
                deferredInstallPrompt.value.prompt();
                const choice = await deferredInstallPrompt.value.userChoice;
                if (choice && choice.outcome === 'accepted') {
                    showInstallBanner.value = false;
                }
                deferredInstallPrompt.value = null;
            } else if (isIos.value) {
                showIosInstallModal.value = true;
            } else {
                alert('To install SalesLink on your device, open your browser menu (â‹® or Share) and tap "Install app" or "Add to Home screen".');
            }
        };

        const dismissInstallBanner = () => {
            showInstallBanner.value = false;
            try {
                localStorage.setItem('saleslink_pwa_dismissed', String(Date.now()));
            } catch(e) {}
        };

        // --- Lifecycle ---
        onMounted(async () => {
            // PWA Standalone & Install detection
            isStandalone.value = checkStandalone();
            isIos.value = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredInstallPrompt.value = e;
                if (!isStandalone.value) {
                    const dismissedAt = localStorage.getItem('saleslink_pwa_dismissed');
                    const cooldown = 2 * 24 * 60 * 60 * 1000; // 2 days cooldown
                    if (!dismissedAt || (Date.now() - Number(dismissedAt)) > cooldown) {
                        showInstallBanner.value = true;
                    }
                }
            });

            window.addEventListener('appinstalled', () => {
                showInstallBanner.value = false;
                deferredInstallPrompt.value = null;
                isStandalone.value = true;
            });

            // On iOS Safari, if not standalone, prompt after brief delay
            if (isIos.value && !isStandalone.value) {
                const dismissedAt = localStorage.getItem('saleslink_pwa_dismissed');
                const cooldown = 2 * 24 * 60 * 60 * 1000;
                if (!dismissedAt || (Date.now() - Number(dismissedAt)) > cooldown) {
                    setTimeout(() => {
                        if (!isStandalone.value) {
                            showInstallBanner.value = true;
                        }
                    }, 2500);
                }
            }

            try {
                systemAnnouncement.value = await db.getAnnouncement();
                adminAnnouncementInput.value = systemAnnouncement.value;
            } catch(e) { console.error(e); }

            // Check if returning from Direct Sign-In (Redirect)
            try {
                const redirectUser = await db.checkRedirectResult();
                if (redirectUser) {
                    isLoggingIn.value = true;
                    loginStage.value = 'verifying';
                    await processGoogleUserWithOtp(redirectUser);
                    isLoggingIn.value = false;
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

                // Ensure active session token exists
                let localSess = localStorage.getItem('axis_active_session_id');
                if (!localSess) {
                    localSess = generateSessionId();
                    localStorage.setItem('axis_active_session_id', localSess);
                    if (currentUser.value.id) {
                        db.updateUser(currentUser.value.id, { activeSessionId: localSess }).catch(() => {});
                    }
                }

                // Attach real-time security watcher immediately
                if (currentUser.value.id) {
                    startUserSecurityListener(currentUser.value.id);
                }
                
                // Self-healing session sync & Enterprise Kill-Switch (Remote Wipe)
                (async () => {
                    try {
                        let fresh = null;
                        if (currentUser.value.id) fresh = await db.getUserById(currentUser.value.id);
                        if (!fresh && currentUser.value.email) fresh = await db.getUserByEmail(currentUser.value.email);

                        if (fresh) {
                            // KILL-SWITCH: If user was marked resigned or suspended, wipe device storage immediately
                            if (fresh.status === 'suspended' || fresh.status === 'resigned' || fresh.status === 'inactive') {
                                console.warn("Remote Wipe Triggered: Account has been deactivated or resigned.");
                                localStorage.removeItem('axis_user');
                                currentUser.value = null;
                                alert("⚠️ Access Revoked: Your SalesLink account has been deactivated by your branch supervisor. All session data has been wiped.");
                                window.location.reload();
                                return;
                            }
                            if (currentUser.value.email) {
                                if (!fresh.salesLinkId) {
                                    const newId = db.generateSalesLinkId(fresh.role || currentUser.value.role || 'sm');
                                    await db.updateUser(fresh.id, { salesLinkId: newId });
                                    fresh.salesLinkId = newId;
                                }
                                currentUser.value.salesLinkId = fresh.salesLinkId;
                                currentUser.value.supervisorId = fresh.supervisorId || null;
                                currentUser.value.supervisorName = fresh.supervisorName || null;
                                currentUser.value.supervisorRole = fresh.supervisorRole || null;
                                currentUser.value.supervisorSalesLinkId = fresh.supervisorSalesLinkId || null;
                                if (fresh.tenantId) currentUser.value.tenantId = fresh.tenantId;
                                if (fresh.phone) currentUser.value.phone = fresh.phone;
                                if (fresh.region) currentUser.value.region = fresh.region;
                                if (fresh.bankName) currentUser.value.bankName = fresh.bankName;
                                if (fresh.division) currentUser.value.division = fresh.division;
                                if (fresh.employeeCode) currentUser.value.employeeCode = fresh.employeeCode;
                                if (fresh.designation) currentUser.value.designation = fresh.designation;
                                if (fresh.branchAddress) currentUser.value.branchAddress = fresh.branchAddress;
                                if (fresh.createdAt) currentUser.value.createdAt = fresh.createdAt;
                                localStorage.setItem('axis_user', JSON.stringify(currentUser.value));
                            }
                        }
                    } catch (e) {
                        console.warn("Session refresh error:", e);
                    }
                })();

                try {
                    await loadData();
                } catch (e) {
                    console.error("Failed to load initial data, you may need to re-login:", e);
                }
            } else {
                localStorage.removeItem('axis_user');
            }

            // Real-Time Background Kill-Switch: check account status whenever employee returns to app
            document.addEventListener('visibilitychange', async () => {
                if (document.visibilityState === 'visible' && currentUser.value?.id) {
                    try {
                        const fresh = await db.getUserById(currentUser.value.id);
                        if (fresh && (fresh.status === 'suspended' || fresh.status === 'resigned' || fresh.status === 'inactive')) {
                            console.warn("Account deactivated while app was in background. Executing remote wipe...");
                            localStorage.removeItem('axis_user');
                            currentUser.value = null;
                            alert("⚠️ Access Revoked: Your SalesLink account has been deactivated by your branch supervisor. All cached data has been wiped.");
                            window.location.reload();
                        }
                    } catch (e) {}
                }
            });
        });

        // Return everything needed by the template
        return {
            currentUser, loginForm, loginError, isLoggingIn, loginStage, isRegistering, registerStage, currentTab, mobileMenuOpen, defaultSmName,
            phoneLoginForm, otpCode, phoneConfirmationResult, pendingOtpUser, otpTargetPhoneDisplay, isSendingOtp, isVerifyingOtp, otpResendCountdown, handleSendPhoneOtp, handleResendOtp, handleVerifyOtp, handleCancelOtp, missingPhoneInput, showMissingPhoneModal, handleLinkPhoneAndSendOtp,
            isSuperAdmin, isSM, isRO, stats, smLeaderboard, roStats, saasOverviewTimeline, saasOverviewCustomDate, saasStats, tenantHealthList, groupedUsers, recentFiles, filteredFiles, filteredMyFiles, roUsers, activeRoUsers, suspendedRoUsers, resignedRoUsers, smUsersTab, smUsersSearch, filteredActiveRos, filteredSuspendedRos, filteredResignedRos, myFiles, allWorkspaces, allFiles,
            showOffboardModal, userToOffboard, offboardReplacementRoId, offboardReason, offboardConfirm, isOffboarding, offboardError, offboardSuccess,
            availableReplacementRos, offboardActiveFiles, offboardDisbursedFiles, offboardActiveFilesVolume, openOffboardModal, submitOffboardUser,
            userSearchQuery, userFilterStatus, expandedWorkspaces, toggleWorkspaceExpansion, expandAllWorkspaces, collapseAllWorkspaces, showEditUserModal, editUserForm, openEditUserModal, saveUserEdit,
            showRegisterMode, registerForm, registerError, registerSM, bankOptions, divisionOptions, toggleWorkspaceStatus, deleteWorkspace,
            showAddRoModal, newRoForm, addRoError, addRoStep, isSavingRo, newlyCreatedRo, copyRoInviteSuccess, openAddRoModal, closeAddRoModal, appendGmailDomain, shareRoInviteWhatsApp, copyRoInviteMessage, formatCapitalizeName,
            newFileForm, showEditFileModal, editFileForm, showUpdateStatusModal, selectedFile, statusUpdateForm,
            showViewFileModal, filters, roFilters, showMobileFilterDrawer, roOverviewTimeline, roOverviewCustomDate, smOverviewTimeline, smOverviewCustomDate,
            formatCurrency, formatLakhsToRupees, toLakhs, formatDate, formatDateOnly, getStatusBadgeClass, getTabTitle, getTimelineLabel, getSortLabel, resetRoFilters,
            getTodayDateStr, getYesterdayDateStr,
            login, loginRedirect, logout, saveNewRo, toggleUserStatus, deleteRoUser,
            resetNewFileForm, saveNewFile, openEditFileModal, saveEditedFile, deleteFile, shareFileWhatsApp, shareBulkWhatsApp,
            originalUser, impersonateUser, stopImpersonation,
            systemAnnouncement, adminAnnouncementInput, saveAnnouncement,
            openEditStatusModal, saveFileStatus, openViewFileModal, exportToExcel, exportRoFilesToExcel,
            eodForm, eodSubmitError, eodSubmitSuccess, submitting, metricsConfig, validateEOD, myEods, smEods, submitEOD,
            smEodSummary, missingEods, generateEodWhatsApp, generateRoWhatsApp, hasSubmittedToday, eodTotals,
            dealerVisitsInput, tomorrowLoginsInput, tomorrowDisbInput, remarksInput,
            isEditingTodayEod, startReviseTodayEod, cancelReviseTodayEod,
            showTodayFilesBreakdown, todayLoginsFiles, todayDisbFiles,
            eodSubTab, eodCopiedToast, copyRoEodToClipboard, eodResyncSuccess, triggerResyncEod,
            roTargetFiles, roTargetVolume, showEditTargetModal, targetInputFiles, targetInputVolume, openEditTargetModal, saveRoTarget, roTargetPacing,
            roNeedsAttentionFiles,
            selectedRoForInspection, showRoInspectorDrawer, roInspectorActiveTab, openRoInspector, closeRoInspector, selectedRoAnalytics, generateSmNudgeWhatsApp, generateFileAlertWhatsApp, myRecentFiles, navigateRoStatusFilter, currentRoMtd, eodMtdTotals, getRoMtdForDate, goToTab, deferredInstallPrompt, showInstallBanner, showIosInstallModal, isStandalone, isIos, installPwaApp, dismissInstallBanner, isASM, isZSM, copiedSalesLinkIdToast, copySalesLinkId, pendingInvitations, isRespondingInvite, acceptSupervisorInvite, declineSupervisorInvite, unlinkFromSupervisor, supervisedSMs, areaFiles, areaEods, areaInvitations, showInviteSmModal, inviteSmForm, inviteSmError, inviteSmSuccess, isInvitingSm, selectedSmDrilldown, asmSearchQuery, asmStatusFilter, asmHubFilter, asmTimelineFilter, asmCategoryFilter, asmChannelFilter, asmSortBy, resetAsmFilters, asmSmDistribution, asmStatusCounts, sendFileAlertToSm, loadAsmData, sendSmInvitation,
            allRegisteredSMs, inviteMethod, inviteInputValue, inviteWarning, linkedManagerDetails, isSubmittingInvite, connectSmError, connectSmSuccess, onInviteMethodChange, resetInviteModal, openConnectSmModal, submitInviteSm, openSmWhatsAppNotify, cancelInvitation, releaseSm, asmStats, smPerformanceList, filteredAreaFiles, supervisedASMs, zsmInvitations, showInviteAsmModal, inviteAsmForm, inviteAsmError, inviteAsmSuccess, isInvitingAsm, selectedAsmDrilldown, loadZsmData, sendAsmInvitation,
            profileActiveTab, profileForm, isSavingProfile, profileSaveSuccess, profileSaveError, initProfileForm, saveUserProfile,
            assignedSm, profileCompletion, openRoWhatsAppChat, openSmWhatsAppChat, isResyncingProfile, profileResyncSuccess, triggerProfileResync,
            showConnectSupervisorModal, connectSupervisorMethod, connectSupervisorInput, connectSupervisorWarning, isConnectingSupervisor, connectSupervisorError, connectSupervisorSuccess, connectedSupervisorData,
            onConnectSupervisorMethodChange, resetConnectSupervisorModal, openConnectSupervisorModal, submitConnectSupervisor, openAsmWhatsAppNotify
        };
    }
});

app.mount('#app');


