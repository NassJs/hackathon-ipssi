const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017/hkt";

async function connectToMongo() {
  mongoose.set("strictQuery", true);

  await mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10_000
  });

  console.log("[mongo] connected");
}

module.exports = { connectToMongo };

