const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true
    },
    password_hash: { type: String, required: true, select: false },
    admin: { type: Boolean, default: false }
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        delete ret.password_hash;
        return ret;
      }
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret._id;
        delete ret.__v;
        delete ret.password_hash;
        return ret;
      }
    }
  }
);

userSchema.virtual("id").get(function id() {
  return String(this._id);
});

userSchema.methods.verifyPassword = async function verifyPassword(password) {
  return bcrypt.compare(password, this.password_hash);
};

userSchema.statics.hashPassword = async function hashPassword(password, rounds = 12) {
  const salt = await bcrypt.genSalt(rounds);
  return bcrypt.hash(password, salt);
};

const User = mongoose.model("User", userSchema);

module.exports = { User };

