// API configuration for deployment
const API_BASE = process.env.VERCEL_ENV === 'production' 
  ? 'https://your-backend-deployment-url.vercel.app'  // Replace with your actual backend URL
  : 'http://localhost:5000';

// Make it available globally
window.API_BASE = API_BASE;