# Sweetgreen Berkeley AI Pickup Assistant

Option A take-home project: a deployed AI assistant for Sweetgreen Berkeley that answers menu, nutrition, allergy, pickup, hours, and location questions.

## Tech Stack

- Next.js App Router + TypeScript
- OpenAI Responses API through a server route
- Supabase Postgres for anonymized event analytics
- Plain responsive CSS
- Vitest unit/API tests
- Playwright smoke tests

## Architecture

- `src/data/menu.ts` contains a static May 2026 Sweetgreen menu snapshot with calories, macros, ingredients, allergens, dietary flags, and source metadata.
- `src/lib/menu.ts` performs deterministic allergy filtering, ingredient exclusions, macro sorting, natural-language constraint extraction, and fallback assistant responses.
- `src/app/api/chat/route.ts` calls OpenAI when `OPENAI_API_KEY` is configured, but keeps local recommendations and allergy warnings authoritative.
- `src/app/api/orders/route.ts` rebuilds pickup orders from trusted menu data and saves demo pickup requests to Supabase.
- `src/app/api/events/route.ts` logs anonymized events only. It strips names, contact fields, messages, and transcripts before Supabase insert.
- `src/app/api/analytics/summary/route.ts` reads event metrics and recent saved pickup orders for the dashboard.
- `src/components/AssistantApp.tsx` provides the chat, menu browser, filters, cart, and mock pickup summary.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

Required deployment variables:

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.2
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_APP_URL=
```

The app still works without OpenAI or Supabase keys: chat falls back to deterministic menu logic, pickup summaries are created locally, and analytics returns local fallback values.

## Supabase Schema

Run `supabase/schema.sql` in the Supabase SQL editor. It creates `assistant_events` for lightweight analytics and `pickup_orders` for saved demo pickup requests.

The app uses the service role key only from server-side routes. Do not expose it in client code.

## Test Commands

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

## Demo Prompts

- What are your spicy vegetarian options?
- High-protein meal under 650 calories
- I have a dairy allergy. What should I avoid?
- Can I order two Harvest Bowls for pickup?
- What are your hours and location?

## Data Sources

- Sweetgreen Berkeley location: https://www.sweetgreen.com/locations/berkeley/
- Sweetgreen Bay Area menu: https://www.sweetgreen.com/menu/?region=bay-area
- Sweetgreen Nutrition Guide, last updated May 2026: https://drive.google.com/file/d/1AQyfAeWWqiZmTIiOHpWMgHi7-sAprnl1/view

## Allergy Disclaimer

The assistant filters official menu/allergen data and ingredient exclusions conservatively, but it does not provide medical advice and cannot guarantee any item is allergen-free. Guests with severe allergies should tell the Sweetgreen team before ordering because shared preparation areas can create cross-contact risk.

## Improvements With More Time

- Connect to a real ordering handoff once an approved restaurant API is available.
- Add an authenticated owner view with searchable conversation-free analytics.
- Add staff-editable menu data with version history and source links.
- Add multilingual support for Berkeley students and visitors.
- Add voice input after browser QA across mobile devices.
