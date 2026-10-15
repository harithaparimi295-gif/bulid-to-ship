/**
 * Gemini Chatbot - Frontend Application Logic
 * Separated frontend client architecture communicating with Express backend and Supabase Cloud.
 */

// Determine Backend Base URL
const API_BASE = (window.location.protocol.startsWith('http') && window.location.port === '5000')
  ? ''
  : 'http://localhost:5000';

// App State
const state = {
  history: [],
  isGenerating: false,
  abortController: null,
  voiceEnabled: false,
  backendOnline: false,
  hasBackendKey: false,
  supabaseConfigured: false,
  supabaseClient: null,
  currentConversationId: localStorage.getItem('gemini_active_conversation_id') || null,
  conversationsList: [],
  settings: {
    apiKey: localStorage.getItem('gemini_user_api_key') || '',
    supabaseUrl: localStorage.getItem('supabase_user_url') || '',
    supabaseAnonKey: localStorage.getItem('supabase_user_anon_key') || '',
    systemPrompt: localStorage.getItem('gemini_system_prompt') || '',
    stream: localStorage.getItem('gemini_stream') !== 'false',
    model: localStorage.getItem('gemini_model') || 'gemini-2.5-flash'
  }
};

// DOM Elements
const elements = {
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.querySelector('#statusIndicator .status-text'),
  supabaseIndicator: document.getElementById('supabaseIndicator'),
  supabaseStatusText: document.querySelector('#supabaseIndicator .status-text'),
  alertBanner: document.getElementById('alertBanner'),
  alertMessage: document.getElementById('alertMessage'),
  bannerActionBtn: document.getElementById('bannerActionBtn'),
  dismissAlertBtn: document.getElementById('dismissAlertBtn'),
  settingsBadge: document.getElementById('settingsBadge'),

  modelSelect: document.getElementById('modelSelect'),
  newChatBtn: document.getElementById('newChatBtn'),
  clearChatBtn: document.getElementById('clearChatBtn'),
  exportChatBtn: document.getElementById('exportChatBtn'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  openConversationsBtn: document.getElementById('openConversationsBtn'),
  conversationsCount: document.getElementById('conversationsCount'),

  messagesContainer: document.getElementById('messagesContainer'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  chatViewport: document.querySelector('.chat-viewport'),
  scrollToBottomBtn: document.getElementById('scrollToBottomBtn'),
  activeConversationTitle: document.getElementById('activeConversationTitle'),

  chatForm: document.getElementById('chatForm'),
  userInput: document.getElementById('userInput'),
  sendBtn: document.getElementById('sendBtn'),
  stopBtn: document.getElementById('stopBtn'),
  voiceToggleBtn: document.getElementById('voiceToggleBtn'),
  voiceIconMuted: document.getElementById('voiceIconMuted'),
  voiceIconActive: document.getElementById('voiceIconActive'),
  quickChipsBar: document.getElementById('quickChipsBar'),

  // Drawer
  conversationsDrawer: document.getElementById('conversationsDrawer'),
  closeDrawerBtn: document.getElementById('closeDrawerBtn'),
  drawerNewChatBtn: document.getElementById('drawerNewChatBtn'),
  refreshConversationsBtn: document.getElementById('refreshConversationsBtn'),
  conversationsList: document.getElementById('conversationsList'),

  // Settings Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  apiKeyInput: document.getElementById('apiKeyInput'),
  toggleApiKeyVisibility: document.getElementById('toggleApiKeyVisibility'),
  supabaseUrlInput: document.getElementById('supabaseUrlInput'),
  supabaseAnonKeyInput: document.getElementById('supabaseAnonKeyInput'),
  toggleSupabaseKeyVisibility: document.getElementById('toggleSupabaseKeyVisibility'),
  testSupabaseBtn: document.getElementById('testSupabaseBtn'),
  supabaseTestStatus: document.getElementById('supabaseTestStatus'),
  systemPromptInput: document.getElementById('systemPromptInput'),
  streamToggle: document.getElementById('streamToggle'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  resetSettingsBtn: document.getElementById('resetSettingsBtn')
};

// Configure Marked.js for Markdown Rendering & Code Blocks
if (window.marked) {
  const renderer = new marked.Renderer();

  renderer.code = function({ text, lang }) {
    const language = lang || 'plaintext';
    let highlighted = text;
    if (window.hljs && hljs.getLanguage(language)) {
      try {
        highlighted = hljs.highlight(text, { language }).value;
      } catch (e) {
        highlighted = text;
      }
    }

    return `
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-lang-label">${escapeHtml(language)}</span>
          <button class="code-copy-btn" onclick="copyCodeSnippet(this)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
            </svg>
            <span>Copy</span>
          </button>
        </div>
        <pre><code class="hljs language-${escapeHtml(language)}">${highlighted}</code></pre>
      </div>
    `;
  };

  marked.setOptions({
    renderer: renderer,
    gfm: true,
    breaks: true
  });
}

/**
 * Initialize Application
 */
async function initApp() {
  initEventListeners();
  syncSettingsUI();
  adjustTextareaHeight();

  // 1. Fetch backend config (including backend .env Supabase values if available)
  await fetchBackendConfig();

  // 2. Initialize Supabase if configured
  initSupabase();

  // 3. Load active conversation or saved history
  if (state.currentConversationId && state.supabaseConfigured) {
    await loadCloudConversation(state.currentConversationId);
  } else {
    loadSavedHistory();
  }

  // 4. Check backend server status
  await checkBackendStatus();
}

/**
 * Fetch Backend Public Config
 */
async function fetchBackendConfig() {
  try {
    const res = await fetch(`${API_BASE}/api/config`, { cache: 'no-store' });
    if (!res.ok) return;

    const config = await res.json();

    // If client hasn't explicitly entered a URL in local storage, use backend config
    if (!state.settings.supabaseUrl && config.supabaseUrl) {
      state.settings.supabaseUrl = config.supabaseUrl;
    }
    if (!state.settings.supabaseAnonKey && config.supabaseAnonKey) {
      state.settings.supabaseAnonKey = config.supabaseAnonKey;
    }
    if (config.hasSupabase) {
      state.supabaseConfigured = true;
    }

    syncSettingsUI();
  } catch (err) {
    console.warn('Could not fetch backend config:', err);
  }
}

/**
 * Initialize Supabase Client
 */
function initSupabase() {
  const url = state.settings.supabaseUrl.trim();
  const key = state.settings.supabaseAnonKey.trim();

  if (url && key && window.supabase) {
    try {
      state.supabaseClient = supabase.createClient(url, key);
      state.supabaseConfigured = true;
      updateSupabaseIndicator(true);
      fetchConversationsList();
      return true;
    } catch (e) {
      console.error('Supabase initialization failed:', e);
      state.supabaseConfigured = false;
      updateSupabaseIndicator(false);
      return false;
    }
  } else {
    state.supabaseConfigured = false;
    updateSupabaseIndicator(false);
    return false;
  }
}

/**
 * Update Supabase Status Pill
 */
function updateSupabaseIndicator(active) {
  if (active) {
    elements.supabaseIndicator.className = 'status-pill status-supabase-on';
    elements.supabaseStatusText.textContent = 'Cloud Sync: Active';
    elements.supabaseIndicator.title = 'Supabase cloud persistence connected!';
  } else {
    elements.supabaseIndicator.className = 'status-pill status-supabase-off';
    elements.supabaseStatusText.textContent = 'Cloud Sync: Off (Local)';
    elements.supabaseIndicator.title = 'Supabase is not configured. Saving chats to local browser storage.';
  }
}

/**
 * Check Backend Health & Status
 */
async function checkBackendStatus() {
  updateStatusPill('checking', 'Checking server...');

  try {
    const res = await fetch(`${API_BASE}/api/status`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);

    const data = await res.json();
    state.backendOnline = true;
    state.hasBackendKey = data.isKeyConfigured;

    if (data.hasSupabase) {
      state.supabaseConfigured = true;
      updateSupabaseIndicator(true);
    }

    const hasAnyKey = state.hasBackendKey || Boolean(state.settings.apiKey.trim());

    if (hasAnyKey) {
      updateStatusPill('ready', 'Gemini Connected');
      elements.alertBanner.classList.add('hidden');
      elements.settingsBadge.classList.add('hidden');
    } else {
      updateStatusPill('warning', 'API Key Required');
      showAlertBanner('Gemini API Key missing. Please set it in backend/.env or enter it in Settings.');
      elements.settingsBadge.classList.remove('hidden');
    }

    if (Array.isArray(data.supportedModels) && data.supportedModels.length > 0) {
      populateModelDropdown(data.supportedModels);
    }
  } catch (error) {
    console.warn('Backend server not reachable:', error);
    state.backendOnline = false;
    updateStatusPill('error', 'Backend Offline');
    showAlertBanner('Cannot connect to backend server at ' + (API_BASE || 'http://localhost:5000') + '. Run "npm start" inside the backend folder.');
  }
}

function updateStatusPill(type, text) {
  elements.statusIndicator.className = `status-pill status-${type}`;
  elements.statusText.textContent = text;
}

function showAlertBanner(msg) {
  elements.alertMessage.textContent = msg;
  elements.alertBanner.classList.remove('hidden');
}

function populateModelDropdown(models) {
  const currentVal = state.settings.model;
  elements.modelSelect.innerHTML = '';

  models.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id;
    opt.textContent = `${m.name} ${m.badge ? `(${m.badge})` : ''}`;
    if (m.id === currentVal) opt.selected = true;
    elements.modelSelect.appendChild(opt);
  });
}

/**
 * Setup Event Listeners
 */
function initEventListeners() {
  elements.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSendMessage();
  });

  elements.userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  elements.userInput.addEventListener('input', adjustTextareaHeight);
  elements.stopBtn.addEventListener('click', stopGeneration);
  elements.clearChatBtn.addEventListener('click', handleClearChat);
  elements.newChatBtn.addEventListener('click', handleStartNewChat);
  elements.exportChatBtn.addEventListener('click', handleExportChat);

  elements.modelSelect.addEventListener('change', (e) => {
    state.settings.model = e.target.value;
    localStorage.setItem('gemini_model', e.target.value);
  });

  elements.voiceToggleBtn.addEventListener('click', toggleVoiceReadAloud);

  elements.scrollToBottomBtn.addEventListener('click', () => {
    elements.chatViewport.scrollTo({ top: elements.chatViewport.scrollHeight, behavior: 'smooth' });
  });

  elements.chatViewport.addEventListener('scroll', handleViewportScroll);

  elements.bannerActionBtn.addEventListener('click', openSettings);
  elements.dismissAlertBtn.addEventListener('click', () => elements.alertBanner.classList.add('hidden'));

  // Drawer
  elements.openConversationsBtn.addEventListener('click', openDrawer);
  elements.closeDrawerBtn.addEventListener('click', closeDrawer);
  elements.drawerNewChatBtn.addEventListener('click', () => {
    closeDrawer();
    handleStartNewChat();
  });
  elements.refreshConversationsBtn.addEventListener('click', fetchConversationsList);
  elements.conversationsDrawer.addEventListener('click', (e) => {
    if (e.target === elements.conversationsDrawer) closeDrawer();
  });

  // Settings Modal
  elements.openSettingsBtn.addEventListener('click', openSettings);
  elements.closeSettingsBtn.addEventListener('click', closeSettings);
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettings();
  });

  elements.toggleApiKeyVisibility.addEventListener('click', () => {
    const isPassword = elements.apiKeyInput.type === 'password';
    elements.apiKeyInput.type = isPassword ? 'text' : 'password';
  });

  elements.toggleSupabaseKeyVisibility.addEventListener('click', () => {
    const isPassword = elements.supabaseAnonKeyInput.type === 'password';
    elements.supabaseAnonKeyInput.type = isPassword ? 'text' : 'password';
  });

  elements.testSupabaseBtn.addEventListener('click', handleTestSupabaseConnection);
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
  elements.resetSettingsBtn.addEventListener('click', handleResetSettings);

  // Suggestions cards
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt) {
        elements.userInput.value = prompt;
        adjustTextareaHeight();
        handleSendMessage();
      }
    });
  });

  // Chips
  document.querySelectorAll('.chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      const prefix = chip.getAttribute('data-text');
      elements.userInput.value = prefix;
      elements.userInput.focus();
      adjustTextareaHeight();
    });
  });

  // Presets
  document.querySelectorAll('.preset-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      elements.systemPromptInput.value = tag.getAttribute('data-prompt') || '';
    });
  });
}

function adjustTextareaHeight() {
  const input = elements.userInput;
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 180) + 'px';
}

function handleViewportScroll() {
  const vp = elements.chatViewport;
  const isFarFromBottom = vp.scrollHeight - vp.scrollTop - vp.clientHeight > 150;
  if (isFarFromBottom) {
    elements.scrollToBottomBtn.classList.remove('hidden');
  } else {
    elements.scrollToBottomBtn.classList.add('hidden');
  }
}

/**
 * Handle Start New Chat
 */
async function handleStartNewChat() {
  state.currentConversationId = null;
  localStorage.removeItem('gemini_active_conversation_id');
  state.history = [];
  elements.messagesContainer.innerHTML = '';
  if (elements.welcomeScreen) {
    elements.messagesContainer.appendChild(elements.welcomeScreen);
    elements.welcomeScreen.classList.remove('hidden');
  }
  elements.activeConversationTitle.textContent = state.supabaseConfigured ? 'New Session (Cloud Ready)' : 'New Session (Local)';
  showTemporaryToast('Started a new conversation');
}

/**
 * Create a new conversation record in Supabase
 */
async function ensureConversationExists(initialPrompt) {
  if (!state.supabaseConfigured || state.currentConversationId) {
    return state.currentConversationId;
  }

  try {
    const title = initialPrompt.slice(0, 36) + (initialPrompt.length > 36 ? '...' : '');
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });

    if (res.ok) {
      const data = await res.json();
      state.currentConversationId = data.conversation.id;
      localStorage.setItem('gemini_active_conversation_id', state.currentConversationId);
      elements.activeConversationTitle.textContent = title;
      fetchConversationsList();
      return state.currentConversationId;
    }
  } catch (err) {
    console.warn('Failed to create cloud conversation:', err);
  }

  return null;
}

/**
 * Handle Sending a Message
 */
async function handleSendMessage() {
  const text = elements.userInput.value.trim();
  if (!text || state.isGenerating) return;

  elements.userInput.value = '';
  adjustTextareaHeight();

  if (elements.welcomeScreen) {
    elements.welcomeScreen.classList.add('hidden');
  }

  appendMessageToUI('user', text);
  state.history.push({ role: 'user', text, timestamp: new Date().toISOString() });
  saveHistoryToStorage();

  setGenerating(true);

  // If Supabase is enabled, ensure a cloud conversation row exists
  const conversationId = await ensureConversationExists(text);

  const aiMessageBubble = createAiMessageElement(state.settings.model);
  elements.messagesContainer.appendChild(aiMessageBubble.rowElement);
  scrollToBottom();

  const useStreaming = state.settings.stream;

  if (useStreaming) {
    await sendStreamingMessage(text, aiMessageBubble, conversationId);
  } else {
    await sendStandardMessage(text, aiMessageBubble, conversationId);
  }
}

/**
 * Send Message via SSE Streaming
 */
async function sendStreamingMessage(userMessage, aiBubble, conversationId) {
  state.abortController = new AbortController();
  let fullResponseText = '';

  try {
    const payload = {
      message: userMessage,
      history: state.history.slice(0, -1),
      model: state.settings.model,
      systemPrompt: state.settings.systemPrompt,
      apiKey: state.settings.apiKey || undefined,
      conversationId: conversationId || undefined
    };

    const response = await fetch(`${API_BASE}/api/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.replace('data: ', '').trim();
        if (!jsonStr) continue;

        try {
          const parsed = JSON.parse(jsonStr);

          if (parsed.error) {
            throw new Error(parsed.error);
          }

          if (parsed.text) {
            fullResponseText += parsed.text;
            updateAiBubbleContent(aiBubble, fullResponseText, true);
            scrollToBottomIfNear();
          }

          if (parsed.done) {
            break;
          }
        } catch (jsonErr) {
          console.error('Failed to parse SSE chunk:', jsonErr, line);
        }
      }
    }

    updateAiBubbleContent(aiBubble, fullResponseText, false);
    state.history.push({
      role: 'model',
      text: fullResponseText,
      model: state.settings.model,
      timestamp: new Date().toISOString()
    });
    saveHistoryToStorage();

    if (state.voiceEnabled && fullResponseText) {
      speakText(fullResponseText);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      updateAiBubbleContent(aiBubble, fullResponseText + ' *(Generation stopped by user)*', false);
      if (fullResponseText) {
        state.history.push({ role: 'model', text: fullResponseText, model: state.settings.model });
        saveHistoryToStorage();
      }
    } else {
      console.error('Streaming error:', error);
      updateAiBubbleError(aiBubble, error.message);
    }
  } finally {
    setGenerating(false);
    state.abortController = null;
  }
}

/**
 * Standard Non-Streaming Message
 */
async function sendStandardMessage(userMessage, aiBubble, conversationId) {
  state.abortController = new AbortController();

  try {
    updateAiBubbleContent(aiBubble, 'Thinking...', true);

    const payload = {
      message: userMessage,
      history: state.history.slice(0, -1),
      model: state.settings.model,
      systemPrompt: state.settings.systemPrompt,
      apiKey: state.settings.apiKey || undefined,
      conversationId: conversationId || undefined
    };

    const response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: state.abortController.signal
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const reply = data.reply || '';
    updateAiBubbleContent(aiBubble, reply, false);

    state.history.push({
      role: 'model',
      text: reply,
      model: state.settings.model,
      timestamp: new Date().toISOString()
    });
    saveHistoryToStorage();

    if (state.voiceEnabled && reply) {
      speakText(reply);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      updateAiBubbleContent(aiBubble, '*(Generation stopped)*', false);
    } else {
      updateAiBubbleError(aiBubble, error.message);
    }
  } finally {
    setGenerating(false);
    state.abortController = null;
  }
}

function stopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

function setGenerating(isGen) {
  state.isGenerating = isGen;
  elements.sendBtn.disabled = isGen;
  elements.userInput.disabled = isGen;

  if (isGen) {
    elements.stopBtn.classList.remove('hidden');
    elements.sendBtn.classList.add('hidden');
  } else {
    elements.stopBtn.classList.add('hidden');
    elements.sendBtn.classList.remove('hidden');
    elements.userInput.focus();
  }
}

function appendMessageToUI(role, text, model = null, timestamp = null) {
  if (role === 'user') {
    const row = document.createElement('div');
    row.className = 'message-row user-row';
    row.innerHTML = `
      <div class="message-avatar user-avatar" title="You">You</div>
      <div class="message-bubble">
        <p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>
        <div class="message-meta">
          <span>${formatTime(timestamp || new Date())}</span>
          <div class="message-actions">
            <button class="mini-action-btn" title="Copy text" onclick="copyRawText(${JSON.stringify(text)})">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;
    elements.messagesContainer.appendChild(row);
  } else {
    const bubble = createAiMessageElement(model || state.settings.model);
    elements.messagesContainer.appendChild(bubble.rowElement);
    updateAiBubbleContent(bubble, text, false);
  }
  scrollToBottom();
}

function createAiMessageElement(modelName) {
  const row = document.createElement('div');
  row.className = 'message-row ai-row';

  const avatar = document.createElement('div');
  avatar.className = 'message-avatar gemini-avatar';
  avatar.title = 'Gemini AI';
  avatar.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="url(#sparkleGradient)"/>
    </svg>
  `;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const contentBox = document.createElement('div');
  contentBox.className = 'message-content-box';
  contentBox.innerHTML = '<span class="streaming-cursor"></span>';

  const metaBox = document.createElement('div');
  metaBox.className = 'message-meta';
  metaBox.innerHTML = `
    <span class="model-tag">${escapeHtml(modelName || 'Gemini')}</span>
    <div class="message-actions">
      <button class="mini-action-btn copy-msg-btn" title="Copy response">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </svg>
      </button>
      <button class="mini-action-btn speak-msg-btn" title="Read aloud">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      </button>
    </div>
  `;

  bubble.appendChild(contentBox);
  bubble.appendChild(metaBox);
  row.appendChild(avatar);
  row.appendChild(bubble);

  return {
    rowElement: row,
    contentBox: contentBox,
    metaBox: metaBox
  };
}

function updateAiBubbleContent(bubbleObj, markdownText, isStreaming) {
  let html = '';
  if (window.marked && markdownText) {
    try {
      html = marked.parse(markdownText);
    } catch (e) {
      html = escapeHtml(markdownText).replace(/\n/g, '<br>');
    }
  } else {
    html = escapeHtml(markdownText).replace(/\n/g, '<br>');
  }

  if (isStreaming) {
    html += '<span class="streaming-cursor"></span>';
  }

  bubbleObj.contentBox.innerHTML = html;

  const copyBtn = bubbleObj.metaBox.querySelector('.copy-msg-btn');
  if (copyBtn) {
    copyBtn.onclick = () => copyRawText(markdownText);
  }

  const speakBtn = bubbleObj.metaBox.querySelector('.speak-msg-btn');
  if (speakBtn) {
    speakBtn.onclick = () => speakText(markdownText);
  }
}

function updateAiBubbleError(bubbleObj, errorMessage) {
  bubbleObj.contentBox.innerHTML = `
    <div style="color: #fb7185; background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.25); padding: 12px; border-radius: 8px;">
      <strong>⚠️ Error:</strong> ${escapeHtml(errorMessage)}
      <div style="margin-top: 8px; font-size: 0.8rem; color: #cbd5e1;">
        Tip: Make sure you have entered a valid Gemini API key in backend/.env or in the Settings modal.
      </div>
    </div>
  `;
}

function toggleVoiceReadAloud() {
  state.voiceEnabled = !state.voiceEnabled;
  elements.voiceToggleBtn.classList.toggle('active', state.voiceEnabled);
  elements.voiceIconMuted.classList.toggle('hidden', state.voiceEnabled);
  elements.voiceIconActive.classList.toggle('hidden', !state.voiceEnabled);

  if (!state.voiceEnabled && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function speakText(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[#*`_~\[\]]/g, '');

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

window.copyCodeSnippet = function(buttonElement) {
  const codeBlock = buttonElement.closest('.code-block-wrapper').querySelector('code');
  if (!codeBlock) return;

  const codeText = codeBlock.innerText;
  navigator.clipboard.writeText(codeText).then(() => {
    const label = buttonElement.querySelector('span');
    const originalText = label.textContent;
    label.textContent = 'Copied!';
    buttonElement.style.color = '#34d399';
    buttonElement.style.borderColor = '#34d399';

    setTimeout(() => {
      label.textContent = originalText;
      buttonElement.style.color = '';
      buttonElement.style.borderColor = '';
    }, 2000);
  });
};

window.copyRawText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    showTemporaryToast('Copied to clipboard!');
  });
};

function showTemporaryToast(msg) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #f8fafc;
    padding: 8px 18px;
    border-radius: 9999px;
    font-size: 0.85rem;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2200);
}

function handleClearChat() {
  if (state.history.length === 0) return;
  if (!confirm('Are you sure you want to clear the current message view?')) return;

  state.history = [];
  localStorage.removeItem('gemini_chat_history');
  elements.messagesContainer.innerHTML = '';
  if (elements.welcomeScreen) {
    elements.messagesContainer.appendChild(elements.welcomeScreen);
    elements.welcomeScreen.classList.remove('hidden');
  }
}

function handleExportChat() {
  if (state.history.length === 0) {
    alert('No conversation history to export.');
    return;
  }

  let mdContent = `# Gemini Chatbot Conversation Export\n`;
  mdContent += `*Date: ${new Date().toLocaleString()}*\n\n---\n\n`;

  state.history.forEach(item => {
    const roleTitle = item.role === 'user' ? '### 👤 User' : `### 🤖 Gemini (${item.model || 'Gemini'})`;
    mdContent += `${roleTitle}\n\n${item.text}\n\n---\n\n`;
  });

  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gemini-chat-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Cloud Conversations Drawer Handlers
 */
function openDrawer() {
  elements.conversationsDrawer.classList.remove('hidden');
  fetchConversationsList();
}

function closeDrawer() {
  elements.conversationsDrawer.classList.add('hidden');
}

async function fetchConversationsList() {
  if (!state.supabaseConfigured) {
    elements.conversationsList.innerHTML = `
      <div class="drawer-empty">
        <p>Supabase is not configured yet.</p>
        <p style="font-size:0.75rem; margin-top:8px; color:#94a3b8;">
          Configure <strong>SUPABASE_URL</strong> and <strong>SUPABASE_ANON_KEY</strong> in Settings or <code>backend/.env</code> to unlock cloud storage.
        </p>
      </div>
    `;
    elements.conversationsCount.classList.add('hidden');
    return;
  }

  try {
    elements.conversationsList.innerHTML = '<div class="drawer-loading">Loading cloud conversations...</div>';
    const res = await fetch(`${API_BASE}/api/conversations`);
    if (!res.ok) throw new Error('Could not fetch conversations');

    const data = await res.json();
    const list = data.conversations || [];
    state.conversationsList = list;

    if (list.length > 0) {
      elements.conversationsCount.textContent = list.length;
      elements.conversationsCount.classList.remove('hidden');
    } else {
      elements.conversationsCount.classList.add('hidden');
    }

    renderConversationsList(list);
  } catch (err) {
    elements.conversationsList.innerHTML = `
      <div class="drawer-empty" style="color:#fb7185;">
        Failed to load cloud conversations: ${escapeHtml(err.message)}
      </div>
    `;
  }
}

function renderConversationsList(list) {
  if (list.length === 0) {
    elements.conversationsList.innerHTML = `
      <div class="drawer-empty">
        No cloud conversations found. Start chatting to save your first cloud chat!
      </div>
    `;
    return;
  }

  elements.conversationsList.innerHTML = '';
  list.forEach(conv => {
    const card = document.createElement('div');
    card.className = `conversation-card ${conv.id === state.currentConversationId ? 'active' : ''}`;
    card.innerHTML = `
      <div class="conversation-info">
        <span class="conversation-title">${escapeHtml(conv.title || 'Untitled Chat')}</span>
        <span class="conversation-date">${new Date(conv.updated_at || conv.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <button class="conversation-delete-btn" title="Delete conversation" data-id="${conv.id}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    // Click card to switch conversation
    card.addEventListener('click', (e) => {
      if (e.target.closest('.conversation-delete-btn')) return;
      loadCloudConversation(conv.id, conv.title);
      closeDrawer();
    });

    // Delete button
    const delBtn = card.querySelector('.conversation-delete-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteCloudConversation(conv.id);
    });

    elements.conversationsList.appendChild(card);
  });
}

async function loadCloudConversation(convId, title = null) {
  try {
    const res = await fetch(`${API_BASE}/api/conversations/${convId}/messages`);
    if (!res.ok) throw new Error('Could not fetch messages');

    const data = await res.json();
    const messages = data.messages || [];

    state.currentConversationId = convId;
    localStorage.setItem('gemini_active_conversation_id', convId);

    // Clear and populate messages
    state.history = [];
    elements.messagesContainer.innerHTML = '';
    if (elements.welcomeScreen) {
      elements.welcomeScreen.classList.add('hidden');
    }

    if (title) {
      elements.activeConversationTitle.textContent = title;
    }

    messages.forEach(m => {
      appendMessageToUI(m.role, m.text, m.model, m.created_at);
      state.history.push({
        role: m.role,
        text: m.text,
        model: m.model,
        timestamp: m.created_at
      });
    });

    scrollToBottom();
    showTemporaryToast('Loaded cloud conversation');
  } catch (err) {
    console.error('Error loading cloud conversation:', err);
    showTemporaryToast('Failed to load conversation');
  }
}

async function handleDeleteCloudConversation(convId) {
  if (!confirm('Delete this conversation from Supabase?')) return;

  try {
    const res = await fetch(`${API_BASE}/api/conversations/${convId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Could not delete');

    if (state.currentConversationId === convId) {
      handleStartNewChat();
    }

    fetchConversationsList();
    showTemporaryToast('Conversation deleted');
  } catch (err) {
    alert('Delete failed: ' + err.message);
  }
}

/**
 * Settings Handlers
 */
function openSettings() {
  elements.apiKeyInput.value = state.settings.apiKey;
  elements.supabaseUrlInput.value = state.settings.supabaseUrl;
  elements.supabaseAnonKeyInput.value = state.settings.supabaseAnonKey;
  elements.systemPromptInput.value = state.settings.systemPrompt;
  elements.streamToggle.checked = state.settings.stream;
  elements.supabaseTestStatus.textContent = '';
  elements.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  elements.settingsModal.classList.add('hidden');
}

async function handleTestSupabaseConnection() {
  elements.supabaseTestStatus.style.color = '#38bdf8';
  elements.supabaseTestStatus.textContent = 'Testing connection...';

  try {
    const res = await fetch(`${API_BASE}/api/supabase/status`);
    const data = await res.json();

    if (data.connected) {
      elements.supabaseTestStatus.style.color = '#34d399';
      elements.supabaseTestStatus.textContent = 'Connected successfully!';
    } else {
      elements.supabaseTestStatus.style.color = '#fb7185';
      elements.supabaseTestStatus.textContent = data.message || 'Connection failed';
    }
  } catch (err) {
    elements.supabaseTestStatus.style.color = '#fb7185';
    elements.supabaseTestStatus.textContent = 'Backend unreachable';
  }
}

function handleSaveSettings() {
  const newApiKey = elements.apiKeyInput.value.trim();
  const newSupabaseUrl = elements.supabaseUrlInput.value.trim();
  const newSupabaseAnonKey = elements.supabaseAnonKeyInput.value.trim();
  const newSystemPrompt = elements.systemPromptInput.value.trim();
  const newStream = elements.streamToggle.checked;

  state.settings.apiKey = newApiKey;
  state.settings.supabaseUrl = newSupabaseUrl;
  state.settings.supabaseAnonKey = newSupabaseAnonKey;
  state.settings.systemPrompt = newSystemPrompt;
  state.settings.stream = newStream;

  if (newApiKey) localStorage.setItem('gemini_user_api_key', newApiKey);
  else localStorage.removeItem('gemini_user_api_key');

  if (newSupabaseUrl) localStorage.setItem('supabase_user_url', newSupabaseUrl);
  else localStorage.removeItem('supabase_user_url');

  if (newSupabaseAnonKey) localStorage.setItem('supabase_user_anon_key', newSupabaseAnonKey);
  else localStorage.removeItem('supabase_user_anon_key');

  localStorage.setItem('gemini_system_prompt', newSystemPrompt);
  localStorage.setItem('gemini_stream', String(newStream));

  initSupabase();
  closeSettings();
  checkBackendStatus();
  showTemporaryToast('Settings saved successfully!');
}

function handleResetSettings() {
  if (!confirm('Reset all settings to default values?')) return;
  elements.apiKeyInput.value = '';
  elements.supabaseUrlInput.value = '';
  elements.supabaseAnonKeyInput.value = '';
  elements.systemPromptInput.value = '';
  elements.streamToggle.checked = true;
}

function syncSettingsUI() {
  if (state.settings.model) {
    elements.modelSelect.value = state.settings.model;
  }
  if (state.settings.supabaseUrl) {
    elements.supabaseUrlInput.value = state.settings.supabaseUrl;
  }
  if (state.settings.supabaseAnonKey) {
    elements.supabaseAnonKeyInput.value = state.settings.supabaseAnonKey;
  }
}

function saveHistoryToStorage() {
  try {
    localStorage.setItem('gemini_chat_history', JSON.stringify(state.history));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

function loadSavedHistory() {
  try {
    const saved = localStorage.getItem('gemini_chat_history');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.history = parsed;
        if (elements.welcomeScreen) {
          elements.welcomeScreen.classList.add('hidden');
        }
        parsed.forEach(msg => {
          appendMessageToUI(msg.role, msg.text, msg.model, msg.timestamp);
        });
      }
    }
  } catch (e) {
    console.error('Failed to load history:', e);
  }
}

function scrollToBottom() {
  elements.chatViewport.scrollTo({
    top: elements.chatViewport.scrollHeight,
    behavior: 'smooth'
  });
}

function scrollToBottomIfNear() {
  const vp = elements.chatViewport;
  const isNear = vp.scrollHeight - vp.scrollTop - vp.clientHeight < 200;
  if (isNear) {
    vp.scrollTop = vp.scrollHeight;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatTime(dateStr) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
}

// Kickoff
document.addEventListener('DOMContentLoaded', initApp);
