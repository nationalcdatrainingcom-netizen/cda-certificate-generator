# National CDA Training — Certificate Generator

A shared web app for generating CDA certificate packages. Any admin can access it from any device (computer, iPad, iPhone), and every generated package is saved to a shared database.

---

## Deploying to GitHub + Render (Step-by-Step)

### Step 1 — Create a GitHub Repository

1. Go to **github.com** and sign in
2. Click the **+** button (top right) → **New repository**
3. Name it: `cda-certificate-generator`
4. Set it to **Private**
5. Click **Create repository**

### Step 2 — Upload the Files

On the new repo page, click **uploading an existing file** (or use the Add file button):

Upload ALL of these files/folders maintaining the structure:
```
server.js
package.json
.gitignore
.env.example
db/
  index.js
public/
  index.html
assets/
  signature.jpeg
  logo.png
```

Click **Commit changes**.

---

### Step 3 — Create the App on Render

1. Go to **render.com** and sign in
2. Click **New +** → **Web Service**
3. Connect your GitHub account if not already connected
4. Select your `cda-certificate-generator` repository
5. Fill in the settings:
   - **Name**: `cda-certificate-generator`
   - **Region**: US East (or closest to you)
   - **Branch**: `main`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Instance Type**: `Free`
6. Click **Create Web Service** — Render will start deploying

---

### Step 4 — Add a PostgreSQL Database on Render

1. In Render dashboard, click **New +** → **PostgreSQL**
2. Settings:
   - **Name**: `cda-database`
   - **Region**: Same as your web service
   - **Instance Type**: `Free`
3. Click **Create Database**
4. Wait for it to say **Available** (takes ~1 minute)

---

### Step 5 — Connect the Database to Your App

1. In Render, open your **PostgreSQL** database
2. Scroll down to **Connections** — copy the **Internal Database URL**
3. Go to your **Web Service** → click **Environment** in the left menu
4. Click **Add Environment Variable**:
   - Key: `DATABASE_URL`
   - Value: (paste the Internal Database URL)
5. Add another variable:
   - Key: `NODE_ENV`
   - Value: `production`
6. Click **Save Changes** — Render will automatically redeploy

---

### Step 6 — Access Your App

Once deployed (usually 2-3 minutes), Render gives you a URL like:
```
https://cda-certificate-generator.onrender.com
```

**Share this URL with all your admins.** Anyone with the link can:
- Upload a CSV and generate a certificate package from any device
- See all students in the shared database
- Re-download any past certificate package

---

## Notes

- **Free tier**: Render's free tier spins down after 15 minutes of inactivity. The first visit after inactivity may take 30-60 seconds to load. Upgrading to the $7/month Starter plan eliminates this.
- **Database**: The free PostgreSQL on Render stores up to 1GB — more than enough for hundreds of students.
- **Updates**: To update the app in the future, just edit files in GitHub. Render auto-deploys on every push.

---

## File Structure

```
cda-certificate-generator/
├── server.js          ← Express web server
├── package.json       ← Dependencies
├── .env.example       ← Environment variable template
├── .gitignore
├── db/
│   └── index.js       ← PostgreSQL queries and schema
├── public/
│   └── index.html     ← The full app (frontend)
└── assets/
    ├── signature.jpeg ← Mary's signature (embedded in PDFs)
    └── logo.png       ← National CDA Training logo
```
