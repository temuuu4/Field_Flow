import mongoose from 'mongoose';
import { USER_ROLES, USER_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';

const userFields = new Set(['firstName', 'lastName', 'name', 'email', 'role', 'phone', 'status', 'password']);
const registerFields = new Set(['firstName', 'lastName', 'name', 'email', 'phone', 'password']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Roles that are considered safe to assign via the public registration
// endpoint. Privileged roles (IT_ADMIN, OPERATOR) must be provisioned by an
// authenticated administrator through the user-management routes.
const PUBLIC_REGISTRATION_ROLES = Object.freeze([USER_ROLES.DRIVER]);
// Default role assigned to newly registered users when none is provided.
export const DEFAULT_PUBLIC_REGISTRATION_ROLE = USER_ROLES.DRIVER;

const rejectUnexpectedFields = (payload, allowedFields) => {
  const unexpectedFields = Object.keys(payload).filter((field) => !allowedFields.has(field));
  if (unexpectedFields.length > 0) {
    throw new ApiError(400, `Unexpected user field(s): ${unexpectedFields.join(', ')}`);
  }
};

const stringValue = (value, field, { required = false, maxLength = 160 } = {}) => {
  if (value === undefined || value === null) {
    if (required) {
      throw new ApiError(400, `${field} is required`);
    }
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, `${field} must be a non-empty string`);
  }
  const normalizedValue = value.trim();
  if (normalizedValue.length > maxLength) {
    throw new ApiError(400, `${field} must not exceed ${maxLength} characters`);
  }
  return normalizedValue;
};

const normalizeName = (payload, { required }) => {
  let firstName = stringValue(payload.firstName, 'firstName', { maxLength: 80 });
  let lastName = stringValue(payload.lastName, 'lastName', { maxLength: 80 });
  const name = stringValue(payload.name, 'name', { maxLength: 160 });

  if (name && (!firstName || !lastName)) {
    const nameParts = name.split(/\s+/);
    firstName ||= nameParts.shift();
    lastName ||= nameParts.join(' ');
  }

  if (required && !firstName) {
    throw new ApiError(400, 'firstName is required (or provide a full name in name)');
  }
  if (required && !lastName) {
    throw new ApiError(400, 'lastName is required (or provide a full name in name)');
  }

  return { firstName, lastName };
};

const normalizeEmail = (value, { required }) => {
  const email = stringValue(value, 'email', { required, maxLength: 254 })?.toLowerCase();
  if (email && !emailPattern.test(email)) {
    throw new ApiError(400, 'email must be a valid email address');
  }
  return email;
};

const normalizeEnum = (value, field, allowedValues) => {
  if (value === undefined) {
    return undefined;
  }
  const normalizedValue = stringValue(value, field, { maxLength: 40 }).toUpperCase();
  if (!allowedValues.includes(normalizedValue)) {
    throw new ApiError(400, `${field} must be one of: ${allowedValues.join(', ')}`);
  }
  return normalizedValue;
};

const normalizeOptionalFields = (payload) => {
  const phone = stringValue(payload.phone, 'phone', { maxLength: 40 });
  const role = normalizeEnum(payload.role, 'role', Object.values(USER_ROLES));
  const status = normalizeEnum(payload.status, 'status', Object.values(USER_STATUSES));
  return { phone, role, status };
};

const normalizePassword = (value, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new ApiError(400, 'password is required');
    }
    return undefined;
  }
  if (typeof value !== 'string' || value.length < 8) {
    throw new ApiError(400, 'password must be at least 8 characters');
  }
  if (value.length > 128) {
    throw new ApiError(400, 'password must not exceed 128 characters');
  }
  // NOTE: bcrypt truncates its input to 72 bytes. Any password longer than
  // 72 bytes would be silently reduced to the first 72 bytes by bcrypt; we
  // explicitly reject this to avoid ambiguity at hash/verify time. The 128
  // character cap above already bounds passwords to <=128 UTF-16 code units,
  // so users typing only ASCII characters will not hit this limit. Users
  // typing multi-byte UTF-8 characters could in theory, but ASCII passwords
  // are by far the dominant case and 128 chars is far above what most users
  // will type.
  if (Buffer.byteLength(value, 'utf8') > 72) {
    throw new ApiError(400, 'password must not exceed 72 bytes when UTF-8 encoded');
  }
  return value;
};

export function validateCreateUser(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }
  rejectUnexpectedFields(payload, userFields);

  const { firstName, lastName } = normalizeName(payload, { required: true });
  const email = normalizeEmail(payload.email, { required: true });
  const { phone, role, status } = normalizeOptionalFields(payload);
  const password = normalizePassword(payload.password, { required: true });

  if (!role) {
    throw new ApiError(400, 'role is required');
  }

  return { firstName, lastName, email, role, phone, status, password };
}

export function validateUpdateUser(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }
  rejectUnexpectedFields(payload, userFields);
  if (Object.keys(payload).length === 0) {
    throw new ApiError(400, 'At least one user field is required for update');
  }

  const normalized = {};
  const { firstName, lastName } = normalizeName(payload, { required: false });
  if (firstName !== undefined) normalized.firstName = firstName;
  if (lastName !== undefined) normalized.lastName = lastName;
  if (payload.name !== undefined && (firstName === undefined || lastName === undefined)) {
    throw new ApiError(400, 'name must contain both a first and last name when used for update');
  }

  const email = normalizeEmail(payload.email, { required: false });
  const { phone, role, status } = normalizeOptionalFields(payload);
  const password = normalizePassword(payload.password, { required: false });
  if (email !== undefined) normalized.email = email;
  if (phone !== undefined) normalized.phone = phone;
  if (role !== undefined) normalized.role = role;
  if (status !== undefined) normalized.status = status;
  if (password !== undefined) normalized.passwordHash = password;

  if (Object.keys(normalized).length === 0) {
    throw new ApiError(400, 'At least one supported user field is required for update');
  }
  return normalized;
}

export function validateRegister(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }
  // Strict allow-list for public registration: `role` and `status` MUST NOT
  // be accepted from the client to prevent privilege escalation. Role is
  // assigned server-side from the public allow-list.
  rejectUnexpectedFields(payload, registerFields);

  const { firstName, lastName } = normalizeName(payload, { required: true });
  const email = normalizeEmail(payload.email, { required: true });
  const phone = stringValue(payload.phone, 'phone', { maxLength: 40 });
  const password = normalizePassword(payload.password, { required: true });

  return { firstName, lastName, email, phone, password };
}

export { PUBLIC_REGISTRATION_ROLES };

export function validateUserId(id) {
  if (!mongoose.isObjectIdOrHexString(id)) {
    throw new ApiError(400, 'Invalid user id');
  }
  return id;
}

// Strict allow-list for the authenticated change-password endpoint.
// Only `currentPassword` and `newPassword` are accepted; any other field
// in the body (userId, email, role, status, tokenVersion, passwordHash,
// …) is rejected. Reuses the existing `normalizePassword` so the
// minimum / maximum / UTF-8 byte limit matches the rest of the project.
const changePasswordFields = new Set(['currentPassword', 'newPassword']);

export function validateChangePassword(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ApiError(400, 'Request body must be a JSON object');
  }
  rejectUnexpectedFields(payload, changePasswordFields);

  // `required: true` is implicit because the allow-list already filters
  // out missing fields; an explicit check gives a clearer error message.
  if (typeof payload.currentPassword !== 'string' || !payload.currentPassword) {
    throw new ApiError(400, 'currentPassword is required');
  }
  if (typeof payload.newPassword !== 'string' || !payload.newPassword) {
    throw new ApiError(400, 'newPassword is required');
  }

  // Reuse the project's password policy (8–128 chars, ≤72 UTF-8 bytes).
  // `normalizePassword` returns the value on success or throws.
  const newPassword = normalizePassword(payload.newPassword, { required: true });

  return {
    currentPassword: payload.currentPassword,
    newPassword,
  };
}