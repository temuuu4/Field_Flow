import mongoose from 'mongoose';
import { AUDIT_ENTITY_TYPES } from './constants.js';
import { objectId } from './common.js';

const auditLogSchema = new mongoose.Schema(
  {
    actorId: objectId('User'),
    action: { type: String, required: true, trim: true, maxlength: 120 },
    entityType: { type: String, required: true, enum: Object.values(AUDIT_ENTITY_TYPES) },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String, trim: true, maxlength: 100 },
    userAgent: { type: String, trim: true, maxlength: 500 },
    requestId: { type: String, trim: true, maxlength: 120 },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  { versionKey: false },
);

auditLogSchema.index({ entityType: 1, entityId: 1, occurredAt: -1 });
auditLogSchema.index({ actorId: 1, occurredAt: -1 });

auditLogSchema.pre('save', function preventAuditUpdates(next) {
  if (!this.isNew) {
    next(new Error('AuditLog records are append-only'));
    return;
  }
  next();
});

for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditLogSchema.pre(operation, function preventAuditMutation(next) {
    next(new Error('AuditLog records are append-only'));
  });
}

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
