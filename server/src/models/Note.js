import mongoose from 'mongoose';

// Sticky memo (스티커 메모)
const noteSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    title: { type: String, default: '' },
    items: {
      type: [{ text: String, done: { type: Boolean, default: false } }],
      default: [],
    },
    color: { type: String, default: '#fff59d' },
    visible: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Note = mongoose.model('Note', noteSchema);
