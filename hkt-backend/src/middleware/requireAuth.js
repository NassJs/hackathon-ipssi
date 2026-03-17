const { User } = require("../models/User");
const { verifyAccessToken } = require("../auth/jwt");

function extractBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || typeof header !== "string") return null;
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) return null;
  return token;
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const payload = verifyAccessToken(token);
    const userId = payload && payload.sub;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  }
}

module.exports = { requireAuth };

