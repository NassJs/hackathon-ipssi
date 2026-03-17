const jwt = require("jsonwebtoken");

function getJwtConfig() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return { secret, expiresIn };
}

function signAccessToken(user) {
  const { secret, expiresIn } = getJwtConfig();
  const subject = user.id || String(user._id);

  return jwt.sign(
    {},
    secret,
    {
      subject,
      expiresIn
    }
  );
}

function verifyAccessToken(token) {
  const { secret } = getJwtConfig();
  return jwt.verify(token, secret);
}

module.exports = { signAccessToken, verifyAccessToken };

