# SST Application Management System - Setup Guide

## Prerequisites
- Node.js 18+ 
- PostgreSQL 14+
- npm or yarn

---

## Step 1: Database Setup

1. Open pgAdmin or psql and create the database:
```sql
CREATE DATABASE ams_db;
```

2. Update the DB password in `backend/.env`:
```
DB_PASSWORD=your_actual_postgres_password
```

---

## Step 2: Backend Setup

```bash
cd backend
npm install
npm run db:init
npm run dev
```

The backend starts on **http://localhost:5000**

Default login credentials created by db:init:
- **Admin**: username=`admin`, password=`Admin@123`
- **Manager**: username=`manager1`, password=`Manager@123`

---

## Step 3: Frontend Setup

Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```

The frontend starts on **http://localhost:5173**

---

## Project Structure

```
SST Application management system/
├── backend/
│   ├── server.js              # Express server entry
│   ├── .env                   # Environment config
│   ├── src/
│   │   ├── config/            # DB + multer config
│   │   ├── middleware/        # Auth, RBAC, audit
│   │   ├── routes/            # API routes
│   │   ├── controllers/       # Business logic
│   │   └── db/
│   │       ├── schema.sql     # DB schema
│   │       └── init.js        # DB initializer
│   └── uploads/               # Uploaded files
│
└── frontend/
    ├── src/
    │   ├── pages/             # All page components
    │   ├── components/        # Layout + common
    │   ├── context/           # Auth context
    │   └── services/          # API service
    └── vite.config.js
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Get current user |
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| GET | /api/projects/:id | Get project detail |
| PATCH | /api/stages/:projectId/stage/:stageNumber | Update stage |
| POST | /api/documents/:projectId | Upload documents |
| POST | /api/payments/:projectId | Add payment |
| GET | /api/analytics/dashboard | Dashboard stats |
| GET | /api/analytics/export/excel | Export Excel |
| GET | /api/analytics/export/pdf | Export PDF |
| GET | /api/audit-logs | Audit logs |

---

## Roles & Permissions

| Feature | Admin | Manager | Employee |
|---------|-------|---------|---------|
| View projects | All | All | Assigned |
| Create project | Yes | Yes | Yes |
| Update stages | Yes | Yes | Yes |
| Delete project | Yes | No | No |
| Manage users | Yes | No | No |
| View team | Yes | Yes | No |
| View audit log | Yes | Yes | No |
| Export reports | Yes | Yes | No |

---

## Workflow Stages (19 Stages)

1. Customer Requirement
2. Customer Name & Company
3. Communication
4. Customer Type (New → Reference / Existing)
5. Company Details + Vendor Registration *(Document)*
6. NDA *(Document)*
7. Customer Design Requirement *(Document)*
8. SST Design + Quotation *(Document)*
9. Negotiation *(Document)*
10. Purchase Order (Customer → SST) *(Document)*
11. PO Acknowledgement (SST → Customer) *(Document)*
12. Terms & Advance (Performa Invoice) *(Document)*
13. Payment Received *(Document)*
14. Project Execution
15. Delivery + Invoice *(Document)*
16. Installation & Commissioning *(Document)*
17. **Project Sign Up** *(Mandatory Document)*
18. Balance Payment *(Document)*
19. Project Closed

---

## Security Features

- JWT authentication with 8h expiry
- Bcrypt password hashing (cost factor 12)
- Rate limiting (100 req/15min, 10 login/15min)
- Helmet.js security headers
- CORS configured for frontend only
- Role-based access control
- Complete audit log trail
- Input sanitization

---

## Production Deployment Notes

1. Change `JWT_SECRET` to a strong random value
2. Set `NODE_ENV=production`
3. Use HTTPS (Nginx + Let's Encrypt)
4. Use AWS S3 or similar for file storage
5. Set up database backups
6. Use PM2 or Docker for process management
