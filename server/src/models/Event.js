import mongoose from 'mongoose';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const eventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, required: true },
    title: { type: String, default: '' }, // plain text (search, export)
    html: { type: String, default: '' }, // sanitized inline formatting of the title
    memo: { type: String, default: '' },
    date: { type: String, match: DATE, required: true }, // start date in the user's timezone
    endDate: { type: String, match: DATE }, // inclusive; equals date for single-day events
    startTime: { type: String, match: TIME, default: null }, // null => all-day
    endTime: { type: String, match: TIME, default: null },
    color: { type: String, default: '' },
    done: { type: Boolean, default: false },
    doneDates: { type: [String], default: [] }, // completion per occurrence for repeating events
    order: { type: Number, default: 0 },
    reminder: { type: Number, default: null }, // minutes before start; null => none
    rrule: { type: String, default: '' }, // e.g. FREQ=WEEKLY;BYDAY=TU (no DTSTART)
    exdates: { type: [String], default: [] },

    source: { type: String, enum: ['local', 'import'], default: 'local' },

    deleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
  },
  { timestamps: true },
);

eventSchema.index({ userId: 1, date: 1 });
eventSchema.index({ userId: 1, title: 'text', memo: 'text' });

eventSchema.pre('validate', function (next) {
  if (!this.endDate || this.endDate < this.date) this.endDate = this.date;
  next();
});

export const Event = mongoose.model('Event', eventSchema);

export const EDITABLE_EVENT_FIELDS = [
  'title', 'html', 'memo', 'date', 'endDate', 'startTime', 'endTime', 'color', 'done', 'doneDates',
  'order', 'reminder', 'rrule', 'exdates',
];
