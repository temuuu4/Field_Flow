import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { USER_ROLES, USER_STATUSES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { validateCreateUser, validateUpdateUser, validateUserId } from '../utils/userValidation.js';
import { environment } from '../config/env.js';

export const safeUser = (user) => {
  const serialized = user.toObject ? user.toObject({ virtuals: true }) : { ...user };
  delete serialized.passwordHash;
  delete serialized.__v;
  return serialized;
};

const hashPassword = async (password) => {
  const rounds = Number(environment.auth.bcryptRounds) || 12;
  return bcrypt.hash(password, rounds);
};

export async function createUser(request, response) {
  const validated = validateCreateUser(request.body);
  const user = await User.create({
    firstName: validated.firstName,
    lastName: validated.lastName,
    email: validated.email,
    role: validated.role,
    phone: validated.phone,
    status: validated.status,
    passwordHash: await hashPassword(validated.password),
  });
  response.status(201).json({ success: true, data: { user: safeUser(user) } });
}

export async function getUsers(request, response) {
  const filter = {};
  if (request.query.role !== undefined) {
    const role = String(request.query.role).trim().toUpperCase();
    if (!Object.values(USER_ROLES).includes(role)) {
      throw new ApiError(400, `role must be one of: ${Object.values(USER_ROLES).join(', ')}`);
    }
    filter.role = role;
  }
  if (request.query.status !== undefined) {
    const status = String(request.query.status).trim().toUpperCase();
    if (!Object.values(USER_STATUSES).includes(status)) {
      throw new ApiError(400, `status must be one of: ${Object.values(USER_STATUSES).join(', ')}`);
    }
    filter.status = status;
  }

  const users = await User.find(filter).sort({ createdAt: -1 });
  response.json({ success: true, data: { users: users.map(safeUser) } });
}

export async function getUser(request, response) {
  const user = await User.findById(validateUserId(request.params.id));
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  response.json({ success: true, data: { user: safeUser(user) } });
}

export async function updateUser(request, response) {
  const validated = validateUpdateUser(request.body);
  const update = { $set: validated };
  const passwordChanged = Boolean(validated.passwordHash);

  if (passwordChanged) {
    update.$set.passwordHash = await hashPassword(validated.passwordHash);
  }

  // When a password is changed we must invalidate all previously issued
  // authentication tokens. The existing token-version mechanism compares the
  // JWT `tv` claim against the user's `tokenVersion`; bumping it here is the
  // single, central way to force re-authentication across the system.
  if (passwordChanged) {
    update.$inc = { ...(update.$inc ?? {}), tokenVersion: 1 };
  }

  const user = await User.findByIdAndUpdate(
    validateUserId(request.params.id),
    update,
    { new: true, runValidators: true },
  );
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  response.json({ success: true, data: { user: safeUser(user) } });
}

export async function deactivateUser(request, response) {
  const user = await User.findByIdAndUpdate(
    validateUserId(request.params.id),
    { $set: { status: USER_STATUSES.INACTIVE } },
    { new: true, runValidators: true },
  );
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  response.json({ success: true, data: { user: safeUser(user) } });
}