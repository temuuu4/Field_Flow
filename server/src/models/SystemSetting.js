import mongoose from 'mongoose';
import { objectId } from './common.js';

const systemSettingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, match: /^[A-Z0-9_]+$/ },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    category: { type: String, trim: true, maxlength: 80 },
    updatedBy: objectId('User', { required: true }),
  },
  { timestamps: true },
);

systemSettingSchema.index({ category: 1, key: 1 });

export const SystemSetting = mongoose.model('SystemSetting', systemSettingSchema);
