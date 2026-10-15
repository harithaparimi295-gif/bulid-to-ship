# 🤖 Gemini Chatbot - Backend

This is the backend server for the Gemini Chatbot application, built using **Node.js**, **Express**, the official Google **`@google/genai`** SDK, and **`@supabase/supabase-js`** for cloud chat persistence.

---

## 📁 Directory Structure
```
backend/
├── .env                  # Environment file (contains GEMINI_API_KEY & SUPABASE keys)
├── .env.example          # Environment template
├── package.json          # Node dependencies and scripts
├── server.js             # Express API server, SSE streaming & Gemini gateway
├── supabaseClient.js     # Supabase client & database queries helper
├── supabase-schema.sql   # SQL migration script for tables & RLS policies
└── README.md             # Backend documentation
```

---

## 🔑 Required Environment Variables (`backend/.env`)

| Variable | Description | Where to get |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Google Gemini API Key | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `PORT` | Backend server port (defaults to `5000`) | Local config |
| `SUPABASE_URL` | Your Supabase project URL (`https://xyz.supabase.co`) | [Supabase Dashboard](https://supabase.com/dashboard) &rarr; Project Settings &rarr; API |
| `SUPABASE_ANON_KEY` | Public Anon API Key | [Supabase Dashboard](https://supabase.com/dashboard) &rarr; Project Settings &rarr; API |
| `SUPABASE_SERVICE_ROLE_KEY` | *(Optional)* Service role key for admin operations | [Supabase Dashboard](https://supabase.com/dashboard) &rarr; Project Settings &rarr; API |

---

## 🛠️ Supabase Database Setup
1. In your [Supabase Dashboard](https://supabase.com/dashboard), open your project.
2. Navigate to **SQL Editor** &rarr; **New Query**.
3. Open [`backend/supabase-schema.sql`](file:///c:/Users/Harit/Desktop/New%20folder/backend/supabase-schema.sql) and paste the contents into the SQL editor.
4. Click **Run**. This creates:
   - `conversations` table
   - `messages` table
   - Performance indexes
   - Row Level Security (RLS) policies

---

## 🚀 Running the Server
```bash
npm start
```
Or with auto-reload:
```bash
npm run dev
```

---

## 📡 API Endpoints

- `GET /api/status`: Health check & API key / Supabase status.
- `GET /api/config`: Exposes public configuration to frontend.
- `GET /api/supabase/status`: Tests live connection to Supabase database.
- `POST /api/chat`: Non-streaming Gemini completion.
- `POST /api/chat/stream`: Real-time SSE streaming Gemini completion.
- `GET /api/conversations`: Fetches saved conversations from Supabase.
- `POST /api/conversations`: Creates a new conversation.
- `GET /api/conversations/:id/messages`: Fetches messages for a conversation.
- `DELETE /api/conversations/:id`: Deletes a conversation and its messages.
