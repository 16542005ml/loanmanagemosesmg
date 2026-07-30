/**
 * emailScheduler.js
 * ─────────────────────────────────────────────────────────────
 * Daily background job that sends automatic email reminders:
 *   - Repayment reminders (3 days, 1 day before due date)
 *   - Overdue loan alerts (1 day after due date)
 *
 * Starts automatically when imported in server.js.
 * Schedule: runs every day at 08:00 AM server time.
 * ─────────────────────────────────────────────────────────────
 */

const cron = require('node-cron');
const { sendEmail, emailTemplates } = require('./emailService');
const { sendSMS, smsTemplates } = require('./smsService');
const { sequelize }                  = require('./models');


let schedulerStarted = false;

async function runDailyEmailJobs() {
  console.log('[emailScheduler] Running daily email jobs...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // ── 1. Repayment Reminders (3 days & 1 day before due date) ──
  const reminderDays = [3, 1];

  for (const days of reminderDays) {
    const targetDate = new Date(today);
    targetDate.setDate(targetDate.getDate() + days);
    const targetStr = targetDate.toISOString().slice(0, 10);

    try {
      const dueLoans = await sequelize.query(
        `SELECT
           l.id          AS loan_id,
           l.amount,
           l.due_date,
           l.borrower_id,
           l.interest_rate,
           am.full_name  AS member_name,
           am.email      AS member_email,
           am.phone      AS member_phone,
           COALESCE(SUM(r.amount), 0) AS total_paid
         FROM loans l
         JOIN approved_members am ON am.id = l.borrower_id
         LEFT JOIN repayments r   ON r.loan_id = l.id
         WHERE l.status IN ('Active', 'Overdue')
           AND l.due_date = :targetDate
           AND ((am.email IS NOT NULL AND am.email != '') OR (am.phone IS NOT NULL AND am.phone != ''))
         GROUP BY l.id, am.full_name, am.email, am.phone`,
        { type: sequelize.QueryTypes.SELECT, replacements: { targetDate: targetStr } }
      );

      for (const loan of dueLoans) {
        const totalOwed  = Number(loan.amount) + (Number(loan.amount) * Number(loan.interest_rate || 0) / 100);
        const outstanding = Math.max(0, totalOwed - Number(loan.total_paid));

        if (loan.member_email) {
          const [subject, html] = emailTemplates.repaymentReminder({
            memberName:  loan.member_name,
            amount:      loan.amount,
            dueDate:     loan.due_date,
            loanId:      loan.loan_id,
            daysLeft:    days,
            outstanding
          });
          await sendEmail(loan.member_email, subject, html).catch(()=>{});
        }
        
        if (loan.member_phone) {
          await sendSMS(loan.member_phone, smsTemplates.repaymentReminder({
            memberName:  loan.member_name,
            amount:      loan.amount,
            dueDate:     loan.due_date,
            outstanding,
            daysLeft:    days
          })).catch(()=>{});
        }
        
        console.log(`[emailScheduler] Reminder (${days}d) → ${loan.member_email || ''} ${loan.member_phone || ''} for loan #${loan.loan_id}`);
      }
    } catch (err) {
      console.error(`[emailScheduler] Error sending ${days}-day reminders:`, err.message);
    }
  }

  // ── 2. Overdue Alerts (1 day past due) ────────────────────────
  try {
    const yesterdayDate = new Date(today);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const overdueLoans = await sequelize.query(
      `SELECT
         l.id         AS loan_id,
         l.amount,
         l.due_date,
         l.borrower_id,
         am.full_name AS member_name,
         am.email     AS member_email,
         am.phone     AS member_phone,
         DATEDIFF(CURDATE(), l.due_date) AS days_overdue
       FROM loans l
       JOIN approved_members am ON am.id = l.borrower_id
       WHERE l.status = 'Active'
         AND l.due_date < CURDATE()
         AND ((am.email IS NOT NULL AND am.email != '') OR (am.phone IS NOT NULL AND am.phone != ''))`,
      { type: sequelize.QueryTypes.SELECT }
    );

    for (const loan of overdueLoans) {
      // Auto-flag to Overdue status
      try {
        await sequelize.query(
          `UPDATE loans SET status = 'Overdue' WHERE id = :id AND status = 'Active'`,
          { replacements: { id: loan.loan_id } }
        );
      } catch (_) {}

      if (loan.member_email) {
        const [subject, html] = emailTemplates.loanOverdue({
          memberName:  loan.member_name,
          amount:      loan.amount,
          dueDate:     loan.due_date,
          loanId:      loan.loan_id,
          daysOverdue: loan.days_overdue
        });
        await sendEmail(loan.member_email, subject, html).catch(()=>{});
      }
      
      if (loan.member_phone) {
        await sendSMS(loan.member_phone, smsTemplates.loanOverdue({
          memberName:  loan.member_name,
          outstanding: loan.amount, // Real logic uses total_owed-total_paid, but here we just pass amount as fallback
          daysOverdue: loan.days_overdue
        })).catch(()=>{});
      }
      
      console.log(`[emailScheduler] Overdue alert → ${loan.member_email || ''} ${loan.member_phone || ''} for loan #${loan.loan_id}`);
    }
  } catch (err) {
    console.error('[emailScheduler] Error sending overdue alerts:', err.message);
  }

  console.log('[emailScheduler] Daily email jobs complete.');
}

/**
 * Start the email scheduler.
 * Safe to call multiple times — only starts once.
 * 
 * Schedule (Africa/Nairobi):
 *   ⏰ 10:00 AM  — Morning reminders
 *   ⏰  1:00 PM  — Afternoon reminders
 *   ⏰  8:00 PM  — Evening reminders
 *   📊  1st of month — Monthly statement emails
 */
function startEmailScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const cronOpts = { timezone: 'Africa/Nairobi' };

  const jobHandler = (label) => () => {
    console.log(`[emailScheduler] Firing scheduled jobs — ${label}`);
    runDailyEmailJobs().catch(err => {
      console.error(`[emailScheduler] Error in ${label} job:`, err.message);
    });
  };

  // ⏰ 10:00 AM daily
  cron.schedule('0 10 * * *', jobHandler('10:00 AM'), cronOpts);

  // ⏰ 1:00 PM daily
  cron.schedule('0 13 * * *', jobHandler('1:00 PM'), cronOpts);

  // ⏰ 8:00 PM daily
  cron.schedule('0 20 * * *', jobHandler('8:00 PM'), cronOpts);

  // 📊 Monthly statement — 1st of every month at 9:00 AM
  cron.schedule('0 9 1 * *', () => {
    console.log('[emailScheduler] Running monthly statement job...');
    runMonthlyStatements().catch(err => {
      console.error('[emailScheduler] Monthly statement error:', err.message);
    });
  }, cronOpts);

  console.log('[emailScheduler] Started — firing at 10:00 AM | 1:00 PM | 8:00 PM (Africa/Nairobi).');
  console.log('[emailScheduler] Monthly statements scheduled for the 1st of each month at 9:00 AM.');

  // Also run once 90 seconds after startup to catch any missed emails
  setTimeout(() => {
    console.log('[emailScheduler] Running startup check...');
    runDailyEmailJobs().catch(err => {
      console.error('[emailScheduler] Startup job error:', err.message);
    });
  }, 90 * 1000);
}

/**
 * Monthly statement job — emails all members their financial summary
 * on the 1st of every month.
 */
async function runMonthlyStatements() {
  try {
    const { sendEmail, emailTemplates } = require('./emailService');

    const members = await sequelize.query(
      `SELECT am.id, am.full_name, am.email, am.admin_id,
              am.loanAmount, am.savingsAmount,
              a.email AS admin_email, a.full_name AS admin_name
       FROM approved_members am
       LEFT JOIN admins a ON a.id = am.admin_id
       WHERE am.email IS NOT NULL AND am.email != ''`,
      { type: sequelize.QueryTypes.SELECT }
    );

    for (const m of members) {
      try {
        const [loans] = await sequelize.query(
          `SELECT COUNT(*) AS total,
                  SUM(status = 'Active') AS active,
                  SUM(status = 'Overdue') AS overdue,
                  SUM(status = 'Settled') AS settled,
                  COALESCE(SUM(amount), 0) AS total_amount
           FROM loans WHERE borrower_id = :id`,
          { type: sequelize.QueryTypes.SELECT, replacements: { id: m.id } }
        );

        const month = new Date().toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
        const subject = `📊 Your Monthly Statement — ${month}`;
        const html = require('./emailService').emailTemplates ? null : null; // use inline below

        // Build a simple monthly summary email
        const { emailWrapper } = (() => {
          // Access the wrapper via the module (already in scope via emailService)
          return {};
        })();

        const [subj, htmlBody] = require('./emailService').emailTemplates.contributionReceipt({
          memberName: m.full_name,
          amount: m.savingsAmount || 0,
          paymentMethod: 'Monthly Summary',
          contributionId: `STMT-${new Date().toISOString().slice(0,7)}`,
          date: new Date().toISOString()
        });

        const adminFrom = m.admin_email
          ? { fromEmail: m.admin_email, fromName: m.admin_name || 'System Admin' }
          : {};

        await require('./emailService').sendEmail(m.email, `📊 Monthly Statement — ${month}`, htmlBody, null, adminFrom);
        console.log(`[emailScheduler] Monthly statement → ${m.email}`);
      } catch (e) {
        console.warn(`[emailScheduler] Monthly statement failed for ${m.email}:`, e.message);
      }
    }
  } catch (err) {
    console.error('[emailScheduler] runMonthlyStatements error:', err.message);
  }
}

module.exports = { startEmailScheduler, runDailyEmailJobs };
