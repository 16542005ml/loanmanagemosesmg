/**
 * emailService.js
 * ─────────────────────────────────────────────────────────────
 * Core email utility for the Loan Management System.
 * Uses Nodemailer with SMTP credentials from backend/.env.
 *
 * Usage:
 *   const { sendEmail, emailTemplates } = require('../emailService');
 *   await sendEmail(to, subject, htmlBody);
 *   await sendEmail(to, ...emailTemplates.loanCreated({ memberName, amount, dueDate }));
 * ─────────────────────────────────────────────────────────────
 */

const nodemailer = require('nodemailer');
const path = require('path');

// Load .env from the backend directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ─── Transporter ──────────────────────────────────────────────

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.EMAIL_HOST;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!host || !user || !pass) {
    console.warn('[emailService] SMTP not configured — emails will be logged to console only.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: { user, pass },
    tls: { rejectUnauthorized: false }
  });

  return transporter;
}

// ─── Core sendEmail Function ──────────────────────────────────

/**
 * Send an email.
 * @param {string|string[]} to        - Recipient email address(es)
 * @param {string}          subject
 * @param {string}          html      - HTML body
 * @param {string}          [text]    - Plain-text fallback (auto-generated if omitted)
 * @param {object}          [opts]    - Optional overrides: { fromEmail, fromName }
 */
async function sendEmail(to, subject, html, text, opts = {}) {
  // Build the FROM address:
  //   1. Use opts.fromEmail if provided (admin's own email)
  //   2. Fall back to EMAIL_FROM in .env
  //   3. Fall back to EMAIL_USER in .env
  const sysFrom = process.env.EMAIL_FROM || `"Loan Management System" <${process.env.EMAIL_USER}>`;
  let from = sysFrom;
  if (opts.fromEmail) {
    const displayName = opts.fromName ? `"${opts.fromName}"` : '"Loan Management System"';
    from = `${displayName} <${opts.fromEmail}>`;
  }

  const plainText = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const transport = getTransporter();

  if (!transport) {
    // No SMTP configured — log to console for development
    console.log(`\n📧 [emailService] EMAIL (no SMTP configured)`);
    console.log(`   From:    ${from}`);
    console.log(`   To:      ${Array.isArray(to) ? to.join(', ') : to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body:    ${plainText.slice(0, 200)}...\n`);
    return { simulated: true };
  }

  try {
    const info = await transport.sendMail({
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: plainText
    });
    console.log(`[emailService] Email sent → ${info.messageId} | From: ${from} | To: ${Array.isArray(to) ? to.join(', ') : to}`);
    return info;
  } catch (err) {
    console.error('[emailService] Failed to send email:', err.message);
    // Never throw — email failure must not break API responses
    return { error: err.message };
  }
}

/**
 * Build a From options object from an admin session object.
 * Usage in routes:  sendEmail(memberEmail, subject, html, null, getAdminFrom(admin));
 * @param {object} admin - Admin object from requireAdmin() / getAdminFromRequest()
 * @returns {{ fromEmail: string, fromName: string }}
 */
function getAdminFrom(admin) {
  if (!admin || !admin.email) return {};
  return {
    fromEmail: admin.email,
    fromName:  admin.full_name || admin.name || 'System Admin'
  };
}

// ─── Shared Styles ────────────────────────────────────────────

const BRAND_COLOR = '#1a3a5c';
const ACCENT_COLOR = '#2563eb';
const SUCCESS_COLOR = '#16a34a';
const DANGER_COLOR  = '#dc2626';
const WARNING_COLOR = '#d97706';

function emailWrapper(title, content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, ${BRAND_COLOR} 0%, ${ACCENT_COLOR} 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
    .header p { margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 13px; }
    .body { padding: 36px 40px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    .body h2 { margin: 0 0 16px; font-size: 18px; color: ${BRAND_COLOR}; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .card table { width: 100%; border-collapse: collapse; }
    .card td { padding: 6px 0; font-size: 14px; }
    .card td:first-child { color: #64748b; width: 40%; }
    .card td:last-child { font-weight: 600; color: #0f172a; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-success { background: #dcfce7; color: ${SUCCESS_COLOR}; }
    .badge-danger  { background: #fee2e2; color: ${DANGER_COLOR}; }
    .badge-warning { background: #fef9c3; color: ${WARNING_COLOR}; }
    .badge-info    { background: #dbeafe; color: ${ACCENT_COLOR}; }
    .btn { display: inline-block; margin: 24px 0 0; padding: 13px 28px; background: ${ACCENT_COLOR}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .divider { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
    .footer a { color: #64748b; text-decoration: none; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏦 Loan Management System</h1>
      <p>Automated Notification</p>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      <p>This is an automated message from the Loan Management System. Please do not reply.</p>
      <p>© ${new Date().getFullYear()} Loan Management System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email Templates ──────────────────────────────────────────

const emailTemplates = {

  /**
   * Welcome email sent when a member account is approved
   */
  memberApproved({ memberName, email, adminName = 'System Admin' }) {
    const subject = '🎉 Your Account Has Been Approved!';
    const html = emailWrapper('Account Approved', `
      <h2>Welcome to the Team, ${memberName}!</h2>
      <p>We are delighted to inform you that your membership application has been <strong>approved</strong> by <strong>${adminName}</strong>.</p>
      <div class="card">
        <table>
          <tr><td>Status</td><td><span class="badge badge-success">✓ Approved</span></td></tr>
          <tr><td>Name</td><td>${memberName}</td></tr>
          <tr><td>Email</td><td>${email}</td></tr>
          <tr><td>Approved By</td><td>${adminName}</td></tr>
          <tr><td>Date</td><td>${new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })}</td></tr>
        </table>
      </div>
      <p>You can now log in to the Member Portal to:</p>
      <ul>
        <li>View your loan history and repayment schedule</li>
        <li>Apply for new loans</li>
        <li>Track your contributions and savings</li>
        <li>Receive meeting notifications</li>
      </ul>
      <p>If you have any questions, please contact your administrator.</p>
    `);
    return [subject, html];
  },

  /**
   * Email sent when a member application is denied
   */
  memberDenied({ memberName, email, adminName = 'System Admin', reason = 'Admin decision' }) {
    const subject = 'Membership Application Update';
    const html = emailWrapper('Application Update', `
      <h2>Dear ${memberName},</h2>
      <p>We regret to inform you that your membership application has not been approved at this time.</p>
      <div class="card">
        <table>
          <tr><td>Status</td><td><span class="badge badge-danger">✗ Not Approved</span></td></tr>
          <tr><td>Name</td><td>${memberName}</td></tr>
          <tr><td>Email</td><td>${email}</td></tr>
          <tr><td>Reason</td><td>${reason}</td></tr>
          <tr><td>Date</td><td>${new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })}</td></tr>
        </table>
      </div>
      <p>If you believe this is an error or would like to appeal this decision, please contact your administrator directly.</p>
    `);
    return [subject, html];
  },

  /**
   * Email sent when a new loan is created / approved
   */
  loanCreated({ memberName, amount, duration, interestRate, dueDate, loanId }) {
    const totalOwed = Number(amount) + (Number(amount) * Number(interestRate || 0) / 100);
    const subject = '✅ Loan Application Confirmed';
    const html = emailWrapper('Loan Confirmed', `
      <h2>Dear ${memberName},</h2>
      <p>Your loan application has been recorded successfully. Below are the details of your loan:</p>
      <div class="card">
        <table>
          <tr><td>Loan ID</td><td>#${loanId || 'N/A'}</td></tr>
          <tr><td>Principal Amount</td><td>KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Interest Rate</td><td>${interestRate || 0}%</td></tr>
          <tr><td>Total Owed</td><td><strong>KES ${totalOwed.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong></td></tr>
          <tr><td>Duration</td><td>${duration || 'N/A'} month(s)</td></tr>
          <tr><td>Due Date</td><td>${dueDate ? new Date(dueDate).toLocaleDateString('en-KE', { dateStyle: 'long' }) : 'N/A'}</td></tr>
          <tr><td>Status</td><td><span class="badge badge-info">Active</span></td></tr>
        </table>
      </div>
      <p>Please ensure timely repayments to maintain a good credit standing. You can log in to the Member Portal to track your repayment progress.</p>
      <hr class="divider"/>
      <p style="font-size:13px;color:#64748b;">⚠️ Failure to repay on time may result in penalties and affect your borrowing eligibility.</p>
    `);
    return [subject, html];
  },

  /**
   * Repayment reminder sent a few days before due date
   */
  repaymentReminder({ memberName, amount, dueDate, loanId, daysLeft, outstanding }) {
    const isUrgent = daysLeft <= 1;
    const subject = isUrgent
      ? `🚨 URGENT: Loan Repayment Due ${daysLeft === 0 ? 'TODAY' : 'TOMORROW'}!`
      : `⏰ Reminder: Loan Repayment Due in ${daysLeft} Days`;
    const badgeClass = isUrgent ? 'badge-danger' : 'badge-warning';
    const html = emailWrapper('Repayment Reminder', `
      <h2>Dear ${memberName},</h2>
      <p>This is a friendly reminder that your loan repayment is due <strong>${isUrgent ? (daysLeft === 0 ? 'TODAY' : 'TOMORROW') : `in ${daysLeft} days`}</strong>.</p>
      <div class="card">
        <table>
          <tr><td>Loan ID</td><td>#${loanId || 'N/A'}</td></tr>
          <tr><td>Outstanding Balance</td><td><strong>KES ${Number(outstanding || amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong></td></tr>
          <tr><td>Due Date</td><td>${new Date(dueDate).toLocaleDateString('en-KE', { dateStyle: 'long' })}</td></tr>
          <tr><td>Status</td><td><span class="badge ${badgeClass}">${daysLeft === 0 ? 'Due Today' : `${daysLeft} day(s) left`}</span></td></tr>
        </table>
      </div>
      <p>Please log in to the Member Portal to make your repayment or contact your administrator for assistance.</p>
      ${isUrgent ? '<p style="color:#dc2626;font-weight:600;">⚠️ Late payments may incur penalty charges. Please make your payment immediately.</p>' : ''}
    `);
    return [subject, html];
  },

  /**
   * Loan overdue alert
   */
  loanOverdue({ memberName, amount, dueDate, loanId, daysOverdue }) {
    const subject = `⚠️ Overdue Loan Notice — Immediate Action Required`;
    const html = emailWrapper('Overdue Loan Alert', `
      <h2>Dear ${memberName},</h2>
      <p>Your loan is now <strong style="color:#dc2626;">${daysOverdue} day(s) overdue</strong>. Immediate action is required.</p>
      <div class="card">
        <table>
          <tr><td>Loan ID</td><td>#${loanId || 'N/A'}</td></tr>
          <tr><td>Amount</td><td>KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td></tr>
          <tr><td>Was Due</td><td>${new Date(dueDate).toLocaleDateString('en-KE', { dateStyle: 'long' })}</td></tr>
          <tr><td>Status</td><td><span class="badge badge-danger">Overdue — ${daysOverdue} day(s)</span></td></tr>
        </table>
      </div>
      <p style="color:#dc2626;font-weight:600;">Please contact your administrator immediately to arrange repayment and avoid further penalties.</p>
    `);
    return [subject, html];
  },

  /**
   * Meeting notification sent to members
   */
  meetingScheduled({ memberName, title, meetingDate, meetingTime, location, platform, purpose, meetingUrl }) {
    const formattedDate = meetingDate
      ? new Date(meetingDate).toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : 'TBD';
    const subject = `📅 Meeting Notice: ${title}`;
    const html = emailWrapper('Meeting Scheduled', `
      <h2>Dear ${memberName},</h2>
      <p>You are cordially invited to the following meeting. Please make arrangements to attend.</p>
      <div class="card">
        <table>
          <tr><td>Title</td><td><strong>${title}</strong></td></tr>
          <tr><td>Date</td><td>${formattedDate}</td></tr>
          <tr><td>Time</td><td>${meetingTime || 'TBD'}</td></tr>
          <tr><td>Location</td><td>${location || 'TBD'}</td></tr>
          <tr><td>Platform</td><td>${platform || 'In-person'}</td></tr>
          ${purpose ? `<tr><td>Purpose</td><td>${purpose}</td></tr>` : ''}
          ${meetingUrl ? `<tr><td>Meeting Link</td><td><a href="${meetingUrl}" style="color:#2563eb;">${meetingUrl}</a></td></tr>` : ''}
        </table>
      </div>
      <p>Please ensure punctuality and come prepared with any required documents or reports.</p>
      <p>For any queries, please contact your administrator.</p>
    `);
    return [subject, html];
  },

  /**
   * Password reset OTP email
   */
  passwordReset({ name, otp, expiresInMinutes = 15 }) {
    const subject = '🔐 Password Reset Request';
    const html = emailWrapper('Password Reset', `
      <h2>Dear ${name},</h2>
      <p>We received a request to reset your password. Use the code below to proceed:</p>
      <div style="text-align:center;margin:28px 0;">
        <div style="display:inline-block;background:#1e293b;color:#fff;font-size:36px;font-weight:800;letter-spacing:12px;padding:16px 32px;border-radius:12px;font-family:monospace;">${otp}</div>
      </div>
      <div class="card">
        <table>
          <tr><td>Code</td><td><strong>${otp}</strong></td></tr>
          <tr><td>Expires In</td><td>${expiresInMinutes} minutes</td></tr>
          <tr><td>Time</td><td>${new Date().toLocaleString('en-KE')}</td></tr>
        </table>
      </div>
      <p>If you did not request a password reset, please ignore this email and your account will remain secure.</p>
      <p style="color:#dc2626;font-size:13px;">⚠️ Never share this code with anyone — our staff will never ask for it.</p>
    `);
    return [subject, html];
  },

  /**
   * Contribution / payment receipt
   */
  contributionReceipt({ memberName, amount, paymentMethod, contributionId, date }) {
    const subject = `✅ Contribution Receipt — KES ${Number(amount).toLocaleString('en-KE')}`;
    const html = emailWrapper('Contribution Receipt', `
      <h2>Dear ${memberName},</h2>
      <p>Your contribution has been recorded successfully. Below is your receipt:</p>
      <div class="card">
        <table>
          <tr><td>Receipt #</td><td>${contributionId || 'N/A'}</td></tr>
          <tr><td>Amount</td><td><strong>KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong></td></tr>
          <tr><td>Payment Method</td><td>${paymentMethod || 'N/A'}</td></tr>
          <tr><td>Date</td><td>${date ? new Date(date).toLocaleDateString('en-KE', { dateStyle: 'long' }) : new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })}</td></tr>
          <tr><td>Status</td><td><span class="badge badge-success">Confirmed</span></td></tr>
        </table>
      </div>
      <p>Thank you for your timely contribution. Please keep this email as your receipt.</p>
    `);
    return [subject, html];
  },

  /**
   * Login credentials / account ready email (sent to member when approved)
   */
  loginCredentials({ memberName, email, loginUrl }) {
    const url = loginUrl || 'http://localhost:3000/login.html';
    const subject = '🔑 Your Account is Ready — Login Now!';
    const html = emailWrapper('Account Ready', `
      <h2>Dear ${memberName},</h2>
      <p>Great news! Your membership account has been <strong>approved and activated</strong>. You can now log in to the Member Portal.</p>
      <div class="card">
        <table>
          <tr><td>Your Email</td><td><strong>${email}</strong></td></tr>
          <tr><td>Portal</td><td>Member Portal</td></tr>
          <tr><td>Status</td><td><span class="badge badge-success">✓ Active</span></td></tr>
        </table>
      </div>
      <p>Click the button below to access your portal:</p>
      <div style="text-align:center;">
        <a href="${url}" class="btn" style="display:inline-block;margin:20px 0;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">Login to Member Portal →</a>
      </div>
      <p>Once logged in you can:</p>
      <ul>
        <li>📋 View your loan history and repayment schedule</li>
        <li>💳 Make loan repayments</li>
        <li>📊 Track your savings and contributions</li>
        <li>📅 View upcoming meeting notices</li>
      </ul>
      <hr class="divider"/>
      <p style="font-size:13px;color:#64748b;">⚠️ If you did not apply for membership, please contact your administrator immediately.</p>
    `);
    return [subject, html];
  },

  /**
   * Registration received email (sent when member submits their application)
   */
  newRegistration({ memberName, email }) {
    const subject = '📝 Registration Received — Pending Approval';
    const html = emailWrapper('Registration Received', `
      <h2>Dear ${memberName},</h2>
      <p>Thank you for registering! We have received your membership application and it is currently <strong>under review</strong> by the administrator.</p>
      <div class="card">
        <table>
          <tr><td>Name</td><td>${memberName}</td></tr>
          <tr><td>Email</td><td>${email}</td></tr>
          <tr><td>Status</td><td><span class="badge badge-warning">⏳ Pending Review</span></td></tr>
          <tr><td>Submitted</td><td>${new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })}</td></tr>
        </table>
      </div>
      <p>You will receive another email once your application has been <strong>approved or reviewed</strong>. This usually takes <strong>1–2 business days</strong>.</p>
      <p>If you have any questions, please contact the administrator.</p>
      <hr class="divider"/>
      <p style="font-size:13px;color:#64748b;">Please do not submit multiple applications — we have received yours and will be in touch shortly.</p>
    `);
    return [subject, html];
  },

  /**
   * Repayment recorded receipt (sent to member when admin records a repayment)
   */
  repaymentReceived({ memberName, amount, paymentMethod, loanId, repaymentId, remainingBalance, loanStatus }) {
    const isSettled = loanStatus === 'Settled';
    const subject = isSettled
      ? '🎉 Congratulations — Loan Fully Settled!'
      : `✅ Repayment Received — KES ${Number(amount).toLocaleString('en-KE')}`;
    const html = emailWrapper('Repayment Received', `
      <h2>Dear ${memberName},</h2>
      ${isSettled
        ? '<p>🎉 <strong>Congratulations!</strong> Your loan has been <strong>fully settled</strong>. Thank you for your commitment!</p>'
        : '<p>Your repayment has been recorded successfully. Below are the details:</p>'}
      <div class="card">
        <table>
          <tr><td>Receipt #</td><td>${repaymentId || 'N/A'}</td></tr>
          <tr><td>Loan ID</td><td>#${loanId || 'N/A'}</td></tr>
          <tr><td>Amount Paid</td><td><strong>KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong></td></tr>
          <tr><td>Payment Method</td><td>${paymentMethod || 'N/A'}</td></tr>
          <tr><td>Remaining Balance</td><td>${isSettled ? '<span style="color:#16a34a;font-weight:700;">KES 0.00 — CLEARED ✓</span>' : `KES ${Number(remainingBalance || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`}</td></tr>
          <tr><td>Loan Status</td><td><span class="badge ${isSettled ? 'badge-success' : 'badge-info'}">${loanStatus || 'Active'}</span></td></tr>
          <tr><td>Date</td><td>${new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })}</td></tr>
        </table>
      </div>
      ${isSettled
        ? '<p style="color:#16a34a;font-weight:600;">Your loan account is now fully cleared. You are eligible to apply for future loans. Keep it up! 💪</p>'
        : '<p>Please continue making timely repayments to keep your account in good standing.</p>'}
    `);
    return [subject, html];
  },

  /**
   * Admin login security alert (sent to admin when they log in from a new session)
   */
  adminLoginAlert({ adminName, email, loginTime, ipAddress }) {
    const subject = '🔐 Security Alert — New Admin Login';
    const html = emailWrapper('Login Alert', `
      <h2>Hello, ${adminName}!</h2>
      <p>A new login was detected on your administrator account.</p>
      <div class="card">
        <table>
          <tr><td>Account</td><td>${email}</td></tr>
          <tr><td>Login Time</td><td>${loginTime || new Date().toLocaleString('en-KE')}</td></tr>
          <tr><td>IP Address</td><td>${ipAddress || 'Unknown'}</td></tr>
          <tr><td>Status</td><td><span class="badge badge-info">Active Session</span></td></tr>
        </table>
      </div>
      <p>If this was <strong>you</strong>, no action is needed.</p>
      <p style="color:#dc2626;font-weight:600;">⚠️ If this was NOT you, please change your password immediately and contact your system administrator.</p>
    `);
    return [subject, html];
  }

};

module.exports = { sendEmail, emailTemplates, getAdminFrom };

