import crypto from 'crypto';
import { prisma } from './prisma';

const ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = 'sha512';

/**
 * Hashes a plaintext password using PBKDF2 with a random salt.
 * Format returned: `salt:hash`
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return `${salt}:${derivedKey}`;
}

/**
 * Verifies a plaintext password against a stored `salt:hash` string.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const derivedKey = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derivedKey, 'hex'), Buffer.from(originalHash, 'hex'));
}

let cachedAdminUser: any = null;

/**
 * Ensures the default 'admin' user exists in PostgreSQL with password '123456'.
 * Returns the admin user record. Cached in-memory after first resolution.
 */
export async function ensureAdminUser() {
  if (cachedAdminUser) {
    return cachedAdminUser;
  }

  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' },
  });

  if (existingAdmin) {
    cachedAdminUser = existingAdmin;
    return existingAdmin;
  }

  const hashedPassword = hashPassword('123456');
  const newAdmin = await prisma.user.create({
    data: {
      username: 'admin',
      email: 'admin@thoughtless.local',
      password: hashedPassword,
      role: 'admin',
    },
  });

  cachedAdminUser = newAdmin;
  console.log('[Auth] Initialized default admin user');
  return newAdmin;
}
