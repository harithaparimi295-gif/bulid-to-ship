# 🎨 Gemini Chatbot - Frontend

This is the client-side user interface for the Gemini Chatbot application, built with vanilla HTML, CSS, JavaScript, and the official Supabase JS SDK.

---

## 📁 Directory Structure
```
frontend/
├── .env              # Frontend environment variables
├── .env.example      # Frontend environment template
├── index.html        # Semantic HTML5 layout, Supabase drawer & modals
├── style.css         # Glassmorphism dark styling & micro-animations
├── app.js            # Frontend logic, SSE reader, and Supabase cloud sync
└── README.md         # Frontend documentation
```

---

## 🔑 Required Environment Variables (`frontend/.env`)

| Variable | Description | Default Value |
| :--- | :--- | :--- |
| `BACKEND_API_URL` | URL of the Express backend server | `http://localhost:5000` |
| `SUPABASE_URL` | Supabase project URL | `https://your-project-id.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Anon Public Key | `eyJhbGciOiJIUzI1...` |

---

## ⚡ How Frontend Loads Configuration
1. **Automatic Sync from Backend**: When opened, the frontend automatically queries `GET /api/config` from the backend. If you configured `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `backend/.env`, the frontend auto-detects them without requiring any manual entry!
2. **In-App Settings**: You can also enter or test your Supabase credentials live in the web browser using the **Settings** modal.

---

## 💎 Features
- **Cloud Sync with Supabase**: Real-time conversation persistence with full multi-turn chat history.
- **Saved Conversations Drawer**: View, switch, and delete past conversations stored in your Supabase database.
- **Real-Time Token Streaming**: Word-by-word streaming using Server-Sent Events (SSE).
- **Markdown & Code Highlighting**: Automatic syntax formatting with a 1-click "Copy Code" button.
- **Voice Read-Aloud**: Text-to-speech engine to listen to AI responses.
