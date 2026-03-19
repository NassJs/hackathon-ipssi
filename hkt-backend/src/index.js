const http = require("node:http");

const app = require("./server");
const { connectToMongo } = require("./mongo");
const { User } = require("./models/User");

const PORT = Number.parseInt(process.env.PORT || "3000", 10);

async function ensureAdminUser() {
  const emailRaw = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!emailRaw || !password) return;

  const email = String(emailRaw).toLowerCase().trim();
  let user = await User.findOne({ email }).select("+password_hash");

  if (!user) {
    const password_hash = await User.hashPassword(password);
    user = await User.create({
      first_name: "Admin",
      last_name: "HKT",
      email,
      password_hash,
      admin: true
    });
    console.log(`[api] bootstrap admin created: ${email}`);
    return;
  }

  if (user.admin !== true) {
    await User.findByIdAndUpdate(user._id, { $set: { admin: true } }, { new: true });
    console.log(`[api] bootstrap admin promoted: ${email}`);
  }
}

async function main() {
  await connectToMongo();
  await ensureAdminUser();

  const server = http.createServer(app);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[api] listening on :${PORT}`);
  });
}

main().catch((err) => {
  console.error("[api] fatal error:", err);
  process.exitCode = 1;
});

