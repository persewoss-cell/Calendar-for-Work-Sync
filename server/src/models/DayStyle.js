import mongoose from 'mongoose';

// Per-date cell decoration (칸 배경색).
const dayStyleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    bg: { type: String, default: '' }, // cell background color
    list: { type: String, default: '' }, // list style for this date only ('' = use the setting)
  },
  { timestamps: true },
);
dayStyleSchema.index({ userId: 1, date: 1 }, { unique: true });

export const DayStyle = mongoose.model('DayStyle', dayStyleSchema);
