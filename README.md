# Costing (Frappe app + React UI)

Sidebar pages: Dashboard, Batches, Products, Processes, Purchases, UoM. Each list supports add, edit, delete; a batch opens the costing sheet.

## Install
```
cd ~/frappe-bench
bench set-admin-password YOUR_PASSWORD
bench get-app costing /path/to/costing
bench --site mysite.localhost install-app costing
bench --site mysite.localhost migrate
cd apps/costing/frontend && npm install && npm run build
cd ~/frappe-bench && bench build --app costing && bench restart
```
Open http://mysite.localhost:8000/costing, sign in as Administrator.
(If you installed the previous version: `bench --site mysite.localhost reinstall` on a test site, or delete the old Process / Costing Product doctypes first.)

## Order of data entry
UoM -> Products -> Processes -> Purchases -> Batches.
