import { AuditLog } from '../models/AuditLog.js';

export function recordAudit({ actorId, action, entityType, entityId, metadata, request, session }) {
  const document = {
    actorId,
    action,
    entityType,
    entityId,
    metadata,
    ipAddress: request?.ip,
    userAgent: request?.get('user-agent'),
    requestId: request?.get('x-request-id'),
  };
  return session ? AuditLog.create([document], { session }) : AuditLog.create(document);
}
