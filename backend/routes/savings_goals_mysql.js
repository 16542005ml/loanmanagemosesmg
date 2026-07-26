const express = require('express');
const { sequelize } = require('../models');
const { getMemberFromRequest } = require('../adminContext');

const router = express.Router();

function ok(res, data) { return res.json({ status: 'success', message: 'OK', data }); }
function fail(res, code, message) { return res.status(code).json({ status: 'fail', message }); }

// Ensure table exists
(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS savings_goals (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        member_id INT UNSIGNED NOT NULL,
        target_amount DECIMAL(18,2) NOT NULL,
        target_date DATE DEFAULT NULL,
        goal_label VARCHAR(150) NOT NULL DEFAULT 'Savings Goal',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_savings_goals_member (member_id)
      )
    `);
  } catch (_) {}
})();

// GET /api/savings-goals/me — get member's current goal + total savings
router.get('/me', async (req, res) => {
  try {
    const member = getMemberFromRequest(req);
    if (!member) return fail(res, 401, 'Member session required.');

    const [goals] = await sequelize.query(
      `SELECT * FROM savings_goals WHERE member_id = :mid ORDER BY created_at DESC LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id } }
    );

    const [savRow] = await sequelize.query(
      `SELECT COALESCE(SUM(amount), 0) AS totalSaved FROM member_savings WHERE member_id = :mid`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id } }
    );

    const totalSaved = Number(savRow.totalSaved);
    let goal = null;
    let projectedDate = null;
    let paceMessage = null;

    if (goals) {
      const target = Number(goals.target_amount);
      const remaining = Math.max(0, target - totalSaved);
      const pctComplete = target > 0 ? Math.min(100, (totalSaved / target) * 100) : 0;

      // Calculate pace
      const [firstSaving] = await sequelize.query(
        `SELECT created_at FROM member_savings WHERE member_id = :mid ORDER BY created_at ASC LIMIT 1`,
        { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id } }
      );

      if (firstSaving && totalSaved > 0) {
        const firstDate = new Date(firstSaving.created_at);
        const now = new Date();
        const monthsElapsed = Math.max(1, (now - firstDate) / (1000 * 60 * 60 * 24 * 30));
        const monthlyPace = totalSaved / monthsElapsed;

        if (monthlyPace > 0 && remaining > 0) {
          const monthsToGoal = remaining / monthlyPace;
          const projDate = new Date();
          projDate.setMonth(projDate.getMonth() + monthsToGoal);
          projectedDate = projDate.toISOString().slice(0, 10);
          paceMessage = `At your current pace (${Math.round(monthlyPace).toLocaleString()} KES/month), you'll reach this goal by ${projectedDate.toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}.`;
        } else if (remaining <= 0) {
          paceMessage = 'Congratulations — you\'ve reached your savings goal!';
        }
      }

      goal = {
        id: goals.id,
        targetAmount: target,
        targetDate: goals.target_date,
        label: goals.goal_label,
        totalSaved,
        remaining,
        pctComplete: Math.round(pctComplete * 10) / 10,
        projectedDate,
        paceMessage
      };
    }

    return ok(res, { goal, totalSaved });
  } catch (e) {
    console.error('[savings-goals/me]', e);
    return fail(res, 500, 'Server error fetching savings goal');
  }
});

// POST /api/savings-goals/set — create or update goal
router.post('/set', async (req, res) => {
  try {
    const member = getMemberFromRequest(req);
    if (!member) return fail(res, 401, 'Member session required.');

    const { target_amount, target_date, goal_label } = req.body || {};
    if (!target_amount || Number(target_amount) <= 0) {
      return fail(res, 400, 'Please provide a valid target amount.');
    }

    // Check if goal exists
    const [existing] = await sequelize.query(
      `SELECT id FROM savings_goals WHERE member_id = :mid LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id } }
    );

    if (existing) {
      await sequelize.query(
        `UPDATE savings_goals
         SET target_amount = :amt, target_date = :dt, goal_label = :lbl, updated_at = NOW()
         WHERE id = :id`,
        { replacements: { amt: Number(target_amount), dt: target_date || null, lbl: goal_label || 'Savings Goal', id: existing.id } }
      );
    } else {
      await sequelize.query(
        `INSERT INTO savings_goals (member_id, target_amount, target_date, goal_label)
         VALUES (:mid, :amt, :dt, :lbl)`,
        { replacements: { mid: member.id, amt: Number(target_amount), dt: target_date || null, lbl: goal_label || 'Savings Goal' } }
      );
    }

    return ok(res, { saved: true });
  } catch (e) {
    console.error('[savings-goals/set]', e);
    return fail(res, 500, 'Server error saving goal');
  }
});

// DELETE /api/savings-goals/remove — remove goal
router.delete('/remove', async (req, res) => {
  try {
    const member = getMemberFromRequest(req);
    if (!member) return fail(res, 401, 'Member session required.');

    await sequelize.query(
      `DELETE FROM savings_goals WHERE member_id = :mid`,
      { replacements: { mid: member.id } }
    );

    return ok(res, { removed: true });
  } catch (e) {
    console.error('[savings-goals/remove]', e);
    return fail(res, 500, 'Server error removing goal');
  }
});

module.exports = router;
