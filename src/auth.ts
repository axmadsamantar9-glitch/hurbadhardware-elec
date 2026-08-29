/**
 * NextAuth v5 configuration (U3).
 *
 * Supports two auth flows:
 * 1. Credentials: email/password with bcrypt hashing
 * 2. OAuth: Google (optional, deferred if not configured)
 *
 * Session strategy: JWT by default, with optional DB session sync via
 * callbacks. The Prisma adapter (Account/Session/VerificationToken)
 * is configured to support both flows.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getCorrelationId } from "@/lib/request-context";
import { isValidEmail, isStrongPassword, hashPassword, verifyPassword } from "@/lib/auth-utils";
import { rateLimiter, getClientIP } from "@/lib/middleware/rate-limit";
import { getRateLimitConfig } from "@/lib/config/rate-limits";
import { isSoftDeleted } from "@/lib/user-deletion";
import type { User as AuthJSUser } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: "CUSTOMER" | "ADMIN";
      locale?: string;
      image?: string | null;
    };
  }

  interface User {
    id: string;
    email?: string | null;
    name?: string | null;
    role: "CUSTOMER" | "ADMIN";
    locale?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "name@example.com" },
        password: { label: "Password", type: "password" },
        action: { label: "Action", type: "hidden" }, // 'signin' or 'register'
      },
      async authorize(credentials, request): Promise<AuthJSUser | null> {
        const correlationId = await getCorrelationId();

        if (!credentials?.email || !credentials?.password) {
          logger.warn("Credentials provider: missing email or password", {
            correlationId,
            action: credentials?.action,
          });
          return null;
        }

        const email = String(credentials.email).toLowerCase();
        const password = String(credentials.password);
        const action = String(credentials.action || "signin");

        // Rate limit login attempts per IP+account (docs/guidelines/rate-limiting.md
        // AC1/AC2: 5 attempts/min per IP+account). Applied before any credential
        // validation so brute-force/credential-stuffing attempts fail closed.
        // Uses the same generic error as invalid credentials so the response
        // does not leak "rate limited" vs "wrong password" to an attacker.
        const clientIP = getClientIP(request);
        const rateLimitKey = `login:${clientIP}:${email}`;
        const { threshold } = getRateLimitConfig("login");
        const rateLimitResult = rateLimiter.check(rateLimitKey, threshold);
        if (!rateLimitResult.allowed) {
          logger.warn("Auth: rate limit exceeded", {
            correlationId,
            action,
            email: email.substring(0, 3) + "***",
          });
          throw new Error("Invalid email or password");
        }

        // --- Register flow ---
        if (action === "register") {
          // Validate email format
          if (!isValidEmail(email)) {
            logger.info("Register: invalid email format", {
              correlationId,
              email: email.substring(0, 3) + "***",
            });
            throw new Error("Invalid email format");
          }

          // Validate password strength
          if (!isStrongPassword(password)) {
            logger.info("Register: weak password", {
              correlationId,
              email: email.substring(0, 3) + "***",
            });
            throw new Error(
              "Password must be at least 8 characters with uppercase, lowercase, number, and special character"
            );
          }

          // Check if email already exists
          const existingUser = await db.user.findUnique({ where: { email } });
          if (existingUser) {
            logger.info("Register: email already exists", {
              correlationId,
              email: email.substring(0, 3) + "***",
            });
            throw new Error("Email already in use");
          }

          // Create new user with hashed password
          const passwordHash = await hashPassword(password);
          try {
            const newUser = await db.user.create({
              data: {
                email,
                passwordHash,
                role: "CUSTOMER",
                emailVerified: new Date(), // Auto-verify on registration for MVP
              },
            });

            logger.info("Register: user created", {
              correlationId,
              userId: newUser.id,
              email: email.substring(0, 3) + "***",
            });

            return {
              id: newUser.id,
              email: newUser.email,
              name: newUser.name,
              role: newUser.role as "CUSTOMER" | "ADMIN",
              locale: newUser.locale,
            };
          } catch (error) {
            logger.error("Register: database error", {
              correlationId,
              email: email.substring(0, 3) + "***",
              error,
            });
            throw new Error("Failed to create user");
          }
        }

        // --- Sign-in flow ---
        try {
          const user = await db.user.findUnique({ where: { email } });

          // Soft-deleted users (docs/guidelines/privacy-and-data.md AC11) have
          // their email nulled on deletion, so this lookup already can't match
          // them in the common case; this check is defense-in-depth for any
          // future path where a deleted row's email might still be set (e.g.
          // mid-migration, or before the 30-day hard-delete grace period).
          // Same generic error as bad credentials — no "account deleted"
          // oracle for an attacker probing emails.
          if (isSoftDeleted(user)) {
            logger.info("Sign-in: user is soft-deleted", {
              correlationId,
              userId: user?.id,
              email: email.substring(0, 3) + "***",
            });
            throw new Error("Invalid email or password");
          }

          if (!user || !user.passwordHash) {
            logger.info("Sign-in: user not found or no password", {
              correlationId,
              email: email.substring(0, 3) + "***",
            });
            throw new Error("Invalid email or password");
          }

          const passwordValid = await verifyPassword(password, user.passwordHash);
          if (!passwordValid) {
            logger.info("Sign-in: invalid password", {
              correlationId,
              userId: user.id,
              email: email.substring(0, 3) + "***",
            });
            throw new Error("Invalid email or password");
          }

          logger.info("Sign-in: successful", {
            correlationId,
            userId: user.id,
            email: email.substring(0, 3) + "***",
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role as "CUSTOMER" | "ADMIN",
            locale: user.locale,
          };
        } catch (error) {
          logger.error("Sign-in: error", {
            correlationId,
            email: email.substring(0, 3) + "***",
            error,
          });
          throw error;
        }
      },
    }),

    // Google OAuth (optional; will skip silently if GOOGLE_CLIENT_ID is not set)
    ...((process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET && [
        Google({
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          allowDangerousEmailAccountLinking: false,
        }),
      ]) ||
      []),
  ],

  pages: {
    signIn: "/en/auth/signin", // Default to English; middleware will handle locale redirect
    newUser: "/en/auth/register",
  },

  callbacks: {
    /**
     * JWT callback: runs whenever a JWT is created or updated.
     * Store user ID, role, and locale in the token so the session
     * callback can access them without a DB query.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as AuthJSUser & { role?: "CUSTOMER" | "ADMIN" }).role || "CUSTOMER";
        token.locale = (user as AuthJSUser & { locale?: string }).locale;
      }
      return token;
    },

    /**
     * Session callback: runs whenever the session is accessed.
     * Map the JWT claims into the session object so client code
     * can read user.role and user.locale from session.user.
     */
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.id as string) || "";
        session.user.role = (token.role as "CUSTOMER" | "ADMIN") || "CUSTOMER";
        session.user.locale = (token.locale as string) || "en";
      }
      return session;
    },

    /**
     * Authorized callback: runs on middleware checks.
     * Return true to allow, false to deny.
     * Here we just allow any authenticated user; route-specific
     * auth (e.g., admin-only) is checked in the middleware.
     */
    async authorized({ auth }) {
      return Boolean(auth);
    },
  },

  events: {
    async signIn({ user }) {
      const correlationId = await getCorrelationId();
      logger.info("Auth event: signIn", {
        correlationId,
        userId: user.id,
      });
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  jwt: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  trustHost: true,
});
