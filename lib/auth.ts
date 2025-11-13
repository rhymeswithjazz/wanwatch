import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          await logger.logAuth('login_failure', 'unknown', {
            reason: 'Missing credentials'
          });
          return null;
        }

        const email = credentials.email as string;
        const user = await prisma.user.findUnique({
          where: { email }
        });

        if (!user) {
          await logger.logAuth('login_failure', email, {
            reason: 'User not found'
          });
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

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
      }
    })
  ],
  pages: {
    signIn: '/login'
  },
  callbacks: {
    authorized: async ({ auth }) => {
      return !!auth;
    }
  }
});
