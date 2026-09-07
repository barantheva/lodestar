import type { AuthService, CreateUserInput } from '../../../../services/auth-service/index.ts';

export interface CreateOperatorResult {
  success: boolean;
  error?: string;
}

export function createOperator(authService: AuthService, input: CreateUserInput): CreateOperatorResult {
  try {
    authService.createUser(input);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
