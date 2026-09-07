import type { AuthService, AuthUser } from '../../../../services/auth-service/index.ts';

export function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function validateUserSession(authService: AuthService, cookieHeader: string | null): AuthUser | null {
  const token = parseCookie(cookieHeader, 'session');
  if (!token) return null;
  return authService.validateSession(token);
}
