// js/composables/useHierarchy.js - Supervisor linking, invitations, ASM/ZSM multi-level operations, and employee offboarding

import * as db from '../db.js';
import { 
    toLakhs, 
    formatCurrency, 
    getTodayDateStr, 
    isSanctionStatus, 
    isDisbursedStatus, 
    matchesTimeline, 
    STANDARD_STATUSES 
} from './helpers.js';

const { ref, computed } = Vue;

export function useHierarchy({
    currentUser,
    allFiles = ref([]),
    activeRoUsers = ref([]),
    allSalesTargets = ref([]),
    loadData = async () => {}
} = {}) {

    // --- SalesLink Identity & Invitation Handshake State ---
    const copiedSalesLinkIdToast = ref(false);
    let copyToastTimer = null;
    const copySalesLinkId = async (id, event) => {
        if (event && event.stopPropagation) event.stopPropagation();
        const targetId = id || currentUser.value?.salesLinkId;
        if (!targetId || targetId === 'Syncing...' || targetId.includes('...')) return;
        try {
            await navigator.clipboard.writeText(targetId);
            copiedSalesLinkIdToast.value = true;
            if (copyToastTimer) clearTimeout(copyToastTimer);
            copyToastTimer = setTimeout(() => { copiedSalesLinkIdToast.value = false; }, 2500);
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

    // --- SM Self-Connect to Supervisor State & Handlers ---
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
            const supervisor = await db.linkSmToSupervisor(currentUser.value.id, val, connectSupervisorMethod.value);
            connectedSupervisorData.value = supervisor;

            // Update local user state
            currentUser.value.supervisorId = supervisor.id;
            currentUser.value.supervisorName = supervisor.name;
            currentUser.value.supervisorRole = supervisor.role || 'asm';
            currentUser.value.supervisorSalesLinkId = supervisor.salesLinkId || '';
            localStorage.setItem('axis_user', JSON.stringify(currentUser.value));

            connectSupervisorSuccess.value = `✓ Successfully connected to Area Sales Manager "${supervisor.name}" (${supervisor.region || 'Area Jurisdiction'})!`;
            await loadData();
            setTimeout(() => {
                if (showConnectSupervisorModal.value && !connectSupervisorError.value) {
                    showConnectSupervisorModal.value = false;
                    resetConnectSupervisorModal();
                }
            }, 2500);
        } catch (err) {
            console.error('Error connecting supervisor:', err);
            const msg = err.message || 'Failed to connect supervisor.';
            if (msg.startsWith('Role Conflict:')) {
                connectSupervisorWarning.value = msg.replace(/^Role Conflict:\s*/, '');
            } else {
                connectSupervisorError.value = msg;
            }
        } finally {
            isConnectingSupervisor.value = false;
        }
    };

    const openAsmWhatsAppNotify = (asm) => {
        if (!asm?.phone) return;
        const cleanPhone = asm.phone.replace(/\D/g, '').slice(-10);
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
    const asmFilters = ref({
        search: '',
        status: '',
        hubId: 'All',
        timeline: 'all',
        customDate: '',
        nclUcl: '',
        sourcingChannel: '',
        sortBy: 'newest',
        showMenu: false
    });

    const asmHubFilter = computed({
        get: () => asmFilters.value.hubId,
        set: (val) => { asmFilters.value.hubId = val; }
    });
    const asmSearchQuery = computed({
        get: () => asmFilters.value.search,
        set: (val) => { asmFilters.value.search = val; }
    });
    const asmStatusFilter = computed({
        get: () => asmFilters.value.status,
        set: (val) => { asmFilters.value.status = val; }
    });
    const asmTimelineFilter = computed({
        get: () => asmFilters.value.timeline,
        set: (val) => { asmFilters.value.timeline = val; }
    });
    const asmCategoryFilter = computed({
        get: () => asmFilters.value.nclUcl,
        set: (val) => { asmFilters.value.nclUcl = val; }
    });
    const asmChannelFilter = computed({
        get: () => asmFilters.value.sourcingChannel,
        set: (val) => { asmFilters.value.sourcingChannel = val; }
    });
    const asmSortBy = computed({
        get: () => asmFilters.value.sortBy,
        set: (val) => { asmFilters.value.sortBy = val; }
    });

    const resetAsmFilters = () => {
        asmFilters.value = {
            search: '',
            status: '',
            hubId: 'All',
            timeline: 'all',
            customDate: '',
            nclUcl: '',
            sourcingChannel: '',
            sortBy: 'newest',
            showMenu: false
        };
    };

    // Dynamic SM Connector State
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

            if (foundUser) {
                linkedManagerDetails.value = foundUser;

                if (foundUser.role !== 'sm' && foundUser.role !== 'admin') {
                    connectSmError.value = `This user (${foundUser.name || val}) has role "${foundUser.role}". Only Branch Sales Managers (SM) can be connected under an Area.`;
                    return;
                }

                if (foundUser.supervisorId && foundUser.supervisorId !== currentUser.value.id) {
                    const supName = foundUser.supervisorName || 'another Area Sales Manager';
                    inviteWarning.value = `This ${methodLabel} (${val}) is already linked to Sales Manager "${foundUser.name || 'Manager'}" (${foundUser.region || 'Branch Hub'}) who is currently reporting to ${supName}. They must be disconnected from their current supervisor before they can join your Area.`;
                    return;
                }

                if (foundUser.supervisorId === currentUser.value.id) {
                    inviteWarning.value = `Sales Manager "${foundUser.name}" (${foundUser.region || 'Branch Hub'}) is already connected under your Area Cluster.`;
                    return;
                }

                await db.directConnectSupervisorToSm(currentUser.value, foundUser.id);
                connectSmSuccess.value = `✓ Connected! Sales Manager "${foundUser.name}" (${foundUser.region || 'Branch Hub'}) has been successfully attached to your Area Cluster.`;
                await loadAsmData();
                setTimeout(() => {
                    showInviteSmModal.value = false;
                    resetInviteModal();
                }, 2500);
                return;
            }

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
        const target = sm || linkedManagerDetails.value;
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

            try {
                const smList = await db.getUsersByRole('sm');
                allRegisteredSMs.value = smList.filter(u => u.id !== currentUser.value.id);
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
        if (asmFilters.value.hubId && asmFilters.value.hubId !== 'All') {
            list = list.filter(f => f.tenantId === asmFilters.value.hubId);
        }

        // 2. Status Stage Filter
        if (asmFilters.value.status && asmFilters.value.status !== 'All') {
            const s = asmFilters.value.status.toLowerCase();
            if (['approved', 'sanction', 'sanctioned'].includes(s)) {
                list = list.filter(f => isSanctionStatus(f.status));
            } else if (s === 'logged' || s === 'lead') {
                list = list.filter(f => (f.status || '').toLowerCase() === 'logged' || (f.status || '').toLowerCase() === 'lead');
            } else if (s === 'rejected' || s === 'cancelled') {
                list = list.filter(f => (f.status || '').toLowerCase() === 'rejected' || (f.status || '').toLowerCase() === 'cancelled');
            } else if (asmFilters.value.status === 'Custom') {
                list = list.filter(f => !STANDARD_STATUSES.includes(f.status));
            } else {
                list = list.filter(f => (f.status || '').toLowerCase() === s);
            }
        }

        // 3. Search Query
        if (asmFilters.value.search) {
            const q = asmFilters.value.search.trim().toLowerCase();
            list = list.filter(f => 
                (f.customerName || '').toLowerCase().includes(q) ||
                (f.appId || '').toLowerCase().includes(q) ||
                (f.roName || '').toLowerCase().includes(q) ||
                (f.smDisplayName || '').toLowerCase().includes(q) ||
                (f.hubName || '').toLowerCase().includes(q) ||
                (f.sourcingChannel || '').toLowerCase().includes(q) ||
                (f.nclUcl || '').toLowerCase().includes(q) ||
                (f.vehicleModel || '').toLowerCase().includes(q)
            );
        }

        // 4. Timeline Filter
        if (asmFilters.value.timeline && asmFilters.value.timeline !== 'all') {
            list = list.filter(f => matchesTimeline(f.loginDate || f.createdAt || f.updatedAt, asmFilters.value.timeline, asmFilters.value.customDate));
        }

        // 5. Category Filter
        if (asmFilters.value.nclUcl && asmFilters.value.nclUcl !== 'All') {
            list = list.filter(f => (f.nclUcl || '').toUpperCase() === asmFilters.value.nclUcl.toUpperCase());
        }

        // 6. Channel Filter
        if (asmFilters.value.sourcingChannel && asmFilters.value.sourcingChannel !== 'All') {
            list = list.filter(f => (f.sourcingChannel || '').toLowerCase() === asmFilters.value.sourcingChannel.toLowerCase());
        }

        // 7. Sort
        return list.sort((a, b) => {
            const dateA = a.loginDate ? new Date(a.loginDate + 'T00:00:00') : new Date(a.createdAt || a.updatedAt || 0);
            const dateB = b.loginDate ? new Date(b.loginDate + 'T00:00:00') : new Date(b.createdAt || b.updatedAt || 0);
            switch (asmFilters.value.sortBy) {
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

    const currentMonthKey = computed(() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    });

    // Targets for ASM & ZSM
    const asmSmTargetsList = computed(() => {
        const month = currentMonthKey.value;
        const sms = supervisedSMs.value || [];
        return sms.map(sm => {
            const targetDoc = allSalesTargets.value.find(t => t.assignedToUserId === sm.id && t.month === month);
            const targetVolume = targetDoc ? (Number(targetDoc.targetVolume) || 450) : 450;
            const targetFiles = targetDoc ? (Number(targetDoc.targetFiles) || 75) : 75;
            const remarks = targetDoc ? targetDoc.remarks : '';

            const branchFiles = (areaFiles.value || []).filter(f => f.tenantId === sm.tenantId);
            const disbursed = branchFiles.filter(f => f.status === 'Disbursed');
            const actualFiles = disbursed.length;
            const actualVolume = disbursed.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const percentVolume = Math.min(100, Math.round((actualVolume / targetVolume) * 100));

            let statusBadge = 'On Track';
            let statusClass = 'text-blue-700 bg-blue-50 border-blue-200';
            if (percentVolume >= 100) {
                statusBadge = 'Exceeded 🏆';
                statusClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
            } else if (percentVolume < 50) {
                statusBadge = 'Lagging';
                statusClass = 'text-amber-700 bg-amber-50 border-amber-200';
            }

            return {
                id: sm.id,
                targetDocId: targetDoc?.id || null,
                name: sm.name,
                region: sm.region,
                salesLinkId: sm.salesLinkId,
                targetVolume,
                targetFiles,
                remarks,
                actualFiles,
                actualVolume,
                percentVolume,
                statusBadge,
                statusClass
            };
        });
    });

    const zsmAsmTargetsList = computed(() => {
        const month = currentMonthKey.value;
        const asms = supervisedASMs.value || [];
        return asms.map(asm => {
            const targetDoc = allSalesTargets.value.find(t => t.assignedToUserId === asm.id && t.month === month);
            const targetVolume = targetDoc ? (Number(targetDoc.targetVolume) || 1200) : 1200;
            const targetFiles = targetDoc ? (Number(targetDoc.targetFiles) || 200) : 200;
            const remarks = targetDoc ? targetDoc.remarks : '';

            let actualVolume = 0;
            let actualFiles = 0;
            (asm.supervisedSMs || []).forEach(sm => {
                const smFiles = (areaFiles.value || []).filter(f => f.tenantId === sm.tenantId && f.status === 'Disbursed');
                actualFiles += smFiles.length;
                actualVolume += smFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            });
            const percentVolume = Math.min(100, Math.round((actualVolume / targetVolume) * 100));

            return {
                id: asm.id,
                targetDocId: targetDoc?.id || null,
                name: asm.name,
                region: asm.region,
                salesLinkId: asm.salesLinkId,
                targetVolume,
                targetFiles,
                remarks,
                actualFiles,
                actualVolume,
                percentVolume
            };
        });
    });

    const zsmStats = computed(() => {
        const asms = supervisedASMs.value || [];
        let totalDisbVol = 0;
        let totalDisbCount = 0;
        let totalTargetVol = 0;
        let totalHubs = 0;

        (zsmAsmTargetsList.value || []).forEach(item => {
            totalDisbVol += (item.actualVolume || 0);
            totalDisbCount += (item.actualFiles || 0);
            totalTargetVol += (item.targetVolume || 0);
        });

        asms.forEach(asm => {
            totalHubs += (asm.supervisedSMs || []).length;
        });

        const overallPercent = totalTargetVol > 0 ? Math.min(100, Math.round((totalDisbVol / totalTargetVol) * 100)) : 0;

        return {
            totalAreas: asms.length,
            totalHubs,
            totalDisbVol,
            totalDisbCount,
            totalTargetVol,
            overallPercent
        };
    });

    const openInviteAsmModal = () => {
        inviteAsmError.value = '';
        inviteAsmSuccess.value = '';
        inviteAsmForm.value = { email: '', salesLinkId: '', territoryName: '' };
        showInviteAsmModal.value = true;
    };

    const releaseAsm = async (asm) => {
        if (!confirm(`Are you sure you want to disconnect Area Sales Manager "${asm.name}" from your Zonal supervision?`)) return;
        try {
            await db.unlinkUserFromSupervisor(asm.id);
            supervisedASMs.value = supervisedASMs.value.filter(a => a.id !== asm.id);
        } catch (e) {
            alert('Failed to disconnect ASM: ' + e.message);
        }
    };

    // --- Employee Resignation & Pipeline Handoff State (P1-4) ---
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

    // Supervisor chat helpers
    const assignedSm = ref({ name: '', phone: '', email: '', salesLinkId: '' });

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

    return {
        // SalesLink ID & Invitations
        copiedSalesLinkIdToast,
        copySalesLinkId,
        pendingInvitations,
        isRespondingInvite,
        acceptSupervisorInvite,
        declineSupervisorInvite,
        unlinkFromSupervisor,

        // Supervisor self connect
        showConnectSupervisorModal,
        connectSupervisorMethod,
        connectSupervisorInput,
        connectSupervisorWarning,
        isConnectingSupervisor,
        connectSupervisorError,
        connectSupervisorSuccess,
        connectedSupervisorData,
        onConnectSupervisorMethodChange,
        resetConnectSupervisorModal,
        openConnectSupervisorModal,
        submitConnectSupervisor,
        openAsmWhatsAppNotify,

        // ASM
        supervisedSMs,
        areaFiles,
        areaEods,
        areaInvitations,
        showInviteSmModal,
        inviteSmForm,
        inviteSmError,
        inviteSmSuccess,
        isInvitingSm,
        selectedSmDrilldown,
        asmFilters,
        asmHubFilter,
        asmSearchQuery,
        asmStatusFilter,
        asmTimelineFilter,
        asmCategoryFilter,
        asmChannelFilter,
        asmSortBy,
        resetAsmFilters,
        allRegisteredSMs,
        inviteMethod,
        inviteInputValue,
        inviteWarning,
        linkedManagerDetails,
        isSubmittingInvite,
        connectSmError,
        connectSmSuccess,
        onInviteMethodChange,
        resetInviteModal,
        openConnectSmModal,
        submitInviteSm,
        openSmWhatsAppNotify,
        loadAsmData,
        sendSmInvitation,
        cancelInvitation,
        releaseSm,
        asmStats,
        smPerformanceList,
        asmSmDistribution,
        asmStatusCounts,
        filteredAreaFiles,
        sendFileAlertToSm,

        // ZSM
        supervisedASMs,
        zsmInvitations,
        showInviteAsmModal,
        inviteAsmForm,
        inviteAsmError,
        inviteAsmSuccess,
        isInvitingAsm,
        selectedAsmDrilldown,
        loadZsmData,
        sendAsmInvitation,
        zsmStats,
        openInviteAsmModal,
        releaseAsm,

        // Targets for ASM & ZSM
        asmSmTargetsList,
        zsmAsmTargetsList,

        // Offboarding (P1-4)
        showOffboardModal,
        userToOffboard,
        offboardReplacementRoId,
        offboardReason,
        offboardConfirm,
        isOffboarding,
        offboardError,
        offboardSuccess,
        availableReplacementRos,
        offboardCandidateFiles,
        offboardActiveFiles,
        offboardDisbursedFiles,
        offboardActiveFilesVolume,
        openOffboardModal,
        submitOffboardUser,

        // Supervisor links
        assignedSm,
        openRoWhatsAppChat,
        openSmWhatsAppChat
    };
}
