import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, index: true, sparse: true, unique: true },
    email: String,
    name: String,
    picture: String,
    // Calendar display preferences shared by every device of this user.
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    google: {
      refreshToken: String, // encrypted
      scopes: [String],
      enabled: { type: Boolean, default: false }, // Google Calendar sync on/off for the account
      calendarId: { type: String, default: 'primary' },
      calendarName: String,
      defaultOn: { type: Boolean, default: true }, // new events are pushed to Google by default
      importFromGoogle: { type: Boolean, default: true }, // pull events created in Google
      syncToken: String,
      lastSyncAt: Date,
      lastError: String,
    },
  },
  { timestamps: true, minimize: false },
);

export const User = mongoose.model('User', userSchema);
