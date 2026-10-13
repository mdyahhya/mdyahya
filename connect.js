// ── connect.js — Calendly Appointment System & Secret Admin Portal ─────────

const VAPID_PUBLIC_KEY = 'BPN3I4uXoHfIr8rR9BirQFsp21iZ3bLOTv6V4mSsUV3LYOO0WuQ76yETVCWMjv3PyxmQvBGtAz2F8ZY3MrwM4Vs';

// Helper: Convert VAPID base64 to Uint8Array for PushManager
function urlB64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// ── State Management ─────────────────────────────────────────────────────────
const CalendarState = {
    currentDate: new Date(),
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(), // 0-indexed
    selectedDate: null, // 'YYYY-MM-DD'
    selectedSlot: null, // '10:00 AM'
    blockedSlots: [],   // from server
    bookedSlots: [],    // from server
    settings: {
        heroText: 'Book an Appointment',
        heroSub: '1-on-1 Strategy & Engineering Call',
        sectionSlug: 'connect',
        sectionTitle: 'Book an Appointment with Yahya Mundewadi'
    },
    adminToken: sessionStorage.getItem('yahya_admin_token') || null,
    adminPin: sessionStorage.getItem('yahya_admin_pin') || null
};

// Default hours to generate for each day
const DEFAULT_HOURS = [
    '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', 
    '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', 
    '06:00 PM', '07:00 PM', '08:00 PM'
];

// ── Initialization ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initCalendar();
    fetchSiteSettings();
    fetchAvailabilityData();
    setupDoubleTapOnAboutPhoto();
    setupPinInputs();
    checkInitialHashRoute();

    // Re-check push status if admin
    if (CalendarState.adminToken || CalendarState.adminPin) {
        checkPushSubscriptionStatus();
    }
});

// ── Deep Linking & Hash Routing ──────────────────────────────────────────────
function checkInitialHashRoute() {
    const hash = window.location.hash.toLowerCase();
    if (hash === '#connect' || hash === '#appointment') {
        showSection('connect', false);
    } else if (hash === '#admin') {
        if (CalendarState.adminToken || CalendarState.adminPin) {
            openAdminPanel();
        } else {
            openPinModal();
        }
    }
}

window.addEventListener('hashchange', () => {
    const hash = window.location.hash.toLowerCase();
    if (hash === '#connect' || hash === '#appointment') {
        showSection('connect', false);
    } else if (hash === '#admin') {
        if (CalendarState.adminToken || CalendarState.adminPin) {
            openAdminPanel();
        } else {
            openPinModal();
        }
    }
});

// ── Settings Sync ────────────────────────────────────────────────────────────
async function fetchSiteSettings() {
    try {
        const res = await fetch('/api/settings');
        if (res.ok) {
            const data = await res.json();
            const s = data.settings || {};
            if (s.hero_button && s.hero_button.text) {
                CalendarState.settings.heroText = s.hero_button.text;
                const el = document.getElementById('heroBtnTitle');
                if (el) el.textContent = s.hero_button.text;
            }
            if (s.hero_button && s.hero_button.subtext) {
                CalendarState.settings.heroSub = s.hero_button.subtext;
                const el = document.getElementById('heroBtnSub');
                if (el) el.textContent = s.hero_button.subtext;
            }
            if (s.section_config && s.section_config.title) {
                CalendarState.settings.sectionTitle = s.section_config.title;
                const el = document.getElementById('connectSectionTitle');
                if (el) el.textContent = s.section_config.title;
            }
            if (s.section_config && s.section_config.nav_title) {
                const navBtn = document.getElementById('navBtnConnect');
                if (navBtn) navBtn.textContent = s.section_config.nav_title;
                const mobBtn = document.getElementById('mobNavBtnConnect');
                if (mobBtn) mobBtn.textContent = s.section_config.nav_title;
            }
        }
    } catch (e) {
        console.log('[Settings notice]: Using local defaults');
    }
}

// ── Fetch Availability from API ──────────────────────────────────────────────
async function fetchAvailabilityData() {
    try {
        const res = await fetch('/api/availability');
        if (res.ok) {
            const data = await res.json();
            CalendarState.blockedSlots = data.blocked || [];
            CalendarState.bookedSlots = data.booked || [];
            renderCalendarMonth();
            if (CalendarState.selectedDate) {
                renderTimeSlots(CalendarState.selectedDate);
            }
        }
    } catch (e) {
        console.warn('[Availability fetch]:', e);
    }
}

// ── Calendar Rendering ───────────────────────────────────────────────────────
function initCalendar() {
    // Select today or tomorrow if late
    const today = new Date();
    CalendarState.viewYear = today.getFullYear();
    CalendarState.viewMonth = today.getMonth();
    
    // Default selection is today
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    CalendarState.selectedDate = `${yyyy}-${mm}-${dd}`;

    renderCalendarMonth();
    renderTimeSlots(CalendarState.selectedDate);

    // Month Navigation listeners
    const prevBtn = document.getElementById('calPrevMonth');
    const nextBtn = document.getElementById('calNextMonth');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            const now = new Date();
            // Don't navigate before current month
            if (CalendarState.viewYear === now.getFullYear() && CalendarState.viewMonth === now.getMonth()) {
                return;
            }
            CalendarState.viewMonth--;
            if (CalendarState.viewMonth < 0) {
                CalendarState.viewMonth = 11;
                CalendarState.viewYear--;
            }
            renderCalendarMonth();
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            CalendarState.viewMonth++;
            if (CalendarState.viewMonth > 11) {
                CalendarState.viewMonth = 0;
                CalendarState.viewYear++;
            }
            renderCalendarMonth();
        });
    }
}

function renderCalendarMonth() {
    const monthTitle = document.getElementById('calMonthTitle');
    const grid = document.getElementById('calDaysGrid');
    const prevBtn = document.getElementById('calPrevMonth');

    if (!grid) return;

    const months = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    if (monthTitle) {
        monthTitle.textContent = `${months[CalendarState.viewMonth]} ${CalendarState.viewYear}`;
    }

    // Disable prev button if in current month
    const now = new Date();
    if (prevBtn) {
        prevBtn.disabled = (CalendarState.viewYear === now.getFullYear() && CalendarState.viewMonth === now.getMonth());
    }

    grid.innerHTML = '';

    // First day of month (0 = Sun, 1 = Mon, ...)
    const firstDayIndex = new Date(CalendarState.viewYear, CalendarState.viewMonth, 1).getDay();
    // Days in current month
    const daysInMonth = new Date(CalendarState.viewYear, CalendarState.viewMonth + 1, 0).getDate();

    // Empty cells for preceding month
    for (let i = 0; i < firstDayIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-day-cell empty';
        grid.appendChild(empty);
    }

    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${CalendarState.viewYear}-${String(CalendarState.viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayCell = document.createElement('button');
        dayCell.className = 'cal-day-cell';
        dayCell.type = 'button';
        dayCell.textContent = day;

        // Check if date is in past
        const cellDate = new Date(CalendarState.viewYear, CalendarState.viewMonth, day);
        const isPast = cellDate < new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (isPast) {
            dayCell.classList.add('disabled');
            dayCell.disabled = true;
        } else {
            // Check if entire day is blocked
            const isDayBlocked = CalendarState.blockedSlots.some(b => b.slot_date === dateStr && (!b.time_slot || b.time_slot === ''));
            if (isDayBlocked) {
                dayCell.classList.add('blocked');
                dayCell.title = 'Day Unavailable';
            } else {
                // Add dot for available date
                const dot = document.createElement('span');
                dot.className = 'day-dot';
                dayCell.appendChild(dot);
            }

            if (dateStr === todayStr) {
                dayCell.classList.add('today');
            }

            if (dateStr === CalendarState.selectedDate) {
                dayCell.classList.add('selected');
            }

            dayCell.addEventListener('click', () => {
                document.querySelectorAll('.cal-day-cell').forEach(c => c.classList.remove('selected'));
                dayCell.classList.add('selected');
                CalendarState.selectedDate = dateStr;
                renderTimeSlots(dateStr);
            });
        }

        grid.appendChild(dayCell);
    }
}

function renderTimeSlots(dateStr) {
    const label = document.getElementById('slotsDateLabel');
    const container = document.getElementById('slotsList');
    if (!container) return;

    if (label) {
        const d = new Date(dateStr + 'T00:00:00');
        const formatted = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        label.textContent = formatted;
    }

    container.innerHTML = '';

    // Check if entire day is blocked
    const isDayBlocked = CalendarState.blockedSlots.some(b => b.slot_date === dateStr && (!b.time_slot || b.time_slot === ''));

    if (isDayBlocked) {
        container.innerHTML = `
            <div style="text-align: center; padding: 2.5rem 1rem; color: #94a3b8;">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-bottom:0.5rem; color:#ef4444;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                <div style="font-weight:600; color:var(--text); margin-bottom:0.25rem;">No Available Slots on this Date</div>
                <div style="font-size:0.85rem;">Yahya is unavailable on this day. Please select another date.</div>
            </div>
        `;
        return;
    }

    DEFAULT_HOURS.forEach(slot => {
        const isBlocked = CalendarState.blockedSlots.some(b => b.slot_date === dateStr && b.time_slot === slot);
        const isBooked = CalendarState.bookedSlots.some(b => b.booking_date === dateStr && b.time_slot === slot);

        const btn = document.createElement('button');
        btn.className = 'slot-btn';
        btn.type = 'button';

        if (isBlocked) {
            btn.disabled = true;
            btn.innerHTML = `<span>${slot}</span><span class="slot-status-tag" style="color:#ef4444; background:#fee2e2;">Busy</span>`;
        } else if (isBooked) {
            btn.disabled = true;
            btn.innerHTML = `<span>${slot}</span><span class="slot-status-tag">Booked</span>`;
        } else {
            btn.innerHTML = `<span>${slot}</span><span class="slot-status-tag" style="color:#059669; background:#ecfdf5;">Available</span>`;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                CalendarState.selectedSlot = slot;
                openBookingModal(dateStr, slot);
            });
        }

        container.appendChild(btn);
    });
}

// ── Booking Modal & Submission ───────────────────────────────────────────────
function openBookingModal(dateStr, slot) {
    const modal = document.getElementById('bookingModal');
    const subtitle = document.getElementById('bookingModalSlotSummary');
    if (!modal) return;

    const d = new Date(dateStr + 'T00:00:00');
    const formattedDate = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    
    if (subtitle) {
        subtitle.textContent = `${formattedDate} at ${slot} (30 mins)`;
    }

    // Reset view to form
    const formView = document.getElementById('bookingFormView');
    const successView = document.getElementById('bookingSuccessView');
    if (formView) formView.style.display = 'block';
    if (successView) successView.style.display = 'none';

    modal.classList.add('active');
}

function closeBookingModal() {
    const modal = document.getElementById('bookingModal');
    if (modal) modal.classList.remove('active');
}

async function handleBookingSubmit(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('bookingSubmitBtn');
    const nameInput = document.getElementById('bookName');
    const emailInput = document.getElementById('bookEmail');
    const phoneInput = document.getElementById('bookPhone');
    const messageInput = document.getElementById('bookMessage');

    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const message = messageInput ? messageInput.value.trim() : '';

    if (!name || !email) {
        alert('Please fill in your name and email address.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="spin-icon" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
            Confirming Booking...
        `;
    }

    const payload = {
        name,
        email,
        phone,
        message,
        booking_date: CalendarState.selectedDate,
        time_slot: CalendarState.selectedSlot
    };

    try {
        const res = await fetch('/api/book', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok && data.success) {
            // Show Success view
            const formView = document.getElementById('bookingFormView');
            const successView = document.getElementById('bookingSuccessView');
            if (formView) formView.style.display = 'none';
            if (successView) {
                successView.style.display = 'block';
                const successDetails = document.getElementById('successDetailsSummary');
                if (successDetails) {
                    successDetails.innerHTML = `
                        <strong>Date:</strong> ${CalendarState.selectedDate}<br/>
                        <strong>Time:</strong> ${CalendarState.selectedSlot}<br/>
                        <strong>Name:</strong> ${name}<br/>
                        <strong>Email:</strong> ${email}
                    `;
                }
            }

            // Refresh availability
            fetchAvailabilityData();
        } else {
            alert(data.error || 'Unable to book slot. Please try another time.');
        }
    } catch (err) {
        console.error('Booking submission error:', err);
        alert('Network error. Please try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Confirm Booking Request';
        }
    }
}

// ── Secret Admin Gesture (Double-Click / Double-Tap on About Photo) ───────────
let lastPhotoTap = 0;
function setupDoubleTapOnAboutPhoto() {
    const photo = document.getElementById('aboutSecretPhoto');
    if (!photo) return;

    // Desktop: Double Click
    photo.addEventListener('dblclick', (e) => {
        e.preventDefault();
        openPinModal();
    });

    // Mobile: Double Tap
    photo.addEventListener('touchend', (e) => {
        const currentTime = new Date().getTime();
        const tapLength = currentTime - lastPhotoTap;
        if (tapLength < 350 && tapLength > 0) {
            e.preventDefault();
            openPinModal();
        }
        lastPhotoTap = currentTime;
    });
}

// ── 6-Digit PIN Modal Logic ──────────────────────────────────────────────────
function openPinModal() {
    const modal = document.getElementById('pinModal');
    const errText = document.getElementById('pinErrorText');
    if (!modal) return;

    if (errText) errText.textContent = '';
    clearPinBoxes();
    modal.classList.add('active');

    // Auto focus first digit
    setTimeout(() => {
        const first = document.getElementById('pinDigit_0');
        if (first) first.focus();
    }, 100);
}

function closePinModal() {
    const modal = document.getElementById('pinModal');
    if (modal) modal.classList.remove('active');
    clearPinBoxes();
}

function clearPinBoxes() {
    for (let i = 0; i < 6; i++) {
        const el = document.getElementById(`pinDigit_${i}`);
        if (el) el.value = '';
    }
}

function setupPinInputs() {
    for (let i = 0; i < 6; i++) {
        const box = document.getElementById(`pinDigit_${i}`);
        if (!box) continue;

        box.addEventListener('input', (e) => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            e.target.value = val ? val[0] : '';

            if (val && i < 5) {
                const next = document.getElementById(`pinDigit_${i + 1}`);
                if (next) next.focus();
            }

            // Check if all 6 digits entered
            checkAndSubmitPin();
        });

        box.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !box.value && i > 0) {
                const prev = document.getElementById(`pinDigit_${i - 1}`);
                if (prev) {
                    prev.focus();
                    prev.value = '';
                }
            }
        });

        box.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text').replace(/[^0-9]/g, '').slice(0, 6);
            for (let j = 0; j < text.length; j++) {
                const b = document.getElementById(`pinDigit_${j}`);
                if (b) b.value = text[j];
            }
            if (text.length >= 6) {
                checkAndSubmitPin();
            } else if (text.length > 0) {
                const next = document.getElementById(`pinDigit_${text.length}`);
                if (next) next.focus();
            }
        });
    }
}

async function checkAndSubmitPin() {
    let pin = '';
    for (let i = 0; i < 6; i++) {
        const el = document.getElementById(`pinDigit_${i}`);
        if (el && el.value) pin += el.value;
    }

    if (pin.length !== 6) return;

    const errText = document.getElementById('pinErrorText');
    if (errText) errText.textContent = 'Verifying PIN...';

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            CalendarState.adminToken = data.token;
            CalendarState.adminPin = pin;
            sessionStorage.setItem('yahya_admin_token', data.token);
            sessionStorage.setItem('yahya_admin_pin', pin);

            closePinModal();
            openAdminPanel();
        } else {
            if (errText) errText.textContent = data.error || 'Incorrect 6-digit PIN';
            clearPinBoxes();
            const first = document.getElementById('pinDigit_0');
            if (first) first.focus();
        }
    } catch (err) {
        console.error('PIN verification error:', err);
        if (errText) errText.textContent = 'Server connection error. Try again.';
    }
}

// ── Admin Panel Functions ────────────────────────────────────────────────────
function openAdminPanel() {
    const overlay = document.getElementById('adminPanelOverlay');
    if (!overlay) return;

    overlay.classList.add('active');
    history.pushState({ admin: true }, '', '#admin');

    // Load initial admin data
    loadAdminBookings();
    initAdminAvailabilityPicker();
    checkPushSubscriptionStatus();
}

function closeAdminPanel() {
    const overlay = document.getElementById('adminPanelOverlay');
    if (overlay) overlay.classList.remove('active');
    history.pushState({}, '', '#connect');
}

function switchAdminTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

    const tabBtn = document.getElementById(`tabBtn_${tabName}`);
    const tabContent = document.getElementById(`tabContent_${tabName}`);

    if (tabBtn) tabBtn.classList.add('active');
    if (tabContent) tabContent.classList.add('active');

    if (tabName === 'bookings') loadAdminBookings();
    if (tabName === 'availability') renderAdminHourlyGrid();
}

// ── Admin Tab 1: Web Push Notifications ──────────────────────────────────────
async function checkPushSubscriptionStatus() {
    const statusText = document.getElementById('pushStatusBadge');
    const btn = document.getElementById('enablePushBtn');

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        if (statusText) statusText.textContent = 'Push Not Supported on this Browser';
        if (btn) btn.disabled = true;
        return;
    }

    if (Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
            if (statusText) statusText.innerHTML = '<span style="color:#10b981;">● Notifications Active on this Device</span>';
            if (btn) {
                btn.textContent = '✅ Push Notifications Active';
                btn.style.background = '#ecfdf5';
                btn.style.color = '#065f46';
            }
            return;
        }
    }

    if (statusText) statusText.innerHTML = '<span style="color:#f59e0b;">● Push Notifications Disabled</span>';
}

async function requestAndEnablePushNotifications() {
    const btn = document.getElementById('enablePushBtn');
    const statusText = document.getElementById('pushStatusBadge');

    try {
        if (btn) btn.disabled = true;
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            alert('Notification permission was denied. Please allow notifications in your browser settings.');
            checkPushSubscriptionStatus();
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();

        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        // Send subscription to serverless API
        const res = await fetch('/api/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            alert('🎉 Web Push Notifications Enabled! Yahya, you will now receive instant push alerts whenever a client books.');
            checkPushSubscriptionStatus();
        } else {
            alert(data.error || 'Failed to save push subscription on server.');
        }
    } catch (err) {
        console.error('Push registration error:', err);
        alert('Could not enable push: ' + err.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function sendTestPushNotification() {
    const btn = document.getElementById('testPushBtn');
    try {
        if (btn) btn.disabled = true;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        if (!sub) {
            alert('Please enable push notifications first.');
            return;
        }

        const res = await fetch('/api/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: sub, test: true })
        });

        const data = await res.json();
        if (res.ok) {
            alert('Test notification dispatched! Check your device notifications.');
        } else {
            alert(data.error || 'Test notification failed');
        }
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ── Admin Tab 2: Hourly Availability Manager ─────────────────────────────────
function initAdminAvailabilityPicker() {
    const dateInput = document.getElementById('adminAvailDatePicker');
    if (!dateInput) return;

    if (!dateInput.value) {
        const todayStr = new Date().toISOString().split('T')[0];
        dateInput.value = todayStr;
    }

    dateInput.addEventListener('change', () => {
        renderAdminHourlyGrid();
    });

    renderAdminHourlyGrid();
}

function renderAdminHourlyGrid() {
    const dateInput = document.getElementById('adminAvailDatePicker');
    const container = document.getElementById('adminHoursGrid');
    if (!dateInput || !container) return;

    const selectedDate = dateInput.value;
    container.innerHTML = '';

    DEFAULT_HOURS.forEach(hour => {
        const isBlocked = CalendarState.blockedSlots.some(b => b.slot_date === selectedDate && b.time_slot === hour);

        const card = document.createElement('div');
        card.className = `admin-hour-card ${isBlocked ? 'blocked' : ''}`;
        card.innerHTML = `
            <div class="admin-hour-time">${hour}</div>
            <button class="admin-hour-toggle ${isBlocked ? 'btn-busy' : 'btn-avail'}" type="button">
                ${isBlocked ? 'Busy (Blocked)' : 'Available'}
            </button>
        `;

        const btn = card.querySelector('.admin-hour-toggle');
        btn.addEventListener('click', async () => {
            await toggleSlotBlockStatus(selectedDate, hour, !isBlocked);
        });

        container.appendChild(card);
    });
}

async function toggleSlotBlockStatus(date, hour, shouldBlock) {
    try {
        const res = await fetch('/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CalendarState.adminToken || ''}`,
                'x-admin-pin': CalendarState.adminPin || ''
            },
            body: JSON.stringify({
                date,
                time_slot: hour,
                blocked: shouldBlock
            })
        });

        if (res.ok) {
            await fetchAvailabilityData();
            renderAdminHourlyGrid();
        } else {
            const data = await res.json();
            alert(data.error || 'Failed to update slot availability.');
        }
    } catch (e) {
        alert('Network error updating slot.');
    }
}

async function blockEntireSelectedDay() {
    const dateInput = document.getElementById('adminAvailDatePicker');
    if (!dateInput) return;
    const date = dateInput.value;

    if (!confirm(`Mark entire day (${date}) as Unavailable?`)) return;

    try {
        const res = await fetch('/api/availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CalendarState.adminToken || ''}`,
                'x-admin-pin': CalendarState.adminPin || ''
            },
            body: JSON.stringify({ date, time_slot: null, blocked: true })
        });

        if (res.ok) {
            await fetchAvailabilityData();
            renderAdminHourlyGrid();
            alert(`Date ${date} marked as full-day unavailable.`);
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ── Admin Tab 3: Appointments Inbox ──────────────────────────────────────────
async function loadAdminBookings() {
    const tbody = document.getElementById('adminBookingsTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;">Loading bookings...</td></tr>';

    try {
        const res = await fetch('/api/bookings', {
            headers: {
                'Authorization': `Bearer ${CalendarState.adminToken || ''}`,
                'x-admin-pin': CalendarState.adminPin || ''
            }
        });

        const data = await res.json();
        const bookings = data.bookings || [];

        if (bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:#94a3b8;">No bookings received yet.</td></tr>';
            return;
        }

        tbody.innerHTML = '';
        bookings.forEach(b => {
            const tr = document.createElement('tr');
            const cleanPhone = (b.phone || '').replace(/[^0-9]/g, '');
            const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=Hi%20${encodeURIComponent(b.name)}%2C%20regarding%20your%20appointment%20request%20with%20Yahya...` : '#';

            tr.innerHTML = `
                <td><strong>${b.booking_date}</strong><br/><span style="color:var(--text3); font-size:0.8rem;">${b.time_slot}</span></td>
                <td><strong>${b.name}</strong><br/><span style="color:var(--text3); font-size:0.8rem;">${b.email}</span></td>
                <td>${b.phone ? `<a href="${waUrl}" target="_blank" style="color:var(--accent); font-weight:600;">${b.phone}</a>` : '—'}</td>
                <td style="max-width:200px; font-size:0.82rem; color:var(--text2);">${b.message || '—'}</td>
                <td><span class="status-badge ${b.status}">${b.status}</span></td>
                <td>
                    <button class="booking-action-btn" onclick="updateBookingStatus('${b.id}', 'confirmed')">Confirm</button>
                    <button class="booking-action-btn" onclick="updateBookingStatus('${b.id}', 'completed')">Done</button>
                    <button class="booking-action-btn btn-delete" onclick="deleteBookingRecord('${b.id}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444; padding:2rem;">Failed to load bookings.</td></tr>';
    }
}

async function updateBookingStatus(id, status) {
    try {
        const res = await fetch('/api/bookings', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CalendarState.adminToken || ''}`,
                'x-admin-pin': CalendarState.adminPin || ''
            },
            body: JSON.stringify({ id, status })
        });

        if (res.ok) {
            loadAdminBookings();
        }
    } catch (e) {
        alert('Error updating status');
    }
}

async function deleteBookingRecord(id) {
    if (!confirm('Are you sure you want to delete this booking?')) return;
    try {
        const res = await fetch(`/api/bookings?id=${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${CalendarState.adminToken || ''}`,
                'x-admin-pin': CalendarState.adminPin || ''
            }
        });

        if (res.ok) {
            loadAdminBookings();
            fetchAvailabilityData();
        }
    } catch (e) {
        alert('Error deleting booking');
    }
}

// ── Admin Tab 4: Save Settings ───────────────────────────────────────────────
async function saveAdminSettings(event) {
    event.preventDefault();
    const heroText = document.getElementById('adminSettingHeroText').value;
    const heroSub = document.getElementById('adminSettingHeroSub').value;
    const navTitle = document.getElementById('adminSettingNavTitle').value;
    const sectionTitle = document.getElementById('adminSettingSectionTitle').value;

    try {
        // Save hero button
        await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CalendarState.adminToken || ''}`,
                'x-admin-pin': CalendarState.adminPin || ''
            },
            body: JSON.stringify({
                key: 'hero_button',
                value: { text: heroText, subtext: heroSub }
            })
        });

        // Save section title
        await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CalendarState.adminToken || ''}`,
                'x-admin-pin': CalendarState.adminPin || ''
            },
            body: JSON.stringify({
                key: 'section_config',
                value: { slug: 'connect', title: sectionTitle, nav_title: navTitle }
            })
        });

        alert('Settings saved successfully!');
        fetchSiteSettings();
    } catch (e) {
        alert('Failed to save settings: ' + e.message);
    }
}
