# 🚀 SiteSmith Vercel Deployment Guide

## ✅ Frontend is Ready for Vercel!

Your frontend has been configured for Vercel deployment with:
- ✅ Environment variables setup (`.env` and `.env.example`)
- ✅ Vercel configuration (`vercel.json`)
- ✅ All API calls use `VITE_BACKEND_URL` environment variable
- ✅ Build tested successfully
- ✅ Proper `.gitignore` configuration

---

## 🎯 Step-by-Step Deployment

### 1. **Prepare Your Backend (Local)**

Since you want to run the backend locally, you need to expose it to the internet:

#### Option A: Using ngrok (Recommended)
```bash
# Install ngrok: https://ngrok.com/download
# Start your backend first
cd backend
npm run dev  # or node dist/index.js

# In another terminal, expose port 5000
ngrok http 5000
```

This gives you a URL like: `https://abc123.ngrok.io`

#### Option B: Using Cloudflare Tunnel
```bash
# Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/
cloudflared tunnel --url http://localhost:5000
```

### 2. **Deploy to Vercel**

1. **Push to GitHub** (if not already done):
   ```bash
   git add .
   git commit -m "Frontend ready for Vercel deployment"
   git push origin main  # or your branch name
   ```

2. **Go to Vercel Dashboard**:
   - Visit [vercel.com](https://vercel.com)
   - Sign in with GitHub
   - Click "New Project"

3. **Import Your Repository**:
   - Select your `Sitesmith` repository
   - **Important**: Set Root Directory to `frontend`
   - Framework Preset: Vite (auto-detected)

4. **Configure Environment Variables**:
   - In the deployment settings, add:
   - `VITE_BACKEND_URL` = `https://your-ngrok-url.ngrok.io`
   - (Replace with your actual ngrok URL)

5. **Deploy**:
   - Click "Deploy"
   - Wait for build to complete (~2-3 minutes)

### 3. **Update Backend CORS**

Your backend needs to allow requests from Vercel. Add this to your backend:

```javascript
// In your backend CORS configuration
const allowedOrigins = [
  'https://your-app-name.vercel.app',  // Your Vercel domain
  'https://your-ngrok-url.ngrok.io',   // Your ngrok URL
  'http://localhost:8080',              // Local development
  'http://localhost:5173'               // Alternative local port
];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
```

### 4. **Test Your Deployment**

1. **Start Local Backend**:
   ```bash
   cd backend
   npm run dev
   ```

2. **Start ngrok**:
   ```bash
   ngrok http 5000
   ```

3. **Update Vercel Environment Variable**:
   - Go to your Vercel project settings
   - Update `VITE_BACKEND_URL` with your new ngrok URL
   - Redeploy (or wait for auto-deploy)

4. **Test Features**:
   - Visit your Vercel URL
   - Try creating a project
   - Test the chat functionality
   - Verify all API calls work

---

## 🔧 Troubleshooting

### Common Issues:

**1. CORS Errors**
- Check that your ngrok URL is in backend CORS config
- Verify Vercel domain is allowed in backend

**2. Backend Not Reachable**
- Ensure ngrok is running and pointing to correct port
- Check that `VITE_BACKEND_URL` in Vercel matches ngrok URL

**3. Environment Variables**
- Verify `VITE_BACKEND_URL` is set in Vercel dashboard
- Redeploy after changing environment variables

**4. Build Errors**
- Check that all dependencies are in `package.json`
- Ensure TypeScript types are correct

---

## 🎉 Quick Start Commands

```bash
# Terminal 1: Start Backend
cd backend && npm run dev

# Terminal 2: Expose Backend
ngrok http 5000

# Terminal 3: Test Frontend Locally (optional)
cd frontend && npm run dev
```

**Your URLs**:
- Backend (local): `http://localhost:5000`
- Backend (public): `https://your-ngrok-url.ngrok.io`
- Frontend (local): `http://localhost:8080`
- Frontend (production): `https://your-app.vercel.app`

---

## 🌟 Next Steps

After successful deployment:
1. **Custom Domain**: Add your own domain in Vercel settings
2. **Analytics**: Enable Vercel Analytics for usage insights
3. **Performance**: Monitor Core Web Vitals
4. **Backend Hosting**: Consider hosting backend on Railway, Render, or Heroku for production

---

**🚀 You're all set! Your SiteSmith frontend is ready for the world!**