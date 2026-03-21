# Job Craft - Gemini CLI Mandates

This document defines the foundational mandates and project context for Gemini CLI's operations within the Job Craft repository. These instructions take precedence over general workflows.

## Project Overview
Job Craft is an AI-powered job search automation platform designed to scrape job boards, analyze relevance, and generate tailored resumes using Gemini AI.

### Core Architecture
- **Client (React + Vite)**: Modern dashboard for managing jobs, settings, and the Resume Pool.
- **Server (Express + Node.js)**: Central API hub. Uses **InsForge PostgreSQL** exclusively for multi-tenant data storage and authentication.
- **Pipeline (Node.js CLI)**: Autonomous worker for scraping (15+ sources), AI tailoring, and PDF generation.

## Engineering Mandates

### 1. Development Lifecycle
Always follow the **Research -> Strategy -> Execution** cycle.
- **Research**: Validate file paths, verify dependencies, and reproduce bugs before proposing fixes.
- **Strategy**: Present a concise plan for approval before making multi-file changes.
- **Execution**: Apply surgical updates. Ensure all changes are idiomatically consistent with existing patterns (e.g., using `db-adapter.ts` for data access).

### 2. Data Access & Persistence
- **InsForge Only**: The project has migrated away from SQLite. All data must be stored in InsForge PostgreSQL.
- **Multi-tenancy**: Every database write must respect RLS policies. The `db-adapter.ts` layer handles this by propagating `userId` or relying on `DEFAULT auth.uid()`.
- Never hardcode SQL queries in route handlers; always use `db-adapter.ts`.

### 3. Pipeline Operations
- The pipeline is resource-intensive. When modifying scraping logic, ensure modularity in `pipeline/src/services/scrapers/`.
- AI tailoring logic resides in `pipeline/src/services/gemini.ts`.

### 4. Code Style & Standards
- **TypeScript**: Strict typing is preferred. Use existing types in `types.ts` across workspaces.
- **Styling**: Vanilla CSS is preferred in the client, following the project's existing interactive aesthetic.

## Recent Architectural Shifts
- **InsForge Exclusive**: The project has fully transitioned to InsForge for both development and production. All SQLite implementation and dependencies (`better-sqlite3`) have been removed.
- **Multi-tenant Data Isolation**: Every database write (inserts/updates) respects RLS policies. The `db-adapter.ts` layer facilitates this by propagating `userId` or relying on `DEFAULT auth.uid()`.
- **Resume Pool**: The "Resume Pool" is the single source of truth for tailoring. AI enhancements should supplement pool data, not replace it entirely.

## Project Evolution Log
- **2026-03-21**: Initial fixes for `user_id` propagation and `UnhandledPromiseRejection`.
- **2026-03-21c**: Implemented industry-standard multi-tenancy. Updated schema to use `DEFAULT auth.uid()` for `user_id` across all tables. Converted global unique constraints to composite user-scoped constraints. Refined `resume_profile` to use `user_id` as the Primary Key, removing hardcoded IDs and ensuring clean 1:1 user mapping.
- **2026-03-21d**: Removed all SQLite implementation, dependencies, and conditionals. The platform now exclusively uses InsForge PostgreSQL. Simplified `db-adapter.ts`, enabled all scrapers by default via `SETTING_DEFAULTS`, and removed the obsolete migration script. All routes now exclusively use the multi-tenant `db-adapter.ts`.

## Communication & Context Preservation
- **Self-Documentation**: Proactively update this `GEMINI.md` file with significant architectural changes, new core services, or major shifts in project strategy. This ensures that the context of the project's evolution is never lost.
- Be concise. Focus on technical rationale.
- Proactively identify potential regressions in the Pipeline when modifying Shared Types or Server Routes.
