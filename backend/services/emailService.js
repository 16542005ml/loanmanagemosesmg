const nodemailer = require('nodemailer');

// Email transporter configuration
let transporter = null;

function initializeTransporter() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log('[EMAIL] Email credentials not configured. Emails will be logged to console only.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  return transporter;
}

// Get transporter (lazy initialization)
function getTransporter() {
  if (!transporter) {
    transporter = initializeTransporter();
  }
  return transporter;
}

// Send email function
async function sendEmail({ to, subject, html, text }) {
  const mailTransporter = getTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || '"Loan Management System" <noreply@loanmanagement.com>',
    to,
    subject,
    html,
    text
  };

  if (!mailTransporter) {
    console.log('[EMAIL] MOCK EMAIL (no transporter configured):');
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML: ${html.substring(0, 200)}...`);
    return { success: true, mock: true };
  }

  try {
    const info = await mailTransporter.sendMail(mailOptions);
    console.log('[EMAIL] Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EMAIL] Error sending email:', error);
    return { success: false, error: error.message };
  }
}

// Email Templates
const templates = {
  // Member Approval Email
  memberApproved: ({ name, email, approvedBy, date }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">🏦 Loan Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Automated Notification</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin-top: 0;">Welcome to the Team, ${name}!</h2>
        <p style="color: #666; line-height: 1.6;">We are delighted to inform you that your membership application has been approved by ${approvedBy}.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; color: #666; font-weight: bold;">Status</td>
              <td style="padding: 10px; color: #4CAF50; font-weight: bold;">✓ Approved</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Name</td>
              <td style="padding: 10px; color: #333;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Email</td>
              <td style="padding: 10px; color: #333;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Approved By</td>
              <td style="padding: 10px; color: #333;">${approvedBy}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Date</td>
              <td style="padding: 10px; color: #333;">${date}</td>
            </tr>
          </table>
        </div>
        
        <p style="color: #666; line-height: 1.6;">You can now log in to the Member Portal to:</p>
        <ul style="color: #666; line-height: 1.8;">
          <li>View your loan history and repayment schedule</li>
          <li>Apply for new loans</li>
          <li>Track your contributions and savings</li>
          <li>Receive meeting notifications</li>
        </ul>
        <p style="color: #666; line-height: 1.6;">If you have any questions, please contact your administrator.</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>This is an automated message from the Loan Management System. Please do not reply.</p>
        <p>© 2026 Loan Management System. All rights reserved.</p>
      </div>
    </div>
  `,

  // Member Denied Email
  memberDenied: ({ name, email, reason, date }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">🏦 Loan Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Automated Notification</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin-top: 0;">Dear ${name},</h2>
        <p style="color: #666; line-height: 1.6;">We regret to inform you that your membership application has not been approved at this time.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f44336;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; color: #666; font-weight: bold;">Status</td>
              <td style="padding: 10px; color: #f44336; font-weight: bold;">✗ Not Approved</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Name</td>
              <td style="padding: 10px; color: #333;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Email</td>
              <td style="padding: 10px; color: #333;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Reason</td>
              <td style="padding: 10px; color: #333;">${reason}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Date</td>
              <td style="padding: 10px; color: #333;">${date}</td>
            </tr>
          </table>
        </div>
        
        <p style="color: #666; line-height: 1.6;">If you believe this is an error or would like to appeal this decision, please contact your administrator directly.</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>This is an automated message from the Loan Management System. Please do not reply.</p>
        <p>© 2026 Loan Management System. All rights reserved.</p>
      </div>
    </div>
  `,

  // Loan Application Confirmation
  loanCreated: ({ name, loanId, principalAmount, interestRate, totalOwed, duration, dueDate, status, approvedBy }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">🏦 Loan Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Automated Notification</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin-top: 0;">Dear ${name},</h2>
        <p style="color: #666; line-height: 1.6;">Your loan application has been recorded successfully. Below are the details of your loan:</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; color: #666; font-weight: bold;">Loan ID</td>
              <td style="padding: 10px; color: #333;">#${loanId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Principal Amount</td>
              <td style="padding: 10px; color: #333;">KES ${principalAmount.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Interest Rate</td>
              <td style="padding: 10px; color: #333;">${interestRate}%</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Total Owed</td>
              <td style="padding: 10px; color: #333;">KES ${totalOwed.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Duration</td>
              <td style="padding: 10px; color: #333;">${duration} month(s)</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Due Date</td>
              <td style="padding: 10px; color: #333;">${dueDate}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Status</td>
              <td style="padding: 10px; color: #2196F3; font-weight: bold;">${status}</td>
            </tr>
            ${approvedBy ? `
            <tr>
              <td style="padding: 10px; color: #666;">Approved By</td>
              <td style="padding: 10px; color: #333;">${approvedBy}</td>
            </tr>` : ''}
          </table>
        </div>
        
        <p style="color: #666; line-height: 1.6;">Please ensure timely repayments to maintain a good credit standing. You can log in to the Member Portal to track your repayment progress.</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>This is an automated message from the Loan Management System. Please do not reply.</p>
        <p>© 2026 Loan Management System. All rights reserved.</p>
      </div>
    </div>
  `,

  // Loan Repayment Reminder
  loanRepaymentReminder: ({ name, loanId, outstandingBalance, dueDate, daysRemaining }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">🏦 Loan Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Automated Notification</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin-top: 0;">Dear ${name},</h2>
        <p style="color: #666; line-height: 1.6;">This is a friendly reminder that your loan repayment is due in ${daysRemaining} days.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; color: #666; font-weight: bold;">Loan ID</td>
              <td style="padding: 10px; color: #333;">#${loanId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Outstanding Balance</td>
              <td style="padding: 10px; color: #333;">KES ${outstandingBalance.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Due Date</td>
              <td style="padding: 10px; color: #333;">${dueDate}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Status</td>
              <td style="padding: 10px; color: #ff9800; font-weight: bold;">${daysRemaining} day(s) left</td>
            </tr>
          </table>
        </div>
        
        <p style="color: #666; line-height: 1.6;">Please log in to the Member Portal to make your repayment or contact your administrator for assistance.</p>
        <p style="color: #f44336; font-weight: bold; margin-top: 20px;">⚠️ Failure to repay on time may result in penalties and affect your borrowing eligibility.</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>This is an automated message from the Loan Management System. Please do not reply.</p>
        <p>© 2026 Loan Management System. All rights reserved.</p>
      </div>
    </div>
  `,

  // Contribution Receipt
  contributionReceipt: ({ name, receiptNumber, amount, paymentMethod, date, status, recordedBy }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">🏦 Loan Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Automated Notification</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin-top: 0;">Dear ${name},</h2>
        <p style="color: #666; line-height: 1.6;">Your contribution has been recorded successfully. Below is your receipt:</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4CAF50;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; color: #666; font-weight: bold;">Receipt #</td>
              <td style="padding: 10px; color: #333;">${receiptNumber}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Amount</td>
              <td style="padding: 10px; color: #333;">KES ${amount.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Payment Method</td>
              <td style="padding: 10px; color: #333;">${paymentMethod}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Date</td>
              <td style="padding: 10px; color: #333;">${date}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Status</td>
              <td style="padding: 10px; color: #4CAF50; font-weight: bold;">${status}</td>
            </tr>
            ${recordedBy ? `
            <tr>
              <td style="padding: 10px; color: #666;">Recorded By</td>
              <td style="padding: 10px; color: #333;">${recordedBy}</td>
            </tr>` : ''}
          </table>
        </div>
        
        <p style="color: #666; line-height: 1.6;">Thank you for your timely contribution. Please keep this email as your receipt.</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>This is an automated message from the Loan Management System. Please do not reply.</p>
        <p>© 2026 Loan Management System. All rights reserved.</p>
      </div>
    </div>
  `,

  // Password Reset Email
  passwordReset: ({ name, resetLink, expiryMinutes }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">🏦 Loan Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Password Reset Request</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin-top: 0;">Dear ${name},</h2>
        <p style="color: #666; line-height: 1.6;">We received a request to reset your password. Click the button below to reset your password:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        
        <p style="color: #666; line-height: 1.6;">This link will expire in ${expiryMinutes} minutes. If you did not request this password reset, please ignore this email.</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>This is an automated message from the Loan Management System. Please do not reply.</p>
        <p>© 2026 Loan Management System. All rights reserved.</p>
      </div>
    </div>
  `,

  // New Member Registration (for admin notification)
  newMemberRegistration: ({ name, email, phone, date }) => `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0;">🏦 Loan Management System</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">Admin Notification</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0;">
        <h2 style="color: #333; margin-top: 0;">New Member Registration</h2>
        <p style="color: #666; line-height: 1.6;">A new member has registered and is pending approval:</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196F3;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 10px; color: #666;">Name</td>
              <td style="padding: 10px; color: #333;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Email</td>
              <td style="padding: 10px; color: #333;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Phone</td>
              <td style="padding: 10px; color: #333;">${phone}</td>
            </tr>
            <tr>
              <td style="padding: 10px; color: #666;">Registration Date</td>
              <td style="padding: 10px; color: #333;">${date}</td>
            </tr>
          </table>
        </div>
        
        <p style="color: #666; line-height: 1.6;">Please log in to the Admin Portal to review and approve this application.</p>
      </div>
      <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
        <p>This is an automated message from the Loan Management System. Please do not reply.</p>
        <p>© 2026 Loan Management System. All rights reserved.</p>
      </div>
    </div>
  `
};

// Export functions
module.exports = {
  sendEmail,
  templates,
  initializeTransporter,
  getTransporter
};
