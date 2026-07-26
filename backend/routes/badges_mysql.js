const express = require('express');
const { sequelize, Loan, Repayment, Contribution, MemberSaving } = require('../models');
const { getMemberFromRequest, getAdminFromRequest } = require('../adminContext');

const router = express.Router();

function ok(res, data) { return res.json({ status: 'success', message: 'OK', data }); }
function fail(res, code, message) { return res.status(code).json({ status: 'fail', message }); }

// Ensure table exists
(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS member_badges (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        member_id INT UNSIGNED NOT NULL,
        badge_key VARCHAR(60) NOT NULL,
        badge_label VARCHAR(120) NOT NULL DEFAULT '',
        earned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_badge_member_key (member_id, badge_key),
        INDEX idx_badges_member (member_id)
      )
    `);
  } catch (_) {}
})();

const BADGE_DEFINITIONS = {
  first_repayment: { label: 'First Repayment Made', icon: 'fa-hand-holding-usd' },
  loan_50_paid: { label: 'Loan 50% Repaid', icon: 'fa-chart-line' },
  loan_fully_paid: { label: 'Loan Fully Settled', icon: 'fa-trophy' },
  streak_3: { label: '3-Day Check-In Streak', icon: 'fa-fire' },
  streak_7: { label: '7-Day Check-In Streak', icon: 'fa-fire-flame-curved' },
  streak_30: { label: '30-Day Check-In Streak', icon: 'fa-star' },
  first_savings: { label: 'First Savings Deposit', icon: 'fa-piggy-bank' },
  on_time_payer: { label: 'On-Time Payer', icon: 'fa-clock' }
};

// GET /api/badges/me — list earned badges
router.get('/me', async (req, res) => {
  try {
    const member = getMemberFromRequest(req);
    if (!member) return fail(res, 401, 'Member session required.');

    const rows = await sequelize.query(
      `SELECT badge_key, badge_label, earned_at FROM member_badges
       WHERE member_id = :mid ORDER BY earned_at DESC`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id } }
    );

    const earned = rows.map(r => ({
      key: r.badge_key,
      label: r.badge_label,
      icon: BADGE_DEFINITIONS[r.badge_key]?.icon || 'fa-award',
      earnedAt: r.earned_at
    }));

    const allBadges = Object.entries(BADGE_DEFINITIONS).map(([key, def]) => ({
      key,
      label: def.label,
      icon: def.icon,
      earned: earned.some(e => e.key === key),
      earnedAt: earned.find(e => e.key === key)?.earnedAt || null
    }));

    return ok(res, { badges: allBadges, earnedCount: earned.length, total: allBadges.length });
  } catch (e) {
    console.error('[badges/me]', e);
    return fail(res, 500, 'Server error fetching badges');
  }
});

// POST /api/badges/check — auto-check and award any pending badges for this member
router.post('/check', async (req, res) => {
  try {
    const member = getMemberFromRequest(req);
    if (!member) return fail(res, 401, 'Member session required.');
    const mid = member.id;
    const newlyEarned = [];

    async function award(key) {
      const def = BADGE_DEFINITIONS[key];
      if (!def) return;
      try {
        await sequelize.query(
          `INSERT IGNORE INTO member_badges (member_id, badge_key, badge_label)
           VALUES (:mid, :key, :label)`,
          { replacements: { mid, key, label: def.label } }
        );
      } catch (_) {}
    }

    async function hasBadge(key) {
      const [row] = await sequelize.query(
        `SELECT id FROM member_badges WHERE member_id = :mid AND badge_key = :key LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, replacements: { mid, key } }
      );
      return !!row;
    }

    // Check first repayment
    if (!(await hasBadge('first_repayment'))) {
      const [rep] = await sequelize.query(
        `SELECT id FROM repayments WHERE member_id = :mid LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, replacements: { mid } }
      );
      if (rep) { await award('first_repayment'); newlyEarned.push('first_repayment'); }
    }

    // Check loan 50% and fully paid
    if (!(await hasBadge('loan_50_paid')) || !(await hasBadge('loan_fully_paid'))) {
      const loans = await Loan.findAll({ where: { borrower_id: mid, status: ['Active', 'Settled'] } });
      for (const loan of loans) {
        const [sumRow] = await sequelize.query(
          `SELECT COALESCE(SUM(amount), 0) AS totalPaid FROM repayments WHERE loan_id = :lid`,
          { type: sequelize.QueryTypes.SELECT, replacements: { lid: loan.id } }
        );
        const totalPaid = Number(sumRow.totalPaid);
        const loanAmount = Number(loan.amount);
        if (loanAmount > 0) {
          const pct = (totalPaid / loanAmount) * 100;
          if (pct >= 50 && !(await hasBadge('loan_50_paid'))) {
            await award('loan_50_paid'); newlyEarned.push('loan_50_paid');
          }
          if (pct >= 100 && !(await hasBadge('loan_fully_paid'))) {
            await award('loan_fully_paid'); newlyEarned.push('loan_fully_paid');
          }
        }
      }
    }

    // Check streak badges
    const [streakRow] = await sequelize.query(
      `SELECT MAX(streak_count) AS maxStreak FROM member_checkins WHERE member_id = :mid`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid } }
    );
    const maxStreak = streakRow ? Number(streakRow.maxStreak) : 0;
    for (const threshold of [3, 7, 30]) {
      const key = `streak_${threshold}`;
      if (maxStreak >= threshold && !(await hasBadge(key))) {
        await award(key); newlyEarned.push(key);
      }
    }

    // Check first savings
    if (!(await hasBadge('first_savings'))) {
      const [sav] = await sequelize.query(
        `SELECT id FROM member_savings WHERE member_id = :mid LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, replacements: { mid } }
      );
      if (sav) { await award('first_savings'); newlyEarned.push('first_savings'); }
    }

    return ok(res, { checked: true, newlyEarned });
  } catch (e) {
    console.error('[badges/check]', e);
    return fail(res, 500, 'Server error checking badges');
  }
});

module.exports = router;
