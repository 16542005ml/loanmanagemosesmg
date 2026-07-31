/**
 * emailReplyService.js
 * ─────────────────────────────────────────────────────────────
 * Automatic email reply and processing service.
 * Monitors inbox for replies and processes them automatically.
 * ─────────────────────────────────────────────────────────────
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Gracefully handle missing dependencies
let Imap, simpleParser;
try {
  Imap = require('imap');
  simpleParser = require('mailparser').simpleParser;
} catch (err) {
  console.warn('[emailReplyService] IMAP dependencies not installed. Auto-reply disabled. Run: npm install imap mailparser');
  Imap = null;
  simpleParser = null;
}

// IMAP Configuration for receiving emails
const imapConfig = {
  user: process.env.EMAIL_USER,
  password: process.env.EMAIL_PASS,
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  connTimeout: 10000,
  authTimeout: 5000
};

let imap = null;

/**
 * Initialize IMAP connection for receiving emails
 */
function initImap() {
  imap = new Imap(imapConfig);

  imap.once('ready', () => {
    console.log('[emailReplyService] IMAP connection ready - monitoring inbox for replies');
    openInbox();
  });

  imap.once('error', (err) => {
    console.error('[emailReplyService] IMAP error:', err);
  });

  imap.once('end', () => {
    console.log('[emailReplyService] IMAP connection ended');
  });

  imap.connect();
}

/**
 * Open inbox and start monitoring for new emails
 */
function openInbox() {
  imap.openBox('INBOX', false, (err, box) => {
    if (err) {
      console.error('[emailReplyService] Error opening inbox:', err);
      return;
    }
    console.log('[emailReplyService] Inbox opened, total messages:', box.messages.total);
    
    // Watch for new emails
    imap.on('mail', (numNewMsgs) => {
      console.log(`[emailReplyService] ${numNewMsgs} new email(s) received`);
      fetchNewEmails();
    });
  });
}

/**
 * Fetch and process new emails
 */
function fetchNewEmails() {
  imap.search(['UNSEEN'], (err, results) => {
    if (err || !results || results.length === 0) return;

    const fetch = imap.fetch(results, { 
      bodies: '', 
      markSeen: false 
    });

    fetch.on('message', (msg, seqno) => {
      msg.on('body', (stream) => {
        simpleParser(stream, (err, parsed) => {
          if (err) {
            console.error('[emailReplyService] Error parsing email:', err);
            return;
          }
          processIncomingEmail(parsed);
        });
      });
    });

    fetch.once('error', (err) => {
      console.error('[emailReplyService] Fetch error:', err);
    });
  });
}

/**
 * Process incoming email and determine if auto-reply is needed
 */
function processIncomingEmail(email) {
  console.log('[emailReplyService] Processing email from:', email.from.text);
  console.log('[emailReplyService] Subject:', email.subject);
  
  // Check if this is a reply to a system email
  const subject = email.subject.toLowerCase();
  const isReply = subject.includes('re:') || subject.includes('reply');
  
  if (isReply) {
    console.log('[emailReplyService] Detected reply to system email');
    handleAutoReply(email);
  }
}

/**
 * Send automatic reply based on email content
 */
async function handleAutoReply(email) {
  const { sendEmail } = require('./emailService');
  
  const replySubject = `Re: ${email.subject.replace(/^(Re:|RE:)\s*/i, '')}`;
  
  // Generate auto-reply content based on context
  let replyBody = '';
  
  if (email.subject.toLowerCase().includes('loan')) {
    replyBody = generateLoanReply(email);
  } else if (email.subject.toLowerCase().includes('contribution')) {
    replyBody = generateContributionReply(email);
  } else if (email.subject.toLowerCase().includes('approval')) {
    replyBody = generateApprovalReply(email);
  } else {
    replyBody = generateGenericReply(email);
  }
  
  try {
    await sendEmail(email.from.text, replySubject, replyBody);
    console.log('[emailReplyService] Auto-reply sent to:', email.from.text);
  } catch (err) {
    console.error('[emailReplyService] Error sending auto-reply:', err);
  }
}

/**
 * Generate loan-related auto-reply
 */
function generateLoanReply(email) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Auto Reply</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2563eb 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; }
    .body { padding: 36px 40px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏦 Loan Management System</h1>
      <p>Automatic Reply</p>
    </div>
    <div class="body">
      <h2>Thank you for your response</h2>
      <p>We have received your email regarding loan matters. Our team will review your message and get back to you within 24-48 hours.</p>
      <p>If this is urgent, please contact your administrator directly or call our support line.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <strong>Reference:</strong> ${email.subject}<br>
        <strong>Received:</strong> ${new Date().toLocaleString()}
      </div>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply to this email.</p>
      <p>© ${new Date().getFullYear()} Loan Management System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate contribution-related auto-reply
 */
function generateContributionReply(email) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Auto Reply</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2563eb 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; }
    .body { padding: 36px 40px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏦 Loan Management System</h1>
      <p>Automatic Reply</p>
    </div>
    <div class="body">
      <h2>Contribution Query Received</h2>
      <p>Thank you for your email regarding contributions. Your message has been logged and will be reviewed by our treasurer team.</p>
      <p>For immediate assistance with contribution matters, please contact the treasurer directly.</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply to this email.</p>
      <p>© ${new Date().getFullYear()} Loan Management System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate approval-related auto-reply
 */
function generateApprovalReply(email) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Auto Reply</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2563eb 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; }
    .body { padding: 36px 40px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏦 Loan Management System</h1>
      <p>Automatic Reply</p>
    </div>
    <div class="body">
      <h2>Membership Application Response</h2>
      <p>We have received your response regarding your membership application. Our admin team will review and update your status accordingly.</p>
      <p>You will receive a formal notification once your application status changes.</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply to this email.</p>
      <p>© ${new Date().getFullYear()} Loan Management System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate generic auto-reply
 */
function generateGenericReply(email) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Auto Reply</title>
  <style>
    body { margin: 0; padding: 0; background: #f0f4f8; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 600px; margin: 32px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a3a5c 0%, #2563eb 100%); padding: 32px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 700; }
    .body { padding: 36px 40px; color: #1e293b; line-height: 1.7; font-size: 15px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 40px; text-align: center; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>🏦 Loan Management System</h1>
      <p>Automatic Reply</p>
    </div>
    <div class="body">
      <h2>Thank you for your email</h2>
      <p>We have received your message. Our team will review it and respond within 24-48 hours.</p>
      <p>If you require immediate assistance, please contact your administrator directly.</p>
    </div>
    <div class="footer">
      <p>This is an automated message. Please do not reply to this email.</p>
      <p>© ${new Date().getFullYear()} Loan Management System. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Start the email reply service
 */
function startEmailReplyService() {
  if (!Imap || !simpleParser) {
    console.warn('[emailReplyService] IMAP dependencies not available - auto-reply disabled');
    return;
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('[emailReplyService] Email credentials not configured - auto-reply disabled');
    return;
  }
  
  console.log('[emailReplyService] Starting automatic email reply service...');
  initImap();
}

module.exports = {
  startEmailReplyService,
  processIncomingEmail,
  handleAutoReply
};
