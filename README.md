# PharmaSeek — Pharmacy Inventory System

A web-based pharmacy inventory management system built with Node.js, Express, and MySQL.  


## Prerequisites

Every team member needs to install these **before** cloning the repo.  
Install them in this order:

### 1. Install XAMPP
XAMPP gives you MySQL and phpMyAdmin in one package — no separate MySQL installation needed.

1. Download from: https://www.apachefriends.org
2. Run the installer with all default settings
3. Open **XAMPP Control Panel** after installation
4. Click **Start** next to **Apache**
5. Click **Start** next to **MySQL**
6. Both should turn green — that means your database is running

> ⚠️ You need to start Apache and MySQL in XAMPP **every time** you work on the project.  
> XAMPP does not start automatically when you turn on your computer.

### 2. Install Node.js
Download from: https://nodejs.org — choose the **LTS** version (the one that says "Recommended for Most Users")  
Run the installer with all default settings.

To verify it installed correctly, open a terminal and run:
```bash
node -v
npm -v
```
Both should print a version number.

### 3. Install Git
Download from: https://git-scm.com  
Run the installer with all default settings.

---

## Setup Instructions

> ⚠️ Unlike SQLite, MySQL does NOT create itself automatically when you clone this repo.  
> Every team member must follow ALL of these steps on their own machine.
> > iMportant ni guys kay Dili sya pareha atong SQLite nato sa una where mo generate ra dayon ug table structure if ma clone na ang repo. Kailangan kita pa, each, manually ang mo setup sa table structure ug database, where mo add manually ta sa myphp to view it, ang atong basehan ug butangan ug queries kay ang file na database.sql PLEASE IF MAG EDIT OR DROP sa file ingna ang team para dili ma guba ang structure
---

### Step 1 — Clone the repository

Open a terminal, navigate to where you want the project folder, then run:

```bash
git clone [https://github.com/YOUR_USERNAME/pharmaseek.git](https://github.com/drp-gi/pharmaseek.git)
cd pharmaseek
```

---

### Step 2 — Install Node.js dependencies

Still in the terminal, inside the pharmaseek folder:

```bash
npm install
```

This reads `package.json` and installs everything the project needs. It creates a `node_modules` folder — this is normal, do not delete it.

---

### Step 3 — Create your `.env` file



The `.env` file holds your personal database settings. It is **never committed to GitHub** because each person's setup is slightly different.

**In your terminal:**
```bash
cp .env.example .env
```

This creates a copy of the template. Now open the new `.env` file in VS Code and it will look like this:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=pharmaseek_db
SESSION_SECRET=pharmaseek2026
PORT=3000
```

**For XAMPP users (everyone on this team):**
- `DB_HOST` → leave as `localhost`
- `DB_USER` → leave as `root`
- `DB_PASSWORD` → **leave this blank** — XAMPP's MySQL has no password by default
- `DB_NAME` → leave as `pharmaseek_db`
- `SESSION_SECRET` → leave as is
- `PORT` → leave as `3000`

So your final `.env` should look exactly like this:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=pharmaseek_db
SESSION_SECRET=pharmaseek2026
PORT=3000
```

> ⚠️ Never change `.env` to `.env.example` or commit it to GitHub.  
> It is already listed in `.gitignore` so Git will ignore it automatically.

---

### Step 4 — Set up the database in phpMyAdmin

phpMyAdmin is a visual tool for managing your MySQL database. It comes with XAMPP.

**Make sure XAMPP is running (Apache + MySQL both green) then:**

1. Open your browser and go to: `http://localhost/phpmyadmin`
2. You should see a dashboard — no login required for XAMPP default
3. On the **left sidebar**, click **New**
4. In the field that appears, type: `pharmaseek_db`
5. Click **Create**
6. You should now see `pharmaseek_db` appear in the left sidebar — click it to select it
7. At the top, click the **Import** tab
8. Click **Choose File**
9. Navigate to your project folder and select `database.sql`
10. Scroll down and click **Go**

You should see a success message in green. On the left sidebar, click the arrow next to `pharmaseek_db` and you should see all the tables listed (categories, medicines, users, etc.).

> ⚠️ If you ever need to reset the database completely:  
> Go to phpMyAdmin → click `pharmaseek_db` → click **Operations** tab → click **Drop the database**.  
> Then repeat steps 3–10 above to reimport.

---

### Step 5 — Run the app

In your terminal (inside the pharmaseek folder):

```bash
npm run dev
```

Then open your browser and go to: `http://localhost:3000`

You should see the PharmaSeek landing page.

> If you see an error like `Cannot find module`, run `npm install` again.  
> If you see a database connection error, make sure XAMPP MySQL is started.

---

## Development Login Credentials

> For development and testing only.

| Role        | Username   | Password   |
|-------------|------------|------------|
| Admin       | admin      | password   |
| Pharmacist  | rcruz_ph   | password   |
| Staff       | mreyes_s   | password   |

---

## Folder Structure

```
PHARMASEEK/
├─ db/
│  └─ connection.js          # MySQL connection — do not edit unless told to
├─ middleware/
│  ├─ authMiddleware.js      # Blocks unauthenticated access
│  └─ roleMiddleware.js      # Restricts routes by role
├─ public/
│  ├─ css/                   # Your CSS files go here
│  ├─ js/                    # Client-side JS files go here
│  └─ uploads/               # Medicine product images (auto-uploaded)
├─ routes/
│  ├─ auth.js                # Login and logout
│  ├─ categories.js          # Category management
│  ├─ medicines.js           # Medicine catalog CRUD
│  ├─ reports.js             # Report generation + management logs
│  ├─ restock.js             # Restock request workflow
│  ├─ transactions.js        # Stock transactions (sale, disposal, restock)
│  └─ users.js               # User account management
├─ views/
│  ├─ admin/                 # Pages only Admin can see
│  ├─ auth/                  # Login page and landing page
│  ├─ pharmacist/            # Pages only Pharmacist can see
│  └─ staff/                 # Pages only Staff can see
├─ .env                      # Your personal local config (gitignored)
├─ .env.example              # Blank template — copy this to create .env
├─ .gitignore
├─ app.js                    # Entry point — starts the server
├─ database.sql              # Full schema + seed data — import this into phpMyAdmin
├─ package.json
└─ README.md
```

---

## User Roles

| Role       | Real-World Job           | System Access |
|------------|--------------------------|---------------|
| Admin      | Store Owner / IT Manager | User management, reports, management logs, settings |
| Pharmacist | Licensed Pharmacist      | Medicine catalog, alerts, restock request approval |
| Staff      | Cashier / Technician     | Record sales, disposals, and delivery receipts |

---

## Every Time You Work on the Project

Do this at the start of every coding session:

```
1. Open XAMPP Control Panel
2. Start Apache (green)
3. Start MySQL (green)
4. Open VS Code → open terminal
5. git pull origin main   (get latest changes from teammates)
6. npm run dev            (start the server)
7. Open browser → http://localhost:3000
```

---

## Development Progress

### ✅ Phase 1 — Planning & Setup (Current)
- [x] Project proposal finalized
- [x] Database schema designed and seeded
- [x] GitHub repository created
- [x] Folder structure established
- [ ] `.env.example` committed
- [ ] Middleware files created (`authMiddleware.js`, `roleMiddleware.js`)
- [ ] `db/connection.js` configured

### 🔲 Phase 2 — Authentication
- [ ] Login page (all roles)
- [ ] Session-based auth with bcrypt
- [ ] Role-based dashboard redirect
- [ ] Logout

### 🔲 Phase 3 — Core Inventory (Pharmacist)
- [ ] Medicine catalog view (by category)
- [ ] Add / edit / delete medicine
- [ ] Category management
- [ ] Supplier reference management

### 🔲 Phase 4 — Alerts & Restock (Pharmacist)
- [ ] Low-stock and near-expiry alert detection
- [ ] Alert dashboard cards
- [ ] Restock request creation
- [ ] Approve / dismiss restock requests

### 🔲 Phase 5 — Stock Transactions (Staff)
- [ ] Record customer sale
- [ ] Record waste disposal
- [ ] Receive physical delivery (link to approved restock)

### 🔲 Phase 6 — Reports & Logs (Admin)
- [ ] Inventory status report
- [ ] Stock movement report
- [ ] Expiration tracking report
- [ ] Restock request status report
- [ ] File management log from reports page

### 🔲 Phase 7 — User Management & Settings (Admin)
- [ ] View / add / edit / deactivate users
- [ ] Pharmacy settings page
- [ ] Profile update

### 🔲 Phase 8 — Testing & Finalization
- [ ] System testing (all roles)
- [ ] Bug fixing
- [ ] Documentation and user manual
- [ ] Final revision and presentation

---

## Important Notes for the Team

- **Never commit your `.env` file.** It contains your local database settings.
- **Always pull before you push.** Run `git pull origin main` before starting work each session to avoid conflicts.
- **Don't modify `database.sql` without telling the team.** If the schema changes, everyone must drop and reimport the database.
- **XAMPP must be running before you start the app.** If you get a database error, check that MySQL is green in XAMPP Control Panel.
- **Passwords in the seed data are for development only.** All three accounts use the password `password`.
- **Images uploaded through the app go to `public/uploads/`.** This folder is gitignored — do not commit uploaded files.

---

## Branch Strategy (Suggested)

To avoid overwriting each other's work:

```
main              ← stable, working code only
dev               ← integration branch, merge features here first
feature/login     ← example feature branch
feature/inventory
feature/alerts
```

```bash
# Start a new feature
git checkout -b feature/your-feature-name

# When done, push and open a pull request to dev
git push origin feature/your-feature-name
```

---

## Troubleshooting

**"Cannot connect to database" error**
→ Open XAMPP Control Panel and make sure MySQL is started (green).

**"Cannot find module" error**
→ Run `npm install` in your terminal.

**phpMyAdmin shows empty tables**
→ You haven't imported the database yet. Follow Step 4 above.

**Port 3000 already in use**
→ Change `PORT=3001` in your `.env` file, or stop whatever else is running on port 3000.

**Apache won't start (port conflict)**
→ Something else is using port 80. In XAMPP Control Panel, click **Config** next to Apache → change the port to 8080. Then access phpMyAdmin at `http://localhost:8080/phpmyadmin`.

---

*PharmaSeek — Because out of stock is scary.*
