// js/composables/useDse.js - Dealership Sales Executive (DSE) & Showroom QR Public Intake Module

import * as db from '../db.js';
import { toLakhs, formatCurrency, getTodayDateStr } from './helpers.js';

const { ref, computed } = Vue;

export function useDse({
    currentUser,
    allWorkspaces = ref([]),
    generateSessionId = () => ('sess_' + Math.random().toString(36).substring(2, 9)),
    startUserSecurityListener = () => {},
    currentTab = ref('login')
} = {}) {

    // --- State & Operations from App ---
    const copiedSalesLinkIdToast = ref(false);

        const dseFiles = ref([]);
        const isDseFileModalOpen = ref(false);
        const isSubmittingDseFile = ref(false);
        const dseFileError = ref('');
        const dseFilterStatus = ref('all');
        const dseSearchQuery = ref('');
        const newDseFileForm = ref({
            customerName: '',
            customerPhone: '',
            vehicleModel: '',
            onRoadPrice: '',
            loanAmount: '',
            targetTenantId: '',
            customerProfile: 'Salaried (Form 16 / ITR)',
            notes: ''
        });
        const dseTrackingFilter = ref('all'); // 'all' | 'sanction' | 'in_progress' | 'pending_ro' | 'disbursed'
        const dseTrackingSearch = ref('');
        const showDseInspectorDrawer = ref(false);
        const selectedDseFile = ref(null);
        const showDseQrModal = ref(false);

        const openDseInspector = (file) => {
            selectedDseFile.value = file;
            showDseInspectorDrawer.value = true;
        };
        const closeDseInspector = () => {
            showDseInspectorDrawer.value = false;
            selectedDseFile.value = null;
        };

        const openDseQrModal = () => {
            showDseQrModal.value = true;
        };
        const closeDseQrModal = () => {
            showDseQrModal.value = false;
        };
        const showroomBrandOptions = [
            'Maruti Suzuki Arena',
            'Maruti Suzuki Nexa',
            'Hyundai Motor India',
            'Tata Motors Passenger Vehicles',
            'Mahindra & Mahindra',
            'Kia India',
            'Toyota Kirloskar',
            'Honda Cars India',
            'MG Motor India',
            'Skoda Auto',
            'Volkswagen India',
            'Renault India',
            'Nissan India',
            'Other Multi-Brand / Luxury'
        ];

        const dseStats = computed(() => {
            const list = dseFiles.value || [];
            const total = list.length;
            const inProgress = list.filter(f => {
                const s = (f.status || '').toUpperCase();
                return f.allocationStatus === 'pending_sm_dispatch' || s === 'INBOUND' || s === 'LOGIN' || s === 'FI';
            }).length;
            const sanctioned = list.filter(f => (f.status || '').toUpperCase() === 'SANCTION').length;
            const disbursed = list.filter(f => (f.status || '').toUpperCase() === 'DISBURSED').length;
            const sanctionedVol = list.filter(f => (f.status || '').toUpperCase() === 'SANCTION').reduce((acc, f) => acc + (toLakhs(f.loanAmount) || 0), 0);
            const disbursedVol = list.filter(f => (f.status || '').toUpperCase() === 'DISBURSED').reduce((acc, f) => acc + (toLakhs(f.loanAmount) || 0), 0);
            return {
                total,
                inProgress,
                sanctioned,
                sanctionedVol,
                disbursed,
                disbursedVol
            };
        });

        const filteredDseFiles = computed(() => {
            let list = dseFiles.value || [];
            const q = (dseSearchQuery.value || '').trim().toLowerCase();
            if (q) {
                list = list.filter(f => 
                    (f.customerName || '').toLowerCase().includes(q) ||
                    (f.customerPhone || '').includes(q) ||
                    (f.vehicleModel || '').toLowerCase().includes(q) ||
                    (f.targetBankName || '').toLowerCase().includes(q) ||
                    (f.roName || '').toLowerCase().includes(q)
                );
            }
            if (dseFilterStatus.value === 'in_progress') {
                list = list.filter(f => {
                    const s = (f.status || '').toUpperCase();
                    return f.allocationStatus === 'pending_sm_dispatch' || s === 'INBOUND' || s === 'LOGIN' || s === 'FI';
                });
            } else if (dseFilterStatus.value === 'sanction') {
                list = list.filter(f => (f.status || '').toUpperCase() === 'SANCTION');
            } else if (dseFilterStatus.value === 'disbursed') {
                list = list.filter(f => (f.status || '').toUpperCase() === 'DISBURSED');
            }
            return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        });

        const getDseDeliveryStage = (file) => {
            if (!file) return { stageIndex: 1, stageName: 'Punch Submitted', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', isReady: false, isDelivered: false };
            const s = (file.status || '').toUpperCase();
            if (s === 'DISBURSED') {
                return { stageIndex: 5, stageName: 'Delivered & Disbursed', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200', isReady: true, isDelivered: true };
            }
            if (s === 'SANCTION') {
                return { stageIndex: 4, stageName: 'Sanctioned & DO Released', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200', isReady: true, isDelivered: false };
            }
            if (s === 'REJECTED' || s === 'CANCELLED') {
                return { stageIndex: 0, stageName: 'Declined / Re-route Bank', badgeClass: 'bg-rose-100 text-rose-800 border-rose-200', isReady: false, isDelivered: false };
            }
            if (file.roName && file.roName !== 'Pending SM Dispatch') {
                return { stageIndex: 3, stageName: 'Bank Credit Review', badgeClass: 'bg-indigo-100 text-[#4F46E5] border-indigo-200', isReady: false, isDelivered: false };
            }
            if (file.allocationStatus === 'pending_sm_dispatch') {
                return { stageIndex: 1, stageName: 'Punch Received at Hub', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200', isReady: false, isDelivered: false };
            }
            return { stageIndex: 2, stageName: 'Bank RO Assigned', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200', isReady: false, isDelivered: false };
        };

        const filteredDseTrackingFiles = computed(() => {
            let list = dseFiles.value || [];
            const q = (dseTrackingSearch.value || '').trim().toLowerCase();
            if (q) {
                list = list.filter(f => 
                    (f.customerName || '').toLowerCase().includes(q) ||
                    (f.customerPhone || '').includes(q) ||
                    (f.vehicleModel || '').toLowerCase().includes(q) ||
                    (f.appId || '').toLowerCase().includes(q) ||
                    (f.targetBankName || '').toLowerCase().includes(q) ||
                    (f.roName || '').toLowerCase().includes(q)
                );
            }
            const filter = dseTrackingFilter.value;
            if (filter === 'sanction') {
                list = list.filter(f => (f.status || '').toUpperCase() === 'SANCTION');
            } else if (filter === 'in_progress') {
                list = list.filter(f => {
                    const s = (f.status || '').toUpperCase();
                    return s !== 'SANCTION' && s !== 'DISBURSED' && s !== 'REJECTED' && s !== 'CANCELLED' && f.allocationStatus !== 'pending_sm_dispatch';
                });
            } else if (filter === 'pending_ro') {
                list = list.filter(f => f.allocationStatus === 'pending_sm_dispatch' || !f.roName || f.roName === 'Pending SM Dispatch');
            } else if (filter === 'disbursed') {
                list = list.filter(f => (f.status || '').toUpperCase() === 'DISBURSED');
            }
            return [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        });

        const dsePersonalApplyUrl = computed(() => {
            if (!currentUser.value) return window.location.origin;
            const params = new URLSearchParams();
            const tenantId = currentUser.value.tenantId || '';
            if (tenantId) params.set('apply', tenantId);
            if (currentUser.value.dealershipName) params.set('dealer', currentUser.value.dealershipName);
            if (currentUser.value.showroomBrand) params.set('brand', currentUser.value.showroomBrand);
            if (currentUser.value.name) params.set('dse', currentUser.value.name);
            if (currentUser.value.phone) params.set('dsePhone', currentUser.value.phone);
            if (currentUser.value.salesLinkId) params.set('dseId', currentUser.value.salesLinkId);
            return `${window.location.origin}/?${params.toString()}`;
        });

        const copyDsePersonalApplyLink = async () => {
            const url = dsePersonalApplyUrl.value;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = url;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                copiedSalesLinkIdToast.value = true;
                setTimeout(() => { copiedSalesLinkIdToast.value = false; }, 2500);
            } catch (e) {
                alert("Showroom Apply Link copied: " + url);
            }
        };

        const shareDsePersonalWhatsApp = () => {
            const url = dsePersonalApplyUrl.value;
            const brand = currentUser.value?.showroomBrand || 'Car Showroom';
            const dealership = currentUser.value?.dealershipName || 'Our Showroom';
            const dseName = currentUser.value?.name || 'Sales Consultant';
            const msg = `Dear Customer,\n\n` +
                `Welcome to *${dealership}* (${brand})!\n\n` +
                `Please use my official showroom digital loan desk to check car loan eligibility and get instant bank sanction approvals:\n\n` +
                `📲 *Apply Online / Punch Loan:* ${url}\n\n` +
                `We will track your sanction live and fast-track your car delivery!\n\n` +
                `Regards,\n*${dseName}*\nSales Consultant, ${dealership}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        };

        const getDseStatusInfo = (file) => {
            if (!file) return { label: 'Submitted', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200', icon: 'fas fa-clock', title: 'Submitted' };
            const status = (file.status || '').toUpperCase();
            if (status === 'DISBURSED') {
                return {
                    label: 'Delivered',
                    title: 'Car Delivered & Financed',
                    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200',
                    pillClass: 'bg-purple-100 text-purple-800',
                    icon: 'fas fa-car-side',
                    borderClass: 'border-purple-200 hover:border-purple-300',
                    bannerClass: 'bg-purple-50/80 border-purple-200 text-purple-900',
                    bannerText: 'Car Delivered & Disbursed'
                };
            }
            if (status === 'SANCTION') {
                return {
                    label: 'Approved',
                    title: 'Loan Approved — Ready for Car Delivery!',
                    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    pillClass: 'bg-emerald-100 text-emerald-800',
                    icon: 'fas fa-check-circle',
                    borderClass: 'border-emerald-300 ring-1 ring-emerald-500/20 hover:border-emerald-400',
                    bannerClass: 'bg-emerald-50/90 border-emerald-200 text-emerald-900',
                    bannerText: 'Loan Approved — Cleared for Delivery'
                };
            }
            if (file.allocationStatus === 'pending_sm_dispatch') {
                return {
                    label: 'Submitted',
                    title: 'Awaiting Bank Officer Assignment',
                    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
                    pillClass: 'bg-amber-100 text-amber-800',
                    icon: 'fas fa-paper-plane',
                    borderClass: 'border-amber-200 hover:border-amber-300',
                    bannerClass: 'bg-amber-50/80 border-amber-200 text-amber-900',
                    bannerText: 'Submitted to Bank Hub — Assigning RO'
                };
            }
            return {
                label: 'In Progress',
                title: 'Bank Verification in Progress',
                badgeClass: 'bg-indigo-50 text-[#4F46E5] border-indigo-200',
                pillClass: 'bg-indigo-100 text-indigo-800',
                icon: 'fas fa-arrows-rotate',
                borderClass: 'border-indigo-200 hover:border-indigo-300',
                bannerClass: 'bg-indigo-50/80 border-indigo-200 text-indigo-900',
                bannerText: file.roName && file.roName !== 'Pending SM Dispatch'
                    ? `Processing with ${file.roName} (${file.targetBankName || 'Bank'})`
                    : `In Bank Verification (${file.targetBankName || 'Bank'})`
            };
        };

        const getRelativeTime = (isoString) => {
            if (!isoString) return '';
            try {
                const date = new Date(isoString);
                const now = new Date();
                const diffMs = now - date;
                const diffMins = Math.floor(diffMs / (1000 * 60));
                const diffHours = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHours / 24);

                if (diffMins < 2) return 'Just now';
                if (diffMins < 60) return `${diffMins}m ago`;
                if (diffHours < 24) return `${diffHours}h ago`;
                if (diffDays === 1) return 'Yesterday';
                if (diffDays < 7) return `${diffDays}d ago`;
                return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
            } catch (e) {
                return '';
            }
        };

        const sendCustomerLoanUpdateWhatsApp = (file) => {
            if (!file || !file.customerPhone) return;
            const statusUpper = (file.status || '').toUpperCase();
            let msg = '';
            if (statusUpper === 'SANCTION') {
                msg = `Hi ${file.customerName}, great news from ${currentUser.value?.dealershipName || 'our showroom'}! 🎉 Your car loan of ₹${file.sanctionAmount || file.loanAmount} Lakhs for ${file.vehicleModel} has been APPROVED by ${file.targetBankName || 'the bank'}. We are getting your car ready for delivery!`;
            } else if (statusUpper === 'DISBURSED') {
                msg = `Congratulations ${file.customerName}! 🚗 Your car loan for ${file.vehicleModel} is disbursed and car delivery is confirmed. Thank you for choosing ${currentUser.value?.dealershipName || 'us'}!`;
            } else {
                msg = `Hi ${file.customerName}, this is ${currentUser.value?.name || 'your Sales Executive'} from ${currentUser.value?.dealershipName || 'the dealership'}. Your car loan application for ${file.vehicleModel} with ${file.targetBankName || 'our partner bank'} is currently in progress. We will keep you updated!`;
            }
            const phoneDigits = file.customerPhone.replace(/\D/g, '');
            const targetPhone = phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits;
            window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        const sendDseRoNudgeWhatsApp = (file) => {
            if (!file) return;
            const msg = `Hi ${file.roName || 'Officer'}, checking update for car loan of *${file.customerName}* (${file.vehicleModel}) punched from *${currentUser.value?.dealershipName || 'our showroom'}*. Could you please share the latest sanction / delivery status? Thanks!`;
            const phone = file.roPhone || file.assignedRoPhone || '';
            const phoneDigits = phone ? phone.replace(/\D/g, '') : '';
            const targetPhone = phoneDigits.length === 10 ? '91' + phoneDigits : phoneDigits;
            if (targetPhone) {
                window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
            } else {
                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
            }
        };

        // --- Showroom QR & Public Apply Ecosystem ---
        const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const initialApplyParam = searchParams ? (searchParams.get('apply') || searchParams.get('hub') || searchParams.get('ref')) : null;

        const isPublicApplyMode = ref(!!initialApplyParam);
        const publicApplyWorkspace = ref(initialApplyParam ? {
            id: initialApplyParam,
            bankName: searchParams.get('bank') || 'Axis Bank',
            name: searchParams.get('hub') || 'Branch Hub',
            managerName: searchParams.get('sm') || 'Sales Manager',
            managerPhone: searchParams.get('phone') || searchParams.get('p') || '',
            salesLinkId: searchParams.get('smId') || ''
        } : null);
        const publicApplySmUser = ref(null);
        const isResolvingPublicHub = ref(false);
        const publicHubError = ref('');
        const showSmQrStandeeModal = ref(false);

        const publicApplyForm = ref({
            dealershipName: searchParams ? (searchParams.get('dealer') || searchParams.get('dealership') || '') : '',
            showroomBrand: searchParams ? (searchParams.get('brand') || 'Maruti Suzuki Arena') : 'Maruti Suzuki Arena',
            dseName: searchParams ? (searchParams.get('dse') || searchParams.get('executive') || '') : '',
            dsePhone: searchParams ? (searchParams.get('dsePhone') || searchParams.get('dp') || '') : '',
            customerName: '',
            customerPhone: '',
            vehicleModel: '',
            onRoadPrice: '',
            loanAmount: '',
            customerProfile: 'Salaried (Form 16 / ITR)',
            notes: ''
        });
        const isSubmittingPublicApply = ref(false);
        const publicApplyError = ref('');
        const publicApplySubmitted = ref(false);
        const publicApplySuccessFile = ref(null);

        // Showroom Consultant Account Onboarding
        const showDseAccountPromptModal = ref(false);
        const showDseQuickRegisterModal = ref(false);
        const dseQuickRegisterForm = ref({
            showroomBrand: 'Maruti Suzuki Arena',
            dealershipName: '',
            name: '',
            employeeCode: '',
            region: '',
            phone: ''
        });
        const isDseRegistering = ref(false);
        const dseRegisterError = ref('');

        const openDseRegisterFromApply = () => {
            dseRegisterError.value = '';
            dseQuickRegisterForm.value = {
                showroomBrand: publicApplyForm.value.showroomBrand || 'Maruti Suzuki Arena',
                dealershipName: publicApplyForm.value.dealershipName || '',
                name: publicApplyForm.value.dseName || '',
                employeeCode: '',
                region: publicApplyWorkspace.value?.name || '',
                phone: publicApplyForm.value.dsePhone || ''
            };
            showDseAccountPromptModal.value = false;
            showDseQuickRegisterModal.value = true;
        };

        const loginDseFromApply = async () => {
            dseRegisterError.value = '';
            try {
                const googleUser = await db.loginWithGoogle();
                const email = googleUser.email.toLowerCase();
                let existing = await db.getUserByEmail(email);
                if (existing) {
                    if (existing.status === 'resigned' || existing.status === 'suspended') {
                        alert("Your account has been deactivated. Please contact your manager.");
                        return;
                    }
                    if (existing.role !== 'dse') {
                        if (!existing.dealershipName) {
                            openDseRegisterFromApply();
                            return;
                        }
                        existing.role = 'dse';
                        await db.updateUser(existing.id, { role: 'dse' });
                    }
                    const newSessionId = generateSessionId();
                    localStorage.setItem('axis_active_session_id', newSessionId);
                    existing.activeSessionId = newSessionId;
                    try {
                        await db.updateUser(existing.id, { lastLoginAt: new Date().toISOString() });
                    } catch (e) {}

                    localStorage.setItem('axis_user', JSON.stringify(existing));
                    currentUser.value = existing;
                    startUserSecurityListener(existing.id);
                    isPublicApplyMode.value = false;
                    currentTab.value = 'dse-dashboard';
                    if (window.history && window.history.replaceState) {
                        window.history.replaceState({}, document.title, window.location.pathname);
                    }
                    await loadDseData();
                } else {
                    openDseRegisterFromApply();
                }
            } catch (err) {
                console.warn("DSE sign in error:", err);
            }
        };

        const proceedDseAccountRegistration = () => {
            openDseRegisterFromApply();
        };

        const submitDseQuickRegistration = async () => {
            if (isDseRegistering.value) return;
            dseRegisterError.value = '';

            const form = dseQuickRegisterForm.value;
            if (!form.dealershipName?.trim()) {
                dseRegisterError.value = 'Dealership / Showroom Name is mandatory.';
                return;
            }
            if (!form.name?.trim()) {
                dseRegisterError.value = 'Sales Consultant Full Name is mandatory.';
                return;
            }
            if (!form.employeeCode?.trim()) {
                dseRegisterError.value = 'Official Staff / Employee ID is mandatory.';
                return;
            }
            if (!form.phone || form.phone.replace(/\D/g, '').length < 10) {
                dseRegisterError.value = 'Please provide a valid 10-digit mobile number.';
                return;
            }

            isDseRegistering.value = true;
            try {
                const googleUser = await db.loginWithGoogle();
                const email = googleUser.email.toLowerCase();
                let user = await db.getUserByEmail(email);

                const newSalesLinkId = db.generateSalesLinkId('dse');
                const tenantId = publicApplyWorkspace.value?.id || null;
                const newSessionId = generateSessionId();
                localStorage.setItem('axis_active_session_id', newSessionId);

                if (!user) {
                    const newUserId = await db.addUser({
                        email: email,
                        role: 'dse',
                        name: form.name.trim(),
                        dealershipName: form.dealershipName.trim(),
                        showroomBrand: form.showroomBrand || 'Maruti Suzuki Arena',
                        employeeCode: form.employeeCode.trim().toUpperCase(),
                        region: form.region?.trim() || publicApplyWorkspace.value?.name || 'Branch Hub',
                        phone: form.phone.trim(),
                        salesLinkId: newSalesLinkId,
                        tenantId: null, // DSE belongs to Showroom, not bank branch!
                        linkedBankTenantId: tenantId,
                        designation: 'Dealership Sales Executive (DSE)',
                        status: 'active',
                        activeSessionId: newSessionId,
                        createdAt: new Date().toISOString(),
                        lastLoginAt: new Date().toISOString()
                    });

                    user = {
                        id: newUserId || email,
                        email: email,
                        username: form.name.trim(),
                        role: 'dse',
                        name: form.name.trim(),
                        dealershipName: form.dealershipName.trim(),
                        showroomBrand: form.showroomBrand || 'Maruti Suzuki Arena',
                        employeeCode: form.employeeCode.trim().toUpperCase(),
                        region: form.region?.trim() || publicApplyWorkspace.value?.name || 'Branch Hub',
                        phone: form.phone.trim(),
                        salesLinkId: newSalesLinkId,
                        tenantId: null,
                        linkedBankTenantId: tenantId,
                        designation: 'Dealership Sales Executive (DSE)',
                        status: 'active',
                        activeSessionId: newSessionId
                    };
                } else {
                    // Upgrading / linking existing user account to DSE Showroom Partner
                    const updatePayload = {
                        role: 'dse',
                        name: form.name.trim() || user.name || googleUser.displayName || 'Showroom Consultant',
                        dealershipName: form.dealershipName.trim(),
                        showroomBrand: form.showroomBrand || user.showroomBrand || 'Maruti Suzuki Arena',
                        employeeCode: form.employeeCode.trim().toUpperCase() || user.employeeCode || '',
                        region: form.region?.trim() || user.region || publicApplyWorkspace.value?.name || 'Branch Hub',
                        phone: form.phone.trim() || user.phone || '',
                        tenantId: null, // Clear bank tenantId so DSE never lands inside SM workspace!
                        linkedBankTenantId: tenantId || user.linkedBankTenantId || user.tenantId || null,
                        designation: 'Dealership Sales Executive (DSE)',
                        status: 'active',
                        activeSessionId: newSessionId,
                        lastLoginAt: new Date().toISOString()
                    };
                    if (!user.salesLinkId) {
                        updatePayload.salesLinkId = newSalesLinkId;
                    }
                    await db.updateUser(user.id, updatePayload);
                    user = {
                        ...user,
                        ...updatePayload,
                        salesLinkId: user.salesLinkId || newSalesLinkId
                    };
                }

                localStorage.setItem('axis_user', JSON.stringify(user));
                currentUser.value = user;
                startUserSecurityListener(user.id);

                // If customer details were filled in publicApplyForm, automatically punch the lead under this DSE!
                const custName = publicApplyForm.value.customerName?.trim();
                const custPhone = publicApplyForm.value.customerPhone?.trim();
                const vehModel = publicApplyForm.value.vehicleModel?.trim();
                const loanAmt = Number(publicApplyForm.value.loanAmount);

                if (custName && custPhone && vehModel && loanAmt > 0) {
                    const createdAtIso = new Date().toISOString();
                    const randId = await db.generateUniqueAppId('QR');
                    const ws = publicApplyWorkspace.value || {};
                    const newFile = {
                        appId: randId,
                        customerName: custName.toUpperCase(),
                        customerPhone: custPhone,
                        vehicleModel: vehModel.toUpperCase(),
                        onRoadPrice: Number(publicApplyForm.value.onRoadPrice) || 0,
                        loanAmount: loanAmt,
                        customerProfile: publicApplyForm.value.customerProfile || 'Salaried (Form 16 / ITR)',
                        notes: (publicApplyForm.value.notes || '').trim(),
                        nclUcl: 'NCL',
                        userId: user.id,
                        userEmail: user.email,
                        sourcingChannel: user.dealershipName || form.dealershipName.trim(),
                        dealershipName: user.dealershipName || form.dealershipName.trim(),
                        showroomBrand: user.showroomBrand || form.showroomBrand || 'Maruti Suzuki Arena',
                        dseId: user.id,
                        dseName: user.name,
                        dsePhone: user.phone,
                        loginDate: createdAtIso.split('T')[0],
                        origin: 'showroom_qr',
                        tenantId: user.tenantId || ws.id,
                        targetBankName: ws.bankName || 'Axis Bank',
                        targetHubName: ws.name || 'Branch Hub',
                        smName: ws.managerName || (publicApplySmUser.value?.name || 'Branch SM'),
                        allocationStatus: 'pending_sm_dispatch',
                        status: 'Inbound',
                        roId: null,
                        roName: 'Pending SM Dispatch',
                        createdAt: createdAtIso,
                        updatedAt: createdAtIso
                    };

                    try {
                        await db.addLoanFile(newFile);
                    } catch (e) {
                        console.warn("Could not write file immediately:", e);
                    }
                    publicApplySuccessFile.value = newFile;
                }

                showDseQuickRegisterModal.value = false;
                showDseAccountPromptModal.value = false;
                isPublicApplyMode.value = false;
                currentTab.value = 'dse-dashboard';
                if (window.history && window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
                await loadDseData();

                alert(`🎉 DSE Account Activated!\n\nWelcome, ${user.name}! Your showroom desk is connected to ${publicApplyWorkspace.value?.bankName || 'Axis Bank'} (${publicApplyWorkspace.value?.name || 'Branch Hub'}).\n\nAll customer loan sanctions & delivery statuses are live in your Showroom Radar.`);
            } catch (err) {
                console.error("DSE quick registration error:", err);
                dseRegisterError.value = err.message || 'Error signing in with Google.';
            } finally {
                isDseRegistering.value = false;
            }
        };

        const smPublicApplyUrl = computed(() => {
            const tenantId = currentUser.value?.tenantId || currentUser.value?.salesLinkId || '';
            if (!tenantId) return window.location.origin;
            const params = new URLSearchParams();
            params.set('apply', tenantId);
            if (currentUser.value?.bankName) params.set('bank', currentUser.value.bankName);
            if (currentUser.value?.region) params.set('hub', currentUser.value.region);
            if (currentUser.value?.name) params.set('sm', currentUser.value.name);
            if (currentUser.value?.phone) params.set('phone', currentUser.value.phone);
            if (currentUser.value?.salesLinkId) params.set('smId', currentUser.value.salesLinkId);
            return `${window.location.origin}/?${params.toString()}`;
        });

        const copySmApplyLink = async () => {
            const url = smPublicApplyUrl.value;
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(url);
                } else {
                    const ta = document.createElement('textarea');
                    ta.value = url;
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                }
                copiedSalesLinkIdToast.value = true;
                setTimeout(() => { copiedSalesLinkIdToast.value = false; }, 2500);
            } catch (e) {
                alert("Apply link copied: " + url);
            }
        };

        const shareSmApplyWhatsApp = () => {
            const url = smPublicApplyUrl.value;
            const bank = currentUser.value?.bankName || 'Axis Bank';
            const hub = currentUser.value?.region || 'Branch Hub';
            const msg = `Dear Car Showroom Partners,\n\n` +
                `Please use our official *${bank} (${hub})* showroom digital car loan desk to submit customer inquiries directly to our branch credit team for spot sanctions:\n\n` +
                `📲 *Apply Online / Punch File:* ${url}\n\n` +
                `Every customer file is tracked live by our branch desk.\n\n` +
                `Regards,\n*${currentUser.value?.name || 'Sales Manager'}*\nSales Manager, ${bank}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
        };

        const loadDseData = async () => {
            if (!currentUser.value?.id) return;
            try {
                dseFiles.value = await db.getLoanFilesByDSE(currentUser.value.id);
                allWorkspaces.value = await db.getActiveWorkspaces();
                if (!newDseFileForm.value.targetTenantId && allWorkspaces.value.length > 0) {
                    newDseFileForm.value.targetTenantId = allWorkspaces.value[0].id;
                }
            } catch (e) {
                console.warn("loadDseData error:", e);
            }
        };

        const openDseFileModal = async () => {
            dseFileError.value = '';
            if (allWorkspaces.value.length === 0) {
                try {
                    allWorkspaces.value = await db.getActiveWorkspaces();
                } catch(e) {}
            }
            newDseFileForm.value = {
                customerName: '',
                customerPhone: '',
                vehicleModel: '',
                onRoadPrice: '',
                loanAmount: '',
                targetTenantId: allWorkspaces.value.length > 0 ? allWorkspaces.value[0].id : '',
                customerProfile: 'Salaried (Form 16 / ITR)',
                notes: ''
            };
            isDseFileModalOpen.value = true;
        };

        const closeDseFileModal = () => {
            isDseFileModalOpen.value = false;
            dseFileError.value = '';
        };

        const submitDseLoanFile = async () => {
            if (isSubmittingDseFile.value) return;
            dseFileError.value = '';

            const custName = newDseFileForm.value.customerName?.trim();
            const custPhone = newDseFileForm.value.customerPhone?.trim();
            const vehModel = newDseFileForm.value.vehicleModel?.trim();
            const loanAmt = Number(newDseFileForm.value.loanAmount);
            const targetTenantId = newDseFileForm.value.targetTenantId;

            if (!custName) {
                dseFileError.value = 'Customer Name is mandatory.';
                return;
            }
            if (!custPhone || custPhone.replace(/\D/g, '').length < 10) {
                dseFileError.value = 'Please provide a valid 10-digit customer mobile number.';
                return;
            }
            if (!vehModel) {
                dseFileError.value = 'Vehicle Model & Variant is mandatory.';
                return;
            }
            if (!loanAmt || loanAmt <= 0) {
                dseFileError.value = 'Loan Amount requested is mandatory (e.g. 7.50 L).';
                return;
            }
            if (!targetTenantId) {
                dseFileError.value = 'Please select a target Lending Partner & Branch Hub.';
                return;
            }

            const selectedHub = allWorkspaces.value.find(w => w.id === targetTenantId) || {
                id: targetTenantId,
                name: 'Selected Branch Hub',
                bankName: 'Axis Bank',
                managerName: 'Branch SM'
            };

            isSubmittingDseFile.value = true;
            try {
                const createdAtIso = new Date().toISOString();
                const randId = await db.generateUniqueAppId('DLR');
                const newFile = {
                    appId: randId,
                    customerName: custName.toUpperCase(),
                    customerPhone: custPhone,
                    vehicleModel: vehModel.toUpperCase(),
                    onRoadPrice: Number(newDseFileForm.value.onRoadPrice) || 0,
                    loanAmount: loanAmt,
                    customerProfile: newDseFileForm.value.customerProfile || 'Salaried (Form 16 / ITR)',
                    notes: (newDseFileForm.value.notes || '').trim(),
                    nclUcl: 'NCL',
                    sourcingChannel: currentUser.value.showroomBrand || 'DEALER',
                    loginDate: createdAtIso.split('T')[0],
                    origin: 'dealer_portal',
                    dealershipName: currentUser.value.dealershipName || '',
                    showroomBrand: currentUser.value.showroomBrand || '',
                    dseId: currentUser.value.id,
                    dseName: currentUser.value.name,
                    dsePhone: currentUser.value.phone || '',
                    dseEmployeeCode: currentUser.value.employeeCode || '',
                    tenantId: selectedHub.id,
                    targetBankName: selectedHub.bankName || 'Axis Bank',
                    targetHubName: selectedHub.name,
                    smName: selectedHub.managerName || 'Branch SM',
                    allocationStatus: 'pending_sm_dispatch',
                    status: 'Inbound',
                    roId: null,
                    roName: 'Pending SM Dispatch',
                    createdAt: createdAtIso,
                    updatedAt: createdAtIso
                };

                await db.addLoanFile(newFile);
                isDseFileModalOpen.value = false;
                await loadDseData();
            } catch (e) {
                console.error("submitDseLoanFile error:", e);
                dseFileError.value = e.message || 'Error submitting loan file.';
            } finally {
                isSubmittingDseFile.value = false;
            }
        };

        const initPublicApplyHub = async (hubKey) => {
            if (!hubKey) return;
            isResolvingPublicHub.value = true;
            publicHubError.value = '';
            try {
                let ws = null;
                try {
                    ws = await db.getWorkspace(hubKey);
                    if (!ws) {
                        ws = await db.getWorkspaceBySalesLinkId(hubKey);
                    }
                    if (!ws) {
                        const smUser = await db.getUserBySalesLinkId(hubKey) || await db.getUserById(hubKey);
                        if (smUser) {
                            publicApplySmUser.value = smUser;
                            if (smUser.tenantId) {
                                ws = await db.getWorkspace(smUser.tenantId);
                            } else {
                                ws = {
                                    id: smUser.tenantId || smUser.id,
                                    name: smUser.region || `${smUser.name}'s Branch Hub`,
                                    bankName: smUser.bankName || 'Axis Bank',
                                    managerName: smUser.name,
                                    managerPhone: smUser.phone || '',
                                    division: smUser.division || 'Auto Loans (Car Loans)'
                                };
                            }
                        }
                    }
                } catch (fsErr) {
                    console.debug("Public guest mode: Using URL parameters for hub metadata");
                }

                if (ws) {
                    publicApplyWorkspace.value = {
                        ...(publicApplyWorkspace.value || {}),
                        ...ws,
                        bankName: ws.bankName || publicApplyWorkspace.value?.bankName || 'Axis Bank',
                        name: ws.name || publicApplyWorkspace.value?.name || 'Branch Hub',
                        managerName: ws.managerName || publicApplyWorkspace.value?.managerName || 'Sales Manager',
                        managerPhone: ws.managerPhone || publicApplyWorkspace.value?.managerPhone || ''
                    };
                }
                isPublicApplyMode.value = true;
            } catch (e) {
                console.warn("initPublicApplyHub notice:", e);
            } finally {
                isResolvingPublicHub.value = false;
            }
        };

        const submitPublicLoanApplication = async () => {
            if (isSubmittingPublicApply.value) return;
            publicApplyError.value = '';

            const custName = publicApplyForm.value.customerName?.trim();
            const custPhone = publicApplyForm.value.customerPhone?.trim();
            const vehModel = publicApplyForm.value.vehicleModel?.trim();
            const loanAmt = Number(publicApplyForm.value.loanAmount);

            if (!custName) {
                publicApplyError.value = 'Customer Name is mandatory.';
                return;
            }
            if (!custPhone || custPhone.replace(/\D/g, '').length < 10) {
                publicApplyError.value = 'Please provide a valid 10-digit customer mobile number.';
                return;
            }
            if (!vehModel) {
                publicApplyError.value = 'Car Model & Variant is mandatory (e.g. Brezza ZXi+ / Creta SX).';
                return;
            }
            if (!loanAmt || loanAmt <= 0) {
                publicApplyError.value = 'Please enter a valid Loan Amount requested (₹ Lakhs).';
                return;
            }

            if (!publicApplyWorkspace.value?.id) {
                publicApplyError.value = 'Branch hub reference missing. Please refresh the page.';
                return;
            }

            // If not logged in, ask the DSE to create an account for live tracking before submission
            if (!currentUser.value) {
                showDseAccountPromptModal.value = true;
                return;
            }

            await executePublicFileSubmission();
        };

        const confirmGuestSubmission = async () => {
            showDseAccountPromptModal.value = false;
            await executePublicFileSubmission();
        };

        const executePublicFileSubmission = async () => {
            isSubmittingPublicApply.value = true;
            publicApplyError.value = '';
            try {
                const createdAtIso = new Date().toISOString();
                const randId = await db.generateUniqueAppId('QR');
                const ws = publicApplyWorkspace.value || {};
                const user = currentUser.value;
                const newFile = {
                    appId: randId,
                    customerName: publicApplyForm.value.customerName?.trim().toUpperCase(),
                    customerPhone: publicApplyForm.value.customerPhone?.trim(),
                    vehicleModel: publicApplyForm.value.vehicleModel?.trim().toUpperCase(),
                    onRoadPrice: Number(publicApplyForm.value.onRoadPrice) || 0,
                    loanAmount: Number(publicApplyForm.value.loanAmount),
                    customerProfile: publicApplyForm.value.customerProfile || 'Salaried (Form 16 / ITR)',
                    notes: (publicApplyForm.value.notes || '').trim(),
                    nclUcl: 'NCL',
                    userId: user?.id || null,
                    userEmail: user?.email || null,
                    sourcingChannel: (user?.dealershipName || publicApplyForm.value.dealershipName || 'SHOWROOM_QR').trim(),
                    dealershipName: (user?.dealershipName || publicApplyForm.value.dealershipName || '').trim(),
                    showroomBrand: (user?.showroomBrand || publicApplyForm.value.showroomBrand || 'Car Showroom Partner').trim(),
                    dseId: user?.id || null,
                    dseName: (user?.name || publicApplyForm.value.dseName || '').trim(),
                    dsePhone: (user?.phone || publicApplyForm.value.dsePhone || '').trim(),
                    loginDate: createdAtIso.split('T')[0],
                    origin: 'showroom_qr',
                    tenantId: ws.id || 'default-tenant',
                    targetBankName: ws.bankName || 'Axis Bank',
                    targetHubName: ws.name || 'Branch Hub',
                    smName: ws.managerName || (publicApplySmUser.value?.name || 'Branch SM'),
                    allocationStatus: 'pending_sm_dispatch',
                    status: 'Inbound',
                    roId: null,
                    roName: 'Pending SM Dispatch',
                    createdAt: createdAtIso,
                    updatedAt: createdAtIso
                };

                let leadSaved = false;
                // If user is authenticated, attempt direct loanFiles write
                if (db.auth?.currentUser) {
                    try {
                        await db.addLoanFile(newFile);
                        leadSaved = true;
                    } catch (fsErr) {
                        console.debug("Direct write restricted, falling back to public leads intake:", fsErr);
                    }
                }

                // If not saved via direct write, route to public leads intake
                if (!leadSaved) {
                    try {
                        await db.addPublicLead(newFile);
                        leadSaved = true;
                    } catch (intakeErr) {
                        console.error("Public intake error:", intakeErr);
                        const fallbackPhone = ws.managerPhone ? ` (Branch Manager: ${ws.managerPhone})` : '';
                        throw new Error(`Submission Failed: Unable to deliver customer lead to ${ws.name || 'Branch Hub'}${fallbackPhone}. Please verify connection and retry, or contact the branch directly.`);
                    }
                }

                publicApplySuccessFile.value = newFile;
                publicApplySubmitted.value = true;
            } catch (e) {
                console.error("submitPublicLoanApplication error:", e);
                publicApplyError.value = e.message || 'Error submitting application.';
                publicApplySubmitted.value = false;
            } finally {
                isSubmittingPublicApply.value = false;
            }
        };

        const resetPublicApplyForm = () => {
            publicApplyForm.value = {
                dealershipName: publicApplyForm.value.dealershipName || '',
                showroomBrand: publicApplyForm.value.showroomBrand || 'Maruti Suzuki Arena',
                dseName: publicApplyForm.value.dseName || '',
                dsePhone: publicApplyForm.value.dsePhone || '',
                customerName: '',
                customerPhone: '',
                vehicleModel: '',
                onRoadPrice: '',
                loanAmount: '',
                customerProfile: 'Salaried (Form 16 / ITR)',
                notes: ''
            };
            publicApplySubmitted.value = false;
            publicApplySuccessFile.value = null;
            publicApplyError.value = '';
        };

        const sendPublicApplySmWhatsApp = () => {
            if (!publicApplySuccessFile.value || !publicApplyWorkspace.value) return;
            const file = publicApplySuccessFile.value;
            const ws = publicApplyWorkspace.value;

            // Generate 1-tap import link for SM
            const importPayload = {
                appId: file.appId,
                customerName: file.customerName,
                customerPhone: file.customerPhone,
                vehicleModel: file.vehicleModel,
                loanAmount: file.loanAmount,
                onRoadPrice: file.onRoadPrice,
                dealershipName: file.dealershipName,
                showroomBrand: file.showroomBrand,
                dseName: file.dseName,
                dsePhone: file.dsePhone,
                notes: file.notes,
                customerProfile: file.customerProfile,
                tenantId: ws.id,
                origin: 'showroom_qr',
                allocationStatus: 'pending_sm_dispatch',
                status: 'Inbound',
                createdAt: file.createdAt
            };
            const importEncoded = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(importPayload)))));
            const importLink = `${window.location.origin}/?importLead=${importEncoded}`;

            const msg = `Hi ${ws.managerName || 'Sales Manager'}, a new car loan inquiry has been submitted via your Showroom QR!\n\n` +
                `👤 Customer: *${file.customerName}* (📞 ${file.customerPhone})\n` +
                `🚗 Car: *${file.vehicleModel}*\n` +
                `💰 Loan Req: *₹${file.loanAmount} Lakhs*` + (file.onRoadPrice ? ` (On-Road: ₹${file.onRoadPrice} L)` : '') + `\n` +
                (file.dealershipName ? `🏢 Dealership: *${file.dealershipName}*\n` : '') +
                (file.dseName ? `👨‍💼 Showroom Exec: *${file.dseName}* (📞 ${file.dsePhone || 'N/A'})\n` : '') +
                (file.notes ? `📝 Remarks: "${file.notes}"\n` : '') +
                `\n📥 *1-Tap Import to Inbound Radar:*\n${importLink}`;
            
            const smPhone = ws.managerPhone || publicApplySmUser.value?.phone || '';
            const smPhoneDigits = smPhone.replace(/\D/g, '').slice(-10);
            const targetUrl = smPhoneDigits.length === 10 
                ? `https://wa.me/91${smPhoneDigits}?text=${encodeURIComponent(msg)}`
                : `https://wa.me/?text=${encodeURIComponent(msg)}`;
            window.open(targetUrl, '_blank');
        };

    return {
        // DSE State
        dseFiles,
        isDseFileModalOpen,
        isSubmittingDseFile,
        dseFileError,
        dseFilterStatus,
        dseSearchQuery,
        newDseFileForm,
        showroomBrandOptions,
        dseStats,
        filteredDseFiles,
        getDseStatusInfo,
        getRelativeTime,
        sendCustomerLoanUpdateWhatsApp,
        sendDseRoNudgeWhatsApp,
        dseTrackingFilter,
        dseTrackingSearch,
        showDseInspectorDrawer,
        selectedDseFile,
        showDseQrModal,
        openDseInspector,
        closeDseInspector,
        openDseQrModal,
        closeDseQrModal,
        dsePersonalApplyUrl,
        copyDsePersonalApplyLink,
        shareDsePersonalWhatsApp,
        getDseDeliveryStage,
        filteredDseTrackingFiles,
        openDseFileModal,
        closeDseFileModal,
        submitDseLoanFile,
        loadDseData,

        // Public QR Intake & Apply
        isPublicApplyMode,
        publicApplyWorkspace,
        publicApplySmUser,
        isResolvingPublicHub,
        publicHubError,
        showSmQrStandeeModal,
        publicApplyForm,
        isSubmittingPublicApply,
        publicApplyError,
        publicApplySubmitted,
        publicApplySuccessFile,
        smPublicApplyUrl,
        copySmApplyLink,
        shareSmApplyWhatsApp,
        submitPublicLoanApplication,
        resetPublicApplyForm,
        sendPublicApplySmWhatsApp,
        confirmGuestSubmission,
        initPublicApplyHub,

        // Quick Onboarding
        showDseAccountPromptModal,
        showDseQuickRegisterModal,
        dseQuickRegisterForm,
        isDseRegistering,
        dseRegisterError,
        openDseRegisterFromApply,
        loginDseFromApply,
        proceedDseAccountRegistration,
        submitDseQuickRegistration
    };
}
