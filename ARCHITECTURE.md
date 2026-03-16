# FabriQ Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Web Browser                                  │
│                  http://localhost:5173                               │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  React Frontend        │
                    │  (Vite Dev Server)     │
                    │                        │
                    │ ├─ CustomerProfile    │
                    │ ├─ EditProfileModal   │
                    │ └─ customerAPI        │
                    └───────────┬────────────┘
                                │
                    HTTP Requests (JSON)
                                │
                ┌───────────────▼──────────────────┐
                │   Express.js Backend Server      │
                │   http://localhost:5000          │
                │                                  │
                │   ├─ routes/customers.js        │
                │   ├─ controllers/customer...    │
                │   └─ CORS enabled               │
                └───────────────┬──────────────────┘
                                │
                    Database Queries (BSON)
                                │
                        ┌───────▼────────┐
                        │    MongoDB     │
                        │                │
                        │  ├─ fabriQ DB  │
                        │  └─ customers  │
                        │                │
                        └────────────────┘
```

## Data Flow

### Getting Profile Data
```
User Opens Profile Page
        ↓
useEffect in CustomerProfile
        ↓
customerAPI.getCustomer(id)
        ↓
HTTP GET /api/customers/:id
        ↓
Backend Router
        ↓
customerController.getCustomer()
        ↓
MongoDB Customer.findById()
        ↓
Return JSON data
        ↓
Display in UI
```

### Saving Profile Changes
```
User clicks "Edit Profile"
        ↓
EditProfileModal opens
        ↓
User fills form and saves
        ↓
handleSaveProfile(data)
        ↓
customerAPI.updateCustomer(id, data)
        ↓
HTTP PUT /api/customers/:id
        ↓
Backend Router
        ↓
customerController.updateCustomer()
        ↓
MongoDB Customer.findByIdAndUpdate()
        ↓
Return updated JSON
        ↓
Update local state
        ↓
Close modal & refresh display
```

## Component Structure

```
App.tsx
  └─ CustomerProfile.tsx ✨ Updated with API
       ├─ Tabs
       │   ├─ Profile Info (editable)
       │   ├─ Measurements (view)
       │   ├─ Favorites (view/manage)
       │   └─ History (view)
       │
       └─ EditProfileModal.tsx ✨ New
           └─ Form (firstName, lastName, email, phone, address, branch)
```

## API Endpoint Structure

```
/api/customers
├─ GET    /:id                      → Fetch customer
├─ POST   /                         → Create customer
├─ PUT    /:id                      → Update customer
├─ DELETE /:id                      → Delete customer
│
├─ /measurements
│  ├─ GET    /:id/measurements      → Get measurements
│  └─ PUT    /:id/measurements      → Update measurements
│
├─ /favorites
│  ├─ GET    /:id/favorites         → Get all favorites
│  ├─ POST   /:id/favorites         → Add favorite
│  └─ DELETE /:id/favorites/:favId  → Remove favorite
│
└─ /history
   └─ GET    /:id/history           → Get order history
```

## Technology Stack

### Frontend
```
React 18.3.1
  ├─ TypeScript
  ├─ Vite (bundler)
  ├─ Tailwind CSS
  ├─ Radix UI (components)
  └─ Lucide React (icons)
```

### Backend
```
Node.js
  ├─ Express.js 4.18.2
  ├─ Mongoose 8.0.0 (MongoDB ODM)
  ├─ CORS 2.8.5
  ├─ dotenv 16.3.1
  └─ bcryptjs 2.4.3
```

### Database
```
MongoDB 4.0+
  └─ Local: mongodb://localhost:27017/fabriQ
```

## File Organization

```
Frontend Request → Backend Router → Controller → Model → Database
                                       ↓
                              Business Logic
                              Validation
                              Error Handling
                                       ↓
                            Response JSON
```

## Request/Response Example

### Edit Profile Request
```json
PUT /api/customers/demo-customer-001
Content-Type: application/json

{
  "firstName": "Sarah",
  "lastName": "Johnson",
  "email": "sarah.johnson@email.com",
  "phone": "+63 912 345 6789",
  "address": "123 Fashion Street, Taguig City",
  "preferredBranch": "Taguig Main"
}
```

### Response
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "firstName": "Sarah",
  "lastName": "Johnson",
  "email": "sarah.johnson@email.com",
  "phone": "+63 912 345 6789",
  "address": "123 Fashion Street, Taguig City",
  "preferredBranch": "Taguig Main",
  "measurements": {...},
  "favorites": [...],
  "orderHistory": [...],
  "createdAt": "2026-01-10T10:00:00Z",
  "updatedAt": "2026-01-30T15:30:00Z"
}
```

## Error Handling Flow

```
User Action
    ↓
API Call
    ↓
┌─ Success? ─→ Update State → Update UI
│
└─ Error? ──→ Catch Error → Show Error Message → Keep Previous State
```

## Development Workflow

```
1. Start MongoDB
        ↓
2. Run Backend (npm run dev)
        ↓
3. Run Frontend (npm run dev)
        ↓
4. Open Browser
        ↓
5. Test Features
        ↓
6. Make Changes
        ↓
7. Auto-reload (both frontend & backend)
```

## Deployment Architecture (Future)

```
┌─────────────────────────────────────────────────────────┐
│                    Users                                │
└────────────────────┬──────────────────────────────────┘
                     │
            ┌────────▼────────┐
            │  CDN / S3       │
            │  (Static Files) │
            └────────┬────────┘
                     │
    ┌────────────────┼────────────────┐
    │                │                │
    │        ┌───────▼────────┐       │
    │        │  Nginx/Reverse │       │
    │        │  Proxy         │       │
    │        └───────┬────────┘       │
    │                │                │
    │   ┌────────────▼──────────┐     │
    │   │ Node.js Backend       │     │
    │   │ (Horizontal Scaling)  │     │
    │   └────────────┬──────────┘     │
    │                │                │
    │        ┌───────▼────────┐       │
    │        │  MongoDB Atlas │       │
    │        │  (Cloud DB)    │       │
    │        └────────────────┘       │
    │                                 │
    └─────────────────────────────────┘
```

## Security Considerations

```
Frontend
  ├─ Input Validation
  ├─ Error Handling
  └─ CORS Headers

Backend
  ├─ Environment Variables (.env)
  ├─ Input Validation
  ├─ Error Handling
  ├─ Password Hashing (bcryptjs)
  └─ MongoDB Injection Prevention

Database
  ├─ Data Validation at Schema Level
  └─ Unique Constraints (email)
```

## Performance Optimization

```
Frontend
  ├─ Vite (fast bundling)
  ├─ Component lazy loading (future)
  └─ Memoization (future)

Backend
  ├─ Connection pooling (Mongoose default)
  ├─ Indexing (MongoDB _id auto-indexed)
  ├─ Pagination (future)
  └─ Caching (future)

Database
  ├─ Indexes on frequently queried fields
  └─ Sharding for scale (future)
```
