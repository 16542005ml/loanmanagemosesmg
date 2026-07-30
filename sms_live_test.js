require('dotenv').config({ path: './backend/.env' });
const { sendSMS, smsTemplates, formatPhoneNumber } = require('./backend/smsService');

// Use a fallback phone number for testing if one isn't provided
const TEST_PHONE = '+254700111222'; // Replace with your actual number to test live delivery

const tests = [
  {
    name: '1. New Registration',
    fn: () => smsTemplates.newRegistration({ memberName: 'Jane Doe' })
  },
  {
    name: '2. Member Approved',
    fn: () => smsTemplates.memberApproved({ memberName: 'Jane Doe', loginUrl: 'http://localhost:3000/login.html' })
  },
  {
    name: '3. Member Denied',
    fn: () => smsTemplates.memberDenied({ memberName: 'Jane Doe' })
  },
  {
    name: '4. Loan Created',
    fn: () => smsTemplates.loanCreated({ memberName: 'Jane Doe', amount: 50000, dueDate: new Date().toISOString() })
  },
  {
    name: '5. Repayment Reminder (3 days)',
    fn: () => smsTemplates.repaymentReminder({ memberName: 'Jane Doe', amount: 50000, dueDate: new Date().toISOString(), outstanding: 15000, daysLeft: 3 })
  },
  {
    name: '6. Repayment Reminder (1 day - Urgent)',
    fn: () => smsTemplates.repaymentReminder({ memberName: 'Jane Doe', amount: 50000, dueDate: new Date().toISOString(), outstanding: 15000, daysLeft: 1 })
  },
  {
    name: '7. Loan Overdue Alert',
    fn: () => smsTemplates.loanOverdue({ memberName: 'Jane Doe', outstanding: 15000, daysOverdue: 2 })
  },
  {
    name: '8. Repayment Received (Partial)',
    fn: () => smsTemplates.repaymentReceived({ memberName: 'Jane Doe', amount: 5000, remainingBalance: 10000, isSettled: false })
  },
  {
    name: '9. Repayment Received (Settled)',
    fn: () => smsTemplates.repaymentReceived({ memberName: 'Jane Doe', amount: 10000, remainingBalance: 0, isSettled: true })
  },
  {
    name: '10. Meeting Scheduled',
    fn: () => smsTemplates.meetingScheduled({ date: '2026-08-01', time: '10:00 AM', location: 'Zoom' })
  }
];

async function runTests() {
  const isConfigured = !!(process.env.AT_API_KEY && process.env.AT_API_KEY.length > 5);

  console.log('\n══════════════════════════════════════════════');
  console.log('  📱  SMS SYSTEM LIVE TEST');
  console.log('══════════════════════════════════════════════');
  console.log(`  API Configured  : ${isConfigured ? '✅ YES — SMS will be SENT via API' : '⚠️  NO  — SMS logged to console only'}`);
  console.log(`  Target Phone    : ${TEST_PHONE} (Formatted: ${formatPhoneNumber(TEST_PHONE)})`);
  console.log(`  AT Username     : ${process.env.AT_USERNAME || 'sandbox'}`);
  console.log('══════════════════════════════════════════════\n');

  let passed = 0;

  for (const test of tests) {
    console.log(`\n▶ Testing: ${test.name}`);
    const message = test.fn();
    console.log(`  📝 Message Length: ${message.length} chars (Limit is usually 160)`);
    
    // We only send the first one if configured, to save credits, but we print all templates.
    // If NOT configured, sendSMS just prints to console anyway.
    if (!isConfigured || test.name.startsWith('1.')) {
      const result = await sendSMS(TEST_PHONE, message);
      if (result) passed++;
    } else {
      console.log(`  ⏭️ Skipped sending to API to save credits. Output would be:\n     "${message}"`);
      passed++;
    }
  }

  console.log('\n══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed out of ${tests.length} tests`);
  console.log('══════════════════════════════════════════════\n');
}

runTests().catch(console.error);
