const express = require('express');
const bcrypt = require('bcryptjs');
const { Loan, Member, sequelize } = require('../models');
const { getAdminFromRequest, requireAdmin, getMemberFromRequest, getFallbackAdminId } = require('../adminContext');
const { loanCreateRules } = require('../validation');
const { sendEmail, templates } = require('../services/emailService');
const { sendSMS, smsTemplates } = require('../smsService');

const router = express.Router();

function ok(res, data) { return res.json({ status: 'success', message: 'OK', data }); }
function fail(res, code, message) { return res.status(code).json({ status: 'fail', message }); }

function loanDTO(l) {
  return {
    id: String(l.id),
    borrower_id: String(l.borrower_id),
    admin_id: l.admin_id || null,
    borrower_name: l.borrower_name,
    amount: Number(l.amount),
    duration: l.duration,
    interest_rate: Number(l.interest_rate),
    status: l.status,
    timestamp: l.created_at,
    due_date: l.due_date
  };
}

(async () => {
  const statements = [
    `ALTER TABLE loans DROP FOREIGN KEY loans_ibfk_1`,
    `ALTER TABLE loans ADD COLUMN admin_id VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE loans ADD INDEX idx_loans_admin (admin_id)`,
    `ALTER TABLE loans ADD COLUMN due_date DATE NULL DEFAULT NULL`,
    `ALTER TABLE loans ADD INDEX idx_loans_due_date (due_date)`
  ];
  for (const statement of statements) {
    try { await sequelize.query(statement); } catch (_) {}
  }
  try {
    const fallbackAdminId = await getFallbackAdminId(sequelize);
    if (fallbackAdminId) {
      await sequelize.query(
        `UPDATE loans l
         LEFT JOIN approved_members m ON m.id = l.borrower_id
         SET l.admin_id = COALESCE(m.admin_id, :fallbackAdminId)
         WHERE l.admin_id IS NULL OR l.admin_id = ''`,
        { replacements: { fallbackAdminId } }
      );
    }
  } catch (_) {}
})();

// POST /api/loans/create
router.post('/create', loanCreateRules, async (req, res) => {
  try {
    const admin = getAdminFromRequest(req);
    const member = getMemberFromRequest(req);
    if (!admin && !member) {
      return res.status(401).json({ status: 'fail', message: 'Admin or member session required.' });
    }
    const { member_id, amount, duration, interest_rate, borrower_name, pin, admin_override } = req.body || {};
    if (!member_id || !amount) return fail(res, 400, 'Missing loan fields');
    if (admin_override && !admin) return fail(res, 401, 'Admin session expired. Please log in again.');
    if (!admin && !admin_override && member && String(member.id) !== String(member_id)) {
      return fail(res, 403, 'Members can only create loans for themselves');
    }

    let borrowerNameClean = borrower_name;
    let pinValid = false;
    let ownerAdminId = admin?.id || null;

    // Admin/Treasurer direct assignment - skip PIN verification
    if (admin_override) {
      pinValid = true;
    }

    // Check members table first
    const memberRec = await Member.findByPk(member_id);
    if (memberRec) {
      if (!ownerAdminId) ownerAdminId = memberRec.admin_id || null;
      if (admin && memberRec.admin_id && String(memberRec.admin_id) !== admin.id) return fail(res, 403, 'Forbidden');
      if (!pinValid && pin && memberRec.transaction_pin) {
        pinValid = await bcrypt.compare(String(pin), memberRec.transaction_pin);
      }
      if (!borrowerNameClean) borrowerNameClean = memberRec.full_name;
    }

    // Fallback to approved_members
    if (!pinValid && pin) {
      const [approved] = await sequelize.query(
        `SELECT full_name, transaction_pin, security_pin, admin_id FROM approved_members WHERE id = :id LIMIT 1`,
        { replacements: { id: member_id } }
      );
      if (approved.length) {
        if (!ownerAdminId) ownerAdminId = approved[0].admin_id || null;
        if (admin && approved[0].admin_id && String(approved[0].admin_id) !== admin.id) return fail(res, 403, 'Forbidden');
        if (!borrowerNameClean) borrowerNameClean = approved[0].full_name;
        if (approved[0].transaction_pin) {
          pinValid = await bcrypt.compare(String(pin), approved[0].transaction_pin);
        }
        if (!pinValid && approved[0].security_pin) {
            if (String(approved[0].security_pin).startsWith('$2')) {
                pinValid = await bcrypt.compare(String(pin), approved[0].security_pin);
            } else {
                pinValid = String(pin) === String(approved[0].security_pin);
            }
        }
      }
    }

    // If no admin_override and no valid pin, also try to resolve borrower name
    if (!pinValid && !admin_override) {
      if (!borrowerNameClean) {
        const [approved] = await sequelize.query(
          `SELECT full_name, admin_id FROM approved_members WHERE id = :id LIMIT 1`,
          { replacements: { id: member_id } }
        );
        if (approved.length) {
          borrowerNameClean = approved[0].full_name;
          if (!ownerAdminId) ownerAdminId = approved[0].admin_id || null;
        }
      }
      if (!member) {
        return fail(res, 403, 'Missing or incorrect security PIN');
      }
      // Members with valid sessions can create loans without PIN
      if (member) {
        pinValid = true;
        if (!borrowerNameClean) borrowerNameClean = member.full_name;
      }
    }

    // Calculate due date based on duration (in months)
    let dueDate = null;
    if (duration && Number(duration) > 0) {
      const date = new Date();
      date.setMonth(date.getMonth() + Number(duration));
      dueDate = date.toISOString().slice(0, 10);
    }

    const loan = await Loan.create({
      borrower_id: Number(member_id),
      admin_id: ownerAdminId,
      borrower_name: String(borrowerNameClean || 'Member'),
      amount: Number(amount),
      duration: duration ? Number(duration) : 0,
      interest_rate: interest_rate ? Number(interest_rate) : 0,
      status: 'Active',
      due_date: dueDate
    });

    // Deduct from capital pool
    if (ownerAdminId && Number(amount) > 0) {
      try {
        // Ensure capital pool record exists
        await sequelize.query(
          `INSERT INTO capital_pool (admin_id, total_capital, available_capital, committed_loans)
           VALUES (:adminId, 0.00, 0.00, 0.00)
           ON DUPLICATE KEY UPDATE id = id`,
          { replacements: { adminId: ownerAdminId } }
        );

        // Deduct loan amount from available capital and add to committed loans
        await sequelize.query(
          `UPDATE capital_pool
           SET available_capital = available_capital - :amount,
               committed_loans = committed_loans + :amount
           WHERE admin_id = :adminId`,
          { replacements: { adminId: ownerAdminId, amount: Number(amount) } }
        );
      } catch (cpError) {
        console.error('[loans/create] Capital pool update error:', cpError);
        // Continue with loan creation even if capital pool update fails
      }
    }

    // Send loan confirmation email to the borrower
    try {
      const memberRows = await sequelize.query(
        `SELECT email, full_name FROM approved_members WHERE id = :id LIMIT 1
         UNION
         SELECT email, full_name FROM members WHERE id = :id LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, replacements: { id: Number(member_id) } }
      );
      const memberEmail = memberRows && memberRows[0] && memberRows[0].email;
      const memberFullName = memberRows && memberRows[0] && memberRows[0].full_name;
      if (memberEmail) {
        // Look up admin email from DB if not in token (fallback for member-initiated loans)
        let adminObj = admin || {};
        if (!adminObj.email && ownerAdminId) {
          const [adminRow] = await sequelize.query(
            `SELECT email, full_name FROM admins WHERE id = :id LIMIT 1`,
            { type: sequelize.QueryTypes.SELECT, replacements: { id: ownerAdminId } }
          ).catch(() => [[]]);
          if (adminRow) adminObj = adminRow;
        }
        const principalAmount = Number(amount);
        const totalOwed = principalAmount + (principalAmount * (interest_rate || 0) / 100);
        const html = templates.loanCreated({
          name: memberFullName || borrowerNameClean || 'Member',
          loanId: loan.id,
          principalAmount,
          interestRate: interest_rate || 0,
          totalOwed,
          duration: duration || 0,
          dueDate: dueDate || 'Not set',
          status: 'Active'
        });
        sendEmail({
          to: memberEmail,
          subject: 'Loan Application Confirmed - Loan Management System',
          html
        }).catch(() => {});
      }
      
      const memberPhone = memberRows && memberRows[0] && memberRows[0].phone;
      if (memberPhone) {
        sendSMS(memberPhone, smsTemplates.loanCreated({
          memberName: memberFullName || borrowerNameClean || 'Member',
          amount: Number(amount),
          dueDate: dueDate
        })).catch(() => {});
      }
    } catch (emailErr) {
      console.warn('[loans/create] Could not send loan confirmation email/SMS:', emailErr.message);
    }

    return ok(res, loanDTO(loan));
  } catch (e) {
    console.error('[loans/create]', e);
    return fail(res, 500, 'System error creating loan');
  }
});

// GET /api/loans/all
router.get('/all', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const loans = await Loan.findAll({ where: { admin_id: admin.id }, order: [['created_at', 'DESC']] });
    return ok(res, loans.map(loanDTO));
  } catch (e) {
    console.error('[loans/all]', e);
    return fail(res, 500, 'System error fetching loans');
  }
});

// GET /api/loans/member/:memberId
// Member-safe read path used by member.html.
// Requires: admin token OR the member whose ID matches.
router.get('/member/:memberId', async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    if (!memberId) return fail(res, 400, 'Invalid member id');

    const admin = getAdminFromRequest(req);
    const member = getMemberFromRequest(req);

    if (!admin && !member) {
      return fail(res, 401, 'Authentication required to view loan data.');
    }
    if (member && !admin && String(member.id) !== String(memberId)) {
      return fail(res, 403, 'You can only view your own loans.');
    }

    const owners = await sequelize.query(
      `SELECT admin_id FROM approved_members WHERE id = :memberId LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId } }
    );
    if (!owners.length || !owners[0].admin_id) return fail(res, 404, 'Approved member not found');

    const loans = await Loan.findAll({
      where: { borrower_id: memberId, admin_id: String(owners[0].admin_id) },
      order: [['created_at', 'DESC']]
    });
    return ok(res, loans.map(loanDTO));
  } catch (e) {
    console.error('[loans/member]', e);
    return fail(res, 500, 'System error fetching member loans');
  }
});

// GET /api/loans/stats
// Returns tile counts for Control Sector dashboard
router.get('/stats', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const [rows] = await sequelize.query(`
      SELECT
        COUNT(*)                                             AS total,
        SUM(status = 'Active')                              AS loan_applications,
        SUM(status = 'Approved')                            AS approved_loans,
        SUM(status = 'Disbursed')                           AS disbursed_loans,
        SUM(status = 'Overdue')                             AS overdue_loans,
        SUM(status = 'Settled')                             AS settled_loans,
        COUNT(DISTINCT borrower_id)                         AS borrowers,
        (SELECT COUNT(*) FROM repayments WHERE admin_id = :adminId) AS repayment_records,
        (SELECT COUNT(*) FROM admins)                       AS users,
        (SELECT COUNT(*) FROM approved_members WHERE admin_id = :adminId) AS approved_members_count
      FROM loans
      WHERE admin_id = :adminId
    `, { replacements: { adminId: admin.id } });
    const s = rows[0] || {};
    return ok(res, {
      loan_applications:  Number(s.loan_applications  || 0),
      approved_loans:     Number(s.approved_loans     || 0),
      disbursed_loans:    Number(s.disbursed_loans    || 0),
      repayment_records:  Number(s.repayment_records  || 0),
      overdue_loans:      Number(s.overdue_loans      || 0),
      borrowers:          Number(s.approved_members_count || 0),
      loan_products:      Number(s.total              || 0),
      users:              Number(s.users              || 0),
      settled_loans:      Number(s.settled_loans      || 0)
    });
  } catch (e) {
    console.error('[loans/stats]', e);
    return fail(res, 500, 'System error fetching loan stats');
  }
});

// POST /api/loans/settle  { id }
router.post('/settle', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.body || {};
    if (!id) return fail(res, 400, 'Missing id');
    const loan = await Loan.findOne({ where: { id: Number(id), admin_id: admin.id } });
    if (!loan) return fail(res, 404, 'Loan not found');
    loan.amount = 0;
    loan.status = 'Settled';
    await loan.save();
    return ok(res, loanDTO(loan));
  } catch (e) {
    console.error('[loans/settle]', e);
    return fail(res, 500, 'System error settling loan');
  }
});

// DELETE /api/loans/drop  { id }
router.delete('/drop', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { id } = req.body || {};
    if (!id) return fail(res, 400, 'Missing id');
    const deleted = await Loan.destroy({ where: { id: Number(id), admin_id: admin.id } });
    if (!deleted) return fail(res, 404, 'Loan not found');
    return ok(res, { deleted: true });
  } catch (e) {
    console.error('[loans/drop]', e);
    return fail(res, 500, 'System error dropping loan');
  }
});

// DELETE /api/loans/drop-many  { ids: [] }
router.delete('/drop-many', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { ids } = req.body || {};
    if (!ids || !Array.isArray(ids) || ids.length === 0) return fail(res, 400, 'Missing ids array');
    const { Op } = require('sequelize');
    await Loan.destroy({ where: { id: { [Op.in]: ids.map(Number) }, admin_id: admin.id } });
    return ok(res, { deleted: true, count: ids.length });
  } catch (e) {
    console.error('[loans/drop-many]', e);
    return fail(res, 500, 'System error dropping loans');
  }
});

// GET /api/loans/payoff/:memberId - loan payoff progress for the member portal
router.get('/payoff/:memberId', async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    if (!memberId) return fail(res, 400, 'Invalid member id');

    const admin = getAdminFromRequest(req);
    const member = getMemberFromRequest(req);
    if (!admin && !member) return fail(res, 401, 'Session required.');
    if (member && String(member.id) !== String(memberId)) return fail(res, 403, 'Access denied');

    const loans = await Loan.findAll({
      where: { borrower_id: memberId, status: ['Active', 'Overdue'] },
      order: [['created_at', 'DESC']]
    });
    const results = [];

    for (const loan of loans) {
      const [sumRow] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) AS totalPaid,
                MIN(created_at) AS firstPayment,
                MAX(created_at) AS lastPayment,
                COUNT(*) AS paymentCount
         FROM repayments WHERE loan_id = :lid`,
        { type: sequelize.QueryTypes.SELECT, replacements: { lid: loan.id } }
      );
      const totalPaid = Number(sumRow.totalPaid || 0);
      const loanAmount = Number(loan.amount || 0);
      const interestRate = Number(loan.interest_rate || 0);
      const totalOwed = loanAmount + (loanAmount * interestRate / 100);
      const remaining = Math.max(0, totalOwed - totalPaid);
      const pctPaid = totalOwed > 0 ? Math.min(100, (totalPaid / totalOwed) * 100) : 0;
      let avgMonthlyPayment = 0;
      if (sumRow.paymentCount > 1 && sumRow.firstPayment && sumRow.lastPayment) {
        const monthsElapsed = Math.max(1, (new Date(sumRow.lastPayment) - new Date(sumRow.firstPayment)) / (1000 * 60 * 60 * 24 * 30));
        avgMonthlyPayment = totalPaid / monthsElapsed;
      } else if (sumRow.paymentCount === 1 && totalPaid > 0) {
        avgMonthlyPayment = totalPaid;
      }
      const monthsRemaining = avgMonthlyPayment > 0 && remaining > 0 ? remaining / avgMonthlyPayment : null;
      let projectedPayoffDate = null;
      if (monthsRemaining) {
        const projected = new Date();
        projected.setMonth(projected.getMonth() + monthsRemaining);
        projectedPayoffDate = projected.toISOString().slice(0, 10);
      }

      results.push({
        loanId: loan.id,
        loanAmount,
        interestRate,
        totalOwed: Math.round(totalOwed * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        remaining: Math.round(remaining * 100) / 100,
        pctPaid: Math.round(pctPaid * 10) / 10,
        paymentCount: Number(sumRow.paymentCount || 0),
        avgMonthlyPayment: Math.round(avgMonthlyPayment * 100) / 100,
        projectedPayoffDate,
        monthsRemaining: monthsRemaining ? Math.ceil(monthsRemaining) : null,
        status: loan.status,
        createdAt: loan.created_at,
        dueDate: loan.due_date
      });
    }

    return ok(res, { loans: results });
  } catch (e) {
    console.error('[loans/payoff]', e);
    return fail(res, 500, 'Server error computing payoff data');
  }
});

// POST /api/loans/check-overdue - Automatically detect and flag overdue loans
router.post('/check-overdue', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;

    const today = new Date().toISOString().slice(0, 10);

    // Find Active loans with due dates that have passed
    const overdueLoans = await sequelize.query(
      `SELECT id, borrower_id, borrower_name, amount, due_date, admin_id
       FROM loans
       WHERE status = 'Active'
       AND due_date IS NOT NULL
       AND due_date < :today
       AND admin_id = :adminId`,
      { type: sequelize.QueryTypes.SELECT, replacements: { today, adminId: admin.id } }
    );

    let flaggedCount = 0;
    for (const loan of overdueLoans) {
      await sequelize.query(
        `UPDATE loans SET status = 'Overdue' WHERE id = :id`,
        { replacements: { id: loan.id } }
      );
      flaggedCount++;
    }

    return ok(res, {
      flaggedCount,
      overdueLoans: overdueLoans.map(l => ({
        id: String(l.id),
        borrowerName: l.borrower_name,
        amount: Number(l.amount),
        dueDate: l.due_date
      }))
    });
  } catch (e) {
    console.error('[loans/check-overdue]', e);
    return fail(res, 500, 'System error checking overdue loans');
  }
});

// GET /api/loans/statement/:memberId - Generate individual member financial statement for meetings
router.get('/statement/:memberId', async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    if (!memberId) return fail(res, 400, 'Invalid member id');

    const admin = getAdminFromRequest(req);
    const member = getMemberFromRequest(req);
    if (!admin && !member) return fail(res, 401, 'Authentication required.');
    if (member && !admin && String(member.id) !== String(memberId)) return fail(res, 403, 'Access denied');

    // Get member information
    const [memberInfo] = await sequelize.query(
      `SELECT id, full_name, email, phone, loanAmount, savingsAmount, admin_id
       FROM approved_members WHERE id = :memberId LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId } }
    );

    if (!memberInfo) return fail(res, 404, 'Member not found');

    // Get all loans for the member
    const loans = await sequelize.query(
      `SELECT id, amount, duration, interest_rate, status, due_date, created_at
       FROM loans
       WHERE borrower_id = :memberId AND admin_id = :adminId
       ORDER BY created_at DESC`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId, adminId: memberInfo.admin_id } }
    );

    // Calculate loan totals
    let totalLoans = 0;
    let totalRepayments = 0;
    let totalOutstanding = 0;
    const loanDetails = [];

    for (const loan of loans) {
      const loanAmount = Number(loan.amount);
      const interestRate = Number(loan.interest_rate || 0);
      const totalOwed = loanAmount + (loanAmount * interestRate / 100);

      const [repaymentSum] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) AS totalPaid
         FROM repayments WHERE loan_id = :loanId`,
        { type: sequelize.QueryTypes.SELECT, replacements: { loanId: loan.id } }
      );

      const totalPaid = Number(repaymentSum.totalPaid || 0);
      const outstanding = Math.max(0, totalOwed - totalPaid);

      totalLoans += loanAmount;
      totalRepayments += totalPaid;
      totalOutstanding += outstanding;

      loanDetails.push({
        loanId: String(loan.id),
        amount: loanAmount,
        duration: loan.duration,
        interestRate,
        status: loan.status,
        dueDate: loan.due_date,
        createdAt: loan.created_at,
        totalOwed: Math.round(totalOwed * 100) / 100,
        totalPaid: Math.round(totalPaid * 100) / 100,
        outstanding: Math.round(outstanding * 100) / 100
      });
    }

    // Get contribution history
    const contributions = await sequelize.query(
      `SELECT amount, payment_method, status, created_at
       FROM contributions
       WHERE member_id = :memberId AND admin_id = :adminId
       ORDER BY created_at DESC
       LIMIT 20`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId, adminId: memberInfo.admin_id } }
    );

    const totalContributions = contributions.reduce((sum, c) => sum + Number(c.amount), 0);

    // Get repayment history
    const repayments = await sequelize.query(
      `SELECT r.amount, r.payment_method, r.created_at, l.id as loan_id
       FROM repayments r
       JOIN loans l ON r.loan_id = l.id
       WHERE r.member_id = :memberId AND r.admin_id = :adminId
       ORDER BY r.created_at DESC
       LIMIT 20`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId, adminId: memberInfo.admin_id } }
    );

    // Generate statement
    const statement = {
      generatedAt: new Date().toISOString(),
      member: {
        id: String(memberInfo.id),
        name: memberInfo.full_name,
        email: memberInfo.email,
        phone: memberInfo.phone
      },
      financialSummary: {
        totalSavings: Number(memberInfo.savingsAmount || 0),
        totalLoans: Math.round(totalLoans * 100) / 100,
        totalRepayments: Math.round(totalRepayments * 100) / 100,
        totalOutstanding: Math.round(totalOutstanding * 100) / 100,
        totalContributions: Math.round(totalContributions * 100) / 100,
        netPosition: Math.round((Number(memberInfo.savingsAmount || 0) + totalContributions - totalOutstanding) * 100) / 100
      },
      loans: loanDetails,
      contributions: contributions.map(c => ({
        amount: Number(c.amount),
        paymentMethod: c.payment_method,
        status: c.status,
        date: c.created_at
      })),
      recentRepayments: repayments.map(r => ({
        amount: Number(r.amount),
        paymentMethod: r.payment_method,
        loanId: String(r.loan_id),
        date: r.created_at
      }))
    };

    return ok(res, statement);
  } catch (e) {
    console.error('[loans/statement]', e);
    return fail(res, 500, 'System error generating financial statement');
  }
});

module.exports = router;
