import { z } from 'zod';
import { passwordSchema } from './common.js';

/** POST /auth/login */
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required'),
});

/** POST /auth/forgot-password */
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/** POST /auth/reset-password */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
});

/** POST /auth/activate — invited user sets their initial password */
export const activateSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ActivateInput = z.infer<typeof activateSchema>;
