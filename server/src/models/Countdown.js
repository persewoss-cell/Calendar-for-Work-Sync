import mongoose from 'mongoose';

// D-day / countdown anniversary card (카운트다운 카드)
const countdownSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    title: { type: String, default: '' },
    date: { type: String, required: true },
    repeatYearly: { type: Boolean, default: false },
    color: { type: String, default: '#4fc3f7' },
    visible: { type: Boolean, default: true }, // show "D-45(방학)" on today's cell (the eye)
    ddayV: { type: Number, default: 2 }, // 2 = `visible` means the eye above, not the old desktop card
  },
  { timestamps: true },
);

export const Countdown = mongoose.model('Countdown', countdownSchema);
