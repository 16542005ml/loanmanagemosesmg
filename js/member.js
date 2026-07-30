window.__API_BASE__ = 'https://new-lm-pages.onrender.com/api';
/**
 * ==========================================================================
 * DATA STRUCTURE INITIALIZER MATRIX & STATE STORAGE
 * ==========================================================================
 */
const API_BASE_URL = window.__API_BASE__ || '/api'; 
const STORAGE_KEYS = {
    SESSION: 'memberSession',
    NOTIFICATIONS: 'memberNotifications',
    MEMBERS_POOL: 'membersPool',
    LOANS: 'memberLoans',
    REPAYMENTS: 'memberRepayments',
    CONTRIBUTIONS: 'memberContributions',
    ACTIVE_TAB: 'memberActiveTab',
    LIGHT_MODE: 'member_light_mode'
};

const MEMBER_SECURITY_PREF_KEYS = {
    LOGIN_EMAIL_OR_USERNAME: 'security_pref_login_email_or_username',
    DISABLE_LOGIN_AUTOCOMPLETE: 'security_pref_disable_login_autocomplete',
    ENFORCE_STRONG_PASSWORDS: 'security_pref_enforce_strong_passwords',
    AUTO_LOGOUT: 'security_pref_auto_logout',
    HIDE_SENSITIVE_FIELDS: 'security_pref_hide_sensitive_fields'
};

function loadMemberSecurityPreferences() {
    return {
        allowEmailOrUsername: localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.LOGIN_EMAIL_OR_USERNAME) === 'true',
        disableLoginAutocomplete: localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.DISABLE_LOGIN_AUTOCOMPLETE) === 'true',
        enforceStrongPasswords: localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.ENFORCE_STRONG_PASSWORDS) === 'true',
        autoLogout: localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.AUTO_LOGOUT) !== 'false',
        hideSensitiveFields: localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.HIDE_SENSITIVE_FIELDS) === 'true'
    };
}

function applyMemberSecurityPreferences() {
    const prefs = loadMemberSecurityPreferences();

    const loginLabel = document.querySelector('label[for="loginIdentity"]');
    const loginIdentity = document.getElementById('loginIdentity');
    const loginPassword = document.getElementById('loginPassword');
    const regEmail = document.getElementById('regEmail');
    const regPassword = document.getElementById('regPassword');
    const regPin = document.getElementById('regPin');
    const recoveryEmail = document.getElementById('recoveryEmail');
    const recoveryNewPassword = document.getElementById('recoveryNewPassword');

    if (loginLabel) {
        loginLabel.textContent = prefs.allowEmailOrUsername ? 'Email Address or Username' : 'Email Address';
    }
    if (loginIdentity) {
        loginIdentity.placeholder = prefs.allowEmailOrUsername ? 'Enter your email address or username' : 'Enter your registered email address';
        loginIdentity.autocomplete = prefs.disableLoginAutocomplete ? 'off' : 'email';
    }
    if (loginPassword) loginPassword.autocomplete = prefs.disableLoginAutocomplete ? 'off' : 'current-password';
    if (regEmail) regEmail.autocomplete = prefs.disableLoginAutocomplete ? 'off' : 'email';
    if (regPassword) regPassword.autocomplete = prefs.disableLoginAutocomplete ? 'off' : 'new-password';
    if (regPin) regPin.autocomplete = prefs.disableLoginAutocomplete ? 'off' : 'new-password';
    if (recoveryEmail) recoveryEmail.autocomplete = prefs.disableLoginAutocomplete ? 'off' : 'email';
    if (recoveryNewPassword) recoveryNewPassword.autocomplete = prefs.disableLoginAutocomplete ? 'off' : 'new-password';

    document.querySelectorAll('i.fas.fa-eye, i.fas.fa-eye-slash').forEach(icon => {
        icon.style.display = prefs.hideSensitiveFields ? 'none' : 'inline-block';
    });
}

const WHATSAPP_CACHE_KEY = 'whatsappMessageCache';
const DEFAULT_WHATSAPP_MESSAGE = 'Hello Admin, I need assistance with my account. Please respond when available.';
let CURRENT_SESSION = JSON.parse(localStorage.getItem(STORAGE_KEYS.SESSION)) || null;
let MEMBER_SESSION_VALIDATED = false;
let MEMBER_SESSION_VALIDATION_PROMISE = null;
let ADMIN_PHONE = '';
let WHATSAPP_MESSAGE_CACHE = localStorage.getItem(WHATSAPP_CACHE_KEY) || '';
let WHATSAPP_FRAME_LOADED = false;
let WHATSAPP_FRAME_TIMER = null;
let WHATSAPP_FAIL_TIMER = null;
let MEMBER_DB_STATE = { loans: [], repayments: [], meetings: [], contributions: [], expenses: [], logs: [] };
let MEMBER_MESSAGE_STATE = {
    lastPayloadHash: '',
    isSyncing: false
};
let MEMBER_CHECKIN_STATE = {
    currentStreak: 0,
    longestStreak: 0,
    checkedInToday: false
};
let MEMBER_SYSTEM_IMPACT_STATE = {
    lastBuiltAt: null
};

function togglePasswordVisibility(fieldId, iconEl) {
    const field = document.getElementById(fieldId);
    if (!field || !iconEl) return;
    if (field.type === 'password') {
        field.type = 'text';
        iconEl.className = 'fas fa-eye-slash';
    } else {
        field.type = 'password';
        iconEl.className = 'fas fa-eye';
    }
}

function isApprovedMemberSession(session) {
    if (!session) return false;
    const statusStr = String(session.status || '').toLowerCase();
    return statusStr === 'approved' || statusStr === 'active' || session.approved === true;
}

function applyMemberAccessBodyState(session) {
    const isLoggedIn = !!session;
    const isApproved = isApprovedMemberSession(session);
    document.body.classList.toggle('not-logged-in', !isLoggedIn);
    document.body.classList.toggle('not-approved', isLoggedIn && !isApproved);
    document.body.classList.toggle('member-approved', isApproved);
}

function ensureAuthGateVisible() {
    let gate = document.getElementById('authBlurGate');
    if (!gate) {
        gate = document.createElement('div');
        gate.id = 'authBlurGate';
        gate.setAttribute('role', 'dialog');
        gate.setAttribute('aria-modal', 'true');
        gate.setAttribute('aria-label', 'Authentication required');
        gate.innerHTML = `
            <div class="blur-gate-card">
                <i class="fas fa-lock blur-gate-icon"></i>
                <h2>Access Restricted</h2>
                <p>This portal is secured. Please sign in with your approved membership credentials to access the dashboard and services.</p>
                <a href="#" class="blur-gate-btn" id="gateLoginBtn" onclick="openAuthPortal(event,'authSection', 'loginForm')">
                    <i class="fas fa-sign-in-alt"></i>&nbsp; Sign In to Portal
                </a>
                <a href="#" class="blur-gate-btn-secondary" id="gateRegisterBtn" onclick="openAuthPortal(event,'authSection', 'registerForm')">
                    <i class="fas fa-user-plus"></i>&nbsp; New Member? Register Here
                </a>
                <div class="blur-gate-badge">
                    <i class="fas fa-shield-alt"></i>
                    End-to-end encrypted &bull; Session token verified &bull; Admin-approved access only
                </div>
            </div>
        `;
        document.body.prepend(gate);
    }
    gate.classList.remove('gate-dissolving');
    gate.style.display = 'flex';
    return gate;
}

function forceAuthOnlyView(message) {
    CURRENT_SESSION = null;
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB);
    localStorage.removeItem('disableBlurEffect');
    localStorage.removeItem('memberAccessGranted');
    applyMemberAccessBodyState(null);
    setFunctionalSectionsLock(true);
    openAuthPortal(null, 'authSection');
    if (message) console.warn(message);
}

function getCachedWhatsAppMessage() {
    return WHATSAPP_MESSAGE_CACHE || localStorage.getItem(WHATSAPP_CACHE_KEY) || DEFAULT_WHATSAPP_MESSAGE;
}

/**
 * ==========================================================================
 * INITIALIZATION ENGINE RUNNER
 * ==========================================================================
 */
let IS_DEV_MODE = false;

/* ==========================================================================
   DARK MODE TOGGLE
   ========================================================================== */
function toggleMemberTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem(STORAGE_KEYS.LIGHT_MODE, isLight);
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.className = isLight ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// Ensure back button from member pages returns to landingpage and blocks forward
function enforceBackToLanding() {
    try {
        // push a sentinel so a single back will trigger popstate here
        history.pushState({ sentinel: 'member' }, '', window.location.href);
        window.addEventListener('popstate', function () {
            // Navigate to landing page and replace history so forward cannot return here
            try {
                window.location.replace('landingpage.html');
            } catch (err) {
                window.location.href = 'landingpage.html';
            }
        }, { once: true });
    } catch (err) {
        console.warn('enforceBackToLanding failed', err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    // Check if session timed out and persist the timeout gate across refreshes
    const sessionTimedOut = localStorage.getItem('sessionTimedOut') === 'true';
    const timeoutTime = parseInt(localStorage.getItem('sessionTimeoutTime') || '0');
    const now = Date.now();
    const TIMEOUT_GATE_DURATION = 30 * 60 * 1000; // Keep gate active for 30 minutes

    if (sessionTimedOut && isApprovedMemberSession(CURRENT_SESSION)) {
        // A valid saved session takes priority over a stale timeout marker from an earlier session.
        localStorage.removeItem('sessionTimedOut');
        localStorage.removeItem('sessionTimeoutTime');
    } else if (sessionTimedOut && (now - timeoutTime) < TIMEOUT_GATE_DURATION) {
        // Session timed out and gate is still valid - show it
        const gate = document.getElementById('authBlurGate');
        if (gate) {
            showSessionTimeoutGate();
        }
        // Don't proceed with normal initialization
        return;
    } else if (sessionTimedOut && (now - timeoutTime) >= TIMEOUT_GATE_DURATION) {
        // Timeout gate expired, clear the flag
        localStorage.removeItem('sessionTimedOut');
        localStorage.removeItem('sessionTimeoutTime');
    }
    
    // Restore light mode state
    if (localStorage.getItem(STORAGE_KEYS.LIGHT_MODE) === 'true') {
        document.body.classList.add('light-mode');
        const icon = document.getElementById('themeIcon');
        if (icon) icon.className = 'fas fa-moon';
    } else {
        const icon = document.getElementById('themeIcon');
        if (icon) icon.className = 'fas fa-sun'; // default icon since base is dark
    }
    // FIX: raised from 5 to 15 minutes — 5 minutes was too aggressive for financial forms
    applyMemberSecurityPreferences();
    const autoLogoutEnabled = localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.AUTO_LOGOUT) !== 'false';
    if (autoLogoutEnabled && typeof initSessionTimeout === 'function') {
        initSessionTimeout({ timeoutMinutes: 15, onTimeout: logoutMember });
    }
    applyMemberAccessBodyState(CURRENT_SESSION);
    initializeNavigationEngine();
    restoreActiveTab();
    synchronizeNotificationStreams();
    evaluateSessionUIModifications();
    loadMemberPortalData().then(() => {
        rebuildMetricsDashboard();
        buildSystemImpactNarrative();
        buildMemberRoadmap();
        engagementPostRefresh();
    });
    loadAdminPhoneNumber();
    loadDefaultBrowserShell();
    if (isApprovedMemberSession(CURRENT_SESSION)) resetAndPoll();

    if (window.location.hash === '#access' && !isApprovedMemberSession(CURRENT_SESSION)) {
        openAuthPortal(null, 'authSection');
    }

    // Check for password reset token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const resetToken = urlParams.get('reset_token');
    if (resetToken) {
        showRecoveryUI(new Event('load'));
        document.getElementById('recoveryStep1').style.display = 'none';
        document.getElementById('recoveryStep3').style.display = 'block';
        window.activeResetToken = resetToken;
    }

    // FIX: debounce storage events — direct calls caused full reload on every cross-tab write
    let _storageRefreshTimer = null;
    window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEYS.SESSION || e.key === STORAGE_KEYS.MEMBERS_POOL || e.key === 'loans' || e.key === 'repayments' || e.key === 'disableBlurEffect') {
            if (_storageRefreshTimer) clearTimeout(_storageRefreshTimer);
            _storageRefreshTimer = setTimeout(() => { _storageRefreshTimer = null; refreshStateSync(); }, 1500);
        }
        // Force logout trigger from other tabs/pages (landingpage)
        if (e.key === 'forceMemberLogout' && e.newValue) {
            try {
                logoutMember();
            } catch (err) { console.warn('[forceMemberLogout] handler failed', err); }
            try { localStorage.removeItem('forceMemberLogout'); } catch (_) {}
        }
    });
    // If landing page previously set force logout, ensure we clear local session now
    if (localStorage.getItem('forceMemberLogout')) {
        try { logoutMember(); } catch (_) {}
        try { localStorage.removeItem('forceMemberLogout'); } catch (_) {}
    }
    // Ensure pressing browser back leads to landing page and prevents forward navigation back here
    enforceBackToLanding();
});

/**
 * ==========================================================================
 * MENU NAVIGATION ENGINE & RESPONSIVE TOGGLER
 * ==========================================================================
 */
function initializeNavigationEngine() {
    const menuToggleBtn = document.getElementById("menuToggleBtn");
    const sidebarMenu = document.getElementById("sidebarMenu");
    const mainContent = document.querySelector(".main-content");
    let previousMemberSection = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB) || 'dashboardSection';

    if (menuToggleBtn && sidebarMenu) {
        menuToggleBtn.addEventListener("click", () => {
            if (window.innerWidth > 992) {
                sidebarMenu.classList.toggle("collapsed");
                if (mainContent) mainContent.classList.toggle("expanded");
            } else {
                sidebarMenu.classList.toggle("active");
            }
        });
    }

    document.querySelectorAll(".nav-item").forEach(item => {
        item.addEventListener("click", (e) => {
            if (item.id === "navAuthLink" && CURRENT_SESSION) {
                // If logged in, the auth link acts as a logout button. Do not switch tabs.
                return;
            }
            e.preventDefault();
            const targetSectionId = item.getAttribute("data-target");
            if (targetSectionId !== 'authSection' && !isApprovedMemberSession(CURRENT_SESSION)) {
                openAuthPortal(null, 'authSection');
                return;
            }

            const isProfileSettingsLink = item.classList.contains('profile-settings-link');
            if (isProfileSettingsLink && targetSectionId === 'settingsSection' &&
                document.getElementById('settingsSection')?.style.display === 'block') {
                const restoreSection = document.getElementById(previousMemberSection) ? previousMemberSection : 'dashboardSection';
                document.querySelectorAll(".content-section").forEach(sec => sec.style.display = "none");
                const restoreTarget = document.getElementById(restoreSection);
                if (restoreTarget) restoreTarget.style.display = "block";
                document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
                const restoreNavItem = document.querySelector(`.nav-item[data-target="${restoreSection}"]`);
                if (restoreNavItem) restoreNavItem.classList.add("active");
                localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, restoreSection);
                return;
            }

            if (targetSectionId !== 'settingsSection' && targetSectionId !== 'authSection') {
                previousMemberSection = targetSectionId;
            }

            document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
            item.classList.add("active");
            localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, targetSectionId);

            document.querySelectorAll(".content-section").forEach(sec => sec.style.display = "none");
            const targetSec = document.getElementById(targetSectionId);
            if (targetSec) targetSec.style.display = "block";

            if (targetSectionId === 'settingsSection') prefillProfileForm();
            if (targetSectionId === 'notificationsSection') refreshNotificationsFeed();

            if (window.innerWidth <= 992 && sidebarMenu) {
                sidebarMenu.classList.remove("active");
            }
        });
    });
}

async function refreshStateSync() {
    if (CURRENT_SESSION && CURRENT_SESSION.id) {
        try {
            const updated = await apiGetMemberById(CURRENT_SESSION.id);
            if (updated) {
                // Keep password hashes or existing attributes if missing from update payload
                CURRENT_SESSION = { ...CURRENT_SESSION, ...updated };
                localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(CURRENT_SESSION));
            }
        } catch (error) {
            console.warn('Unable to refresh database session status payload', error);
        }
    }
    evaluateSessionUIModifications();
    await loadMemberPortalData();
    rebuildMetricsDashboard();
}

async function validateMemberSessionOnce() {
    if (!CURRENT_SESSION?.id || !isApprovedMemberSession(CURRENT_SESSION)) return false;
    if (MEMBER_SESSION_VALIDATED) return true;
    if (MEMBER_SESSION_VALIDATION_PROMISE) return MEMBER_SESSION_VALIDATION_PROMISE;
    MEMBER_SESSION_VALIDATION_PROMISE = apiGetMemberById(CURRENT_SESSION.id)
        .then(updated => {
            if (updated) {
                CURRENT_SESSION = { ...CURRENT_SESSION, ...updated };
                localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(CURRENT_SESSION));
            }
            MEMBER_SESSION_VALIDATED = true;
            return true;
        })
        .catch(error => {
            if (error.message !== 'Back-end communication failure.') console.warn('[validateMemberSessionOnce]', error.message);
            return false;
        })
        .finally(() => { MEMBER_SESSION_VALIDATION_PROMISE = null; });
    return MEMBER_SESSION_VALIDATION_PROMISE;
}

/**
 * ==========================================================================
 * SECURITY AUTHENTICATION PROCESSORS (LIVE API CONTROLLERS)
 * ==========================================================================
 */
async function handleMemberLogin(event) {
    event.preventDefault();
    const identity = document.getElementById("loginIdentity").value.trim();
    const pass = document.getElementById("loginPassword").value;
    const allowEmailOrUsername = localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.LOGIN_EMAIL_OR_USERNAME) === 'true';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!identity) return alert('Please enter your email address or username.');
    if (!allowEmailOrUsername && !emailRegex.test(identity)) return alert('Please enter a valid registered email address.');

    try {
        // FIX: removed console.log of auth state — leaks sensitive session data
        const data = await apiRequest('members/login', {
            method: 'POST',
            body: JSON.stringify({ identifier: identity, password: pass })
        });
        const member = data.member || data;
        document.getElementById("loginForm").reset();
        const statusStr = String(member.status || '').toLowerCase();
        const isApproved = statusStr === 'approved' || statusStr === 'active' || member.approved === true;

        if (statusStr === 'pending') {
            forceAuthOnlyView('Pending member login was blocked from protected navigation.');
            postSystemLogToAdmin(`Pending account login attempted: ${member.full_name || member.name} (${member.email}).`, 'security');
            alert("Your membership is pending admin verification. Workspace access is locked.");
            return;
        }

        if (statusStr === 'denied' || statusStr === 'rejected') {
            forceAuthOnlyView('Denied member login was blocked from protected navigation.');
            postSystemLogToAdmin(`Denied account login attempted: ${member.full_name || member.name} (${member.email}).`, 'security');
            alert("Access denied. Please approach an administrator for record clearance.");
            return;
        }

        if (!isApproved) {
            forceAuthOnlyView('Unapproved member login was blocked from protected navigation.');
            alert("Your account is not approved for portal access yet.");
            return;
        }

        CURRENT_SESSION = member;
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(CURRENT_SESSION));
        postSystemLogToAdmin(`Access notification: ${member.full_name || member.name} initiated session login handshake.`, 'security');
        localStorage.setItem('disableBlurEffect', 'true');
        localStorage.setItem('memberAccessGranted', 'true');
        await refreshStateSync();
        await loadAdminPhoneNumber();
        localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, 'dashboardSection');
        activateNavTab('dashboardSection');
        resetAndPoll();
        alert("Authentication successful. Welcome back!");
    } catch (error) {
        forceAuthOnlyView('Member login failed; protected navigation remains locked.');
        // FIX: error message now correctly reflects deployment environment
        const isOffline = !navigator.onLine || error.message === 'Failed to fetch';
        const message = isOffline
            ? 'Cannot reach the server. Please check your internet connection and try again.'
            : (error.message || 'Login failed. Please confirm your credentials and try again.');
        alert(message);
    }
}

/**
 * ==========================================================================
 * AI-VERIFIED PASSWORD RECOVERY CONTROLLERS
 * ==========================================================================
 */
function showRecoveryUI(e) {
    e.preventDefault();
    // Hide standard auth cards
    Array.from(document.getElementById("authSection").children[0].children).forEach(el => {
        if(el.id !== 'recoveryModal') el.style.display = 'none';
    });
    document.getElementById("recoveryModal").style.display = 'block';
    
    // Reset steps
    document.getElementById("recoveryStep1").style.display = 'block';
    document.getElementById("recoveryStep3").style.display = 'none';
    document.getElementById("recoveryEmail").value = "";
    document.getElementById("recoveryNewPassword").value = "";
}

function hideRecoveryUI() {
    // Show standard auth cards
    Array.from(document.getElementById("authSection").children[0].children).forEach(el => {
        if(el.id !== 'recoveryModal') el.style.display = 'block';
    });
    document.getElementById("recoveryModal").style.display = 'none';
    
    // Clear URL if token was present
    if (window.location.search.includes('reset_token')) {
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

async function requestPasswordReset(event) {
    event.preventDefault();
    const email = document.getElementById("recoveryEmail").value.trim();
    if(!email) return;
    
    const btn = document.getElementById("btnRequestReset");
    btn.disabled = true;
    btn.innerText = "Generating...";
    
    try {
        const result = await apiRequest('members/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        
        btn.innerText = "Reset Link Generated!";
        
        if (result.resetLink) {
            const token = result.token || result.resetLink.split('=')[1];
            const resetLink = window.location.origin + window.location.pathname + "?reset_token=" + token;

            emailjs.send("service_0gypwcr", "template_ozc1j5q", {
                email: email,
                to_email: email,
                reset_link: resetLink,
                message: resetLink,
                token: token
            }).then(() => {
                alert("Secure reset link sent to your email!");
                document.getElementById('simulatedEmailBox').style.display = 'block';
                document.getElementById('simulatedEmailBox').innerHTML = '<strong>Email Dispatched successfully!</strong> Please check your inbox and spam folders.';
            }).catch(err => {
                console.error("EmailJS Error:", err);
                document.getElementById("simulatedEmailBox").style.display = 'block';
                const linkEl = document.getElementById("simulatedEmailLink");
                linkEl.href = resetLink;
                linkEl.innerText = "Simulated Click to Reset";
                alert("Email dispatch failed. A simulated link has been provided below.");
            });
        } else {
            alert(result.message);
        }
    } catch(err) {
        alert(err.message || "Failed to initiate password reset.");
        btn.disabled = false;
        btn.innerText = "Generate Reset Link";
    }
}

async function submitAIVerifiedRecovery(event) {
    event.preventDefault();
    const newPass = document.getElementById("recoveryNewPassword").value;
    const token = window.activeResetToken;
    
    if(!newPass || !token) {
        alert("Missing secure token. Please request a new password reset link.");
        return;
    }

    try {
        const result = await apiRequest('members/recover-password', {
            method: 'POST',
            body: JSON.stringify({ token, new_password: newPass })
        });
        
        alert("Success: " + (result.message || 'Password updated securely.'));
        hideRecoveryUI();
    } catch(err) {
        alert(err.message || "Failed to update password. Token may be invalid or expired.");
    }
}

async function handleMemberRegister(event) {
    event.preventDefault();
    const name = document.getElementById("regName").value.trim();
    const email = document.getElementById("regEmail").value.trim();
    const phone = document.getElementById("regPhone").value.trim();
    const password = document.getElementById("regPassword").value;
    const pin = document.getElementById("regPin").value;
    const requireStrong = localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.ENFORCE_STRONG_PASSWORDS) === 'true';
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const pinRegex = /^\d{4,6}$/;

    if (!name) return alert('Please enter your full legal name.');
    if (!emailRegex.test(email)) return alert('Please enter a valid email address.');
    if (!phone) return alert('Please enter a phone number.');
    if (!password) return alert('Please enter a strong password.');
    if (!pinRegex.test(pin)) return alert('Please enter a valid 4-6 digit security PIN.');
    if (requireStrong && (!/^.*(?=.{8,})(?=.*[A-Z])(?=.*\d).*$/ .test(password))) {
        return alert('Password must be least 8 characters, include an uppercase letter and a number.');
    }

    if (document.getElementById("settingSimulatedDelay")?.checked) {
        await new Promise(r => setTimeout(r, 600));
    }

    try {
        const result = await apiRequest('members/create', {
            method: 'POST',
            body: JSON.stringify({ full_name: name, email, phone, password, pin })
        });

        CURRENT_SESSION = {
            id: result.id || Date.now(),
            name: name,
            full_name: name,
            email,
            phone,
            status: 'pending',
            approved: false
        };

        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(CURRENT_SESSION));
        
        // Push onto cross-tab triggers for immediate home.html awareness
        postApprovalRequestToAdmin(`New signup file received: ${name} (${phone}).`, 'approval');
        
        // Trigger local registry cache addition if sync fallback needed
        let pool = JSON.parse(localStorage.getItem(STORAGE_KEYS.MEMBERS_POOL)) || [];
        pool.push(CURRENT_SESSION);
        localStorage.setItem(STORAGE_KEYS.MEMBERS_POOL, JSON.stringify(pool));

        document.getElementById("registerForm").reset();
        evaluateSessionUIModifications();
        rebuildMetricsDashboard();
        
        alert("Registration file successfully transmitted into database validation queue.");
    } catch (error) {
        alert(error.message || "Registration failed. Record might already exist.");
    }
}

/**
 * ==========================================================================
 * ACCESS LEVEL VERIFICATION MASK CONTROLLER
 * ==========================================================================
 */
function evaluateSessionUIModifications() {
    const banner = document.getElementById("approvalPendingBanner");
    const userBadge = document.getElementById("userBadge");
    const badgeUsername = document.getElementById("badgeUsername");
    const authLink = document.getElementById("navAuthLink");
    applyMemberAccessBodyState(CURRENT_SESSION);

    if (!CURRENT_SESSION) {
        const chatNameInput = document.getElementById("chatFullName");
        const chatEmailInput = document.getElementById("chatEmail");
        if (chatNameInput) chatNameInput.value = "";
        if (chatEmailInput) chatEmailInput.value = "";
        if (banner) {
            banner.style.display = "flex";
            banner.className = "alert-banner warning";
            banner.innerHTML = `
                <div class="banner-icon"><i class="fas fa-lock"></i></div>
                <div class="banner-body">
                    <h4>Authentication Required</h4>
                    <p>You must be logged in to access secure functional sections. Please open the Access Portal.</p>
                </div>
            `;
        }
        if (userBadge) userBadge.style.display = "none";
        if (authLink) {
            authLink.innerHTML = `<i class="fas fa-sign-in-alt"></i> Access Portal`;
            authLink.onclick = null;
        }
        setFunctionalSectionsLock(true);
        return;
    }

    if (userBadge) userBadge.style.display = "flex";
    if (badgeUsername) badgeUsername.innerText = CURRENT_SESSION.full_name || CURRENT_SESSION.name || "Member";
    const chatNameInput = document.getElementById("chatFullName");
    const chatEmailInput = document.getElementById("chatEmail");
    if (chatNameInput && !chatNameInput.value.trim()) chatNameInput.value = CURRENT_SESSION.full_name || CURRENT_SESSION.name || "";
    if (chatEmailInput && !chatEmailInput.value.trim()) chatEmailInput.value = CURRENT_SESSION.email || "";
    
    if (authLink) {
        authLink.innerHTML = `<i class="fas fa-sign-out-alt"></i> Close Session`;
        authLink.onclick = executeLogoutSequence;
    }

    // Unlocked explicitly when database model returns 'approved' status
    const statusStr = String(CURRENT_SESSION.status || '').toLowerCase();
    const isApproved = (statusStr === 'approved' || statusStr === 'active' || CURRENT_SESSION.approved === true);

    if (!isApproved) {
        if (banner) {
            banner.style.display = "flex";
            banner.className = "alert-banner warning";
            banner.innerHTML = `
                <div class="banner-icon"><i class="fas fa-clock"></i></div>
                <div class="banner-body">
                    <h4>Account Pending Verification</h4>
                    <p>Your access request has been securely transmitted. You will be granted system functionality once approved.</p>
                </div>
            `;
        }
        setFunctionalSectionsLock(true);
    } else {
        if (banner) banner.style.display = "none";
        setFunctionalSectionsLock(false);
        //  APPROVED - dissolve the blur protection gate
        dissolveAuthGate();
        restoreActiveTab();
    }
}

function activateNavTab(sectionId) {
    const targetSec = document.getElementById(sectionId);
    if (!targetSec) return;
    document.querySelectorAll(".content-section").forEach(sec => sec.style.display = "none");
    targetSec.style.display = "block";
    document.querySelectorAll(".nav-item").forEach(i => i.classList.remove("active"));
    const navItem = document.querySelector(`.sidebar .nav-item[data-target="${sectionId}"]`) ||
        document.querySelector(`.nav-item[data-target="${sectionId}"]`);
    if (navItem) navItem.classList.add("active");
    if (sectionId !== 'authSection') localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, sectionId);
    if (sectionId === 'messagesSection') {
        loadMessagesInbox();
        loadUnreadCount();
    } else if (sectionId === 'progressSection') {
        loadCheckinData();
        loadLoanPayoffData();
        loadSavingsGoal();
        loadBadges();
    } else if (sectionId === 'payLoanSection') {
        loadLoanPayoffData();
    } else if (sectionId === 'contributionsSection') {
        loadSavingsGoal();
    }
}

function getActiveMemberSection() {
    const active = document.querySelector('.sidebar .nav-item.active')?.getAttribute('data-target');
    return active || localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB) || 'dashboardSection';
}

async function openMemberInsight(kind = 'streak') {
    const popover = document.getElementById('memberInsightPopover');
    const body = document.getElementById('memberInsightBody');
    const title = document.getElementById('memberInsightTitle');
    if (!popover || !body) return;

    if (!popover.hidden) {
        closeMemberInsight();
        return;
    }

    popover.dataset.previousSection = getActiveMemberSection();
    popover.hidden = false;
    if (title) title.textContent = kind === 'streak' ? 'Your consistency check' : 'Your latest update';
    body.innerHTML = '<span class="member-insight-loading"><i class="fas fa-spinner fa-spin"></i> Checking your progress...</span>';

    try {
        const [checkin, badges, goal] = await Promise.all([
            apiRequest('checkins/me', { method: 'GET' }),
            apiRequest('badges/me', { method: 'GET' }),
            apiRequest('savings-goals/me', { method: 'GET' })
        ]);
        const streak = Number(checkin.currentStreak || 0);
        const badgeCount = Number(badges.earnedCount || 0);
        const goalData = goal.goal || goal;
        const goalProgress = goalData?.target_amount ? Math.round((Number(goalData.current_amount || 0) / Number(goalData.target_amount)) * 100) : 0;
        const headline = checkin.checkedInToday ? 'You are checked in for today.' : 'A quick check-in keeps your momentum alive.';
        body.innerHTML = `<p class="member-insight-headline">${headline}</p><div class="member-insight-stats"><span><strong>${streak}</strong><small>day streak</small></span><span><strong>${badgeCount}</strong><small>badges earned</small></span><span><strong>${Math.min(100, goalProgress)}%</strong><small>savings goal</small></span></div><p class="member-insight-note">${streak >= 7 ? 'Strong consistency. Keep your rhythm going.' : 'Build your streak one day at a time.'}</p>`;
    } catch (error) {
        body.innerHTML = '<p class="member-insight-note">Your progress update is temporarily unavailable. Your selected page has not changed.</p>';
        console.warn('[openMemberInsight]', error.message || error);
    }
}

function closeMemberInsight() {
    const popover = document.getElementById('memberInsightPopover');
    if (!popover) return;
    popover.hidden = true;
}

// USER PROFILE POPOVER
function toggleUserProfilePopover(force) {
    const pop = document.getElementById('userProfilePopover');
    const badge = document.getElementById('userBadge');
    if (!pop || !badge) return;
    if (typeof force === 'boolean') {
        pop.style.display = force ? 'block' : 'none';
        badge.setAttribute('aria-expanded', force ? 'true' : 'false');
        return;
    }
    const isOpen = pop.style.display === 'block';
    pop.style.display = isOpen ? 'none' : 'block';
    badge.setAttribute('aria-expanded', (!isOpen).toString());
}

function openProfileFeature(kind) {
    toggleUserProfilePopover(false);
    if (kind === 'progress') {
        try { openMemberInsight('streak'); } catch (_) { activateNavTab('progressSection'); }
        return;
    }
    if (kind === 'settings') { activateNavTab('settingsSection'); return; }
    if (kind === 'security') { activateNavTab('settingsSection'); /* scroll to security block if present */ setTimeout(() => { const el = document.getElementById('memberSecuritySection'); if (el) el.scrollIntoView({behavior:'smooth', block:'center'}); }, 300); return; }
    if (kind === 'autoLogout') { activateNavTab('settingsSection'); setTimeout(() => { const el = document.getElementById('memberSettingAutoLogout'); if (el) { el.focus(); el.scrollIntoView({behavior:'smooth', block:'center'}); } }, 300); return; }
}

document.addEventListener('click', (event) => {
    const popover = document.getElementById('memberInsightPopover');
    const notificationPopover = document.getElementById('memberNotificationPopover');
    const profilePopover = document.getElementById('userProfilePopover');
    const trigger = event.target.closest('#streakBadgeHeader');
    const notificationTrigger = event.target.closest('#unreadMessagesBadge');
    const profileTrigger = event.target.closest('#userBadge');
    if (popover && !popover.hidden && !popover.contains(event.target) && !trigger) {
        closeMemberInsight();
    }
    if (notificationPopover && !notificationPopover.hidden && !notificationPopover.contains(event.target) && !notificationTrigger) {
        closeMemberNotification();
    }
    if (profilePopover && profilePopover.style.display === 'block' && !profilePopover.contains(event.target) && !profileTrigger) {
        toggleUserProfilePopover(false);
    }
});

document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeMemberInsight();
        closeMemberNotification();
    }
});

function openMemberProgressFromInsight() {
    closeMemberInsight();
    activateNavTab('progressSection');
}

function restoreActiveTab() {
    if (!isApprovedMemberSession(CURRENT_SESSION)) return;
    const savedTab = localStorage.getItem(STORAGE_KEYS.ACTIVE_TAB);
    const targetSection = savedTab && savedTab !== 'authSection' && document.getElementById(savedTab)
        ? savedTab
        : 'dashboardSection';

    activateNavTab(targetSection);
    localStorage.setItem(STORAGE_KEYS.ACTIVE_TAB, targetSection);
}

function setFunctionalSectionsLock(shouldLock) {
    const targets = ["takeLoanSection", "payLoanSection", "meetingsSection"];
    targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            if (shouldLock) {
                el.classList.add("disabled-ui-mask");
                // Disable inner buttons/inputs to enforce view mask integrity
                el.querySelectorAll("input, button, select").forEach(child => child.setAttribute("disabled", "true"));
            } else {
                el.classList.remove("disabled-ui-mask");
                el.querySelectorAll("input, button, select").forEach(child => child.removeAttribute("disabled"));
            }
        }
    });
}

function logoutMember() {
    // FIX: also stop the inbox poller — was leaking after logout
    stopLiveUpdatePoller();
    try { stopMemberInboxPoller(); } catch (_) {}
    // Attempt server-side token revocation for safety
    (async () => {
        try {
            await apiRequest('members/revoke', { method: 'POST' });
        } catch (err) { /* non-fatal */ }
    })();
    // Mark session as timed out
    localStorage.setItem('sessionTimedOut', 'true');
    localStorage.setItem('sessionTimeoutTime', Date.now().toString());
    localStorage.removeItem(STORAGE_KEYS.SESSION);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB);
    localStorage.removeItem('disableBlurEffect');
    localStorage.removeItem('memberAccessGranted');
    CURRENT_SESSION = null;
    applyMemberAccessBodyState(null);
    
    // Show blur gate with timeout message
    showSessionTimeoutGate();
}

function showSessionTimeoutGate() {
    const gate = ensureAuthGateVisible();
    if (!gate) return;
    
    // Remove any existing message and update
    const existingMsg = gate.querySelector('.timeout-message');
    if (existingMsg) existingMsg.remove();
    
    // Create timeout message
    const timeoutMsg = document.createElement('div');
    timeoutMsg.className = 'timeout-message';
    timeoutMsg.style.cssText = `
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(15, 23, 42, 0.95);
        padding: 2rem;
        border-radius: 12px;
        border: 2px solid #ef4444;
        text-align: center;
        color: #f8fafc;
        z-index: 10001;
        max-width: 400px;
    `;
    timeoutMsg.innerHTML = `
        <h3 style="color: #ef4444; margin-bottom: 1rem;">Session Expired</h3>
        <p style="margin-bottom: 1.5rem; color: #cbd5e1;">Your session timed out due to 5 minutes of inactivity. Please sign in again.</p>
        <button onclick="location.reload()" style="
            background: #38bdf8;
            color: #000;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 6px;
            font-weight: bold;
            cursor: pointer;
            font-size: 1rem;
        ">Sign In Again</button>
    `;
    
    gate.appendChild(timeoutMsg);
    gate.style.display = 'flex';
}

async function executeLogoutSequence(e) {
    if (e) e.preventDefault();
    if (confirm("Confirm security termination of active portal workspace session?")) {
        stopLiveUpdatePoller();
        // Revoke token on server before clearing local session
        try { await apiRequest('members/revoke', { method: 'POST' }); } catch (_) {}
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB);
        localStorage.removeItem('disableBlurEffect');
        localStorage.removeItem('memberAccessGranted');
        CURRENT_SESSION = null;
        window.location.reload();
    }
}

/**
 * ==========================================================================
 * AUTH BLUR GATE CONTROLLERS
 * ==========================================================================
 */

/**
 * dissolveAuthGate()
 * Called when an APPROVED session is confirmed.
 * Adds 'gate-dissolving' class (CSS fade-out transition),
 * then fully removes the element from DOM after the animation.
 */
function dissolveAuthGate() {
    const gate = document.getElementById('authBlurGate');
    if (!gate) return;
    gate.classList.add('gate-dissolving');
    // Remove from DOM after the 500ms CSS transition
    setTimeout(() => gate.remove(), 520);
}

/**
 * openAuthPortal(e, sectionId)
 * Called from the blur gate buttons.
 * Hides the gate card (not the gate itself - keeps blur while auth section is open),
 * scrolls to the auth section, and activates it.
 */
function openAuthPortal(e, sectionId, targetFormId = null) {
    if (e) e.preventDefault();
    const gate = document.getElementById('authBlurGate');
    if (gate) {
        // Shrink the gate card so auth section behind is reachable
        gate.classList.add('gate-dissolving');
        setTimeout(() => gate.remove(), 520);
    }
    // Activate the auth section via the existing nav system
    document.querySelectorAll('.content-section').forEach(s => s.style.display = 'none');
    const targetSec = document.getElementById(sectionId);
    if (targetSec) targetSec.style.display = 'block';
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const authNavItem = document.getElementById('navAuthLink');
    if (authNavItem) authNavItem.classList.add('active');
    
    if (targetFormId) {
        setTimeout(() => {
            const form = document.getElementById(targetFormId);
            if (form) {
                form.scrollIntoView({ behavior: 'smooth', block: 'center' });
                const firstInput = form.querySelector('input');
                if (firstInput) firstInput.focus();
            }
        }, 550); // wait for blur gate to dissolve
    }
}


/**
 * ==========================================================================
 * DYNAMIC NOTIFICATION DISPATCHING ENGINE
 * ==========================================================================
 */
function postSystemLogToAdmin(msg, category) {
    if (!CURRENT_SESSION || !CURRENT_SESSION.id) return;
    apiRequest('live-updates/log', {
        method: 'POST',
        body: JSON.stringify({ event_type: category || 'system', event_body: msg })
    }).catch(() => {});
}

function postApprovalRequestToAdmin(msg, category) {
    if (!CURRENT_SESSION || !CURRENT_SESSION.id) return;
    apiRequest('live-updates/log', {
        method: 'POST',
        body: JSON.stringify({ event_type: category || 'activity', event_body: msg })
    }).catch(() => {});
}

async function apiRequest(path, options = {}) {
    const url = `${API_BASE_URL}/${path}`;
    const isFormData = options.body instanceof FormData;
    const headers = {};
    if (!isFormData) {
        headers['Content-Type'] = 'application/json';
    }
    if (CURRENT_SESSION && CURRENT_SESSION.token) {
        headers['Authorization'] = 'Bearer ' + CURRENT_SESSION.token;
    }

    const response = await fetch(url, {
        headers,
        credentials: 'same-origin',
        ...options
    });

    // Safely parse JSON — if the server returns HTML (e.g., during cold start), this will throw
    // a friendly error instead of the raw "Unexpected token '<'" parse error
    let data;
    try {
        data = await response.json();
    } catch (_parseErr) {
        throw new Error('Server is temporarily unavailable. Please wait a moment and try again.');
    }

    if (!response.ok) {
        throw new Error(data.message || 'Back-end communication failure.');
    }
    return data.data ?? data;
}

async function apiGetMemberById(id) {
    return await apiRequest(`members/view?id=${id}`, { method: 'GET' });
}

async function loadAdminPhoneNumber() {
    if (!CURRENT_SESSION || !CURRENT_SESSION.email) {
        console.warn('No active session to load admin contact');
        return;
    }
    
    function setAdminDisplay(n, p, em) {
        const contactHint = document.getElementById('contactAdminHint');
        const contactName = document.getElementById('contactAdminName');
        const contactPhone = document.getElementById('contactAdminPhone');
        const contactEmail = document.getElementById('contactAdminEmail');
        const dashName = document.getElementById('adminNameDisplay');
        const dashPhone = document.getElementById('adminPhoneDisplay');
        const dashEmail = document.getElementById('adminEmailDisplay');
        const dashHint = document.getElementById('adminContactHint');
        const sidebarPhone = document.getElementById('sidebarPhone');
        const sidebarPhoneLink = document.getElementById('sidebarPhoneLink');
        const sidebarHandler = document.getElementById('sidebarHandler');
        if (contactHint) contactHint.textContent = (n || 'System Admin') + ' is your assigned officer';
        if (contactName) contactName.textContent = n || 'System Admin';
        if (contactPhone) contactPhone.textContent = p || 'N/A';
        if (contactEmail) contactEmail.textContent = em || 'N/A';
        if (dashName) dashName.textContent = n || 'System Admin';
        if (dashPhone) dashPhone.textContent = p || 'N/A';
        if (dashEmail) dashEmail.textContent = em || 'N/A';
        if (dashHint) dashHint.textContent = (n || 'System Admin') + ' is your assigned officer';
        if (sidebarPhone) sidebarPhone.textContent = p || 'N/A';
        if (sidebarPhoneLink && p) sidebarPhoneLink.href = 'tel:' + p;
        if (sidebarHandler) sidebarHandler.textContent = n || 'System Admin';
        if (p) { ADMIN_PHONE = String(p).trim(); localStorage.setItem('currentAdminPhone', ADMIN_PHONE); }
    }

    try {
        const raw = await apiRequest('members/approver-contact?email=' + encodeURIComponent(CURRENT_SESSION.email), { method: 'GET' });
        const approverData = raw.data || raw;
        
        const resolvedName = approverData.admin_name || 'System Admin';
        const resolvedPhone = approverData.admin_phone || '';
        const resolvedEmail = approverData.admin_email || '';

        setAdminDisplay(resolvedName, resolvedPhone, resolvedEmail);
    } catch (err) {
        console.warn('Unable to load admin contact, trying fallback...', err);
        try {
            const raw2 = await apiRequest('members/my-admin-info', { method: 'GET' });
            const d2 = raw2.data || raw2;
            if (d2 && (d2.admin_name || d2.admin_phone)) {
                setAdminDisplay(d2.admin_name || 'System Admin', d2.admin_phone || '', d2.admin_email || '');
                return;
            }
        } catch (_) {}
        const resolvedName = (CURRENT_SESSION && CURRENT_SESSION.admin_name) ? CURRENT_SESSION.admin_name : 'System Admin';
        const resolvedPhone = (CURRENT_SESSION && CURRENT_SESSION.admin_phone) ? CURRENT_SESSION.admin_phone : (localStorage.getItem('currentAdminPhone') || 'N/A');
        const resolvedEmail = (CURRENT_SESSION && CURRENT_SESSION.admin_email) ? CURRENT_SESSION.admin_email : 'N/A';
        setAdminDisplay(resolvedName, resolvedPhone, resolvedEmail);
    }
}

function renderNotificationsFeed() {
    const feed = document.getElementById("memberNotificationFeedExtended");
    if (!feed) return;

    const logs = MEMBER_DB_STATE.logs || [];
    if (logs.length === 0) {
        feed.innerHTML = `<div class="text-muted" style="text-align:center; padding:2rem;">No activity recorded yet.</div>`;
        return;
    }

    const filterEl = document.getElementById('notificationTypeFilter');
    const filterVal = filterEl ? filterEl.value : 'all';

    const typeIconMap = {
        'loan': { icon: 'fa-hand-holding-usd', color: '#3b82f6' },
        'contribution': { icon: 'fa-piggy-bank', color: '#4caf50' },
        'expense': { icon: 'fa-file-invoice', color: '#f59e0b' },
        'security': { icon: 'fa-shield-alt', color: '#ef4444' },
        'system': { icon: 'fa-cog', color: '#8b5cf6' },
        'meeting': { icon: 'fa-video', color: '#06b6d4' },
        'approval': { icon: 'fa-check-circle', color: '#10b981' }
    };

    const filtered = filterVal === 'all' ? logs : logs.filter(l => {
        const msg = (l.message || '').toLowerCase();
        const type = (l.type || '').toLowerCase();
        if (filterVal === 'loan') return msg.includes('loan') || msg.includes('repay') || type === 'loan';
        if (filterVal === 'contribution') return msg.includes('contribut') || msg.includes('payment') || type === 'contribution';
        if (filterVal === 'expense') return msg.includes('expense') || type === 'expense';
        if (filterVal === 'security') return msg.includes('security') || msg.includes('login') || type === 'security';
        if (filterVal === 'system') return msg.includes('system') || type === 'system';
        return true;
    });

    if (filtered.length === 0) {
        feed.innerHTML = `<div class="text-muted" style="text-align:center; padding:2rem;">No ${filterVal === 'all' ? '' : filterVal + ' '}notifications found.</div>`;
        return;
    }

    feed.innerHTML = filtered.slice(0, 50).map(l => {
        const msg = (l.message || '').toLowerCase();
        let matchedType = 'system';
        if (msg.includes('loan') || msg.includes('repay') || (l.type || '').toLowerCase() === 'loan') matchedType = 'loan';
        else if (msg.includes('contribut') || msg.includes('payment') || (l.type || '').toLowerCase() === 'contribution') matchedType = 'contribution';
        else if (msg.includes('expense') || (l.type || '').toLowerCase() === 'expense') matchedType = 'expense';
        else if (msg.includes('security') || msg.includes('login') || (l.type || '').toLowerCase() === 'security') matchedType = 'security';
        else if (msg.includes('meeting') || (l.type || '').toLowerCase() === 'meeting') matchedType = 'meeting';
        else if (msg.includes('approval') || (l.type || '').toLowerCase() === 'approval') matchedType = 'approval';
        const meta = typeIconMap[matchedType] || typeIconMap['system'];
        const timestamp = l.timestamp_str || (l.created_at ? new Date(l.created_at).toLocaleString() : '');
        return `<div class="notification-item" style="border-left: 3px solid ${meta.color}; padding-left: 12px; margin-bottom: 10px;">
            <p style="margin:0;"><i class="fas ${meta.icon}" style="color:${meta.color}; margin-right:6px;"></i> ${l.message}</p>
            <span class="notification-time" style="font-size: 0.8rem; color: #888;">${timestamp}</span>
        </div>`;
    }).join('');
}

async function refreshNotificationsFeed() {
    if (!CURRENT_SESSION || !CURRENT_SESSION.id || !isApprovedMemberSession(CURRENT_SESSION)) {
        renderNotificationsFeed();
        return;
    }
    try {
        const [systemLogsRaw, liveLogsRaw] = await Promise.allSettled([
            apiRequest('logs/member-activity/' + encodeURIComponent(CURRENT_SESSION.id), { method: 'GET' }),
            apiRequest('live-updates/member', { method: 'GET' })
        ]);
        const sLogs = (systemLogsRaw.status === 'fulfilled' ? systemLogsRaw.value : []).map(l => ({ message: l.message || l.event_body, type: l.type || 'system', created_at: l.created_at, timestamp_str: l.timestamp_str }));
        const lLogs = (liveLogsRaw.status === 'fulfilled' ? liveLogsRaw.value : []).map(l => ({ message: l.event_body, type: l.event_type, created_at: l.created_at }));
        MEMBER_DB_STATE.logs = [...sLogs, ...lLogs].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    } catch (_) {}
    renderNotificationsFeed();
}

function synchronizeNotificationStreams() { refreshNotificationsFeed(); }

let _liveUpdatePollTimer = null;
let _lastKnownLogCount = 0;
let _memberInboxPollTimer = null;
let _lastKnownUnreadCount = null;
let _notificationAudioContext = null;

function playMemberNotificationSound() {
    if (localStorage.getItem('memberNotificationSound') === 'false') return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        _notificationAudioContext ||= new AudioContext();
        if (_notificationAudioContext.state === 'suspended') _notificationAudioContext.resume();
        const oscillator = _notificationAudioContext.createOscillator();
        const gain = _notificationAudioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(740, _notificationAudioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(980, _notificationAudioContext.currentTime + 0.09);
        gain.gain.setValueAtTime(0.0001, _notificationAudioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.08, _notificationAudioContext.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, _notificationAudioContext.currentTime + 0.22);
        oscillator.connect(gain).connect(_notificationAudioContext.destination);
        oscillator.start();
        oscillator.stop(_notificationAudioContext.currentTime + 0.24);
    } catch (_) {}
}

function startLiveUpdatePoller() {
    if (_liveUpdatePollTimer) return;
    _liveUpdatePollTimer = setInterval(async () => {
        if (!CURRENT_SESSION || !CURRENT_SESSION.id || !isApprovedMemberSession(CURRENT_SESSION)) return;
        try {
            const raw = await apiRequest('live-updates/member', { method: 'GET' });
            const rows = Array.isArray(raw) ? raw : [];
            if (rows.length > _lastKnownLogCount && _lastKnownLogCount > 0) {
                MEMBER_DB_STATE.logs = rows.map(l => ({ message: l.event_body, type: l.event_type, created_at: l.created_at }));
                renderNotificationsFeed();
                const badge = document.getElementById('notificationBadge');
                if (badge) {
                    const extra = rows.length - _lastKnownLogCount;
                    badge.textContent = extra;
                    badge.style.display = 'flex';
                }
            }
            _lastKnownLogCount = rows.length;
        } catch (_) {}
    }, 8000);
    _liveUpdatePollTimer.unref && _liveUpdatePollTimer.unref();
}

function stopLiveUpdatePoller() {
    if (_liveUpdatePollTimer) { clearInterval(_liveUpdatePollTimer); _liveUpdatePollTimer = null; }
}

function startMemberInboxPoller() {
    if (_memberInboxPollTimer) return;
    _memberInboxPollTimer = setInterval(async () => {
        if (!CURRENT_SESSION || !CURRENT_SESSION.id || !isApprovedMemberSession(CURRENT_SESSION)) {
            stopMemberInboxPoller();
            return;
        }
        const messagesSection = document.getElementById('messagesSection');
        if (!messagesSection || messagesSection.style.display === 'none') return;
        try {
            await loadMessagesInbox({ showLoading: false });
        } catch (err) {
            console.warn('[MemberInboxPoller] Auto-refresh failed:', err.message);
        }
    }, 5000);
}

function stopMemberInboxPoller() {
    if (_memberInboxPollTimer) { clearInterval(_memberInboxPollTimer); _memberInboxPollTimer = null; }
}

function resetAndPoll() {
    _lastKnownLogCount = 0;
    startLiveUpdatePoller();
    startMemberInboxPoller();
}

/**
 * ==========================================================================
 * TRANSACTIONAL PIN VERIFICATION
 * ==========================================================================
 */
let pendingTransactionCallback = null;

function promptForTransactionPin(callback) {
    pendingTransactionCallback = callback;
    document.getElementById("transactionPinInput").value = '';
    document.getElementById("securityPinModal").style.display = 'flex';
}

function cancelTransactionPin() {
    pendingTransactionCallback = null;
    document.getElementById("securityPinModal").style.display = 'none';
}

function confirmTransactionPin() {
    const pin = document.getElementById("transactionPinInput").value;
    if (pin.length !== 4) {
        alert("Please enter a valid 4-digit PIN.");
        return;
    }
    document.getElementById("securityPinModal").style.display = 'none';
    if (pendingTransactionCallback) {
        pendingTransactionCallback(pin);
        pendingTransactionCallback = null;
    }
}

/*
 * ==========================================================================
 * REAL-TIME LOAN & MEETING LIFECYCLE MANAGERS
 * ==========================================================================
 */
async function processLoanApplication(event) {
    event.preventDefault();
    if (!CURRENT_SESSION) return;

    const amt = parseFloat(document.getElementById("loanAmount").value);
    const dur = parseInt(document.getElementById("loanDuration").value);

    promptForTransactionPin(async (pin) => {

        try {
            const payload = {
                member_id: CURRENT_SESSION.id,
                amount: amt,
                duration: dur,
                interest_rate: parseFloat(document.getElementById("loanInterest")?.value) || 12,
                pin: pin
            };

            // Post straight to backend live router channel
            const result = await apiRequest('loans/create', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

        postNotificationToChannels(`Loan Application Confirmed: Loan ID ${result.id || ''} for Ksh ${amt.toFixed(2)} is now live.`, 'loan');
        document.getElementById("takeLoanForm").reset();
        
        await loadMemberPortalData();
        rebuildMetricsDashboard();
        alert("Loan application filed into live database ledger record successfully.");
    } catch (error) {
        alert(error.message || "Failed to submit loan request to database.");
    }
    });
}

async function processLoanSettlement(event) {
    event.preventDefault();
    const targetId = document.getElementById("payLoanSelect").value;
    const payVal = parseFloat(document.getElementById("payAmount").value);
    const method = document.querySelector('input[name="payMethod"]:checked').value;

    if (!targetId || !CURRENT_SESSION) return;

    if (!confirm(`Are you sure you want to process a repayment of Ksh ${payVal} via ${method}? This action cannot be reversed.`)) {
        return;
    }

    promptForTransactionPin(async (pin) => {
        try {
            let dbLoanId = targetId;
            if (MEMBER_DB_STATE.loans && MEMBER_DB_STATE.loans.length) {
                const liveLoan = MEMBER_DB_STATE.loans.find(l => String(l.id) === String(targetId) || String(l.id) === String(targetId.replace('LNK-', '')));
                if (liveLoan) dbLoanId = liveLoan.id;
            }
            
            await apiRequest('repayments/create', {
                method: 'POST',
                body: JSON.stringify({
                    loan_id: dbLoanId,
                    member_id: CURRENT_SESSION.id,
                    amount: payVal,
                    payment_method: method,
                    pin: pin
                })
            });

        postNotificationToChannels(`Remittance Confirmed: Installment of Ksh ${payVal} applied via ${method}.`, 'loan');
        document.getElementById("payLoanForm").reset();
        
        await loadMemberPortalData();
        rebuildMetricsDashboard();
        alert("Repayment processing approved and stored inside system ledger.");
    } catch (error) {
        alert(error.message || "Repayment rejected by database verification.");
    }
    });
}

function postNotificationToChannels(msg, type) {
    if (!CURRENT_SESSION || !CURRENT_SESSION.id) return;
    apiRequest('live-updates/log', {
        method: 'POST',
        body: JSON.stringify({ event_type: type || 'notification', event_body: msg })
    }).catch(() => {});
}

/**
 * ==========================================================================
 * TOAST NOTIFICATION DISPLAY
 * ==========================================================================
 */
function showToast(message, type = 'info') {
    let existingToast = document.getElementById('memberToastContainer');
    if (existingToast) {
        existingToast.remove();
    }

    const toastContainer = document.createElement('div');
    toastContainer.id = 'memberToastContainer';
    toastContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 99999;
        animation: slideInRight 0.3s ease-out;
    `;

    const toastBox = document.createElement('div');
    toastBox.className = `toast-notification toast-${type}`;
    toastBox.style.cssText = `
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 250px;
    `;

    const icon = type === 'success' ? '' : type === 'error' ? '' : 'i';
    toastBox.innerHTML = `<span style="font-size: 18px;">${icon}</span><span>${message}</span>`;
    
    toastContainer.appendChild(toastBox);
    document.body.appendChild(toastContainer);

    // Add animation keyframes if not present
    if (!document.getElementById('toastAnimationStyle')) {
        const style = document.createElement('style');
        style.id = 'toastAnimationStyle';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Auto-remove after 3 seconds
    setTimeout(() => {
        toastBox.style.animation = 'slideOutRight 0.3s ease-out forwards';
        setTimeout(() => toastContainer.remove(), 300);
    }, 3000);
}

/**
 * ==========================================================================
 * INTERNAL INSTANT COMMUNICATIONS ENGINE (CHATBOX)
 * ==========================================================================
 */
function openWhatsAppChatWithAdmin(e) {
    e.preventDefault();
    const nameInput = document.getElementById("chatFullName");
    const emailInput = document.getElementById("chatEmail");
    const subjectInput = document.getElementById("chatSubject");
    const messageInput = document.getElementById("chatMessageInput");
    if (!messageInput) return;
    
    if (!ADMIN_PHONE) {
        showToast('Admin phone number not available', 'error');
        return;
    }

    const memberName = CURRENT_SESSION ? (CURRENT_SESSION.full_name || CURRENT_SESSION.name) : "Member";
    const memberEmail = CURRENT_SESSION ? CURRENT_SESSION.email : "";
    if (nameInput && !nameInput.value.trim()) nameInput.value = memberName;
    if (emailInput && !emailInput.value.trim()) emailInput.value = memberEmail;

    const fullName = (nameInput?.value || memberName).trim();
    const email = (emailInput?.value || memberEmail).trim();
    const subject = (subjectInput?.value || '').trim();
    const msg = messageInput.value.trim();
    if (!subject) {
        showToast('Please enter a subject', 'error');
        return;
    }
    if (!msg) {
        showToast('Please type a message first', 'error');
        return;
    }

    const normalized = String(ADMIN_PHONE).replace(/[^0-9]/g, '');
    if (!normalized) {
        showToast('Admin phone number is invalid', 'error');
        return;
    }

    const messagePreview = `From ${fullName}${email ? ' <' + email + '>' : ''}\nSubject: ${subject}\n\n${msg}`;
    WHATSAPP_MESSAGE_CACHE = messagePreview;
    localStorage.setItem(WHATSAPP_CACHE_KEY, messagePreview);
    const displayPhone = ADMIN_PHONE.trim().startsWith('+') ? ADMIN_PHONE.trim() : `+${normalized}`;

    const encoded = encodeURIComponent(messagePreview);
    const url = `https://web.whatsapp.com/send?phone=${normalized}&text=${encoded}`;
    
    showToast(`Opening WhatsApp with ${displayPhone}...`, 'success');
    window.open(url, '_blank', 'noopener');
    
    if (subjectInput) subjectInput.value = "";
    messageInput.value = "";
}

function showWhatsAppFrame(url) {
    const container = document.getElementById('whatsappFrameContainer');
    const frame = document.getElementById('whatsappFrame');
    if (!container || !frame) return;

    if (WHATSAPP_FRAME_TIMER) {
        clearTimeout(WHATSAPP_FRAME_TIMER);
        WHATSAPP_FRAME_TIMER = null;
    }
    if (WHATSAPP_FAIL_TIMER) {
        clearTimeout(WHATSAPP_FAIL_TIMER);
        WHATSAPP_FAIL_TIMER = null;
    }

    WHATSAPP_FRAME_LOADED = false;
    frame.style.display = 'block';
    frame.onload = () => {
        WHATSAPP_FRAME_LOADED = true;
        updateBrowserStatus('Page loaded in the embedded browser.');
    };

    updateBrowserStatus(`Loading ${url}...`);
    frame.src = url;
    container.style.display = 'block';

    WHATSAPP_FRAME_TIMER = setTimeout(() => {
        if (!WHATSAPP_FRAME_LOADED && frame.src !== 'about:blank') {
            updateBrowserStatus('Page load still in progress...');
        }
    }, 1200);
}

let SELECTED_BROWSER = 'chrome';

function getBrowserHomeUrl() {
    const homeUrls = {
        chrome: 'about:blank',
        firefox: 'about:blank',
        edge: 'about:blank',
        opera: 'about:blank',
        brave: 'about:blank'
    };
    return homeUrls[SELECTED_BROWSER] || homeUrls.chrome;
}

function updateBrowserSelection() {
    const selector = document.getElementById('browserSelector');
    if (!selector) return;
    SELECTED_BROWSER = selector.value;
    const label = selector.options[selector.selectedIndex].text;
    updateBrowserStatus(`Selected ${label}. Use Chrome or Open WhatsApp Chat.`);
}

function getBrowserLabel() {
    const selector = document.getElementById('browserSelector');
    return selector?.options[selector.selectedIndex]?.text || 'Chrome';
}

function loadDefaultBrowserShell() {
    const selector = document.getElementById('browserSelector');
    if (selector) {
        selector.value = SELECTED_BROWSER;
        updateBrowserSelection();
    }
    updateBrowserStatus('Internal communications ready. Fill the message form to send via WhatsApp.');
}

function openWhatsAppChat() {
    if (!ADMIN_PHONE) return;
    const normalized = String(ADMIN_PHONE).replace(/[^0-9]/g, '');
    if (!normalized) return;
    const cachedMessage = getCachedWhatsAppMessage();
    const encoded = encodeURIComponent(cachedMessage);
    const url = `https://web.whatsapp.com/send?phone=${normalized}&text=${encoded}`;
    updateBrowserStatus('Opening WhatsApp Web in a new browser tab...');
    window.open(url, '_blank', 'noopener');
}

function openBrowserHome() {
    const homeUrl = getBrowserHomeUrl();
    updateBrowserStatus(`Loading ${getBrowserLabel()} homepage in the live browser shell...`);
    showWhatsAppFrame(homeUrl);
}

function refreshWhatsApp() {
    const frame = document.getElementById('whatsappFrame');
    if (!frame) return;
    const currentSrc = frame.src;
    if (currentSrc && currentSrc !== 'about:blank') {
        frame.src = 'about:blank';
        setTimeout(() => {
            frame.src = currentSrc;
        }, 100);
    }
}

function closeWhatsAppFrame() {
    const frame = document.getElementById('whatsappFrame');
    if (frame) {
        frame.src = 'about:blank';
    }
    updateBrowserStatus('Live browser shell cleared. Enter a new URL or search and press Go.');
}

function openCurrentUrlInTab() {
    const homeUrl = getBrowserHomeUrl();
    const label = getBrowserLabel();
    updateBrowserStatus(`Opening ${label} homepage in a new tab...`);
    window.open(homeUrl, '_blank', 'noopener');
}

function isBlockedIframeUrl(url) {
    return false;
}

function updateBrowserStatus(message) {
    const browserBanner = document.getElementById('browserStatusBanner');
    const aiBanner = document.getElementById('aiStatusBanner');
    if (aiBanner) {
        aiBanner.textContent = message;
        return;
    }
    if (browserBanner) {
        browserBanner.textContent = message;
    }
}

/* ==========================================================================
   AI ASSISTANT (Client-side fallback + backend proxy if available)
   ========================================================================== */
function initAIAssistant() {
    const form = document.getElementById('aiChatForm');
    if (form) form.addEventListener('submit', aiAssistantSend);

    const win = document.getElementById('aiChatWindow');
    if (win) {
        win.innerHTML = '<div class="ai-bubble system">Hello - I\'m your AI assistant. Ask about your account, loans, or site features.</div>';
        win.scrollTop = win.scrollHeight;
    }
}

async function aiAssistantSend(event) {
    event.preventDefault();
    const input = document.getElementById('aiChatInput');
    const windowEl = document.getElementById('aiChatWindow');
    if (!input || !windowEl) return;
    const text = input.value.trim();
    if (!text) return;

    renderAIBubble('user', text);
    input.value = '';
    setAITyping(true);

    try {
        // Try backend AI proxy first (only send message, not session token)
        const resp = await fetch(API_BASE_URL + '/ai/assistant', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });

        if (resp.ok) {
            const body = await resp.json();
            const reply = body.reply || body.message || JSON.stringify(body);
            renderAIBubble('assistant', reply);
        } else {
            const txt = await resp.text();
            renderAIBubble('assistant', txt || 'AI backend returned an error.');
        }
    } catch (err) {
        // Offline/fallback behaviour - simple, helpful reply
        const fallback = `Assistant (offline): I received your message: "${text}". Try asking: \"What is my loan status?\"`;
        renderAIBubble('assistant', fallback);
        console.warn('AI assistant proxy failed:', err);
    } finally {
        setAITyping(false);
    }
}

function renderAIBubble(role, text) {
    const windowEl = document.getElementById('aiChatWindow');
    if (!windowEl) return;
    const bubble = document.createElement('div');
    bubble.className = 'ai-bubble ' + (role === 'user' ? 'outbound' : (role === 'assistant' ? 'inbound' : 'system'));
    bubble.style.margin = '6px 0';
    bubble.style.padding = '8px 10px';
    bubble.style.borderRadius = '8px';
    bubble.style.maxWidth = '95%';
    if (role === 'user') {
        bubble.style.background = 'linear-gradient(90deg,#3b82f6,#06b6d4)';
        bubble.style.color = '#fff';
        bubble.style.alignSelf = 'flex-end';
    } else if (role === 'assistant') {
        bubble.style.background = 'var(--bg-dark-panel)';
        bubble.style.color = 'inherit';
    } else {
        bubble.style.background = 'transparent';
        bubble.style.color = '#999';
    }
    bubble.innerText = text;
    windowEl.appendChild(bubble);
    windowEl.scrollTop = windowEl.scrollHeight;
}

function setAITyping(isTyping) {
    const banner = document.getElementById('aiStatusBanner');
    if (!banner) return;
    banner.textContent = isTyping ? 'Assistant is typing...' : 'Ready to assist.';
}

async function loadMemberPortalData() {
    if (!CURRENT_SESSION || !CURRENT_SESSION.id || !isApprovedMemberSession(CURRENT_SESSION)) {
        MEMBER_DB_STATE = { loans: [], repayments: [], meetings: [], contributions: [], expenses: [], logs: [] };
        return MEMBER_DB_STATE;
    }

    const memberId = encodeURIComponent(CURRENT_SESSION.id);
    const next = { loans: [], repayments: [], meetings: [], contributions: [], expenses: [], logs: [] };
    
    // Parallel loading for performance
    const endpoints = [
        { key: 'loans', url: 'loans/member/' + memberId },
        { key: 'repayments', url: 'repayments/member/' + memberId },
        { key: 'meetings', url: 'automation/meetings/member/' + memberId },
        { key: 'contributions', url: 'contributions/member/' + memberId },
        { key: 'expenses', url: 'expenses/member/' + memberId },
        { key: 'logs', url: 'logs/member-activity/' + memberId },
        { key: 'liveUpdates', url: 'live-updates/member' }
    ];

    try {
        const results = await Promise.allSettled(endpoints.map(ep => apiRequest(ep.url, { method: 'GET' })));
        
        results.forEach((res, idx) => {
            if (res.status === 'fulfilled') {
                next[endpoints[idx].key] = res.value || [];
            } else {
                console.warn(`[loadMemberPortalData] ${endpoints[idx].key} fallback:`, res.reason);
            }
        });

        const systemLogs = (next.logs || []).map(l => ({ message: l.message || l.event_body, type: l.type || l.category || 'system', created_at: l.created_at, timestamp_str: l.timestamp_str }));
        const liveLogs = (next.liveUpdates || []).map(l => ({ message: l.event_body, type: l.event_type, created_at: l.created_at }));
        next.logs = [...systemLogs, ...liveLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
        console.error('[loadMemberPortalData] global fetch error', error);
    }
    
    MEMBER_DB_STATE = next;
    return MEMBER_DB_STATE;
}

function memberLoanViewModel(loan) {
    return {
        id: loan.id ? 'LNK-' + loan.id : loan.local_id,
        db_id: loan.id || loan.db_id,
        memberId: String(loan.borrower_id || loan.memberId || CURRENT_SESSION?.id || ''),
        borrower_name: loan.borrower_name || CURRENT_SESSION?.full_name || CURRENT_SESSION?.name || 'Member',
        amount: Number(loan.amount || 0),
        duration: loan.duration || 0,
        status: loan.status || 'Active',
        timestamp: loan.timestamp ? new Date(loan.timestamp).toLocaleDateString() : new Date().toLocaleDateString()
    };
}

/**
 * ==========================================================================
 * DYNAMIC METRICS REBUILDER & LEDGER COMPILER
 * ==========================================================================
 */
function rebuildMetricsDashboard() {
    const ledger = (MEMBER_DB_STATE.loans || []).map(memberLoanViewModel);
    const repaymentsList = MEMBER_DB_STATE.repayments || [];
    const contributionsList = MEMBER_DB_STATE.contributions || [];
    const expensesList = MEMBER_DB_STATE.expenses || [];
    
    const totalMembersEl = document.getElementById("tileTotalMembers");
    if (totalMembersEl) totalMembersEl.innerText = (MEMBER_DB_STATE.loans || []).length > 0 ? 1 : 0;

    if (CURRENT_SESSION) {
        const myLoans = ledger.filter(l => l.memberId === CURRENT_SESSION.id);
        const activeLoans = myLoans.filter(l => l.status === 'Active');
        
        const totalOutstanding = myLoans.reduce((sum, l) => sum + (l.status === 'Active' ? parseFloat(l.amount) : 0), 0);
        const takenTile = document.getElementById("tileLoansTaken");
        if (takenTile) takenTile.innerText = `Ksh ${totalOutstanding.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        
        const activeTile = document.getElementById("tileActiveLoans");
        if (activeTile) activeTile.innerText = activeLoans.length;

        const myRepaymentsSum = repaymentsList
            .filter(r => String(r.member_id || '') === String(CURRENT_SESSION.id) || r.member_name === (CURRENT_SESSION.full_name || CURRENT_SESSION.name))
            .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);
            
        const paidTile = document.getElementById("tileLoansPaid");
        if (paidTile) paidTile.innerText = `Ksh ${myRepaymentsSum.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;

        const totalHistoricalDebt = totalOutstanding + myRepaymentsSum;
        let progressPercent = 0;
        if (totalHistoricalDebt > 0) {
            progressPercent = Math.min(100, Math.round((myRepaymentsSum / totalHistoricalDebt) * 100));
        }
        
        const progressBar = document.getElementById("repaymentProgressBar");
        const progressText = document.getElementById("repaymentProgressText");
        if (progressBar && progressText) {
            progressBar.style.width = progressPercent + "%";
            progressText.innerText = progressPercent + "% Paid Off";
        }

        const healthScore = computeMemberHealthScore({
            loans: myLoans,
            repayments: repaymentsList,
            contributions: contributionsList,
            meetings: MEMBER_DB_STATE.meetings || [],
            checkins: MEMBER_CHECKIN_STATE
        });
        const healthEl = document.getElementById("tileHealthScore");
        if (healthEl) healthEl.innerText = `${healthScore}%`;

        const select = document.getElementById("payLoanSelect");
        if (select) {
            if (activeLoans.length === 0) {
                select.innerHTML = `<option value="">-- No active outstanding balances detected --</option>`;
            } else {
                select.innerHTML = activeLoans.map(l => `<option value="${l.db_id || l.id}" data-balance="${l.amount}">${l.id} - Outstanding: Ksh ${parseFloat(l.amount).toLocaleString(undefined, {minimumFractionDigits:2})}</option>`).join('');
            }
        }
        const balanceHint = document.getElementById('payLoanBalanceHint');
        if (balanceHint) {
            if (activeLoans.length > 0) {
                const totalOwed = activeLoans.reduce((s, l) => s + parseFloat(l.amount || 0), 0);
                balanceHint.textContent = `Total outstanding: Ksh ${totalOwed.toLocaleString(undefined, {minimumFractionDigits:2})} — enter any amount from Ksh 1 upward`;
            } else {
                balanceHint.textContent = 'No active loans to repay.';
            }
        }

        const tableBody = document.getElementById("memberReportTableBody");
        if (tableBody) {
            const allTx = [];
            myLoans.forEach(l => allTx.push({ id: l.id, type: 'Loan', amount: l.amount, date: l.timestamp || new Date().toLocaleDateString(), status: l.status }));
            repaymentsList.filter(r => String(r.member_id || '') === String(CURRENT_SESSION.id)).forEach(r => allTx.push({ id: r.id ? 'RPY-' + r.id : 'RPY', type: 'Repayment', amount: r.amount, date: r.created_at ? new Date(r.created_at).toLocaleDateString() : '', status: 'Completed' }));
            contributionsList.filter(c => String(c.member_id || '') === String(CURRENT_SESSION.id)).forEach(c => allTx.push({ id: c.id ? 'CBN-' + c.id : 'CBN', type: 'Contribution', amount: c.amount, date: c.created_at ? new Date(c.created_at).toLocaleDateString() : '', status: 'Confirmed' }));
            expensesList.filter(e => String(e.member_id || '') === String(CURRENT_SESSION.id)).forEach(e => allTx.push({ id: e.id ? 'EXP-' + e.id : 'EXP', type: 'Expense', amount: e.amount, date: e.created_at ? new Date(e.created_at).toLocaleDateString() : '', status: e.status || 'Pending' }));

            allTx.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

            const filterVal = document.getElementById('ledgerTypeFilter') ? document.getElementById('ledgerTypeFilter').value : 'all';
            const filtered = filterVal === 'all' ? allTx : allTx.filter(tx => tx.type === filterVal);

            const totalIn = allTx.filter(tx => tx.type === 'Contribution').reduce((s, tx) => s + parseFloat(tx.amount || 0), 0);
            const totalOut = allTx.filter(tx => tx.type === 'Expense').reduce((s, tx) => s + parseFloat(tx.amount || 0), 0);
            const totalLoan = allTx.filter(tx => tx.type === 'Loan').reduce((s, tx) => s + parseFloat(tx.amount || 0), 0);
            const totalRepaid = allTx.filter(tx => tx.type === 'Repayment').reduce((s, tx) => s + parseFloat(tx.amount || 0), 0);

            const summaryEl = document.getElementById('ledgerSummaryCards');
            if (summaryEl) {
                summaryEl.innerHTML = `
                    <div style="background: rgba(76,175,80,0.15); padding: 12px; border-radius: 8px; border-left: 3px solid #4caf50;">
                        <div style="font-size: 0.75rem; color: #888;">Contributions</div>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #4caf50;">Ksh ${totalIn.toLocaleString()}</div>
                    </div>
                    <div style="background: rgba(59,130,246,0.15); padding: 12px; border-radius: 8px; border-left: 3px solid #3b82f6;">
                        <div style="font-size: 0.75rem; color: #888;">Loans Taken</div>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #3b82f6;">Ksh ${totalLoan.toLocaleString()}</div>
                    </div>
                    <div style="background: rgba(16,185,129,0.15); padding: 12px; border-radius: 8px; border-left: 3px solid #10b981;">
                        <div style="font-size: 0.75rem; color: #888;">Repaid</div>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #10b981;">Ksh ${totalRepaid.toLocaleString()}</div>
                    </div>
                    <div style="background: rgba(245,158,11,0.15); padding: 12px; border-radius: 8px; border-left: 3px solid #f59e0b;">
                        <div style="font-size: 0.75rem; color: #888;">Expenses</div>
                        <div style="font-size: 1.1rem; font-weight: bold; color: #f59e0b;">Ksh ${totalOut.toLocaleString()}</div>
                    </div>
                `;
            }

            if (filtered.length > 0) {
                let runningBalance = 0;
                const rows = filtered.map(tx => {
                    let displayBalance = 0;
                    if (tx.type === 'Contribution') runningBalance += parseFloat(tx.amount || 0);
                    else if (tx.type === 'Repayment') runningBalance += parseFloat(tx.amount || 0);
                    else if (tx.type === 'Expense') runningBalance -= parseFloat(tx.amount || 0);
                    else if (tx.type === 'Loan') runningBalance += parseFloat(tx.amount || 0);

                    // For loans and repayments, calculate specific remaining loan balance dynamically
                    if (tx.type === 'Loan' || tx.type === 'Repayment') {
                        const totalTaken = myLoans.reduce((sum, l) => sum + parseFloat(l.amount), 0);
                        const totalPaid = repaymentsList.filter(r => String(r.member_id) === String(CURRENT_SESSION.id)).reduce((sum, r) => sum + parseFloat(r.amount), 0);
                        displayBalance = totalTaken - totalPaid;
                    } else {
                        displayBalance = runningBalance;
                    }

                    const statusColor = (tx.status === 'Active' || tx.status === 'Completed' || tx.status === 'Confirmed' || tx.status === 'Settled') ? 'var(--success)' : 'var(--warning)';
                    return `<tr>
                        <td><code>${tx.id}</code></td>
                        <td>${tx.type}</td>
                        <td>Ksh ${parseFloat(tx.amount).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                        <td>${tx.date}</td>
                        <td><span style="color:${statusColor}; font-weight:bold;">${tx.status}</span></td>
                        <td style="font-weight:500; color: ${displayBalance >= 0 ? 'var(--success)' : 'var(--error)'};">Ksh ${displayBalance.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
                    </tr>`;
                }).join('');
                tableBody.innerHTML = rows;
            } else {
                tableBody.innerHTML = `<tr><td colspan="6" style="text-align: center;" class="text-muted">No transactions found${filterVal !== 'all' ? ' for this type' : ''}.</td></tr>`;
            }
        }
    }

    renderContributionsList();
    renderExpensesList();
    renderNotificationsFeed();

    const joinedEl = document.getElementById("tileMeetingsJoined");
    if (joinedEl) joinedEl.innerText = (MEMBER_DB_STATE.meetings || []).length;
    
    const leftEl = document.getElementById("tileGroupsLeft");
    if (leftEl) leftEl.innerText = '0';

    // Engagement widgets
    if (typeof engagementPostRefresh === 'function') {
        try { engagementPostRefresh(); } catch (_) {}
    }
}

function renderContributionsList() {
    const list = document.getElementById('contributionsListBody');
    if (!list) return;
    const contributions = MEMBER_DB_STATE.contributions || [];
    if (contributions.length === 0) {
        list.innerHTML = `<tr><td colspan="4" style="text-align: center;" class="text-muted">No contributions recorded.</td></tr>`;
        return;
    }
    list.innerHTML = contributions.map(c => `
        <tr>
            <td>${new Date(c.created_at).toLocaleDateString()}</td>
            <td>Ksh ${parseFloat(c.amount).toLocaleString()}</td>
            <td>${c.payment_method}</td>
            <td><span class="text-success">Recorded</span></td>
        </tr>
    `).join('');
}

function renderExpensesList() {
    const list = document.getElementById('expensesListBody');
    if (!list) return;
    const expenses = MEMBER_DB_STATE.expenses || [];
    if (expenses.length === 0) {
        list.innerHTML = `<tr><td colspan="4" style="text-align: center;" class="text-muted">No expense claims submitted.</td></tr>`;
        return;
    }
    list.innerHTML = expenses.map(e => `
        <tr>
            <td>${new Date(e.created_at).toLocaleDateString()}</td>
            <td>${e.category}</td>
            <td>Ksh ${parseFloat(e.amount).toLocaleString()}</td>
            <td><span style="color:${e.status === 'Authorized' ? 'var(--success)' : (e.status === 'Rejected' ? 'var(--error)' : 'var(--warning)')}; font-weight:bold;">${e.status}</span></td>
        </tr>
    `).join('');
}

function executeSystemReset() {
    if (confirm("Confirm complete structural diagnostic wipe of client local browser memory storage containers?\n\nNote: Your session will be preserved. Only cached data will be cleared.")) {
        // Targeted removal - preserve session so member stays logged in
        Object.values(STORAGE_KEYS).forEach(k => {
            if (k !== STORAGE_KEYS.SESSION) localStorage.removeItem(k);
        });
        localStorage.removeItem('disableBlurEffect');
        localStorage.removeItem('memberAccessGranted');
        localStorage.removeItem('currentAdminPhone');
        localStorage.removeItem(WHATSAPP_CACHE_KEY);
        localStorage.removeItem('sessionTimedOut');
        localStorage.removeItem('sessionTimeoutTime');
        window.location.reload();
    }
}

async function updateMemberCredentials(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const newPin = document.getElementById('newPin').value;
    const statusEl = document.getElementById('credUpdateStatus');

    const enforceStrong = localStorage.getItem(MEMBER_SECURITY_PREF_KEYS.ENFORCE_STRONG_PASSWORDS) === 'true';
    if (!currentPassword) {
        statusEl.innerHTML = '<span style="color: #f44336;">Please enter your current password.</span>';
        return;
    }
    if (!newPassword && !newPin) {
        statusEl.innerHTML = '<span style="color: #f44336;">Please enter a new password or new PIN.</span>';
        return;
    }
    if (newPassword && enforceStrong && !/^.*(?=.{8,})(?=.*[A-Z])(?=.*\d).*$/ .test(newPassword)) {
        statusEl.innerHTML = '<span style="color: #f44336;">New password must be at least 8 characters and include a number plus uppercase letter.</span>';
        return;
    }
    if (newPassword && newPassword.length < 6) {
        statusEl.innerHTML = '<span style="color: #f44336;">New password must be at least 6 characters.</span>';
        return;
    }
    if (newPin && (newPin.length !== 4 || !/^\d{4}$/.test(newPin))) {
        statusEl.innerHTML = '<span style="color: #f44336;">PIN must be exactly 4 digits.</span>';
        return;
    }

    const session = CURRENT_SESSION;
    if (!session || !session.id) {
        statusEl.innerHTML = '<span style="color: #f44336;">No active session. Please log in again.</span>';
        return;
    }

    statusEl.innerHTML = '<span style="color: #ff9800;">Updating...</span>';

    try {
        const result = await apiRequest('members/update-password', {
            method: 'POST',
            body: JSON.stringify({
                member_id: session.id,
                current_password: currentPassword,
                new_password: newPassword || undefined,
                new_pin: newPin || undefined
            })
        });

        if (result.success) {
            statusEl.innerHTML = '<span style="color: #4caf50;">Credentials updated successfully!</span>';
            postNotificationToChannels('Security credentials updated: password and/or PIN changed.', 'security');
            document.getElementById('updateCredentialsForm').reset();
        } else {
            statusEl.innerHTML = '<span style="color: #f44336;">' + (result.message || 'Update failed') + '</span>';
        }
    } catch (err) {
        statusEl.innerHTML = '<span style="color: #f44336;">' + (err.message || 'Network error') + '</span>';
    }
}

async function updateMemberProfile(event) {
    event.preventDefault();
    const name = document.getElementById('profileName').value.trim();
    const phone = document.getElementById('profilePhone').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const statusEl = document.getElementById('profileUpdateStatus');

    if (!name && !phone && !email) {
        statusEl.innerHTML = '<span style="color: #f44336;">Please fill in at least one field to update.</span>';
        return;
    }

    const session = CURRENT_SESSION;
    if (!session || !session.id) {
        statusEl.innerHTML = '<span style="color: #f44336;">No active session. Please log in again.</span>';
        return;
    }

    statusEl.innerHTML = '<span style="color: #ff9800;">Updating...</span>';

    try {
        const result = await apiRequest('members/update-profile', {
            method: 'POST',
            body: JSON.stringify({
                member_id: session.id,
                full_name: name || undefined,
                phone: phone || undefined,
                email: email || undefined
            })
        });

        if (result.success) {
            statusEl.innerHTML = '<span style="color: #4caf50;">Profile updated successfully!</span>';
            postNotificationToChannels(`Profile updated: ${name || 'name'}, ${phone || 'phone'}.`, 'profile');
            if (result.member) {
                CURRENT_SESSION = { ...CURRENT_SESSION, ...result.member };
                localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(CURRENT_SESSION));
                const badgeUsername = document.getElementById('badgeUsername');
                if (badgeUsername) badgeUsername.innerText = CURRENT_SESSION.full_name || CURRENT_SESSION.name || 'Member';
            }
        } else {
            statusEl.innerHTML = '<span style="color: #f44336;">' + (result.message || 'Update failed') + '</span>';
        }
    } catch (err) {
        statusEl.innerHTML = '<span style="color: #f44336;">' + (err.message || 'Network error') + '</span>';
    }
}

function prefillProfileForm() {
    if (!CURRENT_SESSION) return;
    const nameEl = document.getElementById('profileName');
    const phoneEl = document.getElementById('profilePhone');
    const emailEl = document.getElementById('profileEmail');
    if (nameEl) nameEl.value = CURRENT_SESSION.full_name || CURRENT_SESSION.name || '';
    if (phoneEl) phoneEl.value = CURRENT_SESSION.phone || '';
    if (emailEl) emailEl.value = CURRENT_SESSION.email || '';

    const sName = document.getElementById('settingsProfileName');
    const sPhone = document.getElementById('settingsProfilePhone');
    const sEmail = document.getElementById('settingsProfileEmail');
    const sStatus = document.getElementById('settingsProfileStatus');
    const sId = document.getElementById('settingsProfileId');
    const sDate = document.getElementById('settingsProfileDate');
    if (sName) sName.textContent = CURRENT_SESSION.full_name || CURRENT_SESSION.name || '-';
    if (sPhone) sPhone.textContent = CURRENT_SESSION.phone || '-';
    if (sEmail) sEmail.textContent = CURRENT_SESSION.email || '-';
    if (sStatus) {
        const statusStr = String(CURRENT_SESSION.status || '').toLowerCase();
        sStatus.textContent = statusStr.charAt(0).toUpperCase() + statusStr.slice(1) || '-';
        sStatus.style.color = (statusStr === 'approved' || statusStr === 'active') ? 'var(--success)' : 'var(--warning)';
    }
    if (sId) sId.textContent = CURRENT_SESSION.id || '-';
    if (sDate) sDate.textContent = CURRENT_SESSION.created_at ? new Date(CURRENT_SESSION.created_at).toLocaleDateString() : '-';

    const memberPrefs = loadMemberSecurityPreferences();
    const memberPrefMap = {
        memberSettingLoginEmailOrUsername: memberPrefs.allowEmailOrUsername,
        memberSettingDisableLoginAutocomplete: memberPrefs.disableLoginAutocomplete,
        memberSettingEnforceStrongPasswords: memberPrefs.enforceStrongPasswords,
        memberSettingAutoLogout: memberPrefs.autoLogout,
        memberSettingHideSensitiveFields: memberPrefs.hideSensitiveFields
    };

    Object.entries(memberPrefMap).forEach(([id, value]) => {
        const checkbox = document.getElementById(id);
        if (checkbox) checkbox.checked = value;
    });
}

function saveMemberSecurityPreferences() {
    const mapping = {
        memberSettingLoginEmailOrUsername: MEMBER_SECURITY_PREF_KEYS.LOGIN_EMAIL_OR_USERNAME,
        memberSettingDisableLoginAutocomplete: MEMBER_SECURITY_PREF_KEYS.DISABLE_LOGIN_AUTOCOMPLETE,
        memberSettingEnforceStrongPasswords: MEMBER_SECURITY_PREF_KEYS.ENFORCE_STRONG_PASSWORDS,
        memberSettingAutoLogout: MEMBER_SECURITY_PREF_KEYS.AUTO_LOGOUT,
        memberSettingHideSensitiveFields: MEMBER_SECURITY_PREF_KEYS.HIDE_SENSITIVE_FIELDS
    };

    Object.entries(mapping).forEach(([id, storageKey]) => {
        const checkbox = document.getElementById(id);
        if (checkbox) localStorage.setItem(storageKey, checkbox.checked ? 'true' : 'false');
    });

    applyMemberSecurityPreferences();
    alert('Security preferences saved successfully.');
}

/* ==========================================================================
   CUSTOM DROPDOWN TOGGLE FUNCTIONS
   ========================================================================== */
function toggleCustomPaymentMethod(val) {
    const custom = document.getElementById('paymentMethodCustom');
    if (custom) custom.style.display = val === '__other__' ? 'block' : 'none';
}

function toggleCustomExpenseCategory(val) {
    const custom = document.getElementById('expenseCategoryCustom');
    if (custom) custom.style.display = val === 'Other' ? 'block' : 'none';
}

/* ==========================================================================
 * NEW OPERATIONAL WORKFLOW MODALS (Payment & Expenses)
 * ========================================================================== */
function openPaymentModal() {
    document.getElementById('paymentModal').style.display = 'flex';
    document.getElementById('paymentForm').reset();
    document.getElementById('memberSearchDropdown').style.display = 'none';
    const customMethod = document.getElementById('paymentMethodCustom');
    if (customMethod) { customMethod.style.display = 'none'; customMethod.value = ''; }
    
    if (CURRENT_SESSION) {
        document.getElementById('paymentMemberId').value = CURRENT_SESSION.id;
        document.getElementById('paymentMemberSearch').value = CURRENT_SESSION.full_name || CURRENT_SESSION.name || '';
    } else {
        document.getElementById('paymentMemberId').value = '';
        document.getElementById('paymentMemberSearch').value = '';
    }
}

function openExpenseModal() {
    document.getElementById('expenseModal').style.display = 'flex';
    document.getElementById('expenseForm').reset();
    const customCat = document.getElementById('expenseCategoryCustom');
    if (customCat) { customCat.style.display = 'none'; customCat.value = ''; }
}

async function fetchAllApprovedMembers() {
    // dashboard-pools is admin-only. For member context, return only the current session member.
    if (!CURRENT_SESSION) return [];
    return [{
        id: CURRENT_SESSION.id,
        full_name: CURRENT_SESSION.full_name || CURRENT_SESSION.name || 'Me',
        email: CURRENT_SESSION.email || ''
    }];
}

async function toggleAllMembersDropdown() {
    const dropdown = document.getElementById('memberSearchDropdown');
    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
    }
    dropdown.innerHTML = '<div style="padding: 10px; color: #888;">Loading members...</div>';
    dropdown.style.display = 'block';
    
    const pool = await fetchAllApprovedMembers();
    if (pool.length === 0) {
        dropdown.innerHTML = '<div style="padding: 10px; color: #888;">No members found</div>';
        return;
    }
    const selfId = CURRENT_SESSION ? String(CURRENT_SESSION.id) : '';
    dropdown.innerHTML = pool.map(m => {
        const isSelf = String(m.id) === selfId;
        const label = (m.full_name || m.name || 'Unknown') + (isSelf ? ' (You)' : '');
        return `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #333;${isSelf ? ' background: rgba(76,175,80,0.15);' : ''}" onclick="selectPaymentMember('${m.id}', '${(m.full_name || m.name || '').replace(/'/g, "\\'")}')">${label}</div>`;
    }).join('');
}

async function filterMemberSearch(query) {
    const dropdown = document.getElementById('memberSearchDropdown');
    if (!query) {
        dropdown.style.display = 'none';
        return;
    }
    
    const pool = await fetchAllApprovedMembers();
    const matches = pool.filter(m => (m.full_name || m.name || '').toLowerCase().includes(query.toLowerCase()));
    
    if (matches.length === 0) {
        dropdown.innerHTML = '<div style="padding: 10px; color: #888;">No active members found</div>';
    } else {
        dropdown.innerHTML = matches.map(m => `<div style="padding: 10px; cursor: pointer; border-bottom: 1px solid #333;" onclick="selectPaymentMember('${m.id}', '${(m.full_name || m.name || '').replace(/'/g, "\\'")}')">${m.full_name || m.name} (${m.email || ''})</div>`).join('');
    }
    dropdown.style.display = 'block';
}

function selectPaymentMember(id, name) {
    document.getElementById('paymentMemberId').value = id;
    document.getElementById('paymentMemberSearch').value = name;
    document.getElementById('memberSearchDropdown').style.display = 'none';
}

function validateExpenseReceipt(input) {
    if (input.files && input.files[0]) {
        if (input.files[0].size > 10 * 1024 * 1024) {
            alert('File size exceeds 10MB limit. Please choose a smaller file.');
            input.value = '';
        }
    }
}

async function submitPayment(event) {
    event.preventDefault();
    const memberId = document.getElementById('paymentMemberId').value;
    const searchVal = document.getElementById('paymentMemberSearch').value.trim();
    
    let finalMemberId = memberId;
    if (!finalMemberId && searchVal && CURRENT_SESSION) {
        finalMemberId = CURRENT_SESSION.id;
    }
    if (!finalMemberId) {
        return alert('Please select a member from the dropdown or type a name.');
    }
    
    const amountVal = document.getElementById('paymentAmount').value;
    if (!amountVal || parseFloat(amountVal) <= 0) {
        return alert('Please enter a valid amount greater than 0.');
    }
    
    const formData = new FormData();
    formData.append('member_id', finalMemberId);
    formData.append('amount', amountVal);
    
    const method = document.getElementById('paymentMethod').value;
    if (method === '__other__') {
        const custom = document.getElementById('paymentMethodCustom').value.trim();
        if (custom) formData.append('payment_method', custom);
    } else if (method) {
        formData.append('payment_method', method);
    }
    
    // Receipt upload disabled as per requirement
    
    try {
        const result = await apiRequest('contributions/create', {
            method: 'POST',
            body: formData
        });
        alert('Payment recorded successfully and sent to Head Treasurer for reconciliation.');
        
        // Notify admin via logs mechanism (dashboard message)
        const payerName = searchVal || CURRENT_SESSION.full_name || CURRENT_SESSION.name || 'Member';
        const methodStr = method === '__other__' ? document.getElementById('paymentMethodCustom').value.trim() : method;
        postApprovalRequestToAdmin(`Member ${payerName} recorded a manual contribution of Ksh ${amountVal} via ${methodStr}.`, 'contribution');
        
        document.getElementById('paymentModal').style.display = 'none';
        await loadMemberPortalData();
        rebuildMetricsDashboard();
    } catch (e) {
        alert('Error: ' + (e.message || 'Failed to submit payment.'));
    }
}

async function submitExpense(event) {
    event.preventDefault();
    if (!CURRENT_SESSION || !CURRENT_SESSION.id) {
        return alert('You must be logged in to submit an expense claim.');
    }
    const formData = new FormData();
    formData.append('member_id', CURRENT_SESSION.id);
    
    const categoryVal = document.getElementById('expenseCategory').value;
    if (categoryVal === 'Other') {
        const custom = document.getElementById('expenseCategoryCustom').value.trim();
        if (!custom) return alert('Please enter a custom category name.');
        formData.append('category', custom);
    } else {
        formData.append('category', categoryVal);
    }
    formData.append('amount', document.getElementById('expenseAmount').value);
    
    // Receipt upload disabled as per requirement
    
    try {
        const result = await apiRequest('expenses/create', {
            method: 'POST',
            body: formData
        });
        alert('Expense claim submitted and routed to Head Treasurer for authorization.');
        postNotificationToChannels(`Expense claim submitted: ${categoryVal} Ksh ${document.getElementById('expenseAmount').value}.`, 'expense');
        document.getElementById('expenseModal').style.display = 'none';
        await loadMemberPortalData();
        rebuildMetricsDashboard();
    } catch (e) {
        alert('Error: ' + (e.message || 'Failed to submit expense claim.'));
    }
}

// Auto-refresh interval (every 30 seconds)
setInterval(async () => {
    if (CURRENT_SESSION && isApprovedMemberSession(CURRENT_SESSION)) {
        await loadMemberPortalData();
        rebuildMetricsDashboard();
    }
}, 30000);

// Global message inbox poller - runs continuously to detect new admin messages
// regardless of which section the member is viewing
setInterval(async () => {
    if (CURRENT_SESSION && CURRENT_SESSION.id && isApprovedMemberSession(CURRENT_SESSION)) {
        await loadUnreadCount();
    }
}, 10000); // Check every 10 seconds

// 
//  SESSION TIMEOUT (10 MINUTES INACTIVITY)
// 
(function() {
    let inactivityTimer;
    const TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

    function resetTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(logoutDueToInactivity, TIMEOUT_MS);
    }

    function logoutDueToInactivity() {
        alert("Session expired due to inactivity. You will be logged out securely.");
        // Use targeted removal — preserve any app data not related to session
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_TAB);
        localStorage.removeItem('disableBlurEffect');
        localStorage.removeItem('memberAccessGranted');
        sessionStorage.clear();
        window.location.href = 'landingpage.html';
    }

    // Use addEventListener to avoid overwriting existing handlers
    window.addEventListener('load', resetTimer);
    document.addEventListener('mousemove', resetTimer);
    document.addEventListener('keypress', resetTimer);
    document.addEventListener('click', resetTimer);
    document.addEventListener('scroll', resetTimer);
})();

/* =====================================================================
   ACTIVITIES SECTION FUNCTIONS
   ===================================================================== */

async function sendActivityEmailToAdmin(e) {
    e.preventDefault();
    const subject  = (document.getElementById('actEmailSubject')?.value || '').trim();
    const msgBody  = (document.getElementById('actEmailBody')?.value   || '').trim();
    const statusEl = document.getElementById('actEmailStatus');
    const btn      = e.target.querySelector('button[type="submit"]');

    if (!subject || !msgBody) { alert('Please fill in both subject and message.'); return; }

    if (statusEl) { statusEl.style.color = '#aaa'; statusEl.textContent = 'Sending…'; }
    if (btn) btn.disabled = true;

    let dbSaved = false;
    try {
        await apiRequest('messages/send', { method: 'POST', body: JSON.stringify({ subject, body: msgBody }) });
        dbSaved = true;
    } catch (dbErr) {
        console.error('DB save error:', dbErr);
    }

    if (dbSaved) {
        if (statusEl) { statusEl.style.color = '#4caf50'; statusEl.textContent = '✔ Message sent successfully!'; }
        e.target.reset();
    } else {
        if (statusEl) { statusEl.style.color = '#f44336'; statusEl.textContent = '✘ Failed to send message. Please try again.'; }
    }

    const adminEmail = document.getElementById('adminEmailDisplay')?.textContent?.trim() || document.getElementById('contactAdminEmail')?.textContent?.trim() || '';
    if (adminEmail && typeof emailjs !== 'undefined') {
        try {
            const fromName  = CURRENT_SESSION ? (CURRENT_SESSION.full_name || CURRENT_SESSION.name || 'Member') : 'Member';
            const fromEmail = CURRENT_SESSION ? (CURRENT_SESSION.email || 'member@chama.local') : 'member@chama.local';
            await emailjs.send('service_0gypwcr', 'template_ozc1j5q', {
                to_email : adminEmail,
                email    : adminEmail,
                from_name: fromName,
                from_email: fromEmail,
                subject  : subject,
                message  : msgBody
            });
        } catch (_) {}
    }

    if (btn) btn.disabled = false;
}

/**
 * Print the member's transaction ledger as a formatted printout.
 */
function printMemberLedger() {
    const memberName   = CURRENT_SESSION ? (CURRENT_SESSION.full_name || CURRENT_SESSION.name || 'Member') : 'Member';
    const memberId     = CURRENT_SESSION ? CURRENT_SESSION.id : '—';
    const loans        = (MEMBER_DB_STATE.loans || []).map(memberLoanViewModel);
    const repayments   = MEMBER_DB_STATE.repayments || [];
    const contributions = MEMBER_DB_STATE.contributions || [];
    const allTx = [];
    loans.forEach(l => allTx.push({ id: l.id, type: 'Loan', amount: l.amount, date: l.timestamp, status: l.status }));
    repayments.forEach(r => allTx.push({ id: r.id ? 'RPY-' + r.id : 'RPY', type: 'Repayment', amount: r.amount, date: r.created_at ? new Date(r.created_at).toLocaleString() : '', status: 'Completed' }));
    contributions.forEach(c => allTx.push({ id: c.id ? 'CBN-' + c.id : 'CBN', type: 'Contribution', amount: c.amount, date: c.created_at ? new Date(c.created_at).toLocaleString() : '', status: 'Confirmed' }));
    allTx.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const rows = allTx.map(tx => `
        <tr>
            <td>${tx.id || '—'}</td>
            <td>${tx.type || tx.classification || '—'}</td>
            <td>Ksh ${Number(tx.amount || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
            <td>${tx.date || '—'}</td>
            <td>${tx.status || 'Logged'}</td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:#888;">No transactions recorded.</td></tr>';

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Member Ledger — ${memberName}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{color:#0077ff}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#0077ff;color:#fff}tr:nth-child(even){background:#f5f5f5}@media print{body{padding:10px}}</style>
    </head><body>
    <h1>📄 Member Transaction Ledger</h1>
    <p><strong>Name:</strong> ${memberName} &nbsp;|&nbsp; <strong>ID:</strong> ${memberId} &nbsp;|&nbsp; <strong>Printed:</strong> ${new Date().toLocaleString()}</p>
    <table><thead><tr><th>ID</th><th>Type</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
}

/**
 * Print the member's savings / contributions statement.
 */
function printMemberSavings() {
    const memberName  = CURRENT_SESSION ? (CURRENT_SESSION.full_name || CURRENT_SESSION.name || 'Member') : 'Member';
    const memberId    = CURRENT_SESSION ? CURRENT_SESSION.id : '—';
    const contribs    = MEMBER_DB_STATE.contributions || [];

    let totalSaved = 0;
    const rows = contribs.map(c => {
        totalSaved += Number(c.amount || 0);
        return `<tr>
            <td>${c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
            <td>Ksh ${Number(c.amount || 0).toLocaleString('en-KE', {minimumFractionDigits:2})}</td>
            <td>${c.method || c.payment_method || '—'}</td>
            <td>${c.status || 'Confirmed'}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" style="text-align:center;color:#888;">No savings recorded.</td></tr>';

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><title>Savings Statement — ${memberName}</title>
    <style>body{font-family:Arial,sans-serif;padding:30px;color:#111}h1{color:#4caf50}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#4caf50;color:#fff}tr:nth-child(even){background:#f5f5f5}.total{font-size:1.2rem;font-weight:bold;margin-top:15px;color:#4caf50}@media print{body{padding:10px}}</style>
    </head><body>
    <h1>🐷 Savings & Contributions Statement</h1>
    <p><strong>Name:</strong> ${memberName} &nbsp;|&nbsp; <strong>ID:</strong> ${memberId} &nbsp;|&nbsp; <strong>Printed:</strong> ${new Date().toLocaleString()}</p>
    <table><thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="total">Total Saved: Ksh ${totalSaved.toLocaleString('en-KE', {minimumFractionDigits:2})}</p>
    <script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
}

/**
 * Load meeting link posted by admin from backend API into the Activities card.
 * Fetches the latest meeting_url from meeting_minutes table.
 */
async function loadMeetingLink() {
    const textEl  = document.getElementById('meetingLinkText');
    const joinBtn = document.getElementById('meetingJoinBtn');
    if (!textEl || !joinBtn) return;

    const showNoLink = () => {
        textEl.textContent = 'No meeting link sent by admin yet. Check back later or contact your admin.';
        textEl.style.color = '#aaa';
        joinBtn.style.display = 'none';
        joinBtn.href = '#';
    };

    try {
        const data = await apiRequest('minutes/latest-link', { method: 'GET' });
        const link = String(data?.meeting_url || data?.data?.meeting_url || '').trim();
        if (link.startsWith('http')) {
            textEl.textContent  = '✅ Meeting link is available! Click the button below to join.';
            textEl.style.color  = '#4caf50';
            joinBtn.href        = link;
            joinBtn.style.display = 'inline-flex';
            localStorage.setItem('adminMeetingLink', link);
            return;
        }
        throw new Error('No active meeting URL');
    } catch (err) {
        const localLink = String(localStorage.getItem('adminMeetingLink') || '').trim();
        if (localLink.startsWith('http')) {
            textEl.textContent  = '✅ Meeting link is available! Click the button below to join.';
            textEl.style.color  = '#4caf50';
            joinBtn.href        = localLink;
            joinBtn.style.display = 'inline-flex';
            return;
        }
        showNoLink();
    }
}

// Auto-load meeting link whenever Activities section becomes visible
document.addEventListener('DOMContentLoaded', () => {
    // Piggyback on the existing nav click system
    document.querySelectorAll('.nav-item[data-target="meetingsSection"]').forEach(navEl => {
        navEl.addEventListener('click', () => {
            setTimeout(loadMeetingLink, 100);
            setTimeout(loadActiveMeetings, 200);
            setTimeout(loadPastMeetings, 300);
        });
    });
    // Also run once on load in case the section is already active
    loadMeetingLink();

    // Load messages badge on session
    if (CURRENT_SESSION && CURRENT_SESSION.id) {
        loadUnreadCount();
        setInterval(loadUnreadCount, 30000);
        startMemberInboxPoller();
    }
});

// ═══════════════════════════════════════════════════════════════════════════
//  MEETINGS — Active / Past dropdown panels
// ═══════════════════════════════════════════════════════════════════════════

function toggleMeetingPanel(panelId, btn) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
        if (panelId === 'activeMeetingsPanel') loadActiveMeetings();
        else loadPastMeetings();
    }
}

async function loadActiveMeetings() {
    const listEl = document.getElementById('activeMeetingsList');
    if (!listEl || !CURRENT_SESSION || !CURRENT_SESSION.id) return;
    listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#888;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const data = await apiRequest('automation/meetings/member/' + CURRENT_SESSION.id + '/active', { method: 'GET' });
        const meetings = Array.isArray(data) ? data : (data.data || []);
        if (!meetings.length) {
            listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#888; font-size:13px;"><i class="fas fa-calendar-times"></i> No upcoming meetings scheduled.</div>';
            return;
        }
        listEl.innerHTML = meetings.map(m => {
            const meetingUrl = String(m.location || m.meeting_url || '').trim();
            const hasJoinUrl = meetingUrl.startsWith('http');
            return `
            <div style="padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:14px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(m.title)}</div>
                    <div style="font-size:12px; color:#888; margin-top:3px;">
                        <i class="fas fa-calendar"></i> ${escHtml(m.meeting_date)}
                        ${m.meeting_time ? ' &bull; <i class="fas fa-clock"></i> ' + escHtml(m.meeting_time) : ''}
                        ${meetingUrl ? ' &bull; <i class="fas fa-map-marker-alt"></i> ' + escHtml(meetingUrl) : ''}
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                    ${hasJoinUrl ? `<button onclick="joinMemberMeeting(${m.id}, '${escAttr(m.title)}', '${escAttr(meetingUrl)}')" title="Join Meeting" style="padding:6px 12px; border-radius:6px; border:none; background:#10b981; color:#fff; font-size:12px; font-weight:600; cursor:pointer;"><i class="fas fa-sign-in-alt"></i> Join</button>` : '<span style="font-size:12px; color:#bbb;">No join link available</span>'}
                </div>
            </div>
        `;
        }).join('');
    } catch (err) {
        console.error('loadActiveMeetings error:', err);
        listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#f44336; font-size:13px;">Failed to load meetings.</div>';
    }
}

async function loadPastMeetings() {
    const listEl = document.getElementById('pastMeetingsList');
    if (!listEl || !CURRENT_SESSION || !CURRENT_SESSION.id) return;
    listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#888;"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    try {
        const data = await apiRequest('automation/meetings/member/' + CURRENT_SESSION.id + '/past', { method: 'GET' });
        const meetings = Array.isArray(data) ? data : (data.data || []);
        if (!meetings.length) {
            listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#888; font-size:13px;"><i class="fas fa-history"></i> No past meetings found.</div>';
            return;
        }
        listEl.innerHTML = meetings.map(m => {
            const meetingUrl = String(m.location || m.meeting_url || '').trim();
            const hasUrl = meetingUrl.startsWith('http');
            return `
            <div style="padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px; opacity:0.85;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:13px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(m.title)}</div>
                    <div style="font-size:11px; color:#666; margin-top:3px;">
                        <i class="fas fa-calendar"></i> ${escHtml(m.meeting_date)}
                        ${meetingUrl ? ' &bull; <i class="fas fa-map-marker-alt"></i> ' + escHtml(meetingUrl) : ''}
                    </div>
                </div>
                ${hasUrl ? `<a href="${escAttr(meetingUrl)}" target="_blank" style="padding:6px 12px; border-radius:6px; background:rgba(30,136,229,0.15); color:#82b1ff; text-decoration:none; font-size:12px;">Open Link</a>` : '<span style="font-size:12px; color:#bbb;">No link available</span>'}
            </div>
        `;
        }).join('');
    } catch (err) {
        console.error('loadPastMeetings error:', err);
        listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#f44336; font-size:13px;">Failed to load meetings.</div>';
    }
}

async function deleteMemberMeeting(id) {
    if (!confirm('Are you sure you want to delete this meeting?')) return;
    try {
        await apiRequest('automation/meetings/' + id, { method: 'DELETE' });
        loadActiveMeetings();
        loadPastMeetings();
    } catch (err) {
        console.error('deleteMemberMeeting error:', err);
        alert('Failed to delete meeting.');
    }
}

async function joinMemberMeeting(id, title, url) {
    const directUrl = String(url || '').trim();
    const link = directUrl.startsWith('http') ? directUrl : String(localStorage.getItem('adminMeetingLink') || '').trim();
    if (link && link.startsWith('http')) {
        window.open(link, '_blank');
    } else {
        try {
            const data = await apiRequest('minutes/latest-link', { method: 'GET' });
            const latestLink = String(data?.meeting_url || data?.data?.meeting_url || '').trim();
            if (latestLink.startsWith('http')) {
                window.open(latestLink, '_blank');
            } else {
                alert('No meeting join link is currently available.');
                return;
            }
        } catch (err) {
            console.warn('joinMemberMeeting: failed to fetch latest link', err);
            alert('Unable to join the meeting at this time. Please contact your admin.');
            return;
        }
    }

    try {
        await apiRequest('live-updates/log', {
            method: 'POST',
            body: JSON.stringify({ event_type: 'meeting_join', event_body: 'Joined meeting: ' + title })
        });
        await apiRequest('messages/send', {
            method: 'POST',
            body: JSON.stringify({ subject: 'Meeting Attendance', body: 'I have joined the meeting: ' + title })
        });
    } catch (err) {
        console.warn('joinMemberMeeting: failed to log event or send message:', err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  MESSAGES — Inbox, Compose, Unread Badge
// ═══════════════════════════════════════════════════════════════════════════

function navigateToMessages() {
    const navLink = document.querySelector('.nav-item[data-target="messagesSection"]');
    if (navLink) navLink.click();
}

async function loadUnreadCount() {
    if (!CURRENT_SESSION || !CURRENT_SESSION.id) return;
    try {
        const data = await apiRequest('messages/unread-count', { method: 'GET' });
        const count = typeof data === 'number' ? data : (data.count || 0);
        const previousCount = _lastKnownUnreadCount;
        _lastKnownUnreadCount = count;
        const badge = document.getElementById('unreadBadgeCount');
        const badgeWrap = document.getElementById('unreadMessagesBadge');
        const navBadge = document.getElementById('navMsgBadge');
        const indicator = document.getElementById('msgUnreadIndicator');
        const checkinWrap = document.getElementById('checkinUnreadBtnWrap');
        const checkinCountEl = document.getElementById('checkinUnreadCount');
        if (badge) badge.textContent = count;
        if (badgeWrap) badgeWrap.style.display = count > 0 ? 'block' : 'none';
        if (navBadge) { navBadge.textContent = count; navBadge.style.display = count > 0 ? 'inline' : 'none'; }
        if (indicator) indicator.style.display = count > 0 ? 'inline' : 'none';
        if (checkinCountEl) checkinCountEl.textContent = count;
        // If unread just cleared, play clear animation before hiding
        const checkinBtn = document.getElementById('checkinUnreadBtn');
        if (previousCount !== null && previousCount > 0 && count === 0 && checkinBtn && checkinWrap) {
            // ensure visible then animate
            checkinWrap.style.display = 'inline-block';
            checkinBtn.classList.add('checkin-cleared');
            setTimeout(() => {
                checkinBtn.classList.remove('checkin-cleared');
                checkinWrap.style.display = 'none';
            }, 520);
        } else {
            if (checkinWrap) checkinWrap.style.display = count > 0 ? 'inline-block' : 'none';
        }
        if (previousCount !== null && count > previousCount) playMemberNotificationSound();
    } catch (err) {
        console.warn('loadUnreadCount error:', err);
    }
}

async function markMeetingInviteRead(messageId) {
    try {
        await apiRequest('messages/member-mark-read', { method: 'POST', body: JSON.stringify({ ids: [messageId] }) });
        loadMessagesInbox({ showLoading: false, forceReload: true });
    } catch (e) {
        console.warn('Failed to mark read', e);
    }
}

function renderMeetingActivity(invites) {
    const container = document.getElementById('meetingActivityContainer');
    if (!container) return;

    if (!invites.length) {
        container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; opacity: 0.6;"><i class="fas fa-calendar-times" style="font-size: 24px; margin-bottom: 10px;"></i><p>No meeting invitations found.</p></div>';
        return;
    }

    container.innerHTML = invites.map(m => {
        const md = m.meeting_data || {};
        const isUnread = !m.is_read;
        const dateStr = m.created_at ? new Date(m.created_at).toLocaleString() : '';
        return `
            <div style="background: rgba(0,0,0,0.25); border: 1px solid ${isUnread ? 'rgba(0,224,255,0.4)' : 'rgba(255,255,255,0.1)'}; border-radius: 12px; padding: 16px; position: relative; display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
                    <div>
                        <h3 style="font-size: 1.1rem; color: ${isUnread ? '#00e0ff' : '#a3dafe'}; font-weight: 700; margin: 0 0 4px 0;">
                            ${isUnread ? '<span style="display:inline-block; width:8px; height:8px; background:#00e0ff; border-radius:50%; margin-right:6px;"></span>' : ''}${escHtml(md.title || 'Meeting Invitation')}
                        </h3>
                        <div style="font-size: 11px; opacity: 0.7;">Received: ${dateStr}</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px; color: #e0f7ff; margin-bottom: 4px;">
                    <div style="display:flex; flex-direction:column;"><span style="font-size:11px; opacity:0.6; text-transform:uppercase;">Date &amp; Time</span><span>${escHtml(md.date)} at ${escHtml(md.time)}</span></div>
                    <div style="display:flex; flex-direction:column;"><span style="font-size:11px; opacity:0.6; text-transform:uppercase;">Venue</span><span>${escHtml(md.venue)}</span></div>
                    <div style="display:flex; flex-direction:column;"><span style="font-size:11px; opacity:0.6; text-transform:uppercase;">Committee</span><span>${escHtml(md.committee)}</span></div>
                    <div style="display:flex; flex-direction:column;"><span style="font-size:11px; opacity:0.6; text-transform:uppercase;">Organizer</span><span>${escHtml(md.organizer)}</span></div>
                </div>
                
                <div style="background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; font-size:12px; color:#cfd8fc; border-left:3px solid #00e0ff; margin-bottom: 4px;">
                    <span style="display:block; font-size:10px; opacity:0.7; text-transform:uppercase; margin-bottom:4px;">Administrator Message</span>
                    ${m.subject ? escHtml(m.subject) : 'No additional message.'}
                </div>

                <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <button class="action-btn" onclick="window.location.href='meeting-center.html?join=${md.meeting_id}'" style="font-size: 12px; padding: 6px 12px; background: linear-gradient(90deg, #00e0ff, #0077ff); color: #000; border: none; font-weight: bold;">
                        <i class="fas fa-link"></i> Join Meeting
                    </button>
                    ${isUnread ? `<button class="action-btn" onclick="markMeetingInviteRead('${m.id}')" style="font-size: 12px; padding: 6px 12px;"><i class="fas fa-eye"></i> Mark as Read</button>` : ''}
                    <button class="btn-del" onclick="deleteMemberMessageForMe('${m.id}')" style="font-size: 12px; padding: 6px 12px;"><i class="fas fa-trash"></i> Delete</button>
                </div>
            </div>
        `;
    }).join('');
}


async function handleCheckinUnreadClick() {
    if (!CURRENT_SESSION || !CURRENT_SESSION.id) return;
    try {
        // Fetch inbox which also marks admin-sent messages as read on server
        await apiRequest('messages/member-inbox/' + CURRENT_SESSION.id, { method: 'GET' });
        // Refresh local inbox and unread count
        await loadMessagesInbox({ showLoading: false, forceReload: true });
        await loadUnreadCount();
        showToast('Marked messages as read.', 'success');
    } catch (err) {
        console.warn('[handleCheckinUnreadClick]', err);
        showToast('Failed to mark messages read.', 'error');
    }
}

async function openMemberNotification(kind = 'messages') {
    const popover = document.getElementById('memberNotificationPopover');
    const body = document.getElementById('memberNotificationBody');
    if (!popover || !body) return;
    if (!popover.hidden) {
        closeMemberNotification();
        return;
    }
    popover.dataset.previousSection = getActiveMemberSection();
    popover.hidden = false;
    body.innerHTML = '<span class="member-insight-loading"><i class="fas fa-spinner fa-spin"></i> Checking your messages...</span>';
    try {
        const data = await apiRequest('messages/member-inbox/' + CURRENT_SESSION.id, { method: 'GET' });
        const messages = Array.isArray(data) ? data : (data.data || []);
        const unread = messages.filter(message => message.sender_role === 'admin' && !message.is_read);
        const latest = unread[0] || messages[0];
        if (!unread.length) {
            body.innerHTML = '<p class="member-insight-note">No unread messages right now. Your inbox is up to date.</p>';
        } else {
            body.innerHTML = `<p class="member-insight-headline"><strong>${unread.length} unread message${unread.length === 1 ? '' : 's'}</strong> from your administrator.</p><div class="member-notification-preview"><strong>${escHtml(latest?.subject || 'New message')}</strong><span>${escHtml((latest?.body || '').slice(0, 120))}${(latest?.body || '').length > 120 ? '...' : ''}</span></div>`;
        }
    } catch (error) {
        body.innerHTML = '<p class="member-insight-note">Messages are temporarily unavailable. Your selected page has not changed.</p>';
        console.warn('[openMemberNotification]', error.message || error);
    }
}

function closeMemberNotification() {
    const popover = document.getElementById('memberNotificationPopover');
    if (!popover) return;
    popover.hidden = true;
}

function openMessagesFromNotification() {
    closeMemberNotification();
    activateNavTab('messagesSection');
}

function toggleNotificationSound() {
    const enabled = localStorage.getItem('memberNotificationSound') !== 'false';
    localStorage.setItem('memberNotificationSound', String(!enabled));
    const label = document.getElementById('notificationSoundLabel');
    if (label) label.textContent = enabled ? 'Sound off' : 'Sound on';
    if (!enabled) playMemberNotificationSound();
}

function toggleMemberMessageMenu(menuId) {
    const menu = document.getElementById(menuId);
    if (!menu) return;
    const isOpen = menu.style.display !== 'none';
    document.querySelectorAll('.member-message-menu').forEach(m => { if (m !== menu) m.style.display = 'none'; });
    menu.style.display = isOpen ? 'none' : 'block';
}

function closeAllMessageMenus() {
    document.querySelectorAll('.message-menu').forEach(m => m.style.display = 'none');
}

function closeAllMemberMessageMenus() {
    document.querySelectorAll('.member-message-menu').forEach(m => m.style.display = 'none');
}

async function deleteMemberMessageForMe(messageId) {
    try {
        await apiRequest('messages/member/' + messageId, { method: 'DELETE' });
        closeAllMemberMessageMenus();
        await loadMessagesInbox();
    } catch (err) {
        alert('Delete failed: ' + (err.message || 'Unknown error'));
    }
}

async function deleteMemberConversationForAll() {
    try {
        await apiRequest('messages/member-thread', { method: 'DELETE' });
        closeAllMemberMessageMenus();
        await loadMessagesInbox();
    } catch (err) {
        alert('Delete conversation failed: ' + (err.message || 'Unknown error'));
    }
}

function shareMemberConversation(subject, body) {
    const text = `${subject}\n\n${body}`;
    if (navigator.share) {
        navigator.share({ title: subject, text }).catch(() => {});
    } else if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => alert('Conversation copied to clipboard.')).catch(() => alert('Clipboard unavailable.'));
    } else {
        alert('Share unavailable in this browser.');
    }
    closeAllMemberMessageMenus();
}

async function markAllMemberMessagesRead() {
    try {
        await apiRequest('messages/member-inbox/' + CURRENT_SESSION.id, { method: 'GET' });
        closeAllMemberMessageMenus();
        await loadMessagesInbox();
    } catch (err) {
        alert('Read all failed: ' + (err.message || 'Unknown error'));
    }
}

function computeMessageHash(messages) {
    return JSON.stringify(messages.map(m => ({
        id: m.id,
        sender_role: m.sender_role,
        is_read: m.is_read,
        subject: m.subject || '',
        body: m.body || '',
        created_at: m.created_at || ''
    })));
}

function renderMessagesInbox(messages, preserveScroll = true) {
    const listEl = document.getElementById('messagesInboxList');
    if (!listEl) return;
    const scrollTop = preserveScroll ? listEl.scrollTop : 0;
    listEl.innerHTML = messages.map(m => {
        const isFromAdmin = m.sender_role === 'admin';
        const label = isFromAdmin ? '<span style="color:#3b82f6; font-weight:600;">Admin</span>' : '<span style="color:#10b981; font-weight:600;">You</span>';
        const statusIndicator = isFromAdmin
            ? `<span style="display:inline-flex; align-items:center; gap:6px; font-size:11px; color:#cfd8dc; margin-left:8px;">
                    <span style="width:10px; height:10px; border-radius:50%; background:${m.is_read ? '#4caf50' : '#9e9e9e'}; display:inline-block;"></span>
                    ${m.is_read ? 'Read' : 'Sent'}
               </span>`
            : '';
        return `
            <article class="message-card ${isFromAdmin ? 'from-admin' : 'from-member'} ${isFromAdmin && !m.is_read ? 'unread' : ''}">
                <div class="message-card-header">
                    <div class="message-card-meta">${label}${statusIndicator}</div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <time class="message-card-meta">${m.created_at ? new Date(m.created_at).toLocaleString() : ''}</time>
                        <div style="position:relative;">
                            <button type="button" class="message-menu-toggle" aria-label="Message actions" title="Message actions" onclick="toggleMemberMessageMenu('member-${m.id}')">...</button>
                            <div id="member-${m.id}" class="member-message-menu" style="display:none; position:absolute; right:0; top:28px; min-width:200px; background:#111827; border:1px solid rgba(255,255,255,0.12); border-radius:8px; padding:6px; z-index:20; box-shadow:0 10px 24px rgba(0,0,0,0.5); overflow:visible;">
                                <button type="button" style="display:block; width:100%; text-align:left; background:none; border:none; color:#fff; padding:8px 10px; cursor:pointer;" onclick="deleteMemberMessageForMe('${m.id}')">Delete Message for Me</button>
                                <button type="button" style="display:block; width:100%; text-align:left; background:none; border:none; color:#fff; padding:8px 10px; cursor:pointer;" onclick="deleteMemberConversationForAll()">Delete Message for All</button>
                                <button type="button" style="display:block; width:100%; text-align:left; background:none; border:none; color:#fff; padding:8px 10px; cursor:pointer;" onclick="shareMemberConversation('${escHtml(m.subject || 'General').replace(/'/g, "\\'")}', '${escHtml(m.body).replace(/'/g, "\\'")}')">Share Conversation</button>
                                <button type="button" style="display:block; width:100%; text-align:left; background:none; border:none; color:#fff; padding:8px 10px; cursor:pointer;" onclick="markAllMemberMessagesRead()">Read All</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="message-card-subject">${escHtml(m.subject || 'General')}</div>
                <div class="message-card-body">${escHtml(m.body)}</div>
            </article>
        `;
    }).join('');
    if (preserveScroll) {
        listEl.scrollTop = scrollTop;
    }
    loadUnreadCount();
}

async function loadMessagesInbox({ showLoading = true, forceReload = false } = {}) {
    const listEl = document.getElementById('messagesInboxList');
    if (!listEl || !CURRENT_SESSION || !CURRENT_SESSION.id) return;
    if (!(await validateMemberSessionOnce())) {
        listEl.innerHTML = '<div class="messages-empty-state"><i class="fas fa-lock"></i><span>Message access needs a fresh session. Your current page is still open.</span></div>';
        return;
    }

    if (MEMBER_MESSAGE_STATE.isSyncing && !forceReload) return;
    MEMBER_MESSAGE_STATE.isSyncing = true;

    if (showLoading) {
        listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#888;"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div>';
    }

    try {
        const data = await apiRequest('messages/member-inbox/' + CURRENT_SESSION.id, { method: 'GET' });
        const allMessages = Array.isArray(data) ? data : (data.data || []);
        
        const standardMessages = [];
        const meetingInvites = [];
        let unreadStandard = 0;
        let unreadMeetings = 0;
        
        for (const m of allMessages) {
            let isMeetingInvite = false;
            if (m.body && m.body.startsWith('{') && m.body.includes('"type":"meeting_invite"')) {
                try {
                    const parsed = JSON.parse(m.body);
                    if (parsed.type === "meeting_invite") {
                        m.meeting_data = parsed;
                        meetingInvites.push(m);
                        if (!m.is_read && m.sender_role === 'admin') unreadMeetings++;
                        isMeetingInvite = true;
                    }
                } catch(e) {}
            }
            if (!isMeetingInvite) {
                standardMessages.push(m);
                if (!m.is_read && m.sender_role === 'admin') unreadStandard++;
            }
        }
        
        // Update badges dynamically based on actual inbox data
        const meetingBadge = document.getElementById('navMeetingBadge');
        if (meetingBadge) {
            meetingBadge.textContent = unreadMeetings;
            meetingBadge.style.display = unreadMeetings > 0 ? 'inline' : 'none';
        }
        
        const msgBadge = document.getElementById('navMsgBadge');
        if (msgBadge) {
            msgBadge.textContent = unreadStandard;
            msgBadge.style.display = unreadStandard > 0 ? 'inline' : 'none';
        }
        
        const payloadHash = computeMessageHash(allMessages);
        const shouldUpdate = forceReload || payloadHash !== MEMBER_MESSAGE_STATE.lastPayloadHash || showLoading;

        if (shouldUpdate) {
            if (!standardMessages.length) {
                listEl.innerHTML = '<div class="messages-empty-state"><i class="fas fa-inbox"></i><span>No standard messages yet.</span></div>';
            } else {
                renderMessagesInbox(standardMessages, !showLoading);
            }
            renderMeetingActivity(meetingInvites);
            MEMBER_MESSAGE_STATE.lastPayloadHash = payloadHash;
        }

    } catch (err) {
        console.error('loadMessagesInbox error:', err);
        if (showLoading || !listEl.innerHTML.trim()) {
            listEl.innerHTML = '<div class="messages-empty-state"><i class="fas fa-cloud-exclamation"></i><span>Messages are temporarily unavailable. Your selected page was preserved.</span><button type="button" class="message-retry-button" onclick="loadMessagesInbox({ showLoading: true, forceReload: true })">Try again</button></div>';
        } else {
            showToast('Messages refresh failed silently. Your selected page remains unchanged.', 'error');
        }
    } finally {
        MEMBER_MESSAGE_STATE.isSyncing = false;
    }
}

async function sendMessageToAdmin(e) {
    e.preventDefault();
    const subjectEl = document.getElementById('msgSubject');
    const bodyEl = document.getElementById('msgBody');
    const statusEl = document.getElementById('sendMessageStatus');
    const btn = document.getElementById('btnSendMessage');
    const subject = (subjectEl?.value || '').trim();
    const body = (bodyEl?.value || '').trim();
    if (!subject || !body) { alert('Please fill in both subject and message.'); return; }
    if (btn) btn.disabled = true;
    if (statusEl) { statusEl.style.color = '#aaa'; statusEl.textContent = 'Sending...'; }
    try {
        await apiRequest('messages/send', { method: 'POST', body: JSON.stringify({ subject, body }) });
        if (statusEl) { statusEl.style.color = '#4caf50'; statusEl.textContent = 'Message sent successfully!'; }
        e.target.reset();
        setTimeout(loadMessagesInbox, 500);
    } catch (err) {
        console.error('sendMessageToAdmin error:', err);
        if (statusEl) { statusEl.style.color = '#f44336'; statusEl.textContent = 'Failed to send message. Please try again.'; }
    } finally {
        if (btn) btn.disabled = false;
    }
}

// Hook into messages section navigation
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item[data-target="messagesSection"], .nav-item[data-target="meetingActivitySection"]').forEach(navEl => {
        navEl.addEventListener('click', () => {
            setTimeout(loadMessagesInbox, 200);
            startMemberInboxPoller();
        });
    });
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.message-menu-toggle') && !event.target.closest('.message-menu') && !event.target.closest('.member-message-menu')) {
            closeAllMessageMenus();
            closeAllMemberMessageMenus();
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════
//  HTML ESCAPE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function escAttr(str) {
    return escHtml(str).replace(/'/g, '&#39;');
}

// ═══════════════════════════════════════════════════════════════════════════
//  ENGAGEMENT & MOTIVATION SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

// --- Daily Check-In ---
async function loadCheckinData() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    try {
        const data = await apiRequest('checkins/me', { method: 'GET' });
        MEMBER_CHECKIN_STATE.currentStreak = Number(data.currentStreak || 0);
        MEMBER_CHECKIN_STATE.longestStreak = Number(data.longestStreak || 0);
        MEMBER_CHECKIN_STATE.checkedInToday = !!data.checkedInToday;

        const streakEl = document.getElementById('checkinStreakNum');
        const ringFill = document.getElementById('checkinRingFill');
        const subtitle = document.getElementById('checkinSubtitle');
        const longest = document.getElementById('checkinLongest');
        const btn = document.getElementById('checkinBtn');
        const btnText = document.getElementById('checkinBtnText');
        const widget = document.getElementById('checkinWidget');
        const headerBadge = document.getElementById('streakBadgeHeader');
        const headerCount = document.getElementById('streakBadgeCount');

        if (widget) widget.style.display = 'block';

        if (data.checkedInToday) {
            if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
            if (btnText) btnText.textContent = 'Checked In Today!';
        } else {
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
            if (btnText) btnText.textContent = 'Check In Today';
        }

        if (streakEl) streakEl.textContent = MEMBER_CHECKIN_STATE.currentStreak;
        if (ringFill) {
            const circumference = 213.6;
            const progress = Math.min(1, MEMBER_CHECKIN_STATE.currentStreak / 30);
            ringFill.style.strokeDashoffset = circumference * (1 - progress);
        }
        if (subtitle) {
            if (MEMBER_CHECKIN_STATE.currentStreak >= 30) subtitle.textContent = 'Incredible discipline! You\'re a streak champion.';
            else if (MEMBER_CHECKIN_STATE.currentStreak >= 7) subtitle.textContent = 'Great consistency! Keep the momentum going.';
            else if (MEMBER_CHECKIN_STATE.currentStreak >= 3) subtitle.textContent = 'Building a healthy habit — keep going!';
            else subtitle.textContent = 'Open the app daily to build your streak!';
        }
        if (longest) longest.textContent = `Longest streak: ${MEMBER_CHECKIN_STATE.longestStreak} days`;

        if (headerBadge && MEMBER_CHECKIN_STATE.currentStreak > 0) {
            headerBadge.style.display = 'block';
            if (headerCount) headerCount.textContent = MEMBER_CHECKIN_STATE.currentStreak;
        }
    } catch (e) {
        console.warn('[loadCheckinData]', e);
    } finally {
        buildSystemImpactNarrative();
    }
}

async function performDailyCheckin() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    try {
        const data = await apiRequest('checkins/ping', { method: 'POST', body: '{}' });
        if (data.alreadyCheckedIn) {
            showToast('You\'ve already checked in today!', 'info');
        } else {
            showToast(`Check-in recorded! ${data.currentStreak}-day streak 🔥`, 'success');
            if (data.milestone) {
                showToast(`Milestone reached: ${data.milestone}-day streak! Keep it up!`, 'success');
            }
        }
        await loadCheckinData();
        checkAndAwardBadges();
    } catch (e) {
        console.error('[performDailyCheckin]', e);
        showToast('Failed to record check-in. Please try again.', 'error');
    }
}

// --- Loan Payoff Progress ---
async function loadLoanPayoffData() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    try {
        const data = await apiRequest('loans/payoff/' + CURRENT_SESSION.id, { method: 'GET' });
        const loans = data.loans || [];
        const panel = document.getElementById('loanPayoffPanel');
        const cardsEl = document.getElementById('loanPayoffCards');

        if (!panel || !cardsEl) return;

        if (loans.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        cardsEl.innerHTML = loans.map(loan => {
            const circumference = 2 * Math.PI * 45;
            const offset = circumference * (1 - loan.pctPaid / 100);
            const projDateStr = loan.projectedPayoffDate
                ? new Date(loan.projectedPayoffDate).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })
                : 'N/A';

            let projectionMsg = '';



            if (loan.projectedPayoffDate && loan.monthsRemaining) {
                projectionMsg = `At your current pace, you'll be debt-free by <strong>${projDateStr}</strong> (${loan.monthsRemaining} month${loan.monthsRemaining !== 1 ? 's' : ''} remaining).`;
            } else if (loan.remaining <= 0) {
                projectionMsg = '<strong>Congratulations — this loan is fully settled!</strong>';
            } else {
                projectionMsg = 'Make regular payments to project your debt-free date.';
            }

            const whatIfExtra = Math.round(loan.avgMonthlyPayment * 0.25) || 500;

            return `
                <div class="loan-payoff-card">
                    <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
                        <div style="position:relative; width:100px; height:100px; flex-shrink:0;">
                            <svg viewBox="0 0 100 100" style="width:100%; height:100%; transform:rotate(-90deg);">
                                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--bg-dark-accent)" stroke-width="7"/>
                                <circle cx="50" cy="50" r="45" fill="none" stroke="var(--success)" stroke-width="7" stroke-linecap="round"
                                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" style="transition: stroke-dashoffset 1s ease;"/>
                            </svg>
                            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column;">
                                <span style="font-size:18px; font-weight:800; color:var(--success);">${loan.pctPaid}%</span>
                                <small style="font-size:9px; opacity:0.6; text-transform:uppercase;">Paid</small>
                            </div>
                        </div>
                        <div style="flex:1; min-width:200px;">
                            <h4 style="margin:0 0 8px;">Loan #${loan.loanId}</h4>
                            <div class="loan-payoff-bar">
                                <div class="loan-payoff-bar-fill" style="width:${loan.pctPaid}%;"></div>
                            </div>
                        </div>
                    </div>
                    <div class="loan-payoff-stats">
                        <div class="loan-payoff-stat"><span class="stat-val" style="color:var(--primary);">KES ${loan.loanAmount.toLocaleString()}</span><span class="stat-lbl">Loan Amount</span></div>
                        <div class="loan-payoff-stat"><span class="stat-val" style="color:var(--success);">KES ${loan.totalPaid.toLocaleString()}</span><span class="stat-lbl">Total Paid</span></div>
                        <div class="loan-payoff-stat"><span class="stat-val" style="color:var(--danger);">KES ${loan.remaining.toLocaleString()}</span><span class="stat-lbl">Remaining</span></div>
                        <div class="loan-payoff-stat"><span class="stat-val">${loan.paymentCount}</span><span class="stat-lbl">Payments Made</span></div>
                        <div class="loan-payoff-stat"><span class="stat-val">${loan.avgMonthlyPayment > 0 ? 'KES ' + loan.avgMonthlyPayment.toLocaleString() : 'N/A'}</span><span class="stat-lbl">Avg Monthly</span></div>
                    </div>
                    <div class="loan-payoff-projection">${projectionMsg}</div>
                    ${loan.remaining > 0 ? `
                    <div class="whatif-slider-group">
                        <label><i class="fas fa-sliders-h"></i> What if I pay extra?</label>
                        <input type="range" min="0" max="${Math.round(loan.avgMonthlyPayment * 2) || 5000}" step="100" value="${whatIfExtra}"
                            oninput="updateWhatIf(this, ${loan.totalOwed}, ${loan.totalPaid}, ${loan.avgMonthlyPayment || 0}, ${loan.interestRate || 0})">
                        <div class="whatif-result" id="whatif-${loan.loanId}">Pay an extra <strong>KES ${whatIfExtra.toLocaleString()}</strong>/month to potentially save time.</div>
                    </div>` : ''}
                </div>
            `;
        }).join('');
    } catch (e) {
        console.warn('[loadLoanPayoffData]', e);
    }
}

function updateWhatIf(slider, totalOwed, totalPaid, avgMonthly, interestRate) {
    const extra = Number(slider.value);
    const remaining = Math.max(0, totalOwed - totalPaid);
    const newMonthly = avgMonthly + extra;
    if (newMonthly <= 0 || remaining <= 0) return;

    const monthsLeft = Math.ceil(remaining / newMonthly);
    const origMonths = avgMonthly > 0 ? Math.ceil(remaining / avgMonthly) : null;
    const savedMonths = origMonths ? Math.max(0, origMonths - monthsLeft) : null;

    const projDate = new Date();
    projDate.setMonth(projDate.getMonth() + monthsLeft);
    const dateStr = projDate.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });

    const resultEl = slider.closest('.whatif-slider-group').querySelector('.whatif-result');
    if (resultEl) {
        if (savedMonths && savedMonths > 0) {
            resultEl.innerHTML = `Pay an extra <strong>KES ${extra.toLocaleString()}</strong>/month → debt-free by <strong>${dateStr}</strong> — <strong>${savedMonths} month${savedMonths !== 1 ? 's' : ''} sooner!</strong>`;
        } else {
            resultEl.innerHTML = `Pay an extra <strong>KES ${extra.toLocaleString()}</strong>/month → debt-free by <strong>${dateStr}</strong>.`;
        }
    }
}

// --- Savings Goal ---
async function loadSavingsGoal() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    try {
        const data = await apiRequest('savings-goals/me', { method: 'GET' });
        MEMBER_DB_STATE.savingsGoal = data.goal || null;
        MEMBER_DB_STATE.totalSaved = Number(data.totalSaved || 0);
        const panel = document.getElementById('savingsGoalPanel');
        const ringFill = document.getElementById('savingsRingFill');
        const pctEl = document.getElementById('savingsPctValue');
        const labelEl = document.getElementById('savingsGoalLabel');
        const progressEl = document.getElementById('savingsGoalProgress');
        const paceEl = document.getElementById('savingsGoalPace');
        const btnText = document.getElementById('savingsGoalBtnText');

        if (!panel) return;

        if (data.goal) {
            panel.style.display = 'block';
            const g = data.goal;
            if (labelEl) labelEl.textContent = g.label || 'Savings Goal';
            if (pctEl) pctEl.textContent = Math.round(g.pctComplete) + '%';
            if (progressEl) progressEl.textContent = `KES ${g.totalSaved.toLocaleString()} of KES ${g.targetAmount.toLocaleString()} saved`;
            if (paceEl) paceEl.textContent = g.paceMessage || '';
            if (btnText) btnText.textContent = 'Update Goal';
            if (ringFill) {
                const circumference = 263.9;
                ringFill.style.strokeDashoffset = circumference * (1 - Math.min(1, g.pctComplete / 100));
            }
        } else if (data.totalSaved > 0) {
            panel.style.display = 'block';
            if (labelEl) labelEl.textContent = 'Total Savings';
            if (pctEl) pctEl.textContent = '—';
            if (progressEl) progressEl.textContent = `KES ${data.totalSaved.toLocaleString()} total saved`;
            if (paceEl) paceEl.textContent = 'Set a target to track your progress.';
            if (btnText) btnText.textContent = 'Set Goal';
        } else {
            panel.style.display = 'none';
        }
    } catch (e) {
        console.warn('[loadSavingsGoal]', e);
    }
}

function computeMemberHealthScore({ loans, repayments, contributions, meetings, checkins }) {
    const totalOutstanding = loans
        .filter(l => ['active', 'approved', 'ongoing', 'overdue'].includes(String(l.status || '').toLowerCase()))
        .reduce((sum, l) => sum + Number(l.amount || 0), 0);
    const totalPaid = repayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const totalSaved = contributions.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const coverage = totalOutstanding + totalPaid > 0 ? Math.min(100, Math.round((totalPaid / (totalOutstanding + totalPaid)) * 100)) : 100;
    const savingsStrength = Math.min(100, Math.round(Math.log10(Math.max(1, totalSaved)) * 10) + 10);
    const streakBonus = Math.min(15, Number(checkins.currentStreak || 0) * 1.5);
    const attendanceBonus = Math.min(10, (meetings || []).length * 2);
    const base = 45;
    const score = Math.max(20, Math.min(100, base + coverage * 0.3 + savingsStrength * 0.2 + streakBonus + attendanceBonus));
    return Math.round(score);
}

function renderFinancialPassport() {
    const panel = document.getElementById('financialPassportPanel');
    if (!panel || !CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;

    const goal = MEMBER_DB_STATE.savingsGoal || null;
    const totalSaved = Number(MEMBER_DB_STATE.totalSaved || 0);
    const loans = MEMBER_DB_STATE.loans || [];
    const repayments = MEMBER_DB_STATE.repayments || [];
    const meetings = MEMBER_DB_STATE.meetings || [];
    const checkins = MEMBER_CHECKIN_STATE;

    const activeLoans = loans.filter(l => ['active', 'approved', 'ongoing', 'overdue'].includes(String(l.status || '').toLowerCase()));
    const totalLoanAmount = loans.reduce((sum, l) => sum + Number(l.amount || 0), 0);
    const totalPaid = repayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const loanRatio = totalLoanAmount > 0 ? Math.round(Math.min(100, (totalPaid / totalLoanAmount) * 100)) : 0;

    const reliability = activeLoans.length === 0 && Number(checkins.currentStreak || 0) >= 7 ? 'Excellent' : activeLoans.length === 0 ? 'Strong' : 'Developing';
    const habit = totalSaved > 0 ? `${Math.min(100, Math.round((totalSaved / Math.max(1, Number(goal?.targetAmount || 5000))) * 100))}%` : 'Needs a goal';
    const behavior = loanRatio >= 80 ? 'Consistent' : loanRatio >= 50 ? 'On track' : totalLoanAmount > 0 ? 'Needs attention' : 'No history';
    const attendance = `${meetings.length || 0} scheduled`;
    const goalStatus = goal ? `${goal.pctComplete || 0}% of KES ${Number(goal.targetAmount || 0).toLocaleString()}` : 'No active savings goal';

    const reliabilityEl = document.getElementById('passportReliability');
    const savingsHabitEl = document.getElementById('passportSavingsHabit');
    const loanBehaviorEl = document.getElementById('passportLoanBehavior');
    const attendanceEl = document.getElementById('passportAttendance');
    const goalStatusEl = document.getElementById('passportGoalStatus');

    if (reliabilityEl) reliabilityEl.textContent = reliability;
    if (savingsHabitEl) savingsHabitEl.textContent = habit;
    if (loanBehaviorEl) loanBehaviorEl.textContent = behavior;
    if (attendanceEl) attendanceEl.textContent = attendance;
    if (goalStatusEl) goalStatusEl.textContent = goalStatus;
    panel.style.display = 'block';
}

function renderMemberTimeline() {
    const list = document.getElementById('memberTimelineList');
    if (!list || !CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;

    const entries = [];
    const logs = MEMBER_DB_STATE.logs || [];
    const contributions = MEMBER_DB_STATE.contributions || [];
    const repayments = MEMBER_DB_STATE.repayments || [];
    const meetings = MEMBER_DB_STATE.meetings || [];

    logs.forEach(log => {
        const when = new Date(log.created_at || log.timestamp_str || Date.now());
        entries.push({ when, title: log.message || 'System update', type: log.type || 'system' });
    });
    contributions.forEach(c => {
        const when = new Date(c.created_at || c.timestamp || Date.now());
        entries.push({ when, title: `Saved KES ${Number(c.amount || 0).toLocaleString()}`, type: 'contribution' });
    });
    repayments.forEach(r => {
        const when = new Date(r.created_at || r.timestamp || Date.now());
        entries.push({ when, title: `Paid KES ${Number(r.amount || 0).toLocaleString()} toward loan`, type: 'repayment' });
    });
    meetings.forEach(m => {
        const when = new Date(m.meeting_date ? `${m.meeting_date}T${m.meeting_time || '00:00:00'}` : m.created_at || Date.now());
        const descriptor = m.title || m.meeting_title || 'Member meeting';
        entries.push({ when, title: `Meeting: ${descriptor}`, type: 'meeting' });
    });

    if (!entries.length) {
        list.innerHTML = '<div class="text-muted" style="text-align:center; padding:2rem;">No timeline events found yet.</div>';
        const panel = document.getElementById('memberTimelinePanel');
        if (panel) panel.style.display = 'none';
        return;
    }

    const sorted = entries.sort((a, b) => b.when - a.when).slice(0, 10);
    list.innerHTML = sorted.map(item => {
        const iconMap = {
            system: 'fas fa-cog',
            contribution: 'fas fa-piggy-bank',
            repayment: 'fas fa-check-circle',
            meeting: 'fas fa-video'
        };
        const colorMap = {
            system: '#8b5cf6',
            contribution: '#4caf50',
            repayment: '#10b981',
            meeting: '#06b6d4'
        };
        const icon = iconMap[item.type] || 'fas fa-history';
        const color = colorMap[item.type] || '#94a3b8';
        const whenText = item.when instanceof Date && !isNaN(item.when) ? item.when.toLocaleString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return `<div style="display:flex; gap:12px; align-items:flex-start; padding:14px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;">
            <div style="width:40px; height:40px; border-radius: 12px; display:flex; align-items:center; justify-content:center; background:${color}22; color:${color}; font-size: 1.05rem;"><i class="${icon}"></i></div>
            <div style="flex:1;">
                <div style="font-weight:700; font-size: 0.92rem;">${escHtml(item.title)}</div>
                <div style="font-size: 0.8rem; color: #94a3b8; margin-top:4px;">${escHtml(whenText)}</div>
            </div>
        </div>`;
    }).join('');
    const panel = document.getElementById('memberTimelinePanel');
    if (panel) panel.style.display = 'block';
}

function openSavingsGoalModal() {
    const modal = document.getElementById('savingsGoalModal');
    if (modal) modal.style.display = 'flex';
}

async function submitSavingsGoal(e) {
    e.preventDefault();
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    const label = document.getElementById('savingsGoalName')?.value?.trim() || 'Savings Goal';
    const amount = document.getElementById('savingsGoalAmount')?.value;
    const date = document.getElementById('savingsGoalDate')?.value || null;
    if (!amount || Number(amount) <= 0) { showToast('Please enter a valid target amount.', 'error'); return; }
    try {
        await apiRequest('savings-goals/set', {
            method: 'POST',
            body: JSON.stringify({ target_amount: Number(amount), target_date: date, goal_label: label })
        });
        showToast('Savings goal saved!', 'success');
        document.getElementById('savingsGoalModal').style.display = 'none';
        loadSavingsGoal();
    } catch (e) {
        console.error('[submitSavingsGoal]', e);
        showToast('Failed to save goal. Please try again.', 'error');
    }
}

// --- Badges ---
async function loadBadges() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    try {
        const data = await apiRequest('badges/me', { method: 'GET' });
        return data;
    } catch (e) {
        console.warn('[loadBadges]', e);
        return { badges: [], earnedCount: 0, total: 0 };
    }
}

async function checkAndAwardBadges() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    try {
        const result = await apiRequest('badges/check', { method: 'POST', body: '{}' });
        if (result.newlyEarned && result.newlyEarned.length > 0) {
            for (const key of result.newlyEarned) {
                const labels = {
                    first_repayment: 'First Repayment Made!',
                    loan_50_paid: '50% Loan Repaid!',
                    loan_fully_paid: 'Loan Fully Settled!',
                    streak_3: '3-Day Streak!',
                    streak_7: '7-Day Streak!',
                    streak_30: '30-Day Streak!',
                    first_savings: 'First Savings Deposit!',
                    on_time_payer: 'On-Time Payer!'
                };
                showToast(`Badge earned: ${labels[key] || key}`, 'success');
            }
        }
    } catch (e) {
        console.warn('[checkAndAwardBadges]', e);
    }
}

function renderBadgesGrid(badgesData) {
    const grid = document.getElementById('progressBadgesGrid');
    if (!grid || !badgesData) return;
    const badges = badgesData.badges || [];
    if (badges.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted); font-size:13px;">No badges available yet.</div>';
        return;
    }
    grid.innerHTML = badges.map(b => `
        <div class="badge-item ${b.earned ? 'earned' : 'locked'}">
            <div class="badge-icon-circle">
                <i class="fas ${b.icon}"></i>
            </div>
            <div class="badge-label">${escHtml(b.label)}</div>
            <div class="badge-date">${b.earned && b.earnedAt ? 'Earned ' + new Date(b.earnedAt).toLocaleDateString('en-KE', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not yet earned'}</div>
        </div>
    `).join('');
}

// --- Personalized Daily Message ---
function generateDailyMessage() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    const box = document.getElementById('dailyMessageBox');
    if (!box) return;

    const loans = MEMBER_DB_STATE.loans || [];
    const repayments = MEMBER_DB_STATE.repayments || [];

    let msgType = '', title = '', text = '', iconBg = '', iconColor = '', iconClass = '', linkText = '', linkTarget = '';

    // Priority 1: Overdue payment
    const activeLoans = loans.filter(l => l.status === 'Active' || l.status === 'Overdue');
    if (activeLoans.length > 0) {
        const loan = activeLoans[0];
        const loanDate = new Date(loan.created_at);
        const daysSince = Math.floor((Date.now() - loanDate) / (1000 * 60 * 60 * 24));
        const totalPaid = repayments.filter(r => String(r.loan_id) === String(loan.id)).reduce((s, r) => s + Number(r.amount || 0), 0);
        const remaining = Number(loan.amount) - totalPaid;
        if (remaining > 0 && daysSince > 30) {
            msgType = 'warning';
            title = 'Loan Payment Reminder';
            text = `You have KES ${remaining.toLocaleString()} remaining on your loan (created ${daysSince} days ago). Regular payments help you clear your debt faster.`;
            iconBg = 'rgba(251,191,36,0.15)'; iconColor = '#fbbf24'; iconClass = 'fas fa-exclamation-triangle';
            linkText = 'Go to Repayments'; linkTarget = 'payLoanSection';
        }
    }

    // Priority 2: Close to finishing
    if (!msgType && activeLoans.length > 0) {
        for (const loan of activeLoans) {
            const totalPaid = repayments.filter(r => String(r.loan_id) === String(loan.id)).reduce((s, r) => s + Number(r.amount || 0), 0);
            const pct = Number(loan.amount) > 0 ? (totalPaid / Number(loan.amount)) * 100 : 0;
            if (pct >= 80) {
                msgType = 'success';
                title = 'You\'re Almost Debt-Free!';
                text = `You've repaid ${Math.round(pct)}% of your loan — just ${Math.round(100 - pct)}% to go. Keep up the great work!`;
                iconBg = 'rgba(76,175,80,0.15)'; iconColor = '#4caf50'; iconClass = 'fas fa-trophy';
                linkText = 'View Progress'; linkTarget = 'progressSection';
                break;
            }
        }
    }

    // Priority 3: Streak encouragement
    if (!msgType) {
        const streakEl = document.getElementById('checkinStreakNum');
        const streak = streakEl ? parseInt(streakEl.textContent) || 0 : 0;
        if (streak >= 3) {
            msgType = 'info';
            title = 'Streak Keep Going!';
            text = `You're on a ${streak}-day check-in streak. Consistency builds great financial habits!`;
            iconBg = 'rgba(251,191,36,0.15)'; iconColor = '#fbbf24'; iconClass = 'fas fa-fire';
            linkText = 'View Progress'; linkTarget = 'progressSection';
        }
    }

    // Priority 4: Finance tip
    if (!msgType) {
        const tips = [
            'Set aside at least 10% of income for savings before spending on anything else.',
            'Track every expense for one month — you\'ll be surprised where money goes.',
            'Emergency fund goal: 3-6 months of living expenses saved.',
            'Paying even a small extra amount on your loan principal saves significant interest.',
            'Review your spending weekly to stay on track with financial goals.',
            'Automate savings so you never have to remember to set money aside.',
            'Financial freedom starts with a single step — celebrate small wins!',
            'Consider needs vs wants before each purchase decision.',
            'Diversify income streams where possible for financial resilience.',
            'Regular loan repayments build your creditworthiness for future borrowing.',
            'A budget is telling your money where to go instead of wondering where it went.',
            'Compound growth works best with time — start saving early.',
            'Avoid borrowing for depreciating assets whenever possible.',
            'Keep an updated list of all financial obligations and their due dates.',
            'The best time to save was yesterday. The second best time is today.',
            'Review financial goals monthly and adjust plans as circumstances change.',
            'Lending to friends or family without clear terms often damages relationships.',
            'Small daily savings add up to significant annual progress.',
            'Being debt-free gives you options that being in debt never will.',
            'Financial wellness is a marathon, not a sprint — pace yourself.'
        ];
        const tipIdx = new Date().getDate() % tips.length;
        msgType = 'tip';
        title = 'Daily Finance Tip';
        text = tips[tipIdx];
        iconBg = 'rgba(56,189,248,0.15)'; iconColor = '#38bdf8'; iconClass = 'fas fa-lightbulb';
    }

    box.style.display = 'flex';
    box.style.borderLeftColor = msgType === 'warning' ? '#fbbf24' : msgType === 'success' ? '#4caf50' : msgType === 'info' ? '#fbbf24' : '#38bdf8';
    const iconDiv = document.getElementById('dailyMessageIcon');
    if (iconDiv) { iconDiv.style.background = iconBg; iconDiv.style.color = iconColor; iconDiv.innerHTML = `<i class="${iconClass}"></i>`; }
    const titleEl = document.getElementById('dailyMessageTitle');
    if (titleEl) titleEl.textContent = title;
    const textEl = document.getElementById('dailyMessageText');
    if (textEl) textEl.textContent = text;
    const linkEl = document.getElementById('dailyMessageLink');
    if (linkEl && linkText) { linkEl.style.display = 'inline-block'; linkEl.textContent = linkText; linkEl.onclick = (e) => { e.preventDefault(); activateNavTab(linkTarget); }; }
    else if (linkEl) { linkEl.style.display = 'none'; }
}

function buildSystemImpactNarrative() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;

    const loans = MEMBER_DB_STATE.loans || [];
    const repayments = MEMBER_DB_STATE.repayments || [];
    const contributions = MEMBER_DB_STATE.contributions || [];
    const meetings = MEMBER_DB_STATE.meetings || [];
    const activeLoans = loans.filter(l => String(l.status || '').toLowerCase() === 'active' || String(l.status || '').toLowerCase() === 'overdue');
    const completedLoans = loans.filter(l => String(l.status || '').toLowerCase() === 'completed' || String(l.status || '').toLowerCase() === 'paid');
    const totalPaid = repayments.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const totalContributions = contributions.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const loanCount = loans.length;
    const memberName = CURRENT_SESSION.full_name || CURRENT_SESSION.name || 'Member';

    const needText = activeLoans.length > 0
        ? `This portal keeps ${memberName} and the treasurer aligned on every outstanding loan, payment schedule and priority action without relying on paperwork or repeated calls.`
        : `This portal is the central place for contributions, payment history and member engagement, so the treasurer can manage funds clearly and members can see their progress instantly.`;

    const improveText = `Yes — it improves lives by offering clear repayment reminders, progress trackers, live notifications, and a trusted contact channel for your assigned officer. That means fewer missed dues, less uncertainty, and more confidence for both the treasurer and members.`;

    const liveWithoutText = `Without it, the group would return to informal records, manual follow-ups, and missed deadlines. The system reduces friction and creates a dependable source of truth for lending and savings.`;

    const marketText = `The system is built for real market demand: cooperative groups, savings circles and member-led finances need simple, reliable tools. This portal's friendly dashboard, clear action cards and approval workflow make it market-ready for treasurers and members alike.`;

    const answerData = {
        need: needText,
        improve: improveText,
        liveWithout: liveWithoutText,
        market: marketText
    };

    const panel = document.getElementById('impactNarrativePanel');
    const needEl = document.getElementById('impactAnswerNeed');
    const improveEl = document.getElementById('impactAnswerImprove');
    const liveWithoutEl = document.getElementById('impactAnswerLiveWithout');
    const marketEl = document.getElementById('impactAnswerMarket');

    if (panel) panel.style.display = 'block';
    if (needEl) needEl.textContent = answerData.need;
    if (improveEl) improveEl.textContent = answerData.improve;
    if (liveWithoutEl) liveWithoutEl.textContent = answerData.liveWithout;
    if (marketEl) marketEl.textContent = answerData.market;

    MEMBER_SYSTEM_IMPACT_STATE.lastBuiltAt = new Date().toISOString();
}

function buildMemberRoadmap() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;
    const panel = document.getElementById('memberRoadmapPanel');
    const container = document.getElementById('memberRoadmapCards');
    if (!panel || !container) return;

    const loans = MEMBER_DB_STATE.loans || [];
    const repayments = MEMBER_DB_STATE.repayments || [];
    const meetings = MEMBER_DB_STATE.meetings || [];
    const contributions = MEMBER_DB_STATE.contributions || [];

    const normalizeStatus = status => String(status || '').toLowerCase();
    const activeLoans = loans.filter(loan => ['active', 'approved', 'ongoing'].includes(normalizeStatus(loan.status)) || normalizeStatus(loan.status) === 'overdue');
    const overdueLoans = loans.filter(loan => normalizeStatus(loan.status) === 'overdue');
    const nextMeeting = meetings
        .map(item => ({ ...item, date: item.date ? new Date(item.date) : new Date(item.scheduled_at || item.timestamp || null) }))
        .filter(item => item.date instanceof Date && !isNaN(item.date))
        .filter(item => item.date >= new Date())
        .sort((a, b) => a.date - b.date)[0];

    const unreadCount = parseInt(document.getElementById('unreadBadgeCount')?.textContent || '0', 10) || 0;
    const totalContributions = contributions.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const sanitize = text => String(text || '').replace(/[&<>]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char] || char));
    const formatAmount = value => `KES ${Number(value || 0).toLocaleString()}`;
    const formatDateLabel = date => {
        if (!date || !(date instanceof Date) || isNaN(date)) return 'Upcoming';
        return date.toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    };

    const makeCard = (title, message, note, icon = 'fas fa-map-marker-alt', ctaText = '', ctaTarget = '') => `
        <div class="roadmap-card" style="background: var(--bg-dark-core); border: 1px solid var(--bg-dark-accent); border-radius: 14px; padding: 18px; min-height: 160px; display:flex; flex-direction:column; justify-content:space-between;">
            <div>
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
                    <div style="width:38px; height:38px; border-radius:12px; display:flex; align-items:center; justify-content:center; background: rgba(14,165,233,0.12); color: #0ea5e9; font-size: 1rem;">
                        <i class="${icon}"></i>
                    </div>
                    <strong style="font-size:0.95rem;">${sanitize(title)}</strong>
                </div>
                <p style="margin:0 0 10px; font-size:13px; line-height:1.6; color:var(--text-muted);">${sanitize(message)}</p>
                ${note ? `<p style="margin:0 0 12px; font-size:12px; color:var(--text-muted); opacity:0.8;">${sanitize(note)}</p>` : ''}
            </div>
            ${ctaTarget ? `<a href="#" onclick="event.preventDefault(); activateNavTab('${ctaTarget}');" style="font-size:12px; font-weight:700; color:var(--primary); text-decoration:underline; margin-top:12px;">${sanitize(ctaText)}</a>` : ''}
        </div>`;

    const cards = [];
    if (unreadCount > 0) {
        cards.push(makeCard(
            'Unread Messages',
            `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}. Review your messages to stay aligned with your officer.`,
            'Prioritize replies to avoid delays in loan or savings approval.',
            'fas fa-envelope-open-text',
            'Review Messages',
            'messagesSection'
        ));
    }

    if (overdueLoans.length > 0) {
        const overdueAmount = overdueLoans.reduce((sum, loan) => {
            const repaid = repayments.filter(r => String(r.loan_id) === String(loan.id)).reduce((sub, r) => sub + Number(r.amount || 0), 0);
            return sum + Math.max(0, Number(loan.amount || 0) - repaid);
        }, 0);
        cards.push(makeCard(
            'Overdue Loan Action',
            `You have ${overdueLoans.length} overdue loan${overdueLoans.length !== 1 ? 's' : ''}. A payment of ${formatAmount(overdueAmount)} will reduce your overdue balance.`,
            'Address overdue loans first to protect your membership standing.',
            'fas fa-exclamation-circle',
            'Settle Overdue Balance',
            'payLoanSection'
        ));
    } else if (activeLoans.length > 0) {
        const loan = activeLoans[0];
        const paid = repayments.filter(r => String(r.loan_id) === String(loan.id)).reduce((sub, r) => sub + Number(r.amount || 0), 0);
        const balance = Math.max(0, Number(loan.amount || 0) - paid);
        const suggested = Math.max(500, Math.round(balance * 0.1));
        cards.push(makeCard(
            'Loan Momentum',
            `Your active loan #${loan.id} has a remaining balance of ${formatAmount(balance)}. A focused payment keeps your progress moving forward.`,
            `Suggested next payment: ${formatAmount(suggested)}.`,
            'fas fa-arrow-circle-right',
            'Pay Loan',
            'payLoanSection'
        ));
    } else {
        cards.push(makeCard(
            'Savings & Planning',
            'You currently have no active loans. This is a good opportunity to continue building savings or prepare for a new loan request.',
            'Strong savings habits make borrowing easier and safer.',
            'fas fa-seedling',
            'Save More',
            'contributionsSection'
        ));
    }

    if (nextMeeting) {
        cards.push(makeCard(
            'Upcoming Meeting',
            `Your next member meeting is scheduled for ${formatDateLabel(nextMeeting.date)}. Attend to keep your account active and connected.`,
            nextMeeting.title ? `Agenda: ${sanitize(nextMeeting.title)}` : 'Stay ready for the next group update.',
            'fas fa-calendar-check',
            'See Activities',
            'meetingsSection'
        ));
    } else {
        cards.push(makeCard(
            'Stay Connected',
            'No meetings are currently scheduled. Keep checking back for activity updates and new member events.',
            'Regular participation builds trust and speeds up approvals.',
            'fas fa-headset',
            'View Activities',
            'meetingsSection'
        ));
    }

    if (totalContributions > 0) {
        cards.push(makeCard(
            'Contributions Progress',
            `You have contributed a total of ${formatAmount(totalContributions)}. Keep contributing to build liquidity and membership strength.`,
            'Consistent savings support loan approvals and group stability.',
            'fas fa-piggy-bank',
            'Manage Contributions',
            'contributionsSection'
        ));
    } else {
        cards.push(makeCard(
            'Build Your Savings',
            'No contribution history was found yet. Start depositing regularly to improve your loan readiness and group position.',
            'Small, steady contributions add up quickly with the right plan.',
            'fas fa-hand-holding-heart',
            'Start Saving',
            'contributionsSection'
        ));
    }

    panel.style.display = 'block';
    container.innerHTML = cards.slice(0, 4).join('');
}

// --- My Progress Section ---
async function loadProgressSection() {
    if (!CURRENT_SESSION || !isApprovedMemberSession(CURRENT_SESSION)) return;

    // Streak
    try {
        const checkinData = await apiRequest('checkins/me', { method: 'GET' });
        const streakEl = document.getElementById('progressStreak');
        if (streakEl) streakEl.textContent = (checkinData.currentStreak || 0) + ' days';
    } catch (_) {}

    // Badges
    const badgesData = await loadBadges();
    const badgeCountEl = document.getElementById('progressBadges');
    if (badgeCountEl && badgesData) badgeCountEl.textContent = `${badgesData.earnedCount} / ${badgesData.total}`;
    renderBadgesGrid(badgesData);

    // Savings
    try {
        const savData = await apiRequest('savings-goals/me', { method: 'GET' });
        const savedEl = document.getElementById('progressSaved');
        if (savedEl) savedEl.textContent = 'KES ' + (savData.totalSaved || 0).toLocaleString();
    } catch (_) {}

    // Repaid
    const repayments = MEMBER_DB_STATE.repayments || [];
    const totalRepaid = repayments.reduce((s, r) => s + Number(r.amount || 0), 0);
    const repaidEl = document.getElementById('progressRepaid');
    if (repaidEl) repaidEl.textContent = 'KES ' + totalRepaid.toLocaleString();

    // Loan progress cards in My Progress
    const loanPanel = document.getElementById('progressLoanPanel');
    const loanCards = document.getElementById('progressLoanCards');
    if (loanPanel && loanCards) {
        try {
            const payoffData = await apiRequest('loans/payoff/' + CURRENT_SESSION.id, { method: 'GET' });
            const loans = payoffData.loans || [];
            if (loans.length === 0) {
                loanPanel.style.display = 'none';
            } else {
                loanPanel.style.display = 'block';
                loanCards.innerHTML = loans.map(loan => {
                    return `
                        <div style="padding:14px; background:var(--bg-dark-core); border-radius:10px; margin-bottom:10px; border:1px solid var(--bg-dark-accent);">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <strong style="font-size:14px;">Loan #${loan.loanId}</strong>
                                <span style="font-size:13px; color:var(--success); font-weight:700;">${loan.pctPaid}% paid</span>
                            </div>
                            <div class="loan-payoff-bar"><div class="loan-payoff-bar-fill" style="width:${loan.pctPaid}%;"></div></div>
                            <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-muted); margin-top:6px;">
                                <span>KES ${loan.totalPaid.toLocaleString()} paid</span>
                                <span>KES ${loan.remaining.toLocaleString()} remaining</span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (_) { loanPanel.style.display = 'none'; }
    }

    // Next Best Action
    const actionPanel = document.getElementById('nextActionPanel');
    const actionText = document.getElementById('nextActionText');
    if (actionPanel && actionText) {
        const loans = MEMBER_DB_STATE.loans || [];
        const activeLoans = loans.filter(l => l.status === 'Active');
        const repaymentsList = MEMBER_DB_STATE.repayments || [];

        if (activeLoans.length > 0) {
            const loan = activeLoans[0];
            const totalPaid = repaymentsList.filter(r => String(r.loan_id) === String(loan.id)).reduce((s, r) => s + Number(r.amount || 0), 0);
            const remaining = Number(loan.amount) - totalPaid;
            const suggestedPayment = Math.min(remaining, Math.round(remaining * 0.1) || 500);
            actionText.innerHTML = `Pay <strong>KES ${suggestedPayment.toLocaleString()}</strong> toward Loan #${loan.id} to reduce your outstanding balance from KES ${remaining.toLocaleString()}. <a href="#" onclick="event.preventDefault(); activateNavTab('payLoanSection');" style="color:var(--primary);">Go to Repayments →</a>`;
            actionPanel.style.display = 'block';
        } else {
            actionText.innerHTML = `You have no active loans. Consider <a href="#" onclick="event.preventDefault(); activateNavTab('takeLoanSection');" style="color:var(--primary);">applying for a loan</a> or growing your <a href="#" onclick="event.preventDefault(); activateNavTab('contributionsSection');" style="color:var(--primary);">savings</a>.`;
            actionPanel.style.display = 'block';
        }
    }
}

// --- Integration hooks: called after data refresh ---
function engagementPostRefresh() {
    loadCheckinData();
    loadLoanPayoffData();
    loadSavingsGoal();
    generateDailyMessage();
    checkAndAwardBadges();
    renderFinancialPassport();
    renderMemberTimeline();
    buildSystemImpactNarrative();
    buildMemberRoadmap();
}

// Hook into navigation to load data when sections become visible
(function hookEngagementNavigation() {
    document.addEventListener('DOMContentLoaded', () => {
        // My Progress tab
        document.querySelectorAll('.nav-item[data-target="progressSection"]').forEach(el => {
            el.addEventListener('click', () => setTimeout(loadProgressSection, 200));
        });
        // Pay Loan tab — load payoff data
        document.querySelectorAll('.nav-item[data-target="payLoanSection"]').forEach(el => {
            el.addEventListener('click', () => setTimeout(loadLoanPayoffData, 200));
        });
        // Contributions tab — load savings goal
        document.querySelectorAll('.nav-item[data-target="contributionsSection"]').forEach(el => {
            el.addEventListener('click', () => setTimeout(loadSavingsGoal, 200));
        });
        // Dashboard tab — refresh engagement widgets
        document.querySelectorAll('.nav-item[data-target="dashboardSection"]').forEach(el => {
            el.addEventListener('click', () => setTimeout(engagementPostRefresh, 300));
        });
    });
})();
