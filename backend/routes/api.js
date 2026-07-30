const express = require('express');
const router = express.Router();

// Helper function to safely load routes
function safeRequire(path, mountPath) {
  try {
    const routeModule = require(path);
    router.use(mountPath, routeModule);
    console.log(`[API] Mounted ${mountPath} from ${path}`);
  } catch (err) {
    console.error(`[API] Failed to load ${path}:`, err.message);
    // Mount a fallback route that returns an error
    router.use(mountPath, (req, res) => {
      res.status(500).json({ status: 'fail', message: `Route module failed to load: ${err.message}` });
    });
  }
}

// Auth / Registration
safeRequire('./auth_mysql', '/auth');

// Members
safeRequire('./members_mysql', '/members');

// Loans
safeRequire('./loans_mysql', '/loans');

// Repayments
safeRequire('./repayments_mysql', '/repayments');

// Contributions & Dues
safeRequire('./contributions_mysql', '/contributions');

// Expenses
safeRequire('./expenses_mysql', '/expenses');

// System Logs (Section 4)
safeRequire('./system_logs_mysql', '/logs');

// Verifications & Portal Config
safeRequire('./verifications_mysql', '/verifications');

// Treasurer Console (Section 2, items 1-7)
safeRequire('./treasurer_mysql', '/treasurer');

// Automation (Section 5, items 1-2)
safeRequire('./automation_mysql', '/automation');

// Corporate Portal Feature Set (SHMS Expansion)
safeRequire('./corporate_mysql', '/corporate');

// Main Safeguard (Treasurer Financial Oversight)
safeRequire('./safeguard_mysql', '/safeguard');

// App Settings (blur gate, etc.)
safeRequire('./settings_mysql', '/settings');

// Meeting Minutes Registry
safeRequire('./minutes_mysql', '/minutes');

// Member Messages (member-to-admin inbox, unread badge)
safeRequire('./messages_mysql', '/messages');

// Live System Updates (real-time event log)
safeRequire('./live_updates_mysql', '/live-updates');

// Engagement & Motivation — daily check-ins, badges, savings goals
safeRequire('./checkins_mysql', '/checkins');
safeRequire('./badges_mysql', '/badges');
safeRequire('./savings_goals_mysql', '/savings-goals');

module.exports = router;
