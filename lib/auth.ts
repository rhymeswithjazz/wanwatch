import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';
import { authConfig } from './auth.config';

// Full auth configuration with database access (for server components/API routes)
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) {
            await logger.logAuth('login_failure', 'unknown', {
              reason: 'Missing credentials'
            });
            return null;
          }

          const email = credentials.email as string;

          // Database lookup with error handling
          let user;
          try {
            user = await prisma.user.findUnique({
              where: { email }
            });
          } catch (dbError) {
            await logger.error('Database error during authentication', {
              email,
              error: dbError instanceof Error ? dbError.message : String(dbError)
            });
            return null;
          }

          if (!user) {
            await logger.logAuth('login_failure', email, {
              reason: 'User not found'
            });
            return null;
          }

          // Password comparison with error handling
          let isValid;
          try {
            isValid = await bcrypt.compare(
              credentials.password as string,
              user.password
            );
          } catch (bcryptError) {
            await logger.error('Bcrypt error during authentication', {
              email,
              error: bcryptError instanceof Error ? bcryptError.message : String(bcryptError)
            });
            return null;
          }

          if (!isValid) {
            await logger.logAuth('login_failure', email, {
              reason: 'Invalid password'
            });
            return null;
          }

          await logger.logAuth('login_success', email, {
            userId: user.id
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name
          };
        } catch (error) {
          // Catch any unexpected errors
          await logger.error('Unexpected error during authentication', {
            error: error instanceof Error ? error.message : String(error)
          });
          return null;
        }
      }
    })
  ],
});
