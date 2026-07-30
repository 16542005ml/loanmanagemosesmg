const cron = require('node-cron');
const { sequelize } = require('../models');
const { sendEmail, templates } = require('../services/emailService');

/**
 * Loan Repayment Reminder Scheduler
 * Runs daily at 9:00 AM to check for loans due in 3, 7, and 14 days
 * Sends reminder emails to borrowers
 */

async function checkAndSendLoanReminders() {
  console.log('[LOAN REMINDER] Starting loan repayment reminder check...');
  
  try {
    // Get loans that are active and have due dates
    const loans = await sequelize.query(
      `SELECT l.id, l.borrower_id, l.borrower_name, l.amount, l.due_date, l.interest_rate,
              am.email, am.full_name
       FROM loans l
       LEFT JOIN approved_members am ON am.id = l.borrower_id
       WHERE l.status = 'Active' 
       AND l.due_date IS NOT NULL
       AND l.due_date >= CURDATE()
       AND l.due_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)
       ORDER BY l.due_date ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    const today = new Date();
    let emailsSent = 0;

    for (const loan of loans) {
      if (!loan.email) continue;

      const dueDate = new Date(loan.due_date);
      const diffTime = dueDate - today;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Calculate outstanding balance (principal + interest - repayments made)
      const totalOwed = Number(loan.amount) + (Number(loan.amount) * (loan.interest_rate || 0) / 100);
      
      const [repaymentResult] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total_repaid
         FROM repayments
         WHERE loan_id = :loanId`,
        { 
          type: sequelize.QueryTypes.SELECT, 
          replacements: { loanId: loan.id } 
        }
      );
      
      const outstandingBalance = totalOwed - (repaymentResult.total_repaid || 0);

      // Only send reminders at specific intervals: 3 days, 7 days, 14 days
      if ([3, 7, 14].includes(diffDays)) {
        const html = templates.loanRepaymentReminder({
          name: loan.full_name || loan.borrower_name,
          loanId: loan.id,
          outstandingBalance: Math.max(0, outstandingBalance),
          dueDate: dueDate.toLocaleDateString(),
          daysRemaining: diffDays
        });

        const result = await sendEmail({
          to: loan.email,
          subject: `Loan Repayment Reminder - Due in ${diffDays} days`,
          html
        });

        if (result.success) {
          emailsSent++;
          console.log(`[LOAN REMINDER] Sent reminder to ${loan.email} for loan #${loan.id} (due in ${diffDays} days)`);
        }
      }
    }

    console.log(`[LOAN REMINDER] Completed. Sent ${emailsSent} reminder emails.`);
  } catch (error) {
    console.error('[LOAN REMINDER] Error:', error);
  }
}

/**
 * Overdue Loan Notification
 * Runs daily at 9:00 AM to check for overdue loans
 * Sends notification emails to borrowers
 */
async function checkAndSendOverdueNotifications() {
  console.log('[OVERDUE CHECK] Starting overdue loan check...');
  
  try {
    const loans = await sequelize.query(
      `SELECT l.id, l.borrower_id, l.borrower_name, l.amount, l.due_date, l.interest_rate,
              am.email, am.full_name
       FROM loans l
       LEFT JOIN approved_members am ON am.id = l.borrower_id
       WHERE l.status = 'Active' 
       AND l.due_date IS NOT NULL
       AND l.due_date < CURDATE()
       ORDER BY l.due_date ASC`,
      { type: sequelize.QueryTypes.SELECT }
    );

    let emailsSent = 0;

    for (const loan of loans) {
      if (!loan.email) continue;

      const dueDate = new Date(loan.due_date);
      const diffTime = new Date() - dueDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const totalOwed = Number(loan.amount) + (Number(loan.amount) * (loan.interest_rate || 0) / 100);
      
      const [repaymentResult] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total_repaid
         FROM repayments
         WHERE loan_id = :loanId`,
        { 
          type: sequelize.QueryTypes.SELECT, 
          replacements: { loanId: loan.id } 
        }
      );
      
      const outstandingBalance = totalOwed - (repaymentResult.total_repaid || 0);

      const html = templates.loanRepaymentReminder({
        name: loan.full_name || loan.borrower_name,
        loanId: loan.id,
        outstandingBalance: Math.max(0, outstandingBalance),
        dueDate: dueDate.toLocaleDateString(),
        daysRemaining: `OVERDUE by ${diffDays}`
      });

      const result = await sendEmail({
        to: loan.email,
        subject: `URGENT: Loan Payment Overdue - ${diffDays} days`,
        html
      });

      if (result.success) {
        emailsSent++;
        console.log(`[OVERDUE CHECK] Sent overdue notification to ${loan.email} for loan #${loan.id} (overdue by ${diffDays} days)`);
      }
    }

    console.log(`[OVERDUE CHECK] Completed. Sent ${emailsSent} overdue notifications.`);
  } catch (error) {
    console.error('[OVERDUE CHECK] Error:', error);
  }
}

// Start the schedulers
function startLoanSchedulers() {
  // Run every day at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    await checkAndSendLoanReminders();
    await checkAndSendOverdueNotifications();
  });

  console.log('[LOAN SCHEDULER] Loan reminder schedulers started (runs daily at 9:00 AM)');
}

// Export for use in server.js
module.exports = {
  startLoanSchedulers,
  checkAndSendLoanReminders,
  checkAndSendOverdueNotifications
};
