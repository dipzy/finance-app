# Finance App

A full-stack personal finance app that I built and use every day to run my own budget. It handles the current account,
salary, monthly and annual bills, day-to-day spending, savings, debts and shared expenses between people.

> This repository is a snapshot of the project from October 2026. Development continues in a private repository.
> The app's interface is in Portuguese and English.

## What it does

- **Monthly dashboard**: account balance, what is still due this month and the projected balance at month end.
- **Expenses**: monthly bills with an optional automatic payment, annual expenses, day-to-day spending and a meal card balance.
- **Savings, goals and budgets**, with category budgets and progress tracking.
- **Debts**: interest-bearing debts with a repayment simulator.
- **Shared expenses**: groups where one person pays and the others accept and settle their share.
- **Spending simulator**: based on the real spending of the current month or the average of the last 6 months.
- **Import and export**: bank statements (CSV/OFX), Excel workbooks laid out month by month, and a monthly PDF report.
- **Alerts**: bills about to fall due, budgets running out and shares waiting to be accepted.

## Architecture

```
  App (web / Android)                    API (Render)                         Database (Neon)
 ┌──────────────────────┐  HTTPS + JWT  ┌────────────────────────────┐      ┌──────────────┐
 │ Expo / React Native  │ ────────────► │ Financas.Api (controllers) │ ───► │  PostgreSQL  │
 │ login: Firebase Auth │               │   ↓                        │      └──────────────┘
 │ data: .NET API       │ ◄──────────── │ Financas.Services (rules)  │
 └──────────────────────┘     JSON      │   ↓                        │
                                        │ Financas.DAL (EF Core)     │
                                        └────────────────────────────┘
```

- **Layered backend**: each layer only knows the one below it (Api → Services → DAL). Controllers never see entities,
  only DTOs.
- **Auth**: Firebase Auth on the client. The API validates the ID token on every request and scopes every query to the
  user's id, so no user can read another user's data.
- **Money**: `decimal` everywhere, rounded to the cent in one place.
- **Production concerns**: idempotency keys for the offline queue, an audit log, rate limiting, structured logging
  (Serilog), error monitoring (Sentry), health checks and GDPR account deletion.

## Tech stack

| Area | Technologies |
| --- | --- |
| Frontend | Expo, React Native, React 19, TypeScript, Firebase Auth, i18n (PT/EN) |
| Backend | ASP.NET Core (.NET 10), C#, EF Core, PostgreSQL, Serilog, QuestPDF, OpenAPI |
| Testing | Jest (~700 frontend tests), xUnit (~560 backend tests), Testcontainers with real PostgreSQL, Playwright E2E |
| CI/CD | GitHub Actions (tests, coverage, dependency vulnerability audit), Docker, Render, Firebase Hosting, EAS (Android) |

## Running locally

**API** (.NET 10 SDK) – runs on a local SQLite database, no setup needed:

```bash
cd backend
dotnet run --project src/Financas.Api    # http://localhost:5080
dotnet test
```

**App** (Node 22):

```bash
cd frontend
cp .env.example .env      # fill in a Firebase web config; leave EXPO_PUBLIC_API_URL empty to use the local API
npm install
npx expo start            # press w for the web version
npm test
```

More detail (endpoints, data rules, testing against PostgreSQL, deployment) is in
[`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md), written in Portuguese.

## How this was built

Developed with AI coding agents (Claude Code and Cursor). I defined the product, the architecture and the business
rules, directed and reviewed every change, tested it, and run the app in production for my own finances.

## License

© 2026 Diogo Pereira. All rights reserved. The code is published so it can be read as a portfolio piece; it may not be
copied, modified or redistributed without permission.
