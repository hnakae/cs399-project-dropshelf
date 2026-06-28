# Architecture

## Overview

DropShelf is built as a Next.js full-stack application with no separate backend server (unless there is a need for a python library, then maybe use FastAPI as a backend server for API logic handling). UI, routing, and API logic are all handled within a single Next.js project. A PostgreSQL database (or lightweight alternative like SQLite for development) stores creator and product data. Stripe handles payment processing via hosted Checkout sessions.

## Major Components

**Client / User Interface:**
Next.js pages and React components — the creator storefront, product listing, and post-purchase confirmation page.

**Server / Application Logic:**
Next.js API routes (or server actions) — serve creator and product data, create Stripe Checkout sessions, and handle Stripe webhook events.

**Data / Persistence:**
A relational database (PostgreSQL in production, SQLite in development) storing creator profiles and product records. Stripe holds payment and order state independently.

## Component Responsibilities

- **Storefront pages** render a creator's public profile and product catalog from the database
- **API routes** expose endpoints to fetch creator/product data and to create a Stripe Checkout session on demand
- **Database** persists creator profiles (name, bio, image) and product listings (title, description, price, Stripe price ID)
- **Stripe** handles the payment UI, collects card data, and confirms or fails the transaction

## Data Flow

A buyer visits a creator's storefront page → the page fetches the creator's profile and product list from the database → the buyer clicks "Buy" → an API route creates a Stripe Checkout session → the buyer is redirected to Stripe's hosted checkout → after payment, Stripe redirects the buyer back to a confirmation page.

## Initial Architecture Sketch

```
Browser
  └── Next.js Pages (React)
        ├── /[creator]          — public storefront
        ├── /[creator]/[product] — product detail
        └── /success             — post-purchase confirmation

Next.js API Routes
  ├── GET  /api/creator/[slug]   — fetch creator + products
  └── POST /api/checkout         — create Stripe Checkout session

Database (PostgreSQL / SQLite)
  ├── creators table
  └── products table

Stripe (external)
  └── Hosted Checkout + Webhooks
```

## Open Questions

- Should creator data be seeded manually (no CMS) or managed through a simple admin UI in Sprint 2?
- Which database to use in production — hosted PostgreSQL (e.g., Supabase or Vercel Postgres) vs. another option?
- Does Sprint 1 need Stripe webhooks, or is a redirect-based success page enough for the prototype?
