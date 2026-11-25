// js/composables/useLoanFiles.js - Loan file CRUD, status workflows, TAT/metrics, showroom inbound dispatch, and EOD reporting

import * as db from '../db.js';
import {
    STANDARD_STATUSES,
    toLakhs,
    formatCurrency,
    formatDate,
    formatDateOnly,
    getTodayDateStr,
    getYesterdayDateStr,
    isSanctionStatus,
    isDisbursedStatus,
    matchesTimeline,
    matchesFileTimeline
} from './helpers.js';

const { ref, computed, watch } = Vue;

export function useLoanFiles({
    currentUser,
    isSM = computed(() => false),
    isASM = computed(() => false),
    isRO = computed(() => false),
    defaultSmName = ref(''),
    roUsers = ref([]),
    activeRoUsers = ref([]),
    currentTab = ref(''),
    initUserSm = async () => {},
    loadData = async () => {},
    loadAsmData = async () => {},
    areaFiles = ref([]),
    supervisedSMs = ref([]),
    openOffboardModal = () => {}
} = {}) {

    // --- State ---
    const allFiles = ref([]);
    const myFiles = ref([]);

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
    const showMobileFilterDrawer = ref(false);
    const showCustomDateInput = ref(false);
    const roFilters = ref({
        search: '',
        status: '',
        nclUcl: '',
        sourcingChannel: '',
        timeline: 'this-month',
        customDate: '',
        sortBy: 'newest'
    });

    // SM Overview State
    const smOverviewTimeline = ref('this-month');
    const smOverviewCustomDate = ref('');

    // RO Overview State
    const roOverviewTimeline = ref('this-month');
    const roOverviewCustomDate = ref('');

    // --- Computed Stats ---
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

        return list.sort((a, b) => {
            const dateA = a.loginDate ? new Date(a.loginDate + 'T00:00:00') : new Date(a.createdAt || a.updatedAt);
            const dateB = b.loginDate ? new Date(b.loginDate + 'T00:00:00') : new Date(b.createdAt || b.updatedAt);
            switch (roFilters.value.sortBy) {
                case 'newest': return dateB - dateA;
                case 'oldest': return dateA - dateB;
                case 'amount-desc': return toLakhs(b.loanAmount) - toLakhs(a.loanAmount);
                case 'amount-asc': return toLakhs(a.loanAmount) - toLakhs(b.loanAmount);
                case 'name-asc': return (a.customerName || '').localeCompare(b.customerName || '');
                default: return dateB - dateA;
            }
        });
    });

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

        return list.sort((a, b) => {
            const dateA = a.loginDate ? new Date(a.loginDate + 'T00:00:00') : new Date(a.createdAt || a.updatedAt);
            const dateB = b.loginDate ? new Date(b.loginDate + 'T00:00:00') : new Date(b.createdAt || b.updatedAt);
            switch (roFilters.value.sortBy) {
                case 'newest': return dateB - dateA;
                case 'oldest': return dateA - dateB;
                case 'amount-desc': return toLakhs(b.loanAmount) - toLakhs(a.loanAmount);
                case 'amount-asc': return toLakhs(a.loanAmount) - toLakhs(b.loanAmount);
                case 'name-asc': return (a.customerName || '').localeCompare(b.customerName || '');
                default: return dateB - dateA;
            }
        });
    });

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

    // --- File CRUD Operations ---
    const resetNewFileForm = async () => {
        let uniqueAppId = 'ALA00000';
        try {
            uniqueAppId = await db.generateUniqueAppId('ALA');
        } catch (e) {}
        newFileForm.value = {
            appId: uniqueAppId,
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
        } else if (isASM.value) {
            await loadAsmData();
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
            } else if (isASM.value) {
                await loadAsmData();
            } else {
                await loadRoData();
            }
        }
    };

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

    const openViewFileModal = (file) => {
        selectedFile.value = file;
        showViewFileModal.value = true;
    };

    // Excel Exports
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
            'Login Date', 'App ID', 'Customer Name', 'Category', 'Channel',
            'Loan Amount (Rs)', 'Status', 'SM Name', 'PPC', 'VCIP', 'MI',
            'RO Name', 'Created At', 'Last Updated'
        ];

        const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "My_Login_Details");
        
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `SalesLink_Login_Details_${currentUser.value?.name || 'RO'}_${dateStr}.xlsx`;
        XLSX.writeFile(workbook, filename);
    };

    const exportToExcel = () => {
        if (isASM.value) {
            const list = areaFiles.value || [];
            if (list.length === 0) {
                alert("No area loan files to export based on current filters.");
                return;
            }
            const exportData = list.map(file => {
                const sm = (supervisedSMs.value || []).find(s => s.tenantId === file.tenantId);
                return {
                    'Branch Hub': sm ? (sm.region || sm.name) : (file.branchName || 'Branch Hub'),
                    'Sales Manager': sm ? sm.name : (file.smName || 'Branch Manager'),
                    'Relationship Officer': file.roName || '',
                    'App ID': file.appId || '',
                    'Customer Name': file.customerName || '',
                    'Category': file.nclUcl || '',
                    'Channel': file.sourcingChannel || 'DSA',
                    'Loan Amount (Rs)': Math.round(toLakhs(file.loanAmount) * 100000),
                    'Status': file.status || '',
                    'Login Date': file.loginDate || (file.createdAt ? file.createdAt.substring(0, 10) : ''),
                    'Last Updated': file.updatedAt || ''
                };
            });
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
            'Login Date', 'App ID', 'Customer Name', 'Category', 'Channel',
            'Loan Amount (Rs)', 'Status', 'SM Name', 'PPC', 'VCIP', 'MI',
            'RO Name', 'Created At', 'Last Updated'
        ];

        const worksheet = XLSX.utils.json_to_sheet(exportData, { header: headers });
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Loan Files");
        const dateStr = new Date().toISOString().split('T')[0];
        const filename = `SalesLink_Files_${currentUser.value?.region || 'Branch'}_${dateStr}.xlsx`;
        XLSX.writeFile(workbook, filename);
    };

    // --- Showroom Inbound Queue State & Operations ---
    const inboundShowroomFiles = ref([]);
    const inboundSelectedRo = ref({});
    const inboundSubmitting = ref({});
    const smInboundSubTab = ref('all');
    const smInboundSearch = ref('');
    const smInboundFilter = ref('pending');

    const loadInboundShowroomFiles = async () => {
        if (!currentUser.value?.tenantId) return;
        try {
            inboundShowroomFiles.value = await db.getInboundShowroomFilesByTenant(currentUser.value.tenantId);
        } catch (e) {
            console.warn("loadInboundShowroomFiles error:", e);
        }
    };

    const assignInboundFileToRo = async (file, roId) => {
        if (!file || !roId) return;
        const ro = (roUsers.value || []).find(u => u.id === roId);
        if (!ro) return;

        inboundSubmitting.value[file.id] = true;
        try {
            await db.assignInboundFileToRO(file.id, ro, file);
            file.roId = ro.id;
            file.roName = ro.name;
            file.allocationStatus = 'dispatched_to_ro';
            file.status = 'Login';
            file.allocatedAt = new Date().toISOString();
            
            const idx = allFiles.value.findIndex(f => f.id === file.id);
            if (idx !== -1) {
                allFiles.value[idx].roId = ro.id;
                allFiles.value[idx].roName = ro.name;
                allFiles.value[idx].allocationStatus = 'dispatched_to_ro';
                allFiles.value[idx].status = 'Login';
            }
        } catch (e) {
            console.error("assignInboundFileToRo error:", e);
            alert("Failed to allocate file: " + e.message);
        } finally {
            inboundSubmitting.value[file.id] = false;
        }
    };

    const sendRoDispatchWhatsApp = (file) => {
        const ro = (roUsers.value || []).find(u => u.id === file.roId);
        if (!ro || !ro.phone) return;
        const msg = `🚗 *New Showroom Loan Lead Assigned!*\n\n` +
            `Showroom: *${file.dealershipName || file.sourcingChannel}*\n` +
            `DSE: *${file.dseName}* (📞 ${file.dsePhone || 'N/A'})\n` +
            `Customer: *${file.customerName}* (📞 ${file.customerPhone || 'N/A'})\n` +
            `Car Model: *${file.vehicleModel || 'N/A'}*\n` +
            `Loan Amount: *₹${file.loanAmount} L*\n` +
            `Profile: *${file.customerProfile || 'Salaried'}*\n\n` +
            `Please initiate customer contact & docs pickup immediately.`;
        const cleanPhone = ro.phone.replace(/\D/g, '');
        const fullPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const smInboundStats = computed(() => {
        const list = inboundShowroomFiles.value || [];
        const total = list.length;
        const pending = list.filter(f => f.allocationStatus === 'pending_sm_dispatch').length;
        const dispatched = list.filter(f => f.allocationStatus === 'dispatched_to_ro').length;
        const sanctioned = list.filter(f => {
            const s = (f.status || '').toUpperCase();
            return s === 'SANCTION' || s === 'DISBURSED';
        }).length;
        const totalVol = list.reduce((acc, f) => acc + (toLakhs(f.loanAmount) || 0), 0);
        return {
            total,
            pending,
            dispatched,
            sanctioned,
            totalVol: totalVol.toFixed(1)
        };
    });

    const filteredInboundFiles = computed(() => {
        let list = inboundShowroomFiles.value || [];

        if (smInboundFilter.value === 'pending') {
            list = list.filter(f => f.allocationStatus === 'pending_sm_dispatch');
        } else if (smInboundFilter.value === 'dispatched') {
            list = list.filter(f => f.allocationStatus === 'dispatched_to_ro');
        } else if (smInboundFilter.value === 'sanction') {
            list = list.filter(f => {
                const s = (f.status || '').toUpperCase();
                return s === 'SANCTION' || s === 'DISBURSED';
            });
        }

        if (smInboundSearch.value) {
            const q = smInboundSearch.value.trim().toLowerCase();
            list = list.filter(f => 
                (f.customerName || '').toLowerCase().includes(q) ||
                (f.dseName || '').toLowerCase().includes(q) ||
                (f.dealershipName || '').toLowerCase().includes(q) ||
                (f.vehicleModel || '').toLowerCase().includes(q) ||
                (f.roName || '').toLowerCase().includes(q)
            );
        }

        return list.sort((a, b) => {
            const timeA = new Date(a.createdAt || 0).getTime();
            const timeB = new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });
    });

    const contactCustomerWhatsApp = (file) => {
        if (!file || !file.customerPhone) return;
        const msg = `Hi ${file.customerName}, this is ${currentUser.value?.name || 'the Sales Manager'} from ${currentUser.value?.branchName || 'the Bank'}. We received your car loan application for *${file.vehicleModel || 'your vehicle'}* from *${file.dealershipName || 'the showroom'}*. Our Relationship Officer will assist you for fast track sanction and delivery.`;
        const phoneDigits = file.customerPhone.replace(/\D/g, '');
        const targetPhone = phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits;
        window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    const contactDseWhatsApp = (file) => {
        if (!file || !file.dsePhone) return;
        const msg = `Hi ${file.dseName}, Sales Manager ${currentUser.value?.name || ''} here. We have received your car loan punch for *${file.customerName}* (${file.vehicleModel || 'Car Loan'}). We have routed it into active underwriting for priority sanction!`;
        const phoneDigits = file.dsePhone.replace(/\D/g, '');
        const targetPhone = phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits;
        window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    };

    // --- EOD Daily Reporting ---
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

        const priorEods = (myEods.value || []).filter(e => e.date && e.date.startsWith(currentMonth) && e.date < targetDate);
        priorEods.forEach(e => {
            if (!e.metrics) return;
            m.marutiLogin.count += (e.metrics.marutiLogin?.count || 0);
            m.marutiLogin.amount += (e.metrics.marutiLogin?.amount || 0);
            m.marutiDisb.count += (e.metrics.marutiDisb?.count || 0);
            m.marutiDisb.amount += (e.metrics.marutiDisb?.amount || 0);
        });

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

    const todayLoginsFiles = computed(() => {
        const today = new Date().toISOString().split('T')[0];
        return myFiles.value.filter(f => (f.createdAt && f.createdAt.startsWith(today)) || f.loginDate === today);
    });

    const todayDisbFiles = computed(() => {
        const today = new Date().toISOString().split('T')[0];
        return myFiles.value.filter(f => f.status === 'Disbursed' && ((f.updatedAt && f.updatedAt.startsWith(today)) || (f.loginDate === today)));
    });

    const roNeedsAttentionFiles = computed(() => {
        const now = new Date();
        return myFiles.value.filter(f => {
            if (f.status === 'Cancelled' || f.status === 'Rejected' || f.status === 'Disbursed') return false;
            const updatedTime = new Date(f.updatedAt || f.createdAt || Date.now());
            const diffDays = Math.floor((now - updatedTime) / (1000 * 60 * 60 * 24));
            if (f.status === 'Approved' && diffDays >= 4) return true;
            if (['Lead', 'FI', 'FCU', 'UW'].includes(f.status) && diffDays >= 3) return true;
            return false;
        });
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

    const submitEOD = async (isRevision = false) => {
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

    const smEodSummary = computed(() => {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = today.substring(0, 7);

        const todayReports = smEods.value.filter(e => e.date === today);
        const mtdReports = smEods.value.filter(e => e.date && e.date.startsWith(currentMonth));

        const sumMetrics = (reports) => {
            const totals = {
                loginCount: 0, loginAmount: 0,
                sanctionCount: 0, sanctionAmount: 0,
                disbCount: 0, disbAmount: 0,
                vicpCount: 0, miCount: 0,
                marutiLoginCount: 0, marutiLoginAmount: 0,
                marutiDisbCount: 0, marutiDisbAmount: 0
            };
            reports.forEach(r => {
                const m = r.metrics;
                if (!m) return;
                totals.loginCount += (m.loginOpenMarket?.count||0) + (m.loginBranch?.count||0) + (m.loginUsedCar?.count||0);
                totals.loginAmount += (m.loginOpenMarket?.amount||0) + (m.loginBranch?.amount||0) + (m.loginUsedCar?.amount||0);
                totals.sanctionCount += (m.sanctionOpenMarket?.count||0) + (m.loginBranchSanction?.count||0) + (m.sanctionUsedCar?.count||0);
                totals.sanctionAmount += (m.sanctionOpenMarket?.amount||0) + (m.loginBranchSanction?.amount||0) + (m.sanctionUsedCar?.amount||0);
                totals.disbCount += (m.disbOpenMarket?.count||0) + (m.disbBranch?.count||0) + (m.disbUsedCar?.count||0);
                totals.disbAmount += (m.disbOpenMarket?.amount||0) + (m.disbBranch?.amount||0) + (m.disbUsedCar?.amount||0);
                totals.vicpCount += (m.vicpCrm?.count||0);
                totals.miCount += (m.mi?.count||0);
                totals.marutiLoginCount += (m.marutiLogin?.count||0);
                totals.marutiLoginAmount += (m.marutiLogin?.amount||0);
                totals.marutiDisbCount += (m.marutiDisb?.count||0);
                totals.marutiDisbAmount += (m.marutiDisb?.amount||0);
            });
            return totals;
        };

        const ftd = sumMetrics(todayReports);
        const mtd = sumMetrics(mtdReports);

        return {
            todaySubmissions: todayReports.length,
            totalRos: (activeRoUsers.value || []).length,
            ftd,
            mtd
        };
    });

    const missingEods = computed(() => {
        const today = new Date().toISOString().split('T')[0];
        const submittedUserIds = smEods.value.filter(e => e.date === today).map(e => e.userId);
        return (activeRoUsers.value || []).filter(ro => !submittedUserIds.includes(ro.id));
    });

    const generateEodWhatsApp = () => {
        const today = new Date().toISOString().split('T')[0];
        const currentMonth = today.substring(0, 7);
        const todayReports = smEods.value.filter(e => e.date === today);

        let text = `*Daily EOD Summary - ${today}*\n\n`;
        text += `*Submissions:* ${todayReports.length}/${(activeRoUsers.value || []).length}\n\n`;

        todayReports.forEach(r => {
            const m = r.metrics || {};
            const fl = (m.loginOpenMarket?.count||0) + (m.loginBranch?.count||0) + (m.loginUsedCar?.count||0);
            const fd = (m.disbOpenMarket?.count||0) + (m.disbBranch?.count||0) + (m.disbUsedCar?.count||0);
            text += `*${r.userName}:* L: ${fl} | D: ${fd}\n`;
        });

        return encodeURIComponent(text);
    };

    // SM EOD UI Controls, Filtering & Safe Totals
    const smEodDateFilter = ref('today'); // 'today' | 'yesterday' | 'this-month' | 'all'
    const smEodRoFilter = ref('');
    const smEodSummaryMode = ref('ftd'); // 'ftd' | 'mtd'
    const expandedEodId = ref(null);

    const getEodTotals = (eod) => {
        const m = eod?.metrics || {};
        return {
            loginCount: (m.loginOpenMarket?.count || 0) + (m.loginBranch?.count || 0) + (m.loginUsedCar?.count || 0),
            loginAmount: (m.loginOpenMarket?.amount || 0) + (m.loginBranch?.amount || 0) + (m.loginUsedCar?.amount || 0),
            sancCount: (m.sanctionOpenMarket?.count || 0) + (m.loginBranchSanction?.count || 0) + (m.sanctionUsedCar?.count || 0),
            sancAmount: (m.sanctionOpenMarket?.amount || 0) + (m.loginBranchSanction?.amount || 0) + (m.sanctionUsedCar?.amount || 0),
            disbCount: (m.disbOpenMarket?.count || 0) + (m.disbBranch?.count || 0) + (m.disbUsedCar?.count || 0),
            disbAmount: (m.disbOpenMarket?.amount || 0) + (m.disbBranch?.amount || 0) + (m.disbUsedCar?.amount || 0),
            vicpCount: m.vicpCrm?.count || 0,
            miCount: m.mi?.count || 0,
            marutiLoginCount: m.marutiLogin?.count || 0,
            marutiLoginAmount: m.marutiLogin?.amount || 0,
            marutiDisbCount: m.marutiDisb?.count || 0,
            marutiDisbAmount: m.marutiDisb?.amount || 0
        };
    };

    const filteredSmEods = computed(() => {
        const today = getTodayDateStr();
        const yesterday = getYesterdayDateStr();
        const currentMonth = today.substring(0, 7);

        return (smEods.value || [])
            .filter(eod => {
                if (smEodRoFilter.value && eod.userId !== smEodRoFilter.value) return false;
                if (smEodDateFilter.value === 'today') return eod.date === today;
                if (smEodDateFilter.value === 'yesterday') return eod.date === yesterday;
                if (smEodDateFilter.value === 'this-month') return eod.date && eod.date.startsWith(currentMonth);
                return true;
            })
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
    });

    const sendEodReminderWhatsApp = (ro) => {
        if (!ro) return;
        const name = ro.name || 'Team';
        const today = getTodayDateStr();
        const msg = `Hi ${name}, please submit your Daily EOD report for *${today}* on SalesLink before wrap-up.`;
        const digits = String(ro.phone || '').replace(/\D/g, '').slice(-10);
        const url = digits.length === 10
            ? `https://wa.me/91${digits}?text=${encodeURIComponent(msg)}`
            : `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    // --- RO Personal Targets & Pacing ---
    const roTargetFiles = ref(Number(localStorage.getItem('ro_target_files') || 25));
    const roTargetVolume = ref(Number(localStorage.getItem('ro_target_volume') || 150));
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

    const roTargetPacing = computed(() => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const totalDaysInMonth = new Date(year, month + 1, 0).getDate();
        const currentDay = now.getDate();
        const daysRemaining = Math.max(1, totalDaysInMonth - currentDay);

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

        const filesRunRate = (mtdFilesCount / Math.max(1, currentDay)) * totalDaysInMonth;
        const volumeRunRate = (mtdVolumeLakhs / Math.max(1, currentDay)) * totalDaysInMonth;

        const projectedFiles = Math.round(filesRunRate);
        const projectedVolume = Number(volumeRunRate.toFixed(1));

        const requiredDailyFiles = Math.max(0, (targetFiles - mtdFilesCount) / daysRemaining);
        const requiredDailyVolume = Math.max(0, (targetVolume - mtdVolumeLakhs) / daysRemaining);

        const filesAchievementPercent = Math.min(100, Math.round((mtdFilesCount / targetFiles) * 100));
        const volumeAchievementPercent = Math.min(100, Math.round((mtdVolumeLakhs / targetVolume) * 100));

        return {
            targetFiles,
            targetVolume,
            mtdFilesCount,
            mtdVolumeLakhs: Number(mtdVolumeLakhs.toFixed(1)),
            daysRemaining,
            currentDay,
            totalDaysInMonth,
            projectedFiles,
            projectedVolume,
            requiredDailyFiles: Number(requiredDailyFiles.toFixed(1)),
            requiredDailyVolume: Number(requiredDailyVolume.toFixed(1)),
            filesAchievementPercent,
            volumeAchievementPercent
        };
    });

    // --- Sales Targets & Drives ---
    const allSalesTargets = ref([]);
    const allSalesDrives = ref([]);
    const showSetTargetModal = ref(false);
    const targetModalForm = ref({
        id: '',
        assignedToUserId: '',
        assignedToUserName: '',
        assignedToUserRole: '',
        targetFiles: 25,
        targetVolume: 150,
        targetLogins: 35,
        remarks: ''
    });
    const isSavingTarget = ref(false);
    const targetSaveSuccess = ref(false);
    const targetSaveError = ref('');

    const showNewDriveModal = ref(false);
    const driveModalForm = ref({
        title: '',
        description: '',
        targetMetric: 'volume',
        targetValue: 300,
        startDate: '',
        endDate: '',
        incentiveNote: ''
    });
    const isSavingDrive = ref(false);
    const driveSaveSuccess = ref(false);
    const driveSaveError = ref('');

    const currentMonthKey = computed(() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    });

    const smRoTargetsList = computed(() => {
        const month = currentMonthKey.value;
        const ros = activeRoUsers.value && activeRoUsers.value.length > 0 ? activeRoUsers.value : (roUsers.value || []);
        return ros.map(ro => {
            const targetDoc = allSalesTargets.value.find(t => t.assignedToUserId === ro.id && t.month === month);
            const targetFiles = targetDoc ? (Number(targetDoc.targetFiles) || 25) : 25;
            const targetVolume = targetDoc ? (Number(targetDoc.targetVolume) || 150) : 150;
            const targetLogins = targetDoc ? (Number(targetDoc.targetLogins) || 35) : 35;
            const remarks = targetDoc ? targetDoc.remarks : '';

            const normName = (ro.name || '').trim().toUpperCase();
            const roFiles = (allFiles.value || []).filter(f => {
                const matchId = f.roId === ro.id;
                const matchName = normName && f.roName && f.roName.trim().toUpperCase() === normName;
                return matchId || matchName;
            });
            const disbursedFiles = roFiles.filter(f => f.status === 'Disbursed');
            const actualFiles = disbursedFiles.length;
            const actualVolume = disbursedFiles.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            const actualLogins = roFiles.filter(f => f.status === 'FI' || f.status === 'Sanctioned' || f.status === 'Disbursed').length;

            const percentFiles = Math.min(100, Math.round((actualFiles / targetFiles) * 100));
            const percentVolume = Math.min(100, Math.round((actualVolume / targetVolume) * 100));

            let statusBadge = 'On Track';
            let statusClass = 'text-blue-700 bg-blue-50 border-blue-200';
            if (percentVolume >= 100) {
                statusBadge = 'Target Hit! 🎯';
                statusClass = 'text-emerald-700 bg-emerald-50 border-emerald-200';
            } else if (percentVolume >= 60) {
                statusBadge = 'On Track';
                statusClass = 'text-indigo-700 bg-indigo-50 border-indigo-200';
            } else {
                statusBadge = 'Needs Focus';
                statusClass = 'text-amber-700 bg-amber-50 border-amber-200';
            }

            return {
                id: ro.id,
                targetDocId: targetDoc?.id || null,
                name: ro.name,
                salesLinkId: ro.salesLinkId,
                phone: ro.phone,
                targetFiles,
                targetVolume,
                targetLogins,
                remarks,
                actualFiles,
                actualVolume,
                actualLogins,
                percentFiles,
                percentVolume,
                statusBadge,
                statusClass
            };
        });
    });

    const roOfficialTarget = computed(() => {
        if (!currentUser.value?.id) return null;
        const month = currentMonthKey.value;
        const targetDoc = allSalesTargets.value.find(t => t.assignedToUserId === currentUser.value.id && t.month === month);
        if (targetDoc) {
            return {
                isCustom: true,
                assignedByName: targetDoc.assignedByUserName || 'Branch Sales Manager',
                targetFiles: Number(targetDoc.targetFiles) || 25,
                targetVolume: Number(targetDoc.targetVolume) || 150,
                targetLogins: Number(targetDoc.targetLogins) || 35,
                remarks: targetDoc.remarks || ''
            };
        }
        return {
            isCustom: false,
            assignedByName: defaultSmName.value || 'Branch Sales Manager',
            targetFiles: roTargetFiles.value || 25,
            targetVolume: roTargetVolume.value || 150,
            targetLogins: 35,
            remarks: 'Branch Standard Target'
        };
    });

    const drivesWithProgress = computed(() => {
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        return allSalesDrives.value.map(drive => {
            const start = drive.startDate || todayStr;
            const end = drive.endDate || todayStr;

            const isEnded = todayStr > end;
            const isUpcoming = todayStr < start;
            const isActive = !isEnded && !isUpcoming;

            const endDateObj = new Date(end);
            const diffTime = endDateObj.getTime() - now.getTime();
            const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

            const pool = (allFiles.value && allFiles.value.length > 0) ? allFiles.value : (areaFiles.value || []);
            const matchingFiles = pool.filter(f => {
                const date = f.disbursalDate || f.updatedAt || f.loginDate || f.createdAt || '';
                const dateStr = String(date).split('T')[0];
                return dateStr >= start && dateStr <= end;
            });

            const metric = drive.targetMetric || 'volume';
            const targetVal = Number(drive.targetValue) || 100;
            let currentVal = 0;

            if (metric === 'volume') {
                const disbursed = matchingFiles.filter(f => f.status === 'Disbursed');
                currentVal = disbursed.reduce((sum, f) => sum + toLakhs(f.loanAmount), 0);
            } else if (metric === 'files') {
                currentVal = matchingFiles.filter(f => f.status === 'Disbursed').length;
            } else {
                currentVal = matchingFiles.length;
            }

            const percent = Math.min(100, Math.round((currentVal / targetVal) * 100));

            return {
                ...drive,
                isActive,
                isUpcoming,
                isEnded,
                daysRemaining,
                currentVal: Number(currentVal.toFixed(1)),
                targetVal,
                percent
            };
        });
    });

    const activeSalesDrivesCount = computed(() => {
        return drivesWithProgress.value.filter(d => d.isActive).length;
    });

    const openSetTargetModal = (user, defaultRole = 'ro') => {
        const month = currentMonthKey.value;
        const existing = allSalesTargets.value.find(t => t.assignedToUserId === user.id && t.month === month);
        targetModalForm.value = {
            id: existing?.id || '',
            assignedToUserId: user.id,
            assignedToUserName: user.name || 'Officer',
            assignedToUserRole: defaultRole,
            targetFiles: existing ? (Number(existing.targetFiles) || 25) : 25,
            targetVolume: existing ? (Number(existing.targetVolume) || 150) : 150,
            targetLogins: existing ? (Number(existing.targetLogins) || 35) : 35,
            remarks: existing?.remarks || ''
        };
        targetSaveError.value = '';
        targetSaveSuccess.value = false;
        showSetTargetModal.value = true;
    };

    const saveSalesTarget = async () => {
        if (!targetModalForm.value.assignedToUserId) return;
        isSavingTarget.value = true;
        targetSaveError.value = '';
        try {
            const payload = {
                assignedToUserId: targetModalForm.value.assignedToUserId,
                assignedToUserName: targetModalForm.value.assignedToUserName,
                assignedToUserRole: targetModalForm.value.assignedToUserRole,
                month: currentMonthKey.value,
                targetFiles: Number(targetModalForm.value.targetFiles) || 25,
                targetVolume: Number(targetModalForm.value.targetVolume) || 150,
                targetLogins: Number(targetModalForm.value.targetLogins) || 35,
                remarks: (targetModalForm.value.remarks || '').trim(),
                assignedByUserId: currentUser.value?.id || '',
                assignedByUserName: currentUser.value?.name || 'Manager',
                assignedByUserRole: currentUser.value?.role || 'sm',
                tenantId: currentUser.value?.tenantId || null
            };
            if (targetModalForm.value.id) {
                payload.id = targetModalForm.value.id;
            }
            const savedId = await db.saveSalesTarget(payload);
            payload.id = savedId;

            const idx = allSalesTargets.value.findIndex(t => t.assignedToUserId === payload.assignedToUserId && t.month === payload.month);
            if (idx !== -1) {
                allSalesTargets.value[idx] = payload;
            } else {
                allSalesTargets.value.push(payload);
            }

            targetSaveSuccess.value = true;
            setTimeout(() => {
                showSetTargetModal.value = false;
                targetSaveSuccess.value = false;
            }, 1200);
        } catch (err) {
            console.error("Save target error:", err);
            targetSaveError.value = err.message || 'Failed to save sales target.';
        } finally {
            isSavingTarget.value = false;
        }
    };

    const openNewDriveModal = () => {
        const today = new Date().toISOString().split('T')[0];
        const endOfMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0];
        driveModalForm.value = {
            title: '',
            description: '',
            targetMetric: 'volume',
            targetValue: 400,
            startDate: today,
            endDate: endOfMonth,
            incentiveNote: ''
        };
        driveSaveError.value = '';
        driveSaveSuccess.value = false;
        showNewDriveModal.value = true;
    };

    const saveSalesDrive = async () => {
        if (!driveModalForm.value.title.trim()) {
            driveSaveError.value = 'Sales Drive title is mandatory.';
            return;
        }
        isSavingDrive.value = true;
        driveSaveError.value = '';
        try {
            const payload = {
                title: driveModalForm.value.title.trim(),
                description: (driveModalForm.value.description || '').trim(),
                targetMetric: driveModalForm.value.targetMetric,
                targetValue: Number(driveModalForm.value.targetValue) || 100,
                startDate: driveModalForm.value.startDate,
                endDate: driveModalForm.value.endDate,
                incentiveNote: (driveModalForm.value.incentiveNote || '').trim(),
                scope: isSM.value ? 'branch' : (isASM.value ? 'area' : 'zonal'),
                createdByRole: currentUser.value?.role || 'sm',
                createdByName: currentUser.value?.name || 'Manager',
                tenantId: currentUser.value?.tenantId || null
            };
            const driveId = await db.saveSalesDrive(payload);
            payload.id = driveId;
            allSalesDrives.value.unshift(payload);

            driveSaveSuccess.value = true;
            setTimeout(() => {
                showNewDriveModal.value = false;
                driveSaveSuccess.value = false;
            }, 1200);
        } catch (err) {
            console.error("Save drive error:", err);
            driveSaveError.value = err.message || 'Failed to launch sales drive.';
        } finally {
            isSavingDrive.value = false;
        }
    };

    const deleteSalesDrive = async (id) => {
        if (!confirm("Are you sure you want to remove this sales drive?")) return;
        try {
            await db.deleteSalesDrive(id);
            allSalesDrives.value = allSalesDrives.value.filter(d => d.id !== id);
        } catch (err) {
            console.error("Delete drive error:", err);
        }
    };

    // --- Data Loaders ---
    const loadSmData = async () => {
        if (currentUser.value?.tenantId) {
            allFiles.value = await db.getLoanFilesByTenant(currentUser.value.tenantId);
            roUsers.value = await db.getROUsersByTenant(currentUser.value.tenantId);
            smEods.value = await db.getEODReportsByTenant(currentUser.value.tenantId);
        } else {
            allFiles.value = [];
            roUsers.value = [];
            smEods.value = [];
        }

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
    };

    const loadRoData = async () => {
        if (!currentUser.value) return;
        await initUserSm();
        myFiles.value = await db.getLoanFilesByRO(currentUser.value.id);
        const tenantEods = await db.getEODReportsByTenant(currentUser.value.tenantId);
        myEods.value = tenantEods.filter(e => e.userId === currentUser.value.id);
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

    return {
        // Files
        allFiles,
        myFiles,
        recentFiles,
        filteredFiles,
        filteredMyFiles,
        myRecentFiles,
        newFileForm,
        showEditFileModal,
        editFileForm,
        showUpdateStatusModal,
        selectedFile,
        statusUpdateForm,
        showViewFileModal,
        filters,
        roFilters,
        showMobileFilterDrawer,
        roOverviewTimeline,
        roOverviewCustomDate,
        smOverviewTimeline,
        smOverviewCustomDate,
        stats,
        roStats,
        smLeaderboard,
        roNeedsAttentionFiles,
        resetRoFilters,
        resetNewFileForm,
        saveNewFile,
        openEditFileModal,
        saveEditedFile,
        deleteFile,
        shareFileWhatsApp,
        shareBulkWhatsApp,
        openEditStatusModal,
        saveFileStatus,
        openViewFileModal,
        exportToExcel,
        exportRoFilesToExcel,
        navigateRoStatusFilter,
        loadSmData,
        loadRoData,

        // Showroom Inbound (P0-4)
        inboundShowroomFiles,
        inboundSelectedRo,
        inboundSubmitting,
        smInboundSubTab,
        smInboundSearch,
        smInboundFilter,
        smInboundStats,
        filteredInboundFiles,
        contactCustomerWhatsApp,
        contactDseWhatsApp,
        loadInboundShowroomFiles,
        assignInboundFileToRo,
        sendRoDispatchWhatsApp,

        // EOD
        eodForm,
        eodSubmitError,
        eodSubmitSuccess,
        submitting,
        metricsConfig,
        validateEOD,
        myEods,
        smEods,
        submitEOD,
        smEodSummary,
        missingEods,
        generateEodWhatsApp,
        generateRoWhatsApp,
        smEodDateFilter,
        smEodRoFilter,
        smEodSummaryMode,
        expandedEodId,
        filteredSmEods,
        getEodTotals,
        sendEodReminderWhatsApp,
        hasSubmittedToday,
        eodTotals,
        dealerVisitsInput,
        tomorrowLoginsInput,
        tomorrowDisbInput,
        remarksInput,
        isEditingTodayEod,
        startReviseTodayEod,
        cancelReviseTodayEod,
        showTodayFilesBreakdown,
        todayLoginsFiles,
        todayDisbFiles,
        eodSubTab,
        eodCopiedToast,
        copyRoEodToClipboard,
        eodResyncSuccess,
        triggerResyncEod,
        currentRoMtd,
        eodMtdTotals,
        getRoMtdForDate,

        // RO targets & pacing
        roTargetFiles,
        roTargetVolume,
        showEditTargetModal,
        targetInputFiles,
        targetInputVolume,
        openEditTargetModal,
        saveRoTarget,
        roTargetPacing,
        roOfficialTarget,

        // Sales Targets & Drives
        allSalesTargets,
        allSalesDrives,
        currentMonthKey,
        smRoTargetsList,
        drivesWithProgress,
        activeSalesDrivesCount,
        showSetTargetModal,
        targetModalForm,
        isSavingTarget,
        targetSaveSuccess,
        targetSaveError,
        openSetTargetModal,
        saveSalesTarget,
        showNewDriveModal,
        driveModalForm,
        isSavingDrive,
        driveSaveSuccess,
        driveSaveError,
        openNewDriveModal,
        saveSalesDrive,
        deleteSalesDrive
    };
}
