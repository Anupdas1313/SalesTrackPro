// js/app.js - Main Application Orchestrator for SalesLink (Retail Auto-Loans PWA)

import * as db from './db.js';
import {
    STANDARD_STATUSES,
    toLakhs,
    formatCurrency,
    formatLakhsToRupees,
    formatDate,
    formatDateOnly,
    formatCapitalizeName,
    getStatusBadgeClass,
    getTabTitle,
    getTimelineLabel,
    getSortLabel,
    getTodayDateStr,
    getYesterdayDateStr,
    isSanctionStatus,
    isDisbursedStatus,
    matchesTimeline,
    matchesFileTimeline
} from './composables/helpers.js';
import { useAuth } from './composables/useAuth.js';
import { useDse } from './composables/useDse.js';
import { useHierarchy } from './composables/useHierarchy.js';
import { useLoanFiles } from './composables/useLoanFiles.js';

const { createApp, ref, computed, onMounted, watch } = Vue;

const app = createApp({
    setup() {
        // --- Core Root Reactive State ---
        const currentTab = ref('login');
        const mobileMenuOpen = ref(false);
        const allWorkspaces = ref([]);
        const roUsers = ref([]);
        const defaultSmName = ref(localStorage.getItem('axis_default_sm') || '');
        const systemAnnouncement = ref('');
        const adminAnnouncementInput = ref('');
        const showMoreModal = ref(false);
        const targetsDrivesSubTab = ref('targets');
        const upcomingFeatureVotes = ref(JSON.parse(localStorage.getItem('upcoming_votes') || '{}'));

        const toggleUpcomingVote = (featureKey) => {
            const votes = { ...upcomingFeatureVotes.value };
            votes[featureKey] = (votes[featureKey] || 0) + 1;
            upcomingFeatureVotes.value = votes;
            localStorage.setItem('upcoming_votes', JSON.stringify(votes));
        };

        const goToTab = (tab) => {
            currentTab.value = tab;
            mobileMenuOpen.value = false;
        };

        // --- Active / Suspended / Resigned RO Splitting ---
        const activeRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status !== 'suspended' && u.status !== 'resigned');
        });

        const suspendedRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status === 'suspended');
        });

        const resignedRoUsers = computed(() => {
            return (roUsers.value || []).filter(u => u.status === 'resigned');
        });

        // --- Instantiate Composables ---
        const auth = useAuth({
            currentTab,
            loadData: async () => { await loadData(); },
            loadDseData: async () => { await dse.loadDseData(); },
            initUserSm: async () => { await initUserSm(); },
            allWorkspaces,
            roUsers
        });

        const dse = useDse({
            currentUser: auth.currentUser,
            allWorkspaces
        });

        const loanFiles = useLoanFiles({
            currentUser: auth.currentUser,
            isSM: auth.isSM,
            isASM: auth.isASM,
            isRO: auth.isRO,
            defaultSmName,
            roUsers,
            activeRoUsers,
            currentTab,
            initUserSm: async () => { await initUserSm(); },
            loadData: async () => { await loadData(); },
            loadAsmData: async () => { await hierarchy.loadAsmData(); },
            areaFiles: computed(() => hierarchy.areaFiles.value),
            supervisedSMs: computed(() => hierarchy.supervisedSMs.value),
            openOffboardModal: (u) => hierarchy.openOffboardModal(u)
        });

        const hierarchy = useHierarchy({
            currentUser: auth.currentUser,
            allFiles: loanFiles.allFiles,
            activeRoUsers,
            allSalesTargets: loanFiles.allSalesTargets,
            loadData: async () => { await loadData(); }
        });

        // --- RO 360 Inspector Drawer State & Logic (For SM Monitoring) ---
        const selectedRoForInspection = ref(null);
        const showRoInspectorDrawer = ref(false);
        const roInspectorActiveTab = ref('overview');

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

            const roAllFiles = loanFiles.allFiles.value.filter(f => f.roId === roId || (f.roName && f.roName.trim().toUpperCase() === roName));
            
            const today = new Date().toISOString().split('T')[0];
            const todayLogins = roAllFiles.filter(f => (f.createdAt && f.createdAt.startsWith(today)) || f.loginDate === today);
            const todayDisb = roAllFiles.filter(f => f.status === 'Disbursed' && ((f.updatedAt && f.updatedAt.startsWith(today)) || (f.loginDate === today)));
            const todayLoginsCount = todayLogins.length;
            const todayLoginsVolume = todayLogins.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const todayDisbCount = todayDisb.length;
            const todayDisbVolume = todayDisb.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const todayEod = loanFiles.smEods.value.find(e => e.userId === roId && e.date === today);
            const hasSubmittedToday = Boolean(todayEod);

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

            const conversionRate = mtdCount > 0 ? Math.round((mtdDisbCount / mtdCount) * 100) : 0;
            const approvalRate = mtdCount > 0 ? Math.round(((mtdApprovedCount + mtdDisbCount) / mtdCount) * 100) : 0;

            const nclFiles = mtdFiles.filter(f => (f.nclUcl || '').toUpperCase() === 'NCL');
            const uclFiles = mtdFiles.filter(f => (f.nclUcl || '').toUpperCase() === 'UCL');
            const nclCount = nclFiles.length;
            const uclCount = uclFiles.length;
            const nclVolume = nclFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const uclVolume = uclFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);

            const activePipelineFiles = roAllFiles.filter(f => !['Disbursed', 'Cancelled', 'Rejected'].includes(f.status));

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

        // --- SaaS Owner (Super Admin) Overview State & Operations ---
        const saasOverviewTimeline = ref('this-month');
        const saasOverviewCustomDate = ref('');

        const saasStats = computed(() => {
            const files = loanFiles.allFiles.value.filter(f => matchesTimeline(f.loginDate || f.createdAt || f.updatedAt, saasOverviewTimeline.value, saasOverviewCustomDate.value));
            const activeUserIds = new Set(files.filter(f => f.roId).map(f => f.roId));
            const newWorkspaces = allWorkspaces.value.filter(w => matchesTimeline(w.createdAt, saasOverviewTimeline.value, saasOverviewCustomDate.value));
            
            return {
                totalWorkspaces: allWorkspaces.value.length,
                newWorkspaces: newWorkspaces.length,
                totalUsers: roUsers.value.length,
                activeUsers: activeUserIds.size,
                totalFiles: files.length,
                filesAllTime: loanFiles.allFiles.value.length
            };
        });

        const tenantHealthList = computed(() => {
            return allWorkspaces.value.map(workspace => {
                const wUsers = roUsers.value.filter(u => u.tenantId === workspace.id && u.role !== 'dse' && !u.dealershipName);
                const wFiles = loanFiles.allFiles.value.filter(f => f.tenantId === workspace.id || (!f.tenantId && f.smName === workspace.id));
                
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

        const superAdminUsersTab = ref('bank');
        const dseDirectorySearch = ref('');
        const dseDirectoryFilterBrand = ref('all');
        const dseDirectoryFilterStatus = ref('all');

        const goToSuperAdminDirectory = (tab) => {
            currentTab.value = 'super-admin-users';
            superAdminUsersTab.value = tab || 'bank';
        };

        const totalBankUsersCount = computed(() => {
            return (roUsers.value || []).filter(u => 
                (u.role === 'sm' || u.role === 'ro' || u.role === 'admin' || u.role === 'asm' || u.role === 'zsm') && 
                u.role !== 'super_admin' && 
                u.role !== 'dse' &&
                !u.dealershipName
            ).length;
        });

        const groupedUsers = computed(() => {
            let allPlatformUsers = (roUsers.value || []).filter(u => 
                u.role !== 'super_admin' && 
                u.role !== 'dse' &&
                !u.dealershipName
            );
            
            if (userFilterStatus.value !== 'all') {
                allPlatformUsers = allPlatformUsers.filter(u => (u.status || 'active') === userFilterStatus.value);
            }
            if (userSearchQuery.value) {
                const q = userSearchQuery.value.toLowerCase();
                allPlatformUsers = allPlatformUsers.filter(u => 
                    (u.name && u.name.toLowerCase().includes(q)) || 
                    (u.email && u.email.toLowerCase().includes(q))
                );
            }

            const systemUsers = allPlatformUsers.filter(u => !u.tenantId);
            
            const grouped = allWorkspaces.value.map(workspace => {
                const wUsers = allPlatformUsers.filter(u => u.tenantId === workspace.id);
                
                const enhancedUsers = wUsers.map(u => {
                    const uFiles = loanFiles.allFiles.value.filter(f => f.userId === u.id || f.roId === u.id);
                    let lastActive = null;
                    if (uFiles.length > 0) {
                        lastActive = [...uFiles].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt;
                    }
                    return { ...u, fileCount: uFiles.length, lastActive };
                });
                
                return {
                    workspace,
                    isExpanded: expandedWorkspaces.value.includes(workspace.id),
                    smUsers: enhancedUsers.filter(u => u.role === 'sm' || u.role === 'admin'),
                    roUsers: enhancedUsers.filter(u => u.role === 'ro')
                };
            }).filter(group => group.smUsers.length > 0 || group.roUsers.length > 0)
              .sort((a, b) => a.workspace.name.localeCompare(b.workspace.name));
            
            if (systemUsers.length > 0) {
                const enhancedSystem = systemUsers.map(u => {
                    const uFiles = loanFiles.allFiles.value.filter(f => f.userId === u.id || f.roId === u.id);
                    let lastActive = null;
                    if (uFiles.length > 0) {
                        lastActive = [...uFiles].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt;
                    }
                    return { ...u, fileCount: uFiles.length, lastActive };
                });
                grouped.push({
                    workspace: { id: 'system', name: 'System / Unassigned Officers', status: 'active' },
                    isExpanded: expandedWorkspaces.value.includes('system'),
                    smUsers: enhancedSystem.filter(u => u.role === 'sm' || u.role === 'admin'),
                    roUsers: enhancedSystem.filter(u => u.role === 'ro')
                });
            }
            
            return grouped;
        });

        // Dedicated Dealership & DSE Directory
        const dseDirectoryList = computed(() => {
            let list = (roUsers.value || []).filter(u => 
                u.role === 'dse' || 
                (u.dealershipName && u.role !== 'super_admin' && u.role !== 'sm' && u.role !== 'ro' && u.role !== 'asm' && u.role !== 'zsm')
            );

            if (dseDirectoryFilterBrand.value !== 'all') {
                list = list.filter(u => (u.showroomBrand || '') === dseDirectoryFilterBrand.value);
            }
            if (dseDirectoryFilterStatus.value !== 'all') {
                list = list.filter(u => (u.status || 'active') === dseDirectoryFilterStatus.value);
            }
            const q = (dseDirectorySearch.value || '').trim().toLowerCase();
            if (q) {
                list = list.filter(u => 
                    (u.name && u.name.toLowerCase().includes(q)) ||
                    (u.email && u.email.toLowerCase().includes(q)) ||
                    (u.phone && String(u.phone).includes(q)) ||
                    (u.dealershipName && u.dealershipName.toLowerCase().includes(q)) ||
                    (u.showroomBrand && u.showroomBrand.toLowerCase().includes(q)) ||
                    (u.employeeCode && String(u.employeeCode).toLowerCase().includes(q)) ||
                    (u.salesLinkId && String(u.salesLinkId).toLowerCase().includes(q))
                );
            }

            return list.map(dseItem => {
                const email = (dseItem.email || '').toLowerCase();
                const sid = dseItem.salesLinkId || '';
                const files = (loanFiles.allFiles.value || []).filter(f => 
                    f.dseId === dseItem.id || 
                    (sid && f.dseId === sid) ||
                    (email && f.userEmail && f.userEmail.toLowerCase() === email) ||
                    (dseItem.name && f.dseName && f.dseName.toLowerCase() === dseItem.name.toLowerCase())
                );
                const totalPunched = files.length;
                const totalSanctioned = files.filter(f => (f.status || '').toUpperCase() === 'SANCTION').length;
                const totalDelivered = files.filter(f => (f.status || '').toUpperCase() === 'DISBURSED').length;
                const totalVolume = files.reduce((acc, f) => acc + (Number(f.sanctionAmount || f.loanAmount) || 0), 0);

                let lastActive = dseItem.lastLoginAt || null;
                if (files.length > 0) {
                    const sorted = [...files].sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
                    lastActive = sorted[0].createdAt;
                }

                let linkedHub = null;
                const tid = dseItem.linkedBankTenantId || dseItem.tenantId;
                if (tid) {
                    linkedHub = (allWorkspaces.value || []).find(w => w.id === tid);
                }

                return {
                    ...dseItem,
                    totalPunched,
                    totalSanctioned,
                    totalDelivered,
                    totalVolume: totalVolume.toFixed(2),
                    lastActive,
                    linkedHubName: linkedHub ? linkedHub.name : (dseItem.region || 'Multi-Bank Desk')
                };
            }).sort((a, b) => b.totalPunched - a.totalPunched || (b.createdAt || '').localeCompare(a.createdAt || ''));
        });

        const dseDirectoryStats = computed(() => {
            const list = (roUsers.value || []).filter(u => u.role === 'dse' || (u.dealershipName && u.role !== 'super_admin' && u.role !== 'sm' && u.role !== 'ro'));
            const dealerships = new Set(list.map(u => (u.dealershipName || '').trim()).filter(Boolean));
            const activeDse = list.filter(u => (u.status || 'active') === 'active').length;
            return {
                totalDse: list.length,
                activeDse,
                uniqueDealerships: dealerships.size
            };
        });

        const showEditUserModal = ref(false);
        const editUserForm = ref({ id: '', name: '', email: '', tenantId: '', role: '', dealershipName: '', showroomBrand: 'Maruti Suzuki Arena' });

        const openEditUserModal = (user) => {
            editUserForm.value = {
                id: user.id || '',
                name: user.name || '',
                email: user.email || '',
                employeeCode: user.employeeCode || '',
                phone: user.phone || '',
                tenantId: user.tenantId || '',
                role: user.role || 'ro',
                dealershipName: user.dealershipName || '',
                showroomBrand: user.showroomBrand || 'Maruti Suzuki Arena'
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

                if (cleanedEmp) {
                    const existingEmp = await db.getUserByEmployeeCode(cleanedEmp);
                    if (existingEmp && existingEmp.id !== editUserForm.value.id) {
                        const supName = await db.getSupervisorNameForUser(existingEmp);
                        alert(`⚠️ This Employee ID (${cleanedEmp}) is already linked with another Sales Manager (${supName}) for officer "${existingEmp.name || 'Staff'}". Duplicate Employee IDs cannot be assigned.`);
                        return;
                    }
                }

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
                    if (editUserForm.value.role === 'dse') {
                        updatePayload.dealershipName = (editUserForm.value.dealershipName || '').trim();
                        updatePayload.showroomBrand = editUserForm.value.showroomBrand || 'Maruti Suzuki Arena';
                        updatePayload.designation = 'Dealership Sales Executive (DSE)';
                        updatePayload.tenantId = null;
                    }
                }
                if (editUserForm.value.role !== 'dse' && editUserForm.value.tenantId !== undefined) {
                    updatePayload.tenantId = editUserForm.value.tenantId;
                }

                await db.updateUser(editUserForm.value.id, updatePayload);

                const index = roUsers.value.findIndex(u => u.id === editUserForm.value.id);
                if (index !== -1) {
                    roUsers.value[index] = {
                        ...roUsers.value[index],
                        ...updatePayload
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

            const wsUsers = await db.getUsersByTenant(workspace.id);
            const wsFiles = await db.getLoanFilesByTenant(workspace.id);
            const userCount = wsUsers.filter(u => u.status !== 'deleted' && !u.deletedAt).length;
            const fileCount = wsFiles.filter(f => f.status !== 'deleted' && !f.deletedAt).length;

            if (userCount > 0 || fileCount > 0) {
                alert(`⛔ Cannot Delete Workspace "${workspace.name}":\n\nThis workspace currently contains ${userCount} active user(s) and ${fileCount} active file(s).\n\nTo prevent orphaning records and locking out branch members, please reassign or offboard all users and files before deleting this workspace.`);
                return;
            }

            if (!confirm(`Are you sure you want to permanently delete empty workspace "${workspace.name}" (ID: ${workspace.id})?\n\nThis action cannot be undone.`)) return;

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

        // --- SM Users Tab & Search State ---
        const smUsersTab = ref('active');
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

        // --- Add RO Modal State & Handlers ---
        const showAddRoModal = ref(false);
        const addRoStep = ref('form');
        const addRoError = ref('');
        const isSavingRo = ref(false);
        const newlyCreatedRo = ref(null);
        const copyRoInviteSuccess = ref(false);
        let copyRoInviteTimer = null;

        const newRoForm = ref({
            name: '',
            email: '',
            phone: '',
            employeeCode: ''
        });

        const openAddRoModal = () => {
            addRoStep.value = 'form';
            addRoError.value = '';
            newRoForm.value = { name: '', email: '', phone: '', employeeCode: '' };
            newlyCreatedRo.value = null;
            copyRoInviteSuccess.value = false;
            showAddRoModal.value = true;
        };

        const closeAddRoModal = () => {
            showAddRoModal.value = false;
        };

        const appendGmailDomain = () => {
            const current = (newRoForm.value.email || '').trim();
            if (!current) {
                newRoForm.value.email = '@gmail.com';
                return;
            }
            if (!current.includes('@')) {
                newRoForm.value.email = current + '@gmail.com';
            }
        };

        const shareRoInviteWhatsApp = (ro) => {
            const target = ro || newlyCreatedRo.value;
            if (!target) return;
            const branchName = auth.currentUser.value?.region || 'our branch hub';
            const smName = auth.currentUser.value?.name || 'Sales Manager';
            const inviteUrl = window.location.origin + window.location.pathname;
            const msg = `*SalesLink Invitation - Retail Asset Lending*\n\nHi ${target.name},\nYou have been authorized as a Relationship Officer (RO) under Sales Manager ${smName} at ${branchName}.\n\n*Your Assigned SalesLink ID:* ${target.salesLinkId}\n*Designated Email:* ${target.email}\n\nAccess the portal directly with your Google Sign-In:\n${inviteUrl}\n\nPlease log in to start tracking customer loan files and daily EODs.`;
            const phoneDigits = (target.phone || '').replace(/\D/g, '');
            const targetPhone = phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits;
            window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        const copyRoInviteMessage = async (ro) => {
            const target = ro || newlyCreatedRo.value;
            if (!target) return;
            const branchName = auth.currentUser.value?.region || 'our branch hub';
            const smName = auth.currentUser.value?.name || 'Sales Manager';
            const inviteUrl = window.location.origin + window.location.pathname;
            const msg = `*SalesLink Invitation - Retail Asset Lending*\n\nHi ${target.name},\nYou have been authorized as a Relationship Officer (RO) under Sales Manager ${smName} at ${branchName}.\n\n*Your Assigned SalesLink ID:* ${target.salesLinkId}\n*Designated Email:* ${target.email}\n\nAccess the portal directly with your Google Sign-In:\n${inviteUrl}\n\nPlease log in to start tracking customer loan files and daily EODs.`;
            try {
                await navigator.clipboard.writeText(msg);
                copyRoInviteSuccess.value = true;
                if (copyRoInviteTimer) clearTimeout(copyRoInviteTimer);
                copyRoInviteTimer = setTimeout(() => { copyRoInviteSuccess.value = false; }, 3000);
            } catch (e) {
                console.warn('Clipboard write error:', e);
            }
        };

        const saveNewRo = async () => {
            addRoError.value = '';
            const name = formatCapitalizeName(newRoForm.value.name);
            const rawEmail = (newRoForm.value.email || '').trim().toLowerCase();
            const phone = (newRoForm.value.phone || '').trim().replace(/\D/g, '');
            const empCode = (newRoForm.value.employeeCode || '').trim().toUpperCase();

            if (!name) {
                addRoError.value = 'Please enter the officer’s full official name.';
                return;
            }
            if (!rawEmail || !rawEmail.includes('@') || !rawEmail.includes('.')) {
                addRoError.value = 'Please provide a valid official Gmail address.';
                return;
            }
            if (phone.length !== 10) {
                addRoError.value = 'Mobile number must be exactly 10 digits.';
                return;
            }
            if (!empCode || empCode.length < 3) {
                addRoError.value = 'Employee code / staff ID must be at least 3 characters.';
                return;
            }

            isSavingRo.value = true;
            try {
                const existingEmp = await db.getUserByEmployeeCode(empCode);
                if (existingEmp) {
                    const supName = await db.getSupervisorNameForUser(existingEmp);
                    addRoError.value = `⚠️ Employee ID (${empCode}) is already registered under Sales Manager "${supName}" for officer "${existingEmp.name}". Duplicate Employee IDs cannot be registered.`;
                    isSavingRo.value = false;
                    return;
                }

                const existingEmail = await db.getUserByEmail(rawEmail);
                if (existingEmail) {
                    const supName = await db.getSupervisorNameForUser(existingEmail);
                    addRoError.value = `⚠️ Google email (${rawEmail}) is already registered under Sales Manager "${supName}". Each officer must use a distinct Gmail.`;
                    isSavingRo.value = false;
                    return;
                }

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
                    tenantId: auth.currentUser.value.tenantId,
                    supervisorId: auth.currentUser.value.id || null,
                    supervisorName: auth.currentUser.value.name || 'Sales Manager',
                    supervisorSalesLinkId: auth.currentUser.value.salesLinkId || null,
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
            const confirmMsg = isLocking 
                ? `Are you sure you want to FREEZE & LOCK ${user.name}'s account?\n\n• Their login access will be blocked immediately.\n• Active sessions will be revoked.\n• Customer files will remain safely preserved.`
                : `Are you sure you want to UNLOCK ${user.name}'s account?\n\n• Their login access will be restored immediately.`;
            
            if (!confirm(confirmMsg)) return;

            try {
                const now = new Date().toISOString();
                const updatePayload = {
                    status: isLocking ? 'suspended' : 'active',
                    statusUpdatedAt: now,
                    statusUpdatedBy: auth.currentUser.value?.id || '',
                    statusUpdatedByName: auth.currentUser.value?.name || 'Sales Manager'
                };
                if (isLocking) {
                    updatePayload.suspendedAt = now;
                    updatePayload.suspendedBy = auth.currentUser.value?.id || '';
                    updatePayload.suspendedByName = auth.currentUser.value?.name || 'Sales Manager';
                } else {
                    updatePayload.reactivatedAt = now;
                    updatePayload.reactivatedBy = auth.currentUser.value?.id || '';
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

            const filesCount = (loanFiles.allFiles.value || []).filter(f => f.roId === user.id || (f.roName && f.roName.trim().toUpperCase() === (user.name || '').trim().toUpperCase())).length;

            if (filesCount > 0) {
                alert(`⚠️ Cannot Delete Profile "${user.name || 'User'}":\n\nThis officer has ${filesCount} loan file(s) assigned in the branch pipeline.\n\nOpening the Offboarding & Pipeline Reassignment workflow so you can safely reassign their active files to another officer before removing their profile.`);
                hierarchy.openOffboardModal(user);
                return;
            }

            const confirmMsg = `Are you sure you want to remove profile "${user.name || 'User'}" (${user.email})?\n\nThis will revoke their login access immediately.`;
            if (!confirm(confirmMsg)) return;

            try {
                await db.deleteUser(user.id);
                roUsers.value = roUsers.value.filter(u => u.id !== user.id);
                await loadData();
                alert(`User ${user.name || user.email} was successfully removed.`);
            } catch (error) {
                console.error("Error deleting user:", error);
                alert("Failed to delete user: " + (error.message || error));
            }
        };

        // --- User Profile State & Operations ---
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
        const profileActiveTab = ref('overview');
        const isSavingProfile = ref(false);
        const profileSaveSuccess = ref(false);
        const profileSaveError = ref('');

        const initProfileForm = () => {
            if (!auth.currentUser.value) return;
            const u = auth.currentUser.value;
            const defaultRoleDesignation = auth.isSuperAdmin.value ? 'Platform Administrator' : (auth.isZSM.value ? 'Zonal Sales Manager' : (auth.isASM.value ? 'Area Sales Manager' : (auth.isSM.value ? 'SM (Sales Manager)' : (auth.isDSE.value ? 'Dealership Sales Executive (DSE)' : 'Relationship Officer'))));
            profileForm.value = {
                name: u.name || u.username || '',
                phone: u.phone || '',
                employeeCode: u.employeeCode || '',
                designation: u.designation || defaultRoleDesignation,
                branchAddress: u.branchAddress || '',
                bankName: u.bankName || 'Axis Bank',
                division: u.division || 'Auto Loans (Car Loans)',
                region: u.region || ''
            };
        };

        const profileCompletion = computed(() => {
            if (!auth.currentUser.value) return { percentage: 0, items: [] };
            const u = auth.currentUser.value;
            const checks = [
                { label: 'Full Official Name', done: Boolean(u.name && u.name.trim().length > 1) },
                { label: 'Google Email ID', done: Boolean(u.email) },
                { label: 'Mobile Number', done: Boolean(u.phone && u.phone.replace(/\D/g, '').length === 10) },
                { label: 'Employee Code / Staff ID', done: Boolean(u.employeeCode && u.employeeCode.trim().length >= 3) },
                { label: 'Official Designation', done: Boolean(u.designation) },
                { label: 'Assigned Branch / Hub', done: Boolean(u.region) },
                { label: 'Official Branch Address', done: Boolean(u.branchAddress && u.branchAddress.trim().length > 5) }
            ];
            const completedCount = checks.filter(c => c.done).length;
            const percentage = Math.round((completedCount / checks.length) * 100);
            return { percentage, items: checks, completedCount, totalCount: checks.length };
        });

        const isResyncingProfile = ref(false);
        const profileResyncSuccess = ref(false);
        const triggerProfileResync = async () => {
            if (isResyncingProfile.value) return;
            isResyncingProfile.value = true;
            try {
                await loadData();
                if (auth.isRO.value) await initUserSm();
                initProfileForm();
                profileResyncSuccess.value = true;
                setTimeout(() => { profileResyncSuccess.value = false; }, 3000);
            } catch (e) {
                console.warn('Profile resync error:', e);
            } finally {
                isResyncingProfile.value = false;
            }
        };

        const saveUserProfile = async () => {
            if (!auth.currentUser.value?.id) return;
            profileSaveError.value = '';
            profileSaveSuccess.value = false;

            const name = formatCapitalizeName(profileForm.value.name);
            const phone = (profileForm.value.phone || '').trim().replace(/\D/g, '');
            const empCode = (profileForm.value.employeeCode || '').trim().toUpperCase();

            if (!name) {
                profileSaveError.value = 'Please provide your full official name.';
                return;
            }
            if (phone && phone.length !== 10) {
                profileSaveError.value = 'Mobile number must be exactly 10 digits.';
                return;
            }
            if (empCode && empCode.length < 3) {
                profileSaveError.value = 'Employee / Staff ID must be at least 3 characters.';
                return;
            }

            isSavingProfile.value = true;
            try {
                if (empCode && empCode !== (auth.currentUser.value.employeeCode || '')) {
                    const existingEmp = await db.getUserByEmployeeCode(empCode);
                    if (existingEmp && existingEmp.id !== auth.currentUser.value.id) {
                        const supName = await db.getSupervisorNameForUser(existingEmp);
                        profileSaveError.value = `⚠️ Employee ID (${empCode}) is already linked with another Sales Manager (${supName}) for officer "${existingEmp.name}". Duplicate Employee IDs cannot be registered.`;
                        isSavingProfile.value = false;
                        return;
                    }
                }

                const updates = {
                    name,
                    phone,
                    employeeCode: empCode,
                    designation: profileForm.value.designation || '',
                    branchAddress: profileForm.value.branchAddress || '',
                    bankName: profileForm.value.bankName || 'Axis Bank',
                    division: profileForm.value.division || 'Auto Loans (Car Loans)',
                    region: profileForm.value.region || auth.currentUser.value.region || '',
                    updatedAt: new Date().toISOString()
                };

                await db.updateUser(auth.currentUser.value.id, updates);
                Object.assign(auth.currentUser.value, updates);
                localStorage.setItem('axis_user', JSON.stringify(auth.currentUser.value));

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

        // --- System Announcements ---
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

        // --- PWA State & Operations ---
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
                deferredInstallPrompt.value = null;
            } else {
                alert('To install SalesLink on your device:\n\n• On iPhone/iPad: Tap the Share button (⬆) in Safari, then tap "Add to Home Screen".\n• On Android/PC: Tap the browser menu (⋮) and tap "Install app" or "Add to Home screen".');
            }
        };

        const closeIosInstallModal = () => {
            showIosInstallModal.value = false;
            showInstallBanner.value = false;
            try {
                localStorage.setItem('saleslink_pwa_dismissed', String(Date.now()));
            } catch(e) {}
        };

        const dismissInstallBanner = () => {
            showInstallBanner.value = false;
            showIosInstallModal.value = false;
            try {
                localStorage.setItem('saleslink_pwa_dismissed', String(Date.now()));
            } catch(e) {}
        };

        // --- Data Orchestration ---
        const loadSuperAdminData = async () => {
            allWorkspaces.value = await db.getAllWorkspaces();
            roUsers.value = await db.getAllUsers();
            loanFiles.allFiles.value = await db.getAllLoanFiles();
        };

        const initUserSm = async () => {
            if (!auth.currentUser.value) return;

            let smName = '';
            let smObj = { name: '', phone: '', email: '', salesLinkId: '' };

            if (auth.isSM.value) {
                smName = auth.currentUser.value.name || auth.currentUser.value.username || '';
                smObj = {
                    name: smName,
                    phone: auth.currentUser.value.phone || '',
                    email: auth.currentUser.value.email || '',
                    salesLinkId: auth.currentUser.value.salesLinkId || ''
                };
            } else if (auth.currentUser.value.tenantId) {
                try {
                    const smUser = await db.getSMUserByTenant(auth.currentUser.value.tenantId);
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

                if (!smName) {
                    try {
                        const ws = await db.getWorkspace(auth.currentUser.value.tenantId);
                        if (ws && ws.managerName) {
                            smName = ws.managerName.trim();
                            smObj.name = smName;
                        }
                    } catch (e) {
                        console.warn("Could not fetch workspace managerName:", e);
                    }
                }
            }

            if (!smName) {
                smName = localStorage.getItem('axis_default_sm_' + auth.currentUser.value.id) || localStorage.getItem('axis_default_sm') || '';
                smObj.name = smName;
            }

            if (smName) {
                const upperSm = smName.toUpperCase();
                defaultSmName.value = upperSm;
                smObj.name = upperSm;
                loanFiles.newFileForm.value.smName = upperSm;
                localStorage.setItem('axis_default_sm_' + auth.currentUser.value.id, upperSm);
                localStorage.setItem('axis_default_sm', upperSm);
            }
            hierarchy.assignedSm.value = smObj;
        };

        const loadData = async () => {
            if (!auth.currentUser.value) return;

            if (auth.currentUser.value?.id) {
                try {
                    const freshUser = await db.getUserById(auth.currentUser.value.id);
                    if (freshUser && (freshUser.status === 'suspended' || freshUser.status === 'resigned' || freshUser.status === 'inactive')) {
                        console.warn("Security Kill-Switch: Account suspended or revoked by supervisor.");
                        localStorage.removeItem('axis_user');
                        auth.currentUser.value = null;
                        alert("⚠️ Access Revoked: Your account has been locked by your Sales Manager. All session data has been wiped.");
                        window.location.reload();
                        return;
                    }
                } catch (e) {
                    console.warn("User status check error in loadData:", e);
                }
            }

            if (auth.isSuperAdmin.value) {
                await loadSuperAdminData();
            } else if (auth.isZSM.value) {
                await hierarchy.loadZsmData();
            } else if (auth.isASM.value) {
                await hierarchy.loadAsmData();
            } else if (auth.isSM.value) {
                await loanFiles.loadSmData();
                await loanFiles.loadInboundShowroomFiles();
            } else if (auth.isDSE.value) {
                await dse.loadDseData();
            } else {
                await loanFiles.loadRoData();
            }

            try {
                loanFiles.allSalesTargets.value = await db.getSalesTargets();
                loanFiles.allSalesDrives.value = await db.getSalesDrives();
            } catch (targetErr) {
                console.warn("Could not load targets/drives:", targetErr);
            }
        };

        onMounted(async () => {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const applyParam = urlParams.get('apply') || urlParams.get('hub') || urlParams.get('ref');
                if (applyParam) {
                    await dse.initPublicApplyHub(applyParam);
                }
                const importParam = urlParams.get('importLead');
                if (importParam && auth.currentUser.value) {
                    try {
                        const jsonStr = decodeURIComponent(escape(atob(decodeURIComponent(importParam))));
                        const leadData = JSON.parse(jsonStr);
                        if (leadData && leadData.customerName) {
                            const exists = loanFiles.allFiles.value.some(f => f.appId === leadData.appId);
                            if (!exists) {
                                leadData.tenantId = auth.currentUser.value.tenantId || leadData.tenantId;
                                leadData.targetBankName = auth.currentUser.value.bankName || leadData.targetBankName;
                                leadData.targetHubName = auth.currentUser.value.region || leadData.targetHubName;
                                leadData.smName = auth.currentUser.value.name || leadData.smName;
                                await db.addLoanFile(leadData);
                                await loadData();
                                alert(`🎉 Inbound Showroom Lead Imported!\n\nCustomer: ${leadData.customerName}\nVehicle: ${leadData.vehicleModel}\nDealership: ${leadData.dealershipName || 'Showroom QR'}\n\nAdded to your Inbound Radar for RO allocation.`);
                                currentTab.value = 'inbound-showroom';
                            } else {
                                alert(`ℹ️ Lead ${leadData.appId} (${leadData.customerName}) is already imported in your radar.`);
                                currentTab.value = 'inbound-showroom';
                            }
                        }
                    } catch (importDecodeErr) {
                        console.warn("Could not parse import lead payload:", importDecodeErr);
                    }
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } catch (err) {
                console.warn("Public apply param error:", err);
            }

            isStandalone.value = checkStandalone();
            isIos.value = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

            window.addEventListener('beforeinstallprompt', (e) => {
                e.preventDefault();
                deferredInstallPrompt.value = e;
            });

            window.addEventListener('appinstalled', () => {
                showInstallBanner.value = false;
                showIosInstallModal.value = false;
                deferredInstallPrompt.value = null;
                isStandalone.value = true;
            });

            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (showIosInstallModal.value) closeIosInstallModal();
                    if (showRoInspectorDrawer.value) closeRoInspector();
                }
            });

            try {
                systemAnnouncement.value = await db.getAnnouncement();
                adminAnnouncementInput.value = systemAnnouncement.value;
            } catch(e) { console.error(e); }

            try {
                const redirectUser = await db.checkRedirectResult();
                if (redirectUser) {
                    auth.isLoggingIn.value = true;
                    auth.loginStage.value = 'verifying';
                    await auth.processUserLogin(redirectUser);
                    auth.isLoggingIn.value = false;
                    auth.loginStage.value = '';
                }
            } catch (e) {
                console.error("Redirect login processing error:", e);
                auth.loginError.value = e.message;
                auth.isLoggingIn.value = false;
                auth.loginStage.value = '';
            }

            try {
                if (db.onAuthStateChanged && db.auth) {
                    db.onAuthStateChanged(db.auth, async (firebaseUser) => {
                        if (firebaseUser && firebaseUser.email) {
                            const email = firebaseUser.email.toLowerCase().trim();
                            try {
                                const fresh = await db.getUserByEmail(email);
                                if (fresh) {
                                    if (fresh.status === 'suspended' || fresh.status === 'resigned' || fresh.status === 'inactive') {
                                        await auth.handleSecurityLockout('Your account has been deactivated or offboarded.');
                                        return;
                                    }
                                    const authUser = {
                                        id: fresh.id,
                                        email: fresh.email,
                                        username: fresh.name,
                                        role: fresh.role,
                                        name: fresh.name,
                                        salesLinkId: fresh.salesLinkId,
                                        supervisorId: fresh.supervisorId || null,
                                        supervisorName: fresh.supervisorName || null,
                                        supervisorRole: fresh.supervisorRole || null,
                                        supervisorSalesLinkId: fresh.supervisorSalesLinkId || null,
                                        tenantId: fresh.tenantId || null,
                                        phone: fresh.phone || '',
                                        bankName: fresh.bankName,
                                        division: fresh.division,
                                        dealershipName: fresh.dealershipName || '',
                                        showroomBrand: fresh.showroomBrand || '',
                                        region: fresh.region,
                                        employeeCode: fresh.employeeCode || '',
                                        designation: fresh.designation || '',
                                        branchAddress: fresh.branchAddress || '',
                                        status: fresh.status || 'active',
                                        createdAt: fresh.createdAt || '',
                                        sessionId: auth.currentUser.value?.sessionId || db.generateSessionId()
                                    };
                                    auth.currentUser.value = authUser;
                                    localStorage.setItem('axis_user', JSON.stringify(authUser));

                                    try {
                                        await db.upsertDirectoryEntry(firebaseUser.uid, {
                                            uid: firebaseUser.uid,
                                            userId: fresh.id,
                                            email: fresh.email,
                                            role: fresh.role,
                                            tenantId: fresh.tenantId || null,
                                            status: fresh.status || 'active',
                                            updatedAt: new Date().toISOString()
                                        });
                                    } catch (dirErr) {
                                        console.warn("Directory sync warning:", dirErr);
                                    }

                                    if (currentTab.value === 'login') {
                                        if (fresh.role === 'super_admin') currentTab.value = 'super-admin-dashboard';
                                        else if (fresh.role === 'zsm') currentTab.value = 'zsm-dashboard';
                                        else if (fresh.role === 'asm') currentTab.value = 'asm-dashboard';
                                        else if (fresh.role === 'sm' || fresh.role === 'admin') currentTab.value = 'dashboard';
                                        else if (fresh.role === 'dse') currentTab.value = 'dse-dashboard';
                                        else currentTab.value = 'ro-dashboard';
                                    }

                                    auth.startUserSecurityListener(fresh.id);
                                    await loadData();
                                }
                            } catch (err) {
                                console.warn("onAuthStateChanged sync error:", err);
                            }
                        }
                    });
                }
            } catch (authErr) {
                console.warn("Could not register onAuthStateChanged:", authErr);
            }

            if (auth.currentUser.value) {
                auth.startUserSecurityListener(auth.currentUser.value.id);
                initProfileForm();
                await loadData();
                if (auth.isRO.value) await initUserSm();
            }
        });

        // --- Master Return Object (100% Template Compatibility) ---
        return {
            // Root State & Functions
            currentTab,
            mobileMenuOpen,
            allWorkspaces,
            roUsers,
            defaultSmName,
            systemAnnouncement,
            adminAnnouncementInput,
            saveAnnouncement,
            showMoreModal,
            targetsDrivesSubTab,
            upcomingFeatureVotes,
            toggleUpcomingVote,
            goToTab,

            // Active / Suspended / Resigned ROs
            activeRoUsers,
            suspendedRoUsers,
            resignedRoUsers,
            smUsersTab,
            smUsersSearch,
            filteredActiveRos,
            filteredSuspendedRos,
            filteredResignedRos,
            showAddRoModal,
            newRoForm,
            addRoError,
            addRoStep,
            isSavingRo,
            newlyCreatedRo,
            copyRoInviteSuccess,
            openAddRoModal,
            closeAddRoModal,
            appendGmailDomain,
            shareRoInviteWhatsApp,
            copyRoInviteMessage,
            saveNewRo,
            toggleUserStatus,
            deleteRoUser,

            // Super Admin Overview & Management
            saasOverviewTimeline,
            saasOverviewCustomDate,
            saasStats,
            tenantHealthList,
            userSearchQuery,
            userFilterStatus,
            expandedWorkspaces,
            toggleWorkspaceExpansion,
            expandAllWorkspaces,
            collapseAllWorkspaces,
            toggleWorkspaceStatus,
            deleteWorkspace,
            superAdminUsersTab,
            dseDirectorySearch,
            dseDirectoryFilterBrand,
            dseDirectoryFilterStatus,
            dseDirectoryList,
            dseDirectoryStats,
            totalBankUsersCount,
            goToSuperAdminDirectory,
            groupedUsers,
            showEditUserModal,
            editUserForm,
            openEditUserModal,
            saveUserEdit,

            // RO 360 Inspector
            selectedRoForInspection,
            showRoInspectorDrawer,
            roInspectorActiveTab,
            openRoInspector,
            closeRoInspector,
            selectedRoAnalytics,
            generateSmNudgeWhatsApp,
            generateFileAlertWhatsApp,

            // User Profile
            profileActiveTab,
            profileForm,
            isSavingProfile,
            profileSaveSuccess,
            profileSaveError,
            initProfileForm,
            saveUserProfile,
            profileCompletion,
            isResyncingProfile,
            profileResyncSuccess,
            triggerProfileResync,

            // PWA
            deferredInstallPrompt,
            showInstallBanner,
            showIosInstallModal,
            closeIosInstallModal,
            isStandalone,
            isIos,
            installPwaApp,
            dismissInstallBanner,

            // Helpers & Formatters
            formatCurrency,
            formatLakhsToRupees,
            toLakhs,
            formatDate,
            formatDateOnly,
            formatCapitalizeName,
            getStatusBadgeClass,
            getTabTitle,
            getTimelineLabel,
            getSortLabel,
            getTodayDateStr,
            getYesterdayDateStr,

            // Spread Auth Composable
            ...auth,

            // Spread DSE Composable
            ...dse,

            // Spread Loan Files Composable
            ...loanFiles,

            // Spread Hierarchy Composable
            ...hierarchy
        };
    }
});

app.mount('#app');
