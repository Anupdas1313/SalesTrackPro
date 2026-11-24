// js/composables/helpers.js - Shared helper functions and status definitions for SalesLink

export const STANDARD_STATUSES = ['Lead', 'FI', 'FCU', 'UW', 'Sanction', 'Approved', 'Rejected', 'Disbursed', 'Cancelled'];

export const getTodayDateStr = () => {
    return new Date().toISOString().split('T')[0];
};

export const getYesterdayDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
};

export const toLakhs = (value) => {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    if (isNaN(num)) return 0;
    // Auto-normalize legacy entries stored in full rupees (>= 1000)
    return num >= 1000 ? num / 100000 : num;
};

export const formatCurrency = (value) => {
    const lakhs = toLakhs(value);
    return lakhs.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' L';
};

export const formatLakhsToRupees = (value) => {
    const lakhs = toLakhs(value);
    if (!lakhs) return '₹0';
    const rupees = Math.round(lakhs * 100000);
    return '₹' + rupees.toLocaleString('en-IN');
};

export const formatDateOnly = (dateStr) => {
    if (!dateStr) return '';
    if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString('en-IN');
};

export const formatDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN') + ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

export const formatCapitalizeName = (str) => {
    if (!str) return '';
    return str.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};

export const getStatusBadgeClass = (status) => {
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

export const getTabTitle = (tab) => {
    switch (tab) {
        case 'dse-dashboard': return 'Showroom Delivery Radar';
        case 'sm-inbound': return 'Showroom Inflow Queue';
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
        case 'targets-drives': return 'Sales Targets & Drives';
        case 'profile': return 'My Profile & Account';
        case 'settings': return 'Settings & Preferences';
        case 'more': return 'More Options';
        default: return tab ? tab.replace('-', ' ') : '';
    }
};

export const getTimelineLabel = (timeline, customDate) => {
    switch (timeline) {
        case 'today': return 'Today';
        case 'yesterday': return 'Yesterday';
        case 'this-week': return 'This Week';
        case 'this-month': return 'This Month';
        case 'custom': return customDate ? `Date: ${customDate}` : 'Custom Date';
        case 'all': return 'All Time';
        default: return 'All Time';
    }
};

export const getSortLabel = (sortBy) => {
    switch (sortBy) {
        case 'oldest': return 'Oldest First';
        case 'amount-desc': return 'Amount: High to Low';
        case 'amount-asc': return 'Amount: Low to High';
        case 'name-asc': return 'Name: A to Z';
        default: return 'Newest First';
    }
};

export const isSanctionStatus = (status) => {
    if (!status) return false;
    const s = String(status).trim().toLowerCase();
    return s === 'approved' || s === 'sanction' || s === 'sanctioned';
};

export const isDisbursedStatus = (status) => {
    if (!status) return false;
    const s = String(status).trim().toLowerCase();
    return s === 'disbursed';
};

export const matchesTimeline = (fileDateStr, timeline, customDate) => {
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

export const matchesFileTimeline = (f, timeline, customDate) => {
    if (!f) return false;
    if (timeline === 'all') return true;
    if (f.loginDate && matchesTimeline(f.loginDate, timeline, customDate)) return true;
    if (f.updatedAt && matchesTimeline(f.updatedAt, timeline, customDate)) return true;
    if (f.createdAt && matchesTimeline(f.createdAt, timeline, customDate)) return true;
    return false;
};
