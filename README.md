# The Elite Notebook

Keep-style notes today; Google Drive document linking arrives in phase 2.

## What's here (v1)

- Google sign-in (Firebase Auth)
- Notes: title, body text, checklists, images, seven paper colors, labels, pinning
- Reminders (date/time tag shown on the note, overdue ones highlight) with real notifications:
  - **Native (Android/iOS):** an OS-scheduled notification fires at the reminder time even if the app is fully closed (`@capacitor/local-notifications`). Tapping it opens the note directly.
  - **Web/PWA:** notifications fire while the tab/app is open, plus a catch-up check when the tab becomes visible again — there's no backend push server here, so a reminder can't wake up a fully closed browser tab the way native can. Closing that gap needs Firebase Cloud Messaging + a scheduled Cloud Function; not built yet.
- Android home-screen "Take a note" widget — tap it to jump straight into a blank note without opening the app first. (iOS doesn't have an equivalent yet — a native WidgetKit extension has to be added in Xcode, which isn't something that can be scaffolded from plain files the way the Android widget was.)
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

7. **Set CORS on the Storage bucket** (needed for image editing — rotate/crop/flip/brightness/contrast). Without this, the in-app image editor fails with "Couldn't load this image for editing." A brand-new Firebase Storage bucket has no CORS config at all, so this step is required, not optional:
   ```
   gcloud auth login
   gcloud config set project <your-firebase-project-id>
   gsutil cors set cors.json gs://<your-storage-bucket>.appspot.com
   ```
   `cors.json` is already in this repo. Verify it took effect with:
   ```
   gsutil cors get gs://<your-storage-bucket>.appspot.com
   ```
   (Ordinary note images still display fine without this — they're loaded as plain `<img src>`. It's specifically the editor's canvas-based rotate/crop that needs the browser to read the image's pixel data cross-origin, which requires the bucket to send CORS headers.)

8. Install and run:
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
