# Setup — Public Viewing, Password-Protected Editing

This version works differently from before:

- **Anyone** who opens the site can **view** everything immediately — no password, no sign-in.
- **Only someone who knows the editor password** can add, edit, or delete anything —
  a "Sign In to Edit" button top-right unlocks editing.

If you already have a Firebase project from earlier, you can **reuse it** — just update
the two things below (Rules + Authentication). If you're starting completely fresh,
follow every step.

---

## Step 1 — Firebase project (skip if you already have one)

Go to https://console.firebase.google.com → Add project → name it → Create.

## Step 2 — Firestore rules (public read, editor-only write)

1. Left sidebar → **Databases & Storage** → Firestore (create it first if you haven't)
2. Click the **Rules** tab
3. Clear the box completely (Ctrl+A, Delete)
4. Type this **by hand**, not pasted, to avoid the quote-conversion issue from before —
   use double quotes exactly as shown:

```
rules_version = "2";
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

5. Click **Publish**

**What this means:** `allow read: if true` — anyone can view, no login needed.
`allow write: if request.auth != null` — only someone actually signed in can change
anything. Since only one account will ever be able to sign in (the next step), this
is effectively "only the password holder can edit."

## Step 3 — Turn on Email/Password sign-in

1. Left sidebar → **Authentication** → Get started (if not already on)
2. Click **Sign-in method** tab
3. Click **Email/Password** → toggle **Enable** → **Save**
4. (If "Anonymous" is enabled from a previous setup, you can leave it or disable it —
   it's no longer used by this version either way.)

## Step 4 — Create the one shared editor account

1. Still in **Authentication**, click the **Users** tab
2. Click **Add user**
3. Email: type exactly `editor@em-dashboard.local` (this exact value — it's not a real
   email, just an internal ID the app expects)
4. Password: choose the password whoever should be able to edit will use — this is
   the password you'll actually tell people, so pick something you'll remember and
   share only with the right person(s)
5. Click **Add user**

## Step 5 — Get your config (skip if reusing a project you already configured)

1. Gear icon → **Project settings** → scroll to **Your apps** → **</>** (web) icon
2. Register app with any nickname
3. Copy the 6 values shown (apiKey, authDomain, projectId, storageBucket,
   messagingSenderId, appId) into `firebase-config.js`

## Step 6 — First-time sign-in populates the starter data

This is important: **viewing works for everyone immediately, but the motor/bearing
data won't appear until the editor signs in once.** The very first successful
editor sign-in automatically loads all the starter data (motors, bearings) into
the shared database — a one-time action.

1. Open `index.html` — the dashboard loads directly, in view-only mode
2. Click **"Sign In to Edit"** (top right)
3. Enter the password you chose in Step 4
4. The starter data populates automatically — everyone viewing (including people
   already looking at the page) will see it appear within a second or two

## Step 7 — Test it properly

- Open the site on a **second PC or browser without signing in** — confirm you can
  browse every section (Motors, Bearings, Checklists, etc.) freely
- Confirm the Add/Edit/Delete buttons and upload zones look greyed out and don't
  respond to clicks when not signed in
- Sign in with the editor password, add a test motor, confirm it appears on the
  other (unsigned-in) browser within a couple seconds

---

## Good to know

- **The editor password is the real security boundary now** — anyone who has it can
  edit from anywhere. Share it only with whoever should have edit rights.
- **Everyone else needs nothing at all** — just the link/files to open the site.
- **Cost:** still completely free (Firestore only, no Storage, no billing card).
- **If you ever need more than one editor with different passwords:** that's possible
  but needs a bit more setup (multiple accounts) — ask if you want that built.

---

## Lubrication Details tab (added)

The **Lubrication Details** tab shows the greasing / oil-filling schedule for every motor in the
"HT motor Greasing" Excel sheets, split into Unit 1–6, Stage-1…4 Offsite and Station Common.

**What to upload:** replace `app.js`, `firebase-sync.js`, `index.html`, `style.css` and add the two new
files `lubrication.js` and `lubrication_seed.js` (keep `firebase-config.js` and `seed_data.js` as they are).

**No Firebase changes needed** — the existing Firestore rules already cover the new collections
(`em_lub_equipment`, plus a one-line flag in `em_meta`).

**One-time data load:** the Excel data (412 equipment, ~2,700 past lubrication dates) is written to the
shared database the **first time an editor is signed in** after you upload these files (a short
"Lubrication Details loaded…" message appears). Until then the tab shows "No lubrication data loaded yet".
It cannot run twice, so re-uploading the files will never duplicate or overwrite anything you have entered.

**Free-tier note:** the one-time load is ~412 document writes; afterwards the tab reads those ~412 documents
each time someone opens it (same as any other section).
