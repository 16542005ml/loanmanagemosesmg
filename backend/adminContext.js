const crypto = require('crypto');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function getSecret() {
  const secret = process.env.ADMIN_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    const randomSecret = require('crypto').randomBytes(32).toString('hex');
    if (process.env.NODE_ENV === 'production') {
      // CRITICAL: Sessions will not survive server restarts without this env var set.
      // Set ADMIN_TOKEN_SECRET in your hosting platform's environment variables.
      console.error('[SECURITY] CRITICAL: ADMIN_TOKEN_SECRET is not set in production environment!');
      console.error('[SECURITY] All admin sessions will be invalidated on every server restart.');
      console.error('[SECURITY] Set ADMIN_TOKEN_SECRET in your Render/Railway environment variables immediately.');
    } else {
      console.warn('[SECURITY] WARNING: Using auto-generated token secret. Set ADMIN_TOKEN_SECRET in .env for persistent sessions.');
    }
    return randomSecret;
  }
  return secret;
}

const SECRET = getSecret();

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signPayload(payload) {
  return crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
}

function signAdminToken(admin) {
  const payload = base64url(JSON.stringify({
    type: 'admin',
    id: String(admin.id),
    full_name: admin.full_name || admin.name || '',
    email: admin.email || '',
    phone: admin.phone || '',
    exp: Date.now() + TOKEN_TTL_MS
  }));
  return `${payload}.${signPayload(payload)}`;
}

function readBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req.headers['x-admin-token']) return String(req.headers['x-admin-token']).trim();
  if (req.body && req.body.token) return String(req.body.token).trim();
  if (req.query && req.query.token) return String(req.query.token).trim();
  return '';
}

function getAdminFromRequest(req) {
  try {
    const token = readBearerToken(req);
    if (!token || !token.includes('.')) return null;
    const [payload, signature] = token.split('.');
    const expected = signPayload(payload);
    const sigBuf = Buffer.from(String(signature));
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const admin = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (admin.type === 'member') return null;
    if (admin.type && admin.type !== 'admin') return null;
    if (!admin.id || !admin.exp || Date.now() > Number(admin.exp)) return null;
    return {
      id: String(admin.id),
      full_name: admin.full_name || '',
      name: admin.full_name || '',
      email: admin.email || '',
      phone: admin.phone || ''
    };
  } catch (_) {
    return null;
  }
}

function requireAdmin(req, res) {
  const admin = getAdminFromRequest(req);
  if (!admin) {
    res.status(401).json({ status: 'fail', message: 'Admin session expired. Please log in again.' });
    return null;
  }
  return admin;
}

async function getFallbackAdminId(sequelize) {
  const rows = await sequelize.query(
    `SELECT id FROM admins ORDER BY id ASC LIMIT 1`,
    { type: sequelize.QueryTypes.SELECT }
  );
  return rows && rows.length ? String(rows[0].id) : null;
}

function signMemberToken(member) {
  const payload = base64url(JSON.stringify({
    type: 'member',
    id: String(member.id),
    full_name: member.full_name || member.name || '',
    email: member.email || '',
    exp: Date.now() + TOKEN_TTL_MS
  }));
  return `${payload}.${signPayload(payload)}`;
}

function getMemberFromRequest(req) {
  try {
    const token = readBearerToken(req);
    if (!token || !token.includes('.')) return null;
    // Check revocation list
    if (module.exports && module.exports.isTokenRevoked && module.exports.isTokenRevoked(token)) return null;
    const [payload, signature] = token.split('.');
    const expected = signPayload(payload);
    const sigBuf = Buffer.from(String(signature));
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (data.type !== 'member' || !data.id || !data.exp || Date.now() > Number(data.exp)) return null;
    return { id: String(data.id), full_name: data.full_name || '', email: data.email || '' };
  } catch (_) {
    return null;
  }
}

// In-memory revoked token set (process lifetime). Prefer persistent store for production.
const revokedTokens = new Set();

function revokeMemberToken(token) {
  if (!token) return false;
  try { revokedTokens.add(String(token)); return true; } catch (e) { return false; }
}

function isTokenRevoked(token) {
  try { return revokedTokens.has(String(token)); } catch (e) { return false; }
}

function requireMember(req, res) {
  const member = getMemberFromRequest(req);
  if (!member) {
    res.status(401).json({ status: 'fail', message: 'Member session expired. Please log in again.' });
    return null;
  }
  return member;
}

module.exports = {
  signAdminToken,
  signMemberToken,
  getAdminFromRequest,
  getMemberFromRequest,
  requireAdmin,
  requireMember,
  getFallbackAdminId
};

// Export revocation helpers
module.exports.revokeMemberToken = revokeMemberToken;
module.exports.isTokenRevoked = isTokenRevoked;
