# FabriQ Command Reference

## 🎯 Startup Commands

### Windows (Easiest)
```bash
# Just double-click this file from Windows Explorer
start-dev.bat
```

### Manual Startup - Terminal 1 (Backend)
```bash
cd backend
npm install          # Only needed first time
npm run seed         # Only needed first time (creates sample data)
npm run dev          # Start development server
npm start            # Start production server
```

### Manual Startup - Terminal 2 (Frontend)
```bash
cd FabriQ
npm install          # Only needed first time
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
```

---

## 📦 Installation Commands

### Install Backend Dependencies
```bash
cd backend
npm install
```

### Install Frontend Dependencies
```bash
cd FabriQ
npm install
```

### Install Specific Package
```bash
cd backend
npm install express-validator    # Example
```

---

## 🗄️ Database Commands

### Connect to MongoDB
```bash
mongosh                          # Connect to local MongoDB
mongosh mongodb://localhost:27017  # Explicit connection
```

### MongoDB Commands (in mongosh shell)
```javascript
// View all databases
show databases

// Switch to fabriQ database
use fabriQ

// Show all collections
show collections

// View all customers
db.customers.find()

// View with pretty formatting
db.customers.find().pretty()

// View first customer
db.customers.findOne()

// Count customers
db.customers.countDocuments()

// Find by email
db.customers.findOne({ email: "sarah.johnson@email.com" })

// Update a customer
db.customers.updateOne(
  { _id: ObjectId("...") },
  { $set: { phone: "+63 987 654 3210" } }
)

// Delete a customer
db.customers.deleteOne({ _id: ObjectId("...") })

// Delete all customers
db.customers.deleteMany({})

// Clear database
db.dropDatabase()
```

---

## 🧪 Testing Commands

### Test Backend Health
```bash
curl http://localhost:5000/api/health
```

### Test GET Customer
```bash
curl http://localhost:5000/api/customers/demo-customer-001
```

### Test POST (Create Customer)
```bash
curl -X POST http://localhost:5000/api/customers \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+63 912 345 6789",
    "address": "123 Street",
    "preferredBranch": "Taguig Main"
  }'
```

### Test PUT (Update Customer)
```bash
curl -X PUT http://localhost:5000/api/customers/demo-customer-001 \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+63 987 654 3210"
  }'
```

### Test DELETE Customer
```bash
curl -X DELETE http://localhost:5000/api/customers/demo-customer-001
```

---

## 🔄 Reset/Cleanup Commands

### Reset Database
```bash
cd backend
npm run seed    # Deletes all data and creates sample customer
```

### Clear Node Modules (Backend)
```bash
cd backend
rm -r node_modules    # macOS/Linux
rmdir /s node_modules # Windows
npm install           # Reinstall
```

### Clear Node Modules (Frontend)
```bash
cd FabriQ
rm -r node_modules    # macOS/Linux
rmdir /s node_modules # Windows
npm install           # Reinstall
```

### Clean Build
```bash
cd FabriQ
npm run build    # Creates production build
```

---

## 📊 Database Backup/Restore

### Backup Database
```bash
mongodump --db fabriQ --out ./backup
```

### Restore Database
```bash
mongorestore --db fabriQ ./backup/fabriQ
```

### Export to JSON
```bash
mongoexport --db fabriQ --collection customers --out customers.json
```

### Import from JSON
```bash
mongoimport --db fabriQ --collection customers --file customers.json
```

---

## 🔍 Debugging Commands

### Check if Port is In Use (Windows)
```bash
netstat -ano | findstr :5000
netstat -ano | findstr :5173
```

### Check if Port is In Use (macOS/Linux)
```bash
lsof -i :5000
lsof -i :5173
```

### Kill Process on Port (Windows)
```bash
taskkill /PID <PID> /F
```

### Kill Process on Port (macOS/Linux)
```bash
kill -9 <PID>
```

### Check MongoDB Service Status (Windows)
```bash
sc query MongoDB
```

### Start MongoDB Service (Windows)
```bash
net start MongoDB
```

### Stop MongoDB Service (Windows)
```bash
net stop MongoDB
```

---

## 📝 Logs & Debugging

### View Backend Console Logs
```
Check the terminal running: npm run dev
```

### View MongoDB Logs
```bash
# Linux/macOS
sudo journalctl -u mongod

# Windows
# Check Windows Event Viewer or MongoDB log file
```

### Enable Verbose Logging (Backend)
```javascript
// Add to server.js
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});
```

---

## 🚀 Useful Development Tips

### Hot Reload During Development
Both frontend and backend automatically reload when files change:
- **Backend**: nodemon watches changes → auto-restart
- **Frontend**: Vite provides hot module replacement → instant reload

### Live URL Share (Frontend only)
```bash
# After running npm run dev
# Add to vite.config.ts server config
```

### Debug Mode
```bash
# Add debugger statement in code
debugger;

# Then run with inspector
node --inspect backend/server.js

# Open chrome://inspect in Chrome
```

---

## 📋 Service Management

### Start All Services
```bash
start-dev.bat                    # Windows (one click)
```

### Check Services Status
```bash
# MongoDB (should be running as Windows Service)
# Backend: http://localhost:5000/api/health
# Frontend: http://localhost:5173
```

### Stop All Services
```bash
# Windows: Close the two command windows
# Terminal 1: Ctrl+C
# Terminal 2: Ctrl+C

# Or use Task Manager to stop Node processes
```

---

## 🐳 Docker Commands (Optional)

### Start with Docker Compose
```bash
docker-compose up
```

### Stop Docker Services
```bash
docker-compose down
```

### View Container Logs
```bash
docker-compose logs -f backend
```

### Remove All Containers
```bash
docker-compose down --volumes
```

---

## 📚 Useful Links

| Resource | URL |
|----------|-----|
| MongoDB Docs | https://docs.mongodb.com |
| Express Docs | https://expressjs.com |
| React Docs | https://react.dev |
| Mongoose Docs | https://mongoosejs.com |
| Node.js Docs | https://nodejs.org/en/docs |
| Vite Docs | https://vitejs.dev |

---

## 💾 File Location Reference

```
Backend Server           → FabriQ/backend/server.js
MongoDB Connection      → FabriQ/backend/config/database.js
Customer Model          → FabriQ/backend/models/Customer.js
API Routes              → FabriQ/backend/routes/customers.js
API Controllers         → FabriQ/backend/controllers/customerController.js
Sample Data Script      → FabriQ/backend/seed.js
Environment Config      → FabriQ/backend/.env

Frontend Profile Page   → FabriQ/FabriQ/src/components/CustomerProfile.tsx
Edit Modal Component    → FabriQ/FabriQ/src/components/EditProfileModal.tsx
API Service             → FabriQ/FabriQ/src/services/customerAPI.ts
```

---

## 🎯 Quick Problem Solving

| Problem | Command |
|---------|---------|
| Port 5000 in use | `netstat -ano \| findstr :5000` then `taskkill /PID <PID> /F` |
| MongoDB not running | `net start MongoDB` (Windows) |
| Packages not installed | `npm install` in the directory |
| Want fresh start | `npm run seed` in backend |
| Need to see database | `mongosh` then `use fabriQ` then `db.customers.find()` |

---

## 🔑 Key Shortcuts

- **Frontend Dev Mode**: `npm run dev` in FabriQ folder
- **Backend Dev Mode**: `npm run dev` in backend folder
- **Seed Database**: `npm run seed` in backend folder
- **Stop Server**: `Ctrl+C` in the terminal
- **View Backend Code**: `backend/server.js`
- **View Frontend Code**: `FabriQ/src/components/CustomerProfile.tsx`

---

## 📝 Notes

- All commands should be run from the specified directory
- Windows users can use `start-dev.bat` to automate startup
- MongoDB must be running for the backend to work
- Frontend will show mock data if backend is unavailable
- Changes are auto-reloaded in development mode
