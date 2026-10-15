const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const { GoogleGenAI } = require('@google/genai');
const {
  isSupabaseConfigured,
  testSupabaseConnection,
  db
} = require('./supabaseClient');

// Load environment variables from backend/.env or parent directory
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Also serve frontend statically if accessed directly through server
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// Supported Gemini models with descriptions
const SUPPORTED_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', badge: 'Recommended', description: 'Fastest flagship model with exceptional reasoning' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', badge: 'Fast', description: 'Next-generation multimodal speed and low latency' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', badge: 'Lightweight', description: 'Fast, efficient general purpose model' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', badge: 'Deep Reasoning', description: 'Complex reasoning, math, and long contexts' }
];

/**
 * Helper to get an instance of GoogleGenAI client
 * Allows either environment variable or user-provided key from request
 */
function getAiClient(clientKey) {
  const apiKey = clientKey || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

/**
 * Public Client Configuration
 * Provides public non-sensitive configuration to frontend
 */
app.get('/api/config', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL && !process.env.SUPABASE_URL.includes('your-project-id')
    ? process.env.SUPABASE_URL.trim()
    : '';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY.includes('your_supabase_')
    ? process.env.SUPABASE_ANON_KEY.trim()
    : '';

  res.json({
    supabaseUrl,
    supabaseAnonKey,
    hasSupabase: isSupabaseConfigured(),
    hasGeminiKey: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here' && process.env.GEMINI_API_KEY.trim() !== '')
  });
});

/**
 * Health & Configuration Status Check
 */
app.get('/api/status', (req, res) => {
  const envKey = process.env.GEMINI_API_KEY;
  const isKeyConfigured = !!(envKey && envKey !== 'your_gemini_api_key_here' && envKey.trim() !== '');

  res.json({
    status: 'online',
    isKeyConfigured,
    hasSupabase: isSupabaseConfigured(),
    defaultModel: 'gemini-2.5-flash',
    supportedModels: SUPPORTED_MODELS,
    nodeVersion: process.version,
    serverTime: new Date().toISOString()
  });
});

/**
 * Supabase Connection Test & Health Check
 */
app.get('/api/supabase/status', async (req, res) => {
  const result = await testSupabaseConnection();
  res.json(result);
});

/**
 * Get available models list
 */
app.get('/api/models', (req, res) => {
  res.json({ models: SUPPORTED_MODELS });
});

/**
 * Helper to format history into Gemini contents format
 */
function formatHistory(history, newMessage) {
  const contents = [];

  if (Array.isArray(history)) {
    for (const msg of history) {
      if (!msg.text || !msg.role) continue;
      const role = msg.role === 'user' ? 'user' : 'model';
      contents.push({
        role,
        parts: [{ text: String(msg.text) }]
      });
    }
  }

  if (newMessage && newMessage.trim()) {
    contents.push({
      role: 'user',
      parts: [{ text: String(newMessage).trim() }]
    });
  }

  return contents;
}

/**
 * Non-Streaming Chat Endpoint
 * POST /api/chat
 * Body: { message, history, model, systemPrompt, apiKey, conversationId }
 */
app.post('/api/chat', async (req, res) => {
  try {
    const { message, history = [], model = 'gemini-2.5-flash', systemPrompt = '', apiKey, conversationId } = req.body;

    if (!message && (!history || history.length === 0)) {
      return res.status(400).json({ error: 'Message or conversation history is required.' });
    }

    const ai = getAiClient(apiKey);
    if (!ai) {
      return res.status(401).json({
        error: 'Gemini API Key is not configured. Please add GEMINI_API_KEY to your backend/.env file or enter it in the frontend settings.'
      });
    }

    const contents = formatHistory(history, message);

    const config = {};
    if (systemPrompt && systemPrompt.trim()) {
      config.systemInstruction = systemPrompt.trim();
    }

    // Call Gemini API
    const response = await ai.models.generateContent({
      model,
      contents,
      config
    });

    const replyText = response.text || '';

    // If Supabase is connected and a conversationId is provided, save messages
    if (isSupabaseConfigured() && conversationId) {
      try {
        if (message) {
          await db.addMessage({ conversationId, role: 'user', text: message });
        }
        await db.addMessage({ conversationId, role: 'model', text: replyText, model });
      } catch (dbErr) {
        console.warn('Could not persist messages to Supabase:', dbErr.message);
      }
    }

    res.json({
      reply: replyText,
      modelUsed: model,
      usage: response.usageMetadata || null
    });
  } catch (error) {
    console.error('Error in /api/chat:', error);
    const errorMessage = error?.message || 'Failed to generate response from Gemini.';
    res.status(500).json({
      error: errorMessage,
      details: error?.statusText || error?.status || null
    });
  }
});

/**
 * Streaming Chat Endpoint (Server-Sent Events)
 * POST /api/chat/stream
 * Body: { message, history, model, systemPrompt, apiKey, conversationId }
 */
app.post('/api/chat/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    const { message, history = [], model = 'gemini-2.5-flash', systemPrompt = '', apiKey, conversationId } = req.body;

    if (!message && (!history || history.length === 0)) {
      res.write(`data: ${JSON.stringify({ error: 'Message or history is required.' })}\n\n`);
      return res.end();
    }

    const ai = getAiClient(apiKey);
    if (!ai) {
      res.write(`data: ${JSON.stringify({
        error: 'Gemini API Key is missing. Add GEMINI_API_KEY to backend/.env or enter it in the UI settings.'
      })}\n\n`);
      return res.end();
    }

    const contents = formatHistory(history, message);

    const config = {};
    if (systemPrompt && systemPrompt.trim()) {
      config.systemInstruction = systemPrompt.trim();
    }

    const responseStream = await ai.models.generateContentStream({
      model,
      contents,
      config
    });

    let fullReply = '';

    for await (const chunk of responseStream) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullReply += chunkText;
        res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
      }
    }

    // Auto-persist to Supabase if conversationId is provided
    if (isSupabaseConfigured() && conversationId) {
      try {
        if (message) {
          await db.addMessage({ conversationId, role: 'user', text: message });
        }
        await db.addMessage({ conversationId, role: 'model', text: fullReply, model });
      } catch (dbErr) {
        console.warn('Could not persist streamed messages to Supabase:', dbErr.message);
      }
    }

    // Indicate completion
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Error in /api/chat/stream:', error);
    const errorMessage = error?.message || 'Error occurred while streaming response.';
    res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
    res.end();
  }
});

// ============================================================
// Supabase Conversation Management Endpoints
// ============================================================

/**
 * Get all conversations
 * GET /api/conversations
 */
app.get('/api/conversations', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const conversations = await db.getConversations();
    res.json({ conversations });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new conversation
 * POST /api/conversations
 * Body: { title }
 */
app.post('/api/conversations', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const title = req.body.title || 'New Conversation';
    const conversation = await db.createConversation(title);
    res.json({ conversation });
  } catch (err) {
    console.error('Error creating conversation:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get messages for a conversation
 * GET /api/conversations/:id/messages
 */
app.get('/api/conversations/:id/messages', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const messages = await db.getMessages(req.params.id);
    res.json({ messages });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Add a message to a conversation
 * POST /api/conversations/:id/messages
 * Body: { role, text, model }
 */
app.post('/api/conversations/:id/messages', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    const { role, text, model } = req.body;
    const message = await db.addMessage({
      conversationId: req.params.id,
      role,
      text,
      model
    });
    res.json({ message });
  } catch (err) {
    console.error('Error adding message:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a conversation
 * DELETE /api/conversations/:id
 */
app.delete('/api/conversations/:id', async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(503).json({ error: 'Supabase is not configured' });
  }

  try {
    await db.deleteConversation(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (err) {
    console.error('Error deleting conversation:', err);
    res.status(500).json({ error: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 Gemini Chatbot Backend Server Running!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🔗 API Health Check: http://localhost:${PORT}/api/status`);
  console.log(`⚡ Supabase Configured: ${isSupabaseConfigured()}`);
  console.log(`🔑 Gemini Key Configured: ${Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here')}`);
  console.log(`💻 Frontend App: http://localhost:${PORT}/`);
  console.log(`===============================================`);
});
