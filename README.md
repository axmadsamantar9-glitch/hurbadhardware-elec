# HurbadHardware

A mobile-first B2C electronics e-commerce platform for East Africa (Somalia, Kenya) built with Next.js, Prisma, and modern web standards.

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your database URL and auth secrets

# Run database migrations
npm run db:migrate

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Technology Stack

- **Frontend:** Next.js 16 (React 19), TypeScript, Tailwind CSS
- **Backend:** Next.js API routes, Prisma ORM
- **Database:** PostgreSQL (Supabase)
- **Auth:** NextAuth v5 (email/password + Google OAuth)
- **Internationalization:** next-intl (English, Somali)
- **Payments:** WaafiPay, eDahab, Paystack
- **Testing:** Vitest, testing-library

## Project Structure

```
src/
  app/              # Next.js App Router
    [locale]/       # i18n routing
    api/            # API routes
  components/       # React components
  lib/              # Utilities (db, auth, logger, etc.)
  __tests__/        # Integration tests

prisma/            # Database schema & migrations
docs/              # Project documentation & plans
.claude/           # Claude Code agents configuration
```

## Development Scripts

```bash
npm run dev              # Start dev server (hot reload)
npm run build            # Production build
npm run start            # Start production server
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix ESLint violations
npm run format           # Format code with Prettier
npm run format:check     # Check formatting compliance
npm run typecheck        # TypeScript strict mode check
npm run test             # Run tests
npm run test:watch       # Watch mode
npm run test:coverage    # Coverage report (target: 80%+)
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Create & apply migrations
npm run db:studio        # Open Prisma Studio
npm run db:seed          # Seed database with test data
```

## Contributing

HurbadHardware follows strict coding standards for correctness, security, and traceability.

**Before contributing, please read:** [CONTRIBUTING.md](docs/CONTRIBUTING.md)

Key standards:

- **Naming:** `camelCase` for variables/functions, `PascalCase` for types
- **Async:** Always use `async/await`, never `.then()` chains
- **Errors:** All errors caught in Route Handlers, never thrown to client
- **Logging:** Structured JSON with `correlationId` for request tracing
- **Audit:** All data mutations logged with action names like `product.update`
- **Testing:** 80%+ coverage; tests co-located with source files
- **Linting:** ESLint + Prettier run automatically on pre-commit

## Architecture & Decisions

See [PRD](docs/plans/PRD.md) for product requirements and business decisions.

Key Architecture Decisions:

- Multi-currency via FX conversion (not multi-payment-currency)
- WhatsApp ordering via chatbot API (Phase 2)
- Bilingual EN/SO interface (next-intl routing)
- Session pooling for database connections (Supabase workaround)

## Roadmap

Current phase: **Module 02 — Engineering Standards** (foundation complete, standards documentation in progress)

See [docs/agents/run-state.md](docs/agents/run-state.md) for the full 12-module curriculum and current position.

## Support

For issues or questions:

- Check [docs/agents/learnings](docs/agents/learnings) for agent-specific insights
- Review [CONTRIBUTING.md](docs/CONTRIBUTING.md) for coding questions
- See [PRD](docs/plans/PRD.md) for product/business questions
