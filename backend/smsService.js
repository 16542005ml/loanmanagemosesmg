require('dotenv').config();
const africastalking = require('africastalking');

/**
 * smsService.js
 * ─────────────────────────────────────────────────────────────
 * Handles all outgoing SMS notifications using Africa's Talking.
 * Formats numbers, handles templates, and falls back to console.log
 * if API keys are missing.
 * ─────────────────────────────────────────────────────────────
 */

const credentials = {
  apiKey: process.env.AT_API_KEY || '',
  username: process.env.AT_USERNAME || 'sandbox'
};

const senderId = process.env.AT_SENDER_ID || null;

// Initialize SDK
let sms;
const isConfigured = !!(credentials.apiKey && credentials.apiKey.length > 5);

if (isConfigured) {
  const at = africastalking(credentials);
  sms = at.SMS;
}

/**
 * Normalizes a phone number to E.164 format (e.g., +254700000000)
 */
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = String(phone).replace(/\D/g, ''); // Remove non-digits
  
  if (cleaned.startsWith('0')) {
    // Assuming Kenyan default for now (+254)
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('7') || cleaned.startsWith('1') || cleaned.startsWith('4')) {
    // Starts with 7, 1, or 4 without a 0 or 254 (e.g., 712345678)
    cleaned = '254' + cleaned;
  } else if (!cleaned.startsWith('254') && cleaned.length === 9) {
    // Failsafe for 9 digits
    cleaned = '254' + cleaned;
  }
  
  return '+' + cleaned;
}

/**
 * Core SMS sender
 * @param {string} to - The recipient's phone number
 * @param {string} message - The text message to send
 */
async function sendSMS(to, message) {
  const formattedPhone = formatPhoneNumber(to);
  if (!formattedPhone) {
    console.warn(`[smsService] Invalid phone number provided: "${to}". SMS skipped.`);
    return false;
  }

  if (!isConfigured) {
    console.log('\n[smsService] 🚧 SMS MOCK DISPATCH (API Key not set):');
    console.log(`   To:      ${formattedPhone}`);
    console.log(`   Message: ${message}`);
    console.log('   Status:  ✅ Logged to console\n');
    return true; // Pretend it sent
  }

  try {
    const options = {
      to: [formattedPhone],
      message: message
    };
    
    // Add sender ID if configured
    if (senderId && senderId.trim() !== '') {
      options.from = senderId;
    }

    const response = await sms.send(options);
    console.log(`[smsService] SMS sent → ${formattedPhone} | Status:`, response?.SMSMessageData?.Message || 'Success');
    return true;
  } catch (error) {
    console.error(`[smsService] ❌ Error sending SMS to ${formattedPhone}:`, error.message || error);
    return false;
  }
}

/**
 * SMS Templates (Concise for 160-char limits)
 */
const smsTemplates = {
  
  newRegistration({ memberName }) {
    return `Hello ${memberName}, your registration has been received and is pending admin approval. We will notify you once approved.`;
  },

  memberApproved({ memberName, loginUrl }) {
    return `Hello ${memberName}, your account is now ACTIVE! Login to the Member Portal here: ${loginUrl || 'http://localhost:3000/login.html'}`;
  },

  memberDenied({ memberName }) {
    return `Hello ${memberName}, unfortunately your membership application was not approved at this time. Please contact the administrator.`;
  },

  loanCreated({ memberName, amount, dueDate }) {
    const amtStr = Number(amount).toLocaleString('en-KE');
    const dateStr = new Date(dueDate).toLocaleDateString('en-KE');
    return `Hello ${memberName}, your loan of KES ${amtStr} has been approved. Please ensure it is repaid by ${dateStr}.`;
  },

  repaymentReminder({ memberName, amount, dueDate, outstanding, daysLeft }) {
    const outStr = Number(outstanding).toLocaleString('en-KE');
    const dateStr = new Date(dueDate).toLocaleDateString('en-KE');
    const urgency = daysLeft === 1 ? 'URGENT: ' : '';
    return `${urgency}Hello ${memberName}, your loan balance of KES ${outStr} is due on ${dateStr}. Please make your payment to avoid penalties.`;
  },

  loanOverdue({ memberName, outstanding, daysOverdue }) {
    const outStr = Number(outstanding).toLocaleString('en-KE');
    return `URGENT: Hello ${memberName}, your loan is OVERDUE by ${daysOverdue} days. Outstanding balance: KES ${outStr}. Please pay immediately.`;
  },

  repaymentReceived({ memberName, amount, remainingBalance, isSettled }) {
    const amtStr = Number(amount).toLocaleString('en-KE');
    if (isSettled) {
      return `Hello ${memberName}, we received your payment of KES ${amtStr}. Your loan is now FULLY SETTLED. Thank you!`;
    }
    const balStr = Number(remainingBalance).toLocaleString('en-KE');
    return `Hello ${memberName}, we received your payment of KES ${amtStr}. Your remaining loan balance is KES ${balStr}.`;
  },

  meetingScheduled({ date, time, location }) {
    return `NOTICE: A new meeting has been scheduled for ${date} at ${time}. Location: ${location}. Please log in to the portal for details.`;
  }
};

module.exports = {
  sendSMS,
  smsTemplates,
  formatPhoneNumber
};
