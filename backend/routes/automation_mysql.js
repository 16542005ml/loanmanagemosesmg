const express = require('express');
const { sequelize } = require('../models');
const { requireAdmin, getFallbackAdminId, getMemberFromRequest } = require('../adminContext');
const { sendEmail, emailTemplates, getAdminFrom } = require('../emailService');
const { sendSMS, smsTemplates } = require('../smsService');

const router = express.Router();

function ok(res, data) { return res.json({ status: 'success', message: 'OK', data }); }
function fail(res, code, message) { return res.status(code).json({ status: 'fail', message }); }

(async () => {
  const statements = [
    `ALTER TABLE automation_admins ADD COLUMN admin_id VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE automation_admins ADD INDEX idx_automation_admins_admin (admin_id)`,
    `ALTER TABLE scheduled_meetings ADD COLUMN admin_id VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE scheduled_meetings ADD INDEX idx_scheduled_meetings_admin (admin_id)`,
    `ALTER TABLE scheduled_meetings ADD COLUMN meeting_type VARCHAR(100) DEFAULT 'Board'`,
    `ALTER TABLE scheduled_meetings ADD COLUMN department VARCHAR(255) DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN status VARCHAR(50) DEFAULT 'Scheduled'`,
    `ALTER TABLE scheduled_meetings ADD COLUMN priority VARCHAR(50) DEFAULT 'Normal'`,
    `ALTER TABLE scheduled_meetings ADD COLUMN confidentiality VARCHAR(50) DEFAULT 'Normal'`,
    `ALTER TABLE scheduled_meetings ADD COLUMN organizer VARCHAR(255) DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN chair VARCHAR(255) DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN vice_chair VARCHAR(255) DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN secretary VARCHAR(255) DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN assistant_secretary VARCHAR(255) DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN minute_taker VARCHAR(255) DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN purpose TEXT DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN description TEXT DEFAULT ''`,
    `ALTER TABLE scheduled_meetings ADD COLUMN end_time TIME DEFAULT NULL`,
    `ALTER TABLE scheduled_meetings ADD COLUMN meeting_url VARCHAR(500) DEFAULT NULL`,
    `ALTER TABLE scheduled_meetings ADD COLUMN agenda_items TEXT DEFAULT NULL`,
    `ALTER TABLE scheduled_meetings ADD COLUMN attendance_count INT DEFAULT 0`,
    `ALTER TABLE scheduled_meetings ADD COLUMN minutes_status VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE scheduled_meetings ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
  ];
  for (const statement of statements) {
    try { await sequelize.query(statement); } catch (_) {}
  }
  try {
    const emailIndexes = await sequelize.query(
      `SELECT INDEX_NAME
       FROM INFORMATION_SCHEMA.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'automation_admins'
         AND COLUMN_NAME = 'email'
         AND NON_UNIQUE = 0
         AND INDEX_NAME <> 'PRIMARY'
       GROUP BY INDEX_NAME`,
      { type: sequelize.QueryTypes.SELECT }
    );
    for (const idx of emailIndexes) {
      try { await sequelize.query(`ALTER TABLE automation_admins DROP INDEX \`${idx.INDEX_NAME}\``); } catch (_) {}
    }
    try { await sequelize.query(`ALTER TABLE automation_admins ADD UNIQUE KEY uniq_automation_admins_admin_email (admin_id, email)`); } catch (_) {}
    const fallbackAdminId = await getFallbackAdminId(sequelize);
    if (fallbackAdminId) {
      await sequelize.query(`UPDATE automation_admins SET admin_id = :adminId WHERE admin_id IS NULL OR admin_id = ''`, { replacements: { adminId: fallbackAdminId } });
      await sequelize.query(`UPDATE scheduled_meetings SET admin_id = :adminId WHERE admin_id IS NULL OR admin_id = ''`, { replacements: { adminId: fallbackAdminId } });
    }
  } catch (_) {}
})();

// GET /api/automation/admins
router.get('/admins', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const rows = await sequelize.query(
      `SELECT id, email, registered_at FROM automation_admins WHERE admin_id = :adminId ORDER BY registered_at ASC`,
      { type: sequelize.QueryTypes.SELECT, replacements: { adminId: admin.id } }
    );
    return ok(res, rows);
  } catch (e) {
    console.error('[automation/admins]', e);
    return fail(res, 500, 'Error fetching admins');
  }
});

// POST /api/automation/admins/add
// body: { email }
router.post('/admins/add', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { email } = req.body || {};
    if (!email) return fail(res, 400, 'Missing email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 400, 'Invalid email format');

    await sequelize.query(
      `INSERT IGNORE INTO automation_admins (email, admin_id) VALUES (:email, :admin_id)`,
      { type: sequelize.QueryTypes.INSERT, replacements: { email: String(email).trim(), admin_id: admin.id } }
    );
    return ok(res, { email });
  } catch (e) {
    console.error('[automation/admins/add]', e);
    return fail(res, 500, 'Error adding admin');
  }
});

// DELETE /api/automation/admins/delete
// body: { email }
router.delete('/admins/delete', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const { email } = req.body || {};
    if (!email) return fail(res, 400, 'Missing email');

    await sequelize.query(
      `DELETE FROM automation_admins WHERE email = :email AND admin_id = :adminId`,
      { type: sequelize.QueryTypes.DELETE, replacements: { email: String(email), adminId: admin.id } }
    );
    return ok(res, { deleted: true });
  } catch (e) {
    console.error('[automation/admins/delete]', e);
    return fail(res, 500, 'Error deleting admin');
  }
});

// GET /api/automation/meetings/member/:memberId
// Member-safe meeting feed scoped to the member's approving administrator.
router.get('/meetings/member/:memberId', async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    if (!memberId) return fail(res, 400, 'Invalid member id');
    const owners = await sequelize.query(
      `SELECT admin_id FROM approved_members WHERE id = :memberId LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId } }
    );
    if (!owners.length || !owners[0].admin_id) return fail(res, 404, 'Approved member not found');
    const rows = await sequelize.query(
      `SELECT id, title, meeting_date, meeting_time, location, platform, target_group, subsidiary_slug, created_at
       FROM scheduled_meetings WHERE admin_id = :adminId ORDER BY meeting_date DESC, meeting_time DESC`,
      { type: sequelize.QueryTypes.SELECT, replacements: { adminId: String(owners[0].admin_id) } }
    );
    return ok(res, rows);
  } catch (e) {
    console.error('[automation/meetings/member]', e);
    return fail(res, 500, 'Error fetching member meetings');
  }
});

// GET /api/automation/meetings
router.get('/meetings', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const rows = await sequelize.query(
      `SELECT id, title, meeting_date, meeting_time, location, platform, target_group, subsidiary_slug,
              meeting_type, department, status, priority, confidentiality, organizer, chair, vice_chair,
              secretary, assistant_secretary, minute_taker, purpose, description, end_time, meeting_url,
              agenda_items, attendance_count, minutes_status, created_at, updated_at, attendance_data
       FROM scheduled_meetings WHERE admin_id = :adminId ORDER BY created_at DESC`,
      { type: sequelize.QueryTypes.SELECT, replacements: { adminId: admin.id } }
    );
    return ok(res, rows);
  } catch (e) {
    console.error('[automation/meetings]', e);
    return fail(res, 500, 'Error fetching meetings');
  }
});

// POST /api/automation/meetings/create
// body: { title, meeting_date, meeting_time, location, platform, target_group, subsidiary_slug }
router.post('/meetings/create', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const {
      title, meeting_date, meeting_time, location, platform, target_group, subsidiary_slug,
      meeting_type, department, status, priority, confidentiality,
      organizer, chair, vice_chair, secretary, assistant_secretary, minute_taker,
      purpose, description, end_time, meeting_url, agenda_items, attendance_data
    } = req.body || {};
    if (!title || !meeting_date || !meeting_time) return fail(res, 400, 'Missing required meeting fields');

    const [result] = await sequelize.query(
      `INSERT INTO scheduled_meetings
         (admin_id, title, meeting_date, meeting_time, location, platform, target_group, subsidiary_slug,
          meeting_type, department, status, priority, confidentiality, organizer, chair, vice_chair,
          secretary, assistant_secretary, minute_taker, purpose, description, end_time, meeting_url, agenda_items, attendance_data)
       VALUES (:admin_id, :title, :meeting_date, :meeting_time, :location, :platform, :target_group, :subsidiary_slug,
               :meeting_type, :department, :status, :priority, :confidentiality, :organizer, :chair, :vice_chair,
               :secretary, :assistant_secretary, :minute_taker, :purpose, :description, :end_time, :meeting_url, :agenda_items, :attendance_data)`,
      {
        type: sequelize.QueryTypes.INSERT,
        replacements: {
          admin_id: admin.id,
          title: String(title),
          meeting_date: String(meeting_date),
          meeting_time: String(meeting_time),
          location: String(location || ''),
          platform: String(platform || 'Email Engine'),
          target_group: String(target_group || 'all'),
          subsidiary_slug: String(subsidiary_slug || 'eldoret_main'),
          meeting_type: String(meeting_type || 'Board'),
          department: String(department || ''),
          status: String(status || 'Scheduled'),
          priority: String(priority || 'Normal'),
          confidentiality: String(confidentiality || 'Normal'),
          organizer: String(organizer || ''),
          chair: String(chair || ''),
          vice_chair: String(vice_chair || ''),
          secretary: String(secretary || ''),
          assistant_secretary: String(assistant_secretary || ''),
          minute_taker: String(minute_taker || ''),
          purpose: String(purpose || ''),
          description: String(description || ''),
          end_time: end_time ? String(end_time) : null,
          meeting_url: String(meeting_url || ''),
          agenda_items: String(agenda_items || ''),
          attendance_data: String(attendance_data || '')
        }
      }
    );

    // ── Send meeting notification emails and SMS to all members of this admin ──
    // (runs async, non-blocking — API responds immediately)
    setImmediate(async () => {
      try {
        const members = await sequelize.query(
          `SELECT full_name, email, phone FROM approved_members
           WHERE admin_id = :adminId`,
          { type: sequelize.QueryTypes.SELECT, replacements: { adminId: admin.id } }
        );
        const adminFrom = getAdminFrom(admin);
        let notifiedEmailCount = 0;
        let notifiedSmsCount = 0;
        for (const m of members) {
          if (m.email) {
            const [subject, html] = emailTemplates.meetingScheduled({
              memberName:  m.full_name,
              title,
              meetingDate: meeting_date,
              meetingTime: meeting_time,
              location:    location || 'TBD',
              platform:    platform || 'In-person',
              purpose:     purpose || '',
              meetingUrl:  meeting_url || ''
            });
            await sendEmail(m.email, subject, html, null, adminFrom).catch(()=>{});
            notifiedEmailCount++;
          }
          if (m.phone) {
            await sendSMS(m.phone, smsTemplates.meetingScheduled({
              date: meeting_date,
              time: meeting_time,
              location: location || 'TBD'
            })).catch(()=>{});
            notifiedSmsCount++;
          }
        }
        console.log(`[automation/meetings] Notified ${notifiedEmailCount} email(s) and ${notifiedSmsCount} SMS(s) about meeting: ${title}`);
      } catch (emailErr) {
        console.warn('[automation/meetings] Notification error:', emailErr.message);
      }
    });

    return ok(res, { id: result, title });
  } catch (e) {
    console.error('[automation/meetings/create]', e);
    return fail(res, 500, 'Error creating meeting');
  }
});

// PUT /api/automation/meetings/:id
// Admin updates an existing meeting record by ID.
router.put('/meetings/:id', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const meetingId = Number(req.params.id);
    if (!meetingId) return fail(res, 400, 'Invalid meeting ID');

    const {
      title, meeting_date, meeting_time, location, platform, target_group, subsidiary_slug,
      meeting_type, department, status, priority, confidentiality, organizer, chair, vice_chair,
      secretary, assistant_secretary, minute_taker, purpose, description, end_time, meeting_url, agenda_items, attendance_data
    } = req.body || {};

    const updateFields = [];
    const replacements = { id: meetingId, adminId: admin.id };

    if (title !== undefined) { updateFields.push('title = :title'); replacements.title = String(title); }
    if (meeting_date !== undefined) { updateFields.push('meeting_date = :meeting_date'); replacements.meeting_date = String(meeting_date); }
    if (meeting_time !== undefined) { updateFields.push('meeting_time = :meeting_time'); replacements.meeting_time = String(meeting_time); }
    if (location !== undefined) { updateFields.push('location = :location'); replacements.location = String(location); }
    if (platform !== undefined) { updateFields.push('platform = :platform'); replacements.platform = String(platform); }
    if (target_group !== undefined) { updateFields.push('target_group = :target_group'); replacements.target_group = String(target_group); }
    if (subsidiary_slug !== undefined) { updateFields.push('subsidiary_slug = :subsidiary_slug'); replacements.subsidiary_slug = String(subsidiary_slug); }
    if (meeting_type !== undefined) { updateFields.push('meeting_type = :meeting_type'); replacements.meeting_type = String(meeting_type); }
    if (department !== undefined) { updateFields.push('department = :department'); replacements.department = String(department); }
    if (status !== undefined) { updateFields.push('status = :status'); replacements.status = String(status); }
    if (priority !== undefined) { updateFields.push('priority = :priority'); replacements.priority = String(priority); }
    if (confidentiality !== undefined) { updateFields.push('confidentiality = :confidentiality'); replacements.confidentiality = String(confidentiality); }
    if (organizer !== undefined) { updateFields.push('organizer = :organizer'); replacements.organizer = String(organizer); }
    if (chair !== undefined) { updateFields.push('chair = :chair'); replacements.chair = String(chair); }
    if (vice_chair !== undefined) { updateFields.push('vice_chair = :vice_chair'); replacements.vice_chair = String(vice_chair); }
    if (secretary !== undefined) { updateFields.push('secretary = :secretary'); replacements.secretary = String(secretary); }
    if (assistant_secretary !== undefined) { updateFields.push('assistant_secretary = :assistant_secretary'); replacements.assistant_secretary = String(assistant_secretary); }
    if (minute_taker !== undefined) { updateFields.push('minute_taker = :minute_taker'); replacements.minute_taker = String(minute_taker); }
    if (purpose !== undefined) { updateFields.push('purpose = :purpose'); replacements.purpose = String(purpose); }
    if (description !== undefined) { updateFields.push('description = :description'); replacements.description = String(description); }
    if (end_time !== undefined) { updateFields.push('end_time = :end_time'); replacements.end_time = end_time ? String(end_time) : null; }
    if (meeting_url !== undefined) { updateFields.push('meeting_url = :meeting_url'); replacements.meeting_url = String(meeting_url || ''); }
    if (agenda_items !== undefined) { updateFields.push('agenda_items = :agenda_items'); replacements.agenda_items = String(agenda_items || ''); }
    if (attendance_data !== undefined) { updateFields.push('attendance_data = :attendance_data'); replacements.attendance_data = String(attendance_data || ''); }

    if (!updateFields.length) return fail(res, 400, 'No fields provided for update');

    await sequelize.query(
      `UPDATE scheduled_meetings SET ${updateFields.join(', ')} WHERE id = :id AND admin_id = :adminId`,
      { replacements }
    );

    return ok(res, { updated: true, id: meetingId });
  } catch (e) {
    console.error('[automation/meetings/update]', e);
    return fail(res, 500, 'Error updating meeting');
  }
});

// DELETE /api/automation/meetings/:id
// Admin deletes a specific meeting by its ID.
router.delete('/meetings/:id', async (req, res) => {
  try {
    const admin = requireAdmin(req, res);
    if (!admin) return;
    const meetingId = Number(req.params.id);
    if (!meetingId) return fail(res, 400, 'Invalid meeting ID');

    await sequelize.query(
      `DELETE FROM scheduled_meetings WHERE id = :id AND admin_id = :adminId`,
      { type: sequelize.QueryTypes.DELETE, replacements: { id: meetingId, adminId: admin.id } }
    );

    return ok(res, { deleted: true, id: meetingId });
  } catch (e) {
    console.error('[automation/meetings/delete]', e);
    return fail(res, 500, 'Error deleting meeting');
  }
});

// GET /api/automation/meetings/member/:memberId/active
// Active (today & future) meetings for the member's admin — member-safe.
router.get('/meetings/member/:memberId/active', async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    const member = getMemberFromRequest(req);
    const admin = requireAdmin ? null : null; // admin can also call this

    if (!member) return fail(res, 401, 'Member session required');
    if (String(member.id) !== String(memberId)) return fail(res, 403, 'Access denied');

    const owners = await sequelize.query(
      `SELECT admin_id FROM approved_members WHERE id = :memberId LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId } }
    );
    if (!owners.length || !owners[0].admin_id) return ok(res, []);

    const rows = await sequelize.query(
      `SELECT id, title, meeting_date, meeting_time, location, platform, target_group,
              meeting_type, department, status, priority, confidentiality, organizer, chair,
              vice_chair, secretary, assistant_secretary, minute_taker, purpose, description,
              end_time, meeting_url, agenda_items, attendance_count, minutes_status, created_at, updated_at, attendance_data
       FROM scheduled_meetings
       WHERE admin_id = :adminId AND meeting_date >= CURDATE()
       ORDER BY meeting_date ASC, meeting_time ASC`,
      { type: sequelize.QueryTypes.SELECT, replacements: { adminId: String(owners[0].admin_id) } }
    );
    return ok(res, rows);
  } catch (e) {
    console.error('[automation/meetings/active]', e);
    return fail(res, 500, 'Error fetching active meetings');
  }
});

// GET /api/automation/meetings/member/:memberId/past
// Past meetings (before today) for the member's admin — member-safe.
router.get('/meetings/member/:memberId/past', async (req, res) => {
  try {
    const memberId = Number(req.params.memberId);
    const member = getMemberFromRequest(req);

    if (!member) return fail(res, 401, 'Member session required');
    if (String(member.id) !== String(memberId)) return fail(res, 403, 'Access denied');

    const owners = await sequelize.query(
      `SELECT admin_id FROM approved_members WHERE id = :memberId LIMIT 1`,
      { type: sequelize.QueryTypes.SELECT, replacements: { memberId } }
    );
    if (!owners.length || !owners[0].admin_id) return ok(res, []);

    const rows = await sequelize.query(
      `SELECT id, title, meeting_date, meeting_time, location, platform, target_group,
              meeting_type, department, status, priority, confidentiality, organizer, chair,
              vice_chair, secretary, assistant_secretary, minute_taker, purpose, description,
              end_time, meeting_url, agenda_items, attendance_count, minutes_status, created_at, updated_at, attendance_data
       FROM scheduled_meetings
       WHERE admin_id = :adminId AND meeting_date < CURDATE()
       ORDER BY meeting_date DESC, meeting_time DESC
       LIMIT 50`,
      { type: sequelize.QueryTypes.SELECT, replacements: { adminId: String(owners[0].admin_id) } }
    );
    return ok(res, rows);
  } catch (e) {
    console.error('[automation/meetings/past]', e);
    return fail(res, 500, 'Error fetching past meetings');
  }
});

module.exports = router;
