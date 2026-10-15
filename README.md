# 🌟 Full-Stack Google Gemini & Supabase Chatbot

A clean, modular, and high-performance chatbot web application powered by **Google's Gemini LLM** (`@google/genai`) and **Supabase Cloud Database** (`@supabase/supabase-js`). Built with a strict architectural separation between **Frontend** and **Backend** folders.

---

## 📂 Project Architecture & Folder Differentiation

```
├── backend/                       <-- SERVER-SIDE LAYER (Node.js, Express & Supabase SDK)
│   ├── .env                       <-- Backend secrets (GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY)
│   ├── .env.example               <-- Template configuration
│   ├── package.json               <-- Dependencies (@google/genai, @supabase/supabase-js, express)
│   ├── server.js                  <-- REST & SSE API server, Gemini API gateway, conversation routes
│   ├── supabaseClient.js          <-- Supabase client initialization & database helpers
│   ├── supabase-schema.sql        <-- SQL table schema & RLS policies
│   └── README.md                  <-- Backend documentation
│
├── frontend/                      <-- CLIENT-SIDE LAYER (Vanilla HTML/CSS/JS + Supabase JS)
│   ├── .env                       <-- Frontend config (BACKEND_API_URL, SUPABASE_URL, SUPABASE_ANON_KEY)
│   ├── .env.example               <-- Template configuration
│   ├── index.html                 <-- Semantic UI layout, Cloud Conversations drawer, settings modal
│   ├── style.css                  <-- Dark glassmorphism design system & micro-animations
│   ├── app.js                     <-- Client state, SSE reader, Supabase sync, markdown engine
│   └── README.md                  <-- Frontend documentation
│
├── start.bat                      <-- One-click Windows starter script
└── README.md                      <-- Full documentation & setup guide
```

---

## 🔑 Environment Variables Overview

### 1. Backend (`backend/.env`):
```env
# Google Gemini API
GEMINI_API_KEY=your_gemini_api_key_here
PORT=5000

# Supabase Database
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

### 2. Frontend (`frontend/.env`):
```env
# Backend Connection
BACKEND_API_URL=http://localhost:5000

# Supabase Public Client
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_public_key_here
```

---

## ⚡ Quick Start Guide

### Step 1: Configure Keys
1. **Google Gemini Key**: Get a free API key at [Google AI Studio](https://aistudio.google.com/app/apikey).
2. **Supabase Setup**:
   - Create a free project at [Supabase](https://supabase.com/).
   - Copy your **Project URL** and **anon public key** from Project Settings &rarr; API.
   - Run the SQL script from [`backend/supabase-schema.sql`](file:///c:/Users/Harit/Desktop/New%20folder/backend/supabase-schema.sql) in the Supabase SQL Editor.
3. Paste keys into [`backend/.env`](file:///c:/Users/Harit/Desktop/New%20folder/backend/.env) and [`frontend/.env`](file:///c:/Users/Harit/Desktop/New%20folder/frontend/.env).

### Step 2: Launch Application
- **Windows 1-Click**: Double-click [`start.bat`](file:///c:/Users/Harit/Desktop/New%20folder/start.bat).
- **Manual Command**:
  ```powershell
  cd backend
  npm start
  ```
- Open **`http://localhost:5000/`** in your browser.

---

## 💎 Features
- **Cloud Database Persistence**: All messages and conversations automatically sync with Supabase.
- **Saved Conversations Drawer**: View, switch, and delete past conversations saved in the cloud.
- **Server-Sent Events (SSE) Streaming**: Fluid token-by-token streaming from Gemini models.
- **Multi-Model Support**: Switch between `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`, and `gemini-1.5-pro`.
- **Markdown & Code Highlighting**: Automatic formatting with 1-click **Copy Code** buttons.
- **Live Connection Diagnostics**: Dynamic status indicators for both the backend server and the Supabase cloud database.
