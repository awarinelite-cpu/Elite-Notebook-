# The Elite Notebook

Keep-style notes today; Google Drive document linking arrives in phase 2.

## What's here (v1)

- Google sign-in (Firebase Auth)
- Notes: title, body text, checklists, images, seven paper colors, labels, pinning
- Reminders (date/time tag shown on the note; overdue ones highlight)
- Archive and trash (soft delete, restore, or delete forever)
- Search across title, body, and checklist text
- Realtime sync via Firestore — same account, any device

## Setup

1. **Create a Firebase project** at console.firebase.google.com.
2. Enable **Authentication → Google** sign-in.
3. Create a **Firestore** database (production mode).
4. Enable **Storage** (for note images).
5. In Project Settings, add a Web App and copy the config values into a `.env` file:

   ```
   cp .env.example .env
   ```
   Fill in each `VITE_FIREBASE_*` value, plus `VITE_GOOGLE_CLIENT_ID` (Authentication → Sign-in method → Google → Web SDK configuration → "Web client ID") for the Drive panel.

6. Deploy the security rules:
   ```
   firebase deploy --only firestore:rules
   ```
   (`firestore.rules` is already in this repo, scoped so a user can only read/write their own notes and labels.)

7. Install and run:
   ```
   npm install
   npm run dev
   ```

## Deploying

Same pattern as your other apps — push to GitHub, connect the repo on Vercel, and add the `VITE_FIREBASE_*` variables in the Vercel project's Environment Variables settings (don't commit `.env`).

## Data model

**notes** (Firestore collection)
```
{
  uid, title, text,
  checklist: [{ id, text, done }],
  images: [url],
  color, labels: [labelId],
  pinned, archived, trashed,
  reminderAt: ISOString | null,
  createdAt, updatedAt
}
```

**labels**
```
{ uid, name }
```

## Phase 2 (not built yet): Drive documents

Plan: Google Drive API (OAuth, `drive.file` or `drive.readonly` scope) to let a user pick a file from their Drive. Store only the Drive file ID + metadata on the note (not the file itself), and render it in-app with Google's embeddable preview (`https://drive.google.com/file/d/{id}/preview` in an iframe) — this covers PDFs, Docx, Sheets, and images without building custom parsers. Direct upload of arbitrary files (not just images) would go to Firebase Storage the same way note images do now.
