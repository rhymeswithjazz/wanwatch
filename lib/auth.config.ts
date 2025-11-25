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
    },
    jwt: async ({ token, user }) => {
      // On sign-in, add user data to token
      if (user) {
        token.id = user.id;
        token.email = user.email;
        token.name = user.name;
      }
      return token;
    },
    session: async ({ session, token }) => {
      // Pass token data to session
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
      }
      return session;
    },
  }
};
