import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

// Auth configuration without database access (safe for middleware)
export const authConfig: NextAuthConfig = {
  providers: [
    // Credentials provider with a placeholder authorize that will be overridden
    // in the full auth.ts when database access is available
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      // This authorize function is a placeholder - the real one in auth.ts uses Prisma
      authorize: async () => null,
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
};
