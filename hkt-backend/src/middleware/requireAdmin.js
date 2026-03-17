function requireAdmin(req, res, next) {
  const user = req.user;
  if (!user || user.admin !== true) {
    return res.status(403).json({ ok: false, error: "FORBIDDEN" });
  }
  return next();
}

module.exports = { requireAdmin };

