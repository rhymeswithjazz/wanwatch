'use server';

import { signIn } from '@/lib/auth';
import { AuthError } from 'next-auth';

export async function authenticate(
  callbackUrl: string,
  formData: FormData
): Promise<{ error: string } | undefined> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: callbackUrl,
    });
    // signIn with redirectTo throws a NEXT_REDIRECT, so this line is never reached
    return undefined;
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return { error: 'Invalid email or password' };
        default:
          return { error: 'An error occurred. Please try again.' };
      }
    }
    // Re-throw redirect errors (they're not actual errors)
    throw error;
  }
}
