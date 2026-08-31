# Maintaining This App

This guide is for people who are new to Next.js, React, or web development and need to keep the Theta Tau Xi Rush Management Tool working during rush.

The short version: this app is a small Next.js site that talks to a private Google Apps Script backend. Most user-facing changes happen in `app/`. Most rush schedule/data-shape changes happen in `lib/pnmConstants.ts` and must match the Google Sheet/Apps Script backend.

## What This App Does

The app has three main workflows:

- `/ingest`: adds a new PNM with name, email, student ID, event attendance, and a headshot.
- `/check-in`: acts as a kiosk for scanning Wiscards and marking attendance at one selected rush event.
- `/summary`: searches for a PNM and downloads a PNG summary of their attendance.

There are also support pages:

- `/login`: checks the shared password with the backend, then saves it in browser `localStorage`.
- `/reset`: clears the saved browser password so the user can log in again.
- `/`: the home page with navigation.

## Tech Stack

- Next.js 16 with the App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Google Apps Script and Google Sheets for the private backend
- `@vercel/og` for generated summary images
- `fuse.js` for name search
- `browser-image-compression` for shrinking uploaded headshots
- `sonner` for toast messages

## Local Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` in the project root:

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

Start the development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

Useful checks before sharing changes:

```bash
npm run lint
npm run build
```

## Project Layout

```text
app/
  api/
    proxy/route.ts              Sends frontend requests to Google Apps Script
    generate-summary/route.tsx  Builds downloadable PNM summary PNGs
  check-in/page.tsx             Check-in kiosk page
  ingest/page.tsx               Add PNM page
  summary/page.tsx              Search and summary download page
  login/page.tsx                Password page
  reset/page.tsx                Clear saved password page
  page.tsx                      Home page
  layout.tsx                    Shared app wrapper, fonts, background, toasts
  globals.css                   Global styling

lib/
  pnmConstants.ts               Shared rush event names and PNM data type
  localStorageCsv.ts            Local browser backup helpers
```

## How Next.js Works Here

Files named `page.tsx` inside `app/` become routes.

For example:

- `app/page.tsx` becomes `/`
- `app/check-in/page.tsx` becomes `/check-in`
- `app/api/proxy/route.ts` becomes `/api/proxy`

Components with `"use client"` at the top run in the browser. They can use React state, browser APIs like `localStorage`, and event handlers like `onClick`.

API route files under `app/api/` run on the server. They can read environment variables like `GOOGLE_SCRIPT_URL`.

## Data Flow

Most browser pages do not call Google Apps Script directly. They call the local Next.js proxy:

```text
Browser page -> /api/proxy -> Google Apps Script -> Google Sheet
```

This happens in `app/api/proxy/route.ts`.

The browser sends an `action` value to tell the Apps Script what to do. Current actions include:

- `checkPassword`
- `ingest`
- `check-in`
- `fetchAllNames`
- `fetchById`

If you add or rename an action in the frontend, the Google Apps Script backend must understand the same action.

## Changing Rush Events

Rush event names live in `lib/pnmConstants.ts`:

```ts
export const EVENT_HEADERS = [
  "9/10 | Info & PD",
  "9/11 | Info & Comm Serve",
  "9/14 | Speed Networking",
  "9/15 | Field Day",
  "9/17 | Engineering Challenge",
  "9/18 | Food Friday"
];
```

These strings are used in:

- the check-in event dropdown
- the add-PNM event dropdown
- the generated summary image
- attendance lookup from records returned by the backend

Important: these names should exactly match the Google Sheet column headers and the Apps Script backend. A typo or changed date in only one place can make attendance appear missing.

## Adding a New Page

To add a new page:

1. Create a folder inside `app/`.
2. Add a `page.tsx` file inside that folder.
3. Export a default React component.

Example:

```tsx
export default function HelpPage() {
  return <main>Help</main>;
}
```

That would become `/help` if the file is `app/help/page.tsx`.

To link to the page, use Next's `Link` component:

```tsx
import Link from "next/link";

<Link href="/help">Help</Link>
```

## Adding or Changing Form Fields

Forms are currently managed with React state. A typical field has:

- a `useState` variable near the top of the component
- an `<input>`, `<select>`, or `<textarea>` in the JSX
- code in the submit handler that sends the value to `/api/proxy`

If you add a form field, update all of these:

1. Add state for the new value.
2. Add the input in the page.
3. Include the value in the request body sent to `/api/proxy`.
4. Update the Apps Script backend to read and store that value.
5. Update the Google Sheet columns if needed.
6. Update the summary image if the new value should appear there.

## Local Browser Backups

`lib/localStorageCsv.ts` stores backup rows in browser `localStorage` before important submissions are sent to the backend.

This protects against some connection failures during rush. The current backup keys are:

- `ingestCsvBackup`
- `checkInCsvBackup`

These backups are stored per browser/device. They are not automatically uploaded somewhere else.

## Authentication Model

This app uses a simple shared password checked by the Google Apps Script backend.

After login, the password is saved in browser `localStorage` under `password`. Pages then include that password in requests to `/api/proxy`.

This is convenient for a small internal tool, but it is not a strong security model. Do not treat this app as a general-purpose secure authentication example.

## Summary Image Generation

`app/api/generate-summary/route.tsx` uses `@vercel/og` to generate a PNG image from JSX.

The summary page flow is:

```text
/summary fetches the PNM list
User selects a PNM
/summary fetches the full PNM record through /api/proxy
/summary sends the record to /api/generate-summary
The browser downloads the returned PNG
```

If the summary image needs a new layout, edit `app/api/generate-summary/route.tsx`.

Things to watch:

- The route uses `export const runtime = "edge"`.
- CSS support inside `@vercel/og` is not the same as normal browser CSS.
- The image height is calculated from the number of events.
- Attendance checks use the exact event header strings from `EVENT_HEADERS`.

## Styling

Most styling is done with Tailwind classes directly in components.

Common examples:

- `flex`, `grid`, `gap-4` for layout
- `bg-red-700`, `text-white`, `rounded-md` for appearance
- `hover:bg-red-800`, `disabled:opacity-50` for states
- `w-full`, `md:w-1/2`, `max-w-2xl` for responsive sizing

Global styles belong in `app/globals.css`. Shared app-level UI belongs in `app/layout.tsx`.

## Common Maintenance Tasks

### Update Rush Schedule

1. Edit `EVENT_HEADERS` in `lib/pnmConstants.ts`.
2. Update Google Sheet column headers to match.
3. Update Apps Script logic if it depends on event names.
4. Run `npm run build`.
5. Test `/ingest`, `/check-in`, and `/summary`.

### Change the Password

The login page says the password is managed in the Google Sheet/backend. Update it there, then use `/reset` on any device that already saved the old password.

### Add a New Backend Action

1. Add frontend code that calls `/api/proxy` with a new `action`.
2. Add matching handling in the Apps Script backend.
3. Decide what success and error responses should look like.
4. In the frontend, check both `response.ok` and `data.ok` where appropriate.

### Debug a Failed Backend Request

Check these first:

- Is `.env.local` present locally?
- Is `GOOGLE_SCRIPT_URL` correct in local/Vercel environment variables?
- Is the Apps Script deployment URL still active?
- Does the frontend `action` match the backend action name?
- Is the saved password stale? Try `/reset`, then log in again.
- Did an event header change in only the frontend or only the Google Sheet?

### Prepare for Rush

Before using the app at an event:

1. Confirm the event list is correct.
2. Confirm the Google Sheet and Apps Script are deployed.
3. Log in on the check-in device.
4. Test one known PNM check-in.
5. Test one new PNM ingest with a headshot.
6. Test one summary download.
7. Keep the check-in page open and focused before scanning starts.

## Beginner Notes

React components are functions that return UI. State values created with `useState` cause the page to update when they change.

Example:

```tsx
const [name, setName] = useState("");
```

Here, `name` is the current value and `setName` changes it.

Event handlers are functions that run after user actions:

```tsx
<button onClick={handleClick}>Save</button>
```

Async functions use `await` for work that takes time, like `fetch()` requests:

```tsx
const response = await fetch("/api/proxy", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ action: "example" }),
});
```

TypeScript helps catch mistakes before the app runs. If you see a type error, read it carefully; it is usually pointing to a mismatched value shape, missing property, or possible `null`.

## Deployment Notes

The app can deploy to Vercel. Make sure the deployed project has this environment variable:

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

Run a production build locally when possible:

```bash
npm run build
```

Then test the deployed app against the real backend.

## Maintenance Checklist

Before merging or deploying changes:

- `npm run lint` passes.
- `npm run build` passes.
- `/login` works.
- `/ingest` can add a test PNM.
- `/check-in` can mark a test attendance.
- `/summary` can download a summary image.
- Event headers match the Google Sheet.
- Any backend action changes are also deployed in Apps Script.
- Any environment variable changes are also set in Vercel.
