/**
 * email_live_test.js
 * Run with: node email_live_test.js
 *
 * Tests each email template and the SMTP connection.
 * Results are printed to the console.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'backend/.env') });

const { sendEmail, emailTemplates, getAdminFrom } = require('./backend/emailService');

const TEST_EMAIL = process.env.EMAIL_USER || 'test@example.com';

// Simulated admin — mirrors what requireAdmin() returns from a real session token
const MOCK_ADMIN = {
  id:        '1',
  full_name: 'Admin Moses',
  email:     process.env.EMAIL_USER  // admin sends FROM their own inbox
};

const ADMIN_FROM = getAdminFrom(MOCK_ADMIN);

const TESTS = [
  {
    name: '1. Member Approved (Welcome Email)',
    fn: () => {
      const [subject, html] = emailTemplates.memberApproved({
        memberName: 'John Kamau',
        email: TEST_EMAIL,
        adminName: 'Admin Moses'
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '2. Member Denied (Rejection Email)',
    fn: () => {
      const [subject, html] = emailTemplates.memberDenied({
        memberName: 'Jane Wanjiku',
        email: TEST_EMAIL,
        adminName: 'Admin Moses',
        reason: 'Incomplete documentation'
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '3. Loan Created (Confirmation Email)',
    fn: () => {
      const [subject, html] = emailTemplates.loanCreated({
        memberName:   'Peter Otieno',
        amount:       50000,
        duration:     6,
        interestRate: 10,
        dueDate:      '2027-01-28',
        loanId:       1042
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '4. Repayment Reminder — 3 Days',
    fn: () => {
      const [subject, html] = emailTemplates.repaymentReminder({
        memberName:  'Mary Achieng',
        amount:      30000,
        dueDate:     '2026-07-31',
        loanId:      1043,
        daysLeft:    3,
        outstanding: 22500
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '5. Repayment Reminder — 1 Day (Urgent)',
    fn: () => {
      const [subject, html] = emailTemplates.repaymentReminder({
        memberName:  'James Mwangi',
        amount:      15000,
        dueDate:     '2026-07-29',
        loanId:      1044,
        daysLeft:    1,
        outstanding: 8000
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '6. Loan Overdue Alert',
    fn: () => {
      const [subject, html] = emailTemplates.loanOverdue({
        memberName:  'Grace Njeri',
        amount:      25000,
        dueDate:     '2026-07-20',
        loanId:      1045,
        daysOverdue: 8
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '7. Meeting Scheduled',
    fn: () => {
      const [subject, html] = emailTemplates.meetingScheduled({
        memberName:  'David Kipchoge',
        title:       'Monthly Board Meeting — August 2026',
        meetingDate: '2026-08-05',
        meetingTime: '10:00 AM',
        location:    'Boardroom 2, Eldoret Branch',
        platform:    'In-person',
        purpose:     'Review of loan portfolio and financial reports',
        meetingUrl:  ''
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '8. Password Reset OTP',
    fn: () => {
      const [subject, html] = emailTemplates.passwordReset({
        name: 'Sarah Wambui',
        otp:  '847291',
        expiresInMinutes: 15
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '9. Contribution Receipt',
    fn: () => {
      const [subject, html] = emailTemplates.contributionReceipt({
        memberName:     'Kevin Omondi',
        amount:         2500,
        paymentMethod:  'M-Pesa',
        contributionId: 'CNT-20260728-001',
        date:           new Date().toISOString()
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '10. Login Credentials / Account Ready',
    fn: () => {
      const [subject, html] = emailTemplates.loginCredentials({
        memberName: 'John Kamau',
        email:      TEST_EMAIL,
        loginUrl:   'http://localhost:3000/login.html'
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '11. New Registration Received',
    fn: () => {
      const [subject, html] = emailTemplates.newRegistration({
        memberName: 'New Member',
        email:      TEST_EMAIL
      });
      // System email (no admin from)
      return sendEmail(TEST_EMAIL, subject, html);
    }
  },
  {
    name: '12. Repayment Receipt',
    fn: () => {
      const [subject, html] = emailTemplates.repaymentReceived({
        memberName:       'Peter Otieno',
        amount:           5000,
        paymentMethod:    'M-Pesa',
        loanId:           1042,
        repaymentId:      884,
        remainingBalance: 20000,
        loanStatus:       'Active'
      });
      return sendEmail(TEST_EMAIL, subject, html, null, ADMIN_FROM);
    }
  },
  {
    name: '13. Admin Login Security Alert',
    fn: () => {
      const [subject, html] = emailTemplates.adminLoginAlert({
        adminName: 'Admin Moses',
        email:     TEST_EMAIL,
        loginTime: new Date().toLocaleString('en-KE'),
        ipAddress: '192.168.1.5'
      });
      // System to Admin email
      return sendEmail(TEST_EMAIL, subject, html);
    }
  }
];

async function runTests() {
  const smtpConfigured = !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS &&
    process.env.EMAIL_PASS !== 'your_16char_app_password_here');

  console.log('\n══════════════════════════════════════════════');
  console.log('  📧  EMAIL SYSTEM LIVE TEST');
  console.log('══════════════════════════════════════════════');
  console.log(`  SMTP Configured : ${smtpConfigured ? '✅ YES — emails will be SENT' : '⚠️  NO  — emails logged to console only'}`);
  console.log(`  Sending FROM    : ${ADMIN_FROM.fromEmail ? `"${ADMIN_FROM.fromName}" <${ADMIN_FROM.fromEmail}>` : '(system default)'}`);
  console.log(`  Email Target    : ${TEST_EMAIL}`);
  console.log(`  Host            : ${process.env.EMAIL_HOST || '(not set)'}`);
  console.log(`  Port            : ${process.env.EMAIL_PORT || '(not set)'}`);
  console.log('══════════════════════════════════════════════\n');

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    process.stdout.write(`  ${test.name} ... `);
    try {
      const result = await test.fn();
      if (result && result.error) {
        console.log(`❌ FAILED: ${result.error}`);
        failed++;
      } else if (result && result.simulated) {
        console.log('✅ SIMULATED (no SMTP)');
        passed++;
      } else {
        console.log(`✅ SENT → ${result && result.messageId ? result.messageId : 'OK'}`);
        passed++;
      }
    } catch (err) {
      console.log(`❌ ERROR: ${err.message}`);
      failed++;
    }
  }

  console.log('\n══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed out of ${TESTS.length} tests`);
  if (!smtpConfigured) {
    console.log('\n  ⚠️  To send REAL emails, add your Gmail App Password to backend/.env:');
    console.log('     EMAIL_USER=your_gmail@gmail.com');
    console.log('     EMAIL_PASS=xxxx xxxx xxxx xxxx  (16-char App Password)');
    console.log('     EMAIL_FROM="Loan Management System <your_gmail@gmail.com>"');
  } else {
    console.log('\n  📬 Check your inbox at: ' + TEST_EMAIL);
  }
  console.log('══════════════════════════════════════════════\n');
}

runTests().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
