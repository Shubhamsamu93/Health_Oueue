# HealthQueue Deployment Guide

## Frontend Deployment (Vercel) ✅

The frontend is configured for Vercel deployment.

### Steps:
1. Push this repository to GitHub
2. Connect your GitHub repo to Vercel
3. Vercel will automatically deploy the frontend from `HealthQueue/client/`
4. Set the environment variable `API_BASE` in Vercel to your backend URL

### Environment Variables for Vercel:
- `API_BASE`: Your backend deployment URL (e.g., `https://healthqueue-backend.onrender.com`)

## Backend Deployment (Render) 🚀

The backend is now configured for Render deployment.

### Steps:
1. **Create Render Account**: Go to [render.com](https://render.com) and sign up
2. **Connect GitHub**: Link your GitHub account
3. **Create Web Service**:
   - Click "New" → "Web Service"
   - Connect your GitHub repo
   - Set service name: `healthqueue-backend`
   - Root directory: `HealthQueue/server`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
4. **Set Environment Variables**:
   - `NODE_ENV`: `production`
   - `MONGO_URI`: Your MongoDB Atlas connection string
   - `JWT_SECRET`: Generate a secure random string
5. **Create Database** (Optional - Render has managed databases):
   - Create a MongoDB instance on Render, or use MongoDB Atlas
6. **Deploy**: Click "Create Web Service"

### Environment Variables for Render:
- `MONGO_URI`: `mongodb+srv://username:password@cluster.mongodb.net/healthqueue?retryWrites=true&w=majority`
- `JWT_SECRET`: A long random string (Render can generate this)
- `NODE_ENV`: `production`

## Database Setup (MongoDB Atlas)

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Create a free cluster
3. Create database user
4. Whitelist your IP (or 0.0.0.0/0 for all)
5. Get connection string and update `MONGO_URI`

## Production URLs

After deployment:
- Frontend: `https://health-queue.vercel.app`
- Backend: `https://healthqueue-backend.onrender.com`

Update the `API_BASE` in Vercel to point to your Render backend URL.