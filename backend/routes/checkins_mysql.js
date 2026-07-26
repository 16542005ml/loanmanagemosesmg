const express = require('express');
const { sequelize } = require('../models');
const { getMemberFromRequest, getAdminFromRequest } = require('../adminContext');

const router = express.Router();

function ok(res, data) { return res.json({ status: 'success', message: 'OK', data }); }
function fail(res, code, message) { return res.status(code).json({ status: 'fail', message }); }

// Ensure table exists
(async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS member_checkins (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        member_id INT UNSIGNED NOT NULL,
        checkin_date DATE NOT NULL,
        streak_count INT UNSIGNED NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_checkin_member_date (member_id, checkin_date),
        INDEX idx_checkins_member (member_id)
      )
    `);
  } catch (_) {}
})();

// GET /api/checkins/me — returns current streak, longest streak, total check-ins
router.get('/me', async (req, res) => {
  try {
    const member = getMemberFromRequest(req);
    if (!member) return fail(res, 401, 'Member session required.');

    const rows = await sequelize.query(
      `SELECT checkin_date, streak_count FROM member_checkins
       WHERE member_id = :mid ORDER BY checkin_date DESC LIMIT 365`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id } }
    );

    if (!rows.length) {
      return ok(res, { currentStreak: 0, longestStreak: 0, totalCheckins: 0, checkedInToday: false, lastCheckin: null });
    }

    const today = new Date().toISOString().slice(0, 10);
    const checkedInToday = rows[0].checkin_date === today;
    const currentStreak = rows[0].streak_count || 0;
    const longestStreak = rows.reduce((max, r) => Math.max(max, r.streak_count || 0), 0);
    const totalCheckins = rows.length;

    return ok(res, { currentStreak, longestStreak, totalCheckins, checkedInToday, lastCheckin: rows[0].checkin_date });
  } catch (e) {
    console.error('[checkins/me]', e);
    return fail(res, 500, 'Server error fetching check-in data');
  }
});

// POST /api/checkins/ping — idempotent per calendar day
router.post('/ping', async (req, res) => {
  try {
    const member = getMemberFromRequest(req);
    if (!member) return fail(res, 401, 'Member session required.');

    const today = new Date().toISOString().slice(0, 10);

    // Check if already checked in today
    const [existing] = await sequelize.query(
      `SELECT id FROM member_checkins WHERE member_id = :mid AND checkin_date = :dt LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id, dt: today } }
    );
    if (existing) {
      // Already checked in — return current state
      const [row] = await sequelize.query(
        `SELECT streak_count FROM member_checkins WHERE member_id = :mid AND checkin_date = :dt`,
        { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id, dt: today } }
      );
      return ok(res, { checkedIn: true, currentStreak: row ? row.streak_count : 0, alreadyCheckedIn: true });
    }

    // Calculate yesterday's date
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);

    // Check if yesterday was checked in
    const [yesterdayRow] = await sequelize.query(
      `SELECT streak_count FROM member_checkins WHERE member_id = :mid AND checkin_date = :dt LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { mid: member.id, dt: yesterday } }
    );

    const newStreak = yesterdayRow ? (yesterdayRow.streak_count || 0) + 1 : 1;

    // Insert today's check-in
    await sequelize.query(
      `INSERT INTO member_checkins (member_id, checkin_date, streak_count)
       VALUES (:mid, :dt, :streak)
       ON DUPLICATE KEY UPDATE streak_count = VALUES(streak_count)`,
      { replacements: { mid: member.id, dt: today, streak: newStreak } }
    );

    // Milestone messages
    const milestones = [3, 7, 14, 30, 90];
    const milestone = milestones.includes(newStreak) ? newStreak : null;

    return ok(res, { checkedIn: true, currentStreak: newStreak, milestone });
  } catch (e) {
    console.error('[checkins/ping]', e);
    return fail(res, 500, 'Server error recording check-in');
  }
});

module.exports = router;
