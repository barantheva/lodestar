import type { AuthService, AuthUser } from '../../../../services/auth-service/index.ts';

export interface LoginUserInput {
  username: string;
  password: string;
}

export interface LoginUserResult {
  success: boolean;
  user?: AuthUser;
  sessionToken?: string;
  error?: string;
}

export function loginUser(authService: AuthService, input: LoginUserInput): LoginUserResult {
  if (!input.username || !input.password) {
    return { success: false, error: 'Username and password are required' };
  }

  const res = authService.authenticate(input.username, input.password);
  if (!res) {
    return { success: false, error: 'Invalid username or password' };
  }

  return {
    success: true,
    user: res.user,
    sessionToken: res.sessionToken,
  };
}
