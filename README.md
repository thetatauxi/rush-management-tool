# Theta Tau Xi Rush Management Tool

Internal tool for managing PNM (Potential New Member) attendance during rush events.

## Features

### Check-In Kiosk (`/check-in`)
- Select a rush event, then scan Wiscards via barcode reader
- Auto-submits on barcode scan (Enter key)
- Visual success/error feedback optimized for kiosk use
- Local CSV backup for resilience

### Add PNMs (`/ingest`)
- Register new PNMs with name, email, student ID, and headshot
- Headshots are compressed client-side before upload
- Data stored in Google Sheets via Apps Script backend

### Generate Summary (`/summary`)
- Search for PNMs by name (fuzzy search)
- Generates a downloadable PNG image with:
  - Headshot
  - Name, ID, email
  - Attendance for each rush event (checkmark/X)
  - Total events attended
- Designed for bulk slideshow insertion

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19, Tailwind CSS 4
- **Image Generation**: @vercel/og (Satori)
- **Search**: fuse.js (client-side fuzzy search)
- **Backend**: Google Apps Script + Google Sheets
- **Utilities**: browser-image-compression, sonner (toasts)

## Project Structure

```
app/
├── api/
│   ├── proxy/route.ts        # Forwards requests to Google Apps Script
│   └── generate-summary/     # @vercel/og image generation endpoint
├── check-in/page.tsx         # Barcode scanning kiosk
├── ingest/page.tsx           # Add new PNMs
├── summary/page.tsx          # Generate attendance summary images
├── login/page.tsx            # Password gate
└── page.tsx                  # Home/navigation

lib/
├── pnmConstants.ts           # Shared event headers & types
└── localStorageCsv.ts        # Local backup utilities
```

## Environment Variables

Create a `.env.local` file:

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Rush events are defined in `lib/pnmConstants.ts`. Update `EVENT_HEADERS` to match your rush schedule—this must stay in sync with your Google Apps Script backend.

## Deployment

Deploy to Vercel or any platform supporting Next.js Edge Runtime (required for `/api/generate-summary`).

```bash
npm run build
npm run start
```
