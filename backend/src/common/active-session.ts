import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

/**
 * Access tokens carry `sid` (LoginSession id). Logout sets isRevoked=true;
 * every HTTP/WS auth path must reject revoked sessions so tokens die on
 * logout instead of waiting for JWT clock expiry.
 *
 * JWTs issued before `sid` existed are allowed through until their natural
 * `exp` (legacy 30m tokens) — no forced mass logout.
 */
export async function assertActiveLoginSession(
  prisma: PrismaService,
  sessionId: string | undefined,
  userId: string | undefined,
): Promise<void> {
  if (!sessionId || !userId) return;

  const session = await prisma.loginSession.findFirst({
    where: { id: sessionId, userId, isRevoked: false },
    select: { id: true },
  });

  if (!session) {
    throw new UnauthorizedException('Session expired. Please sign in again.');
  }
}

/** Same check for optional auth: revoked/missing session ⇒ treat as anonymous. */
export async function isLoginSessionActive(
  prisma: PrismaService,
  sessionId: string | undefined,
  userId: string | undefined,
): Promise<boolean> {
  if (!sessionId || !userId) return true;
  const session = await prisma.loginSession.findFirst({
    where: { id: sessionId, userId, isRevoked: false },
    select: { id: true },
  });
  return Boolean(session);
}
