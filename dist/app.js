// WhatsApp Dashboard Client Application & Subagent Testability Engine

(function () {
  let isReadyState = false;
  let isAuthenticated = false;
  let activeView = 'chat'; // 'chat' or 'waitlist'
  let currentConversations = [];
  let activeCustomer = null;
  let currentMessages = [];
  let currentStats = null;
  let currentWaitlist = [];

  // DOM Elements - Navigation & Views
  const btnViewChatEl = document.getElementById('btn-view-chat');
  const btnViewWaitlistEl = document.getElementById('btn-view-waitlist');
  const badgeWaitlistCountEl = document.getElementById('badge-waitlist-count');
  const chatViewEl = document.getElementById('chat-view');
  const waitlistViewEl = document.getElementById('waitlist-view');
  const inputWaitlistSearchEl = document.getElementById('input-waitlist-search');
  const btnWaitlistRefreshEl = document.getElementById('btn-waitlist-refresh');
  const waitlistListEl = document.getElementById('waitlist-list');
  const waitlistEmptyEl = document.getElementById('waitlist-empty');

  // DOM Elements - Chat & Conversations
  const convListEl = document.getElementById('conv-list');
  const chatEmptyEl = document.getElementById('chat-empty');
  const chatHeaderEl = document.getElementById('chat-header');
  const chatTitleNameEl = document.getElementById('chat-title-name');
  const chatTitleIdEl = document.getElementById('chat-title-id');
  const chatCswPillEl = document.getElementById('chat-csw-pill');
  const messagesContainerEl = document.getElementById('messages-container');
  const composerPaneEl = document.getElementById('composer-pane');
  const inputMsgEl = document.getElementById('input-msg');
  const btnSendEl = document.getElementById('btn-send');
  const bannerCswClosedEl = document.getElementById('banner-csw-closed');
  const inputSearchEl = document.getElementById('input-search');

  // Stats DOM
  const valMonthlyCswEl = document.getElementById('val-monthly-csw');
  const valDailyTierEl = document.getElementById('val-daily-tier');
  const valWalletEl = document.getElementById('val-wallet');
  const textR2StatEl = document.getElementById('text-r2-stat');
  const badgeR2StatusEl = document.getElementById('badge-r2-status');

  // Auth DOM
  const authModalEl = document.getElementById('auth-modal');
  const inputAuthEmailEl = document.getElementById('input-auth-email');
  const inputAuthPasswordEl = document.getElementById('input-auth-password');
  const btnAuthLoginEl = document.getElementById('btn-auth-login');
  const authErrorEl = document.getElementById('auth-error');
  const authWaitlistNoticeEl = document.getElementById('auth-waitlist-notice');
  const authWaitlistMsgEl = document.getElementById('auth-waitlist-msg');
  const btnAuthLogoutEl = document.getElementById('btn-auth-logout');
  const mainEl = document.querySelector('main');
  const metricsGroupEl = document.getElementById('metrics-group');

  // Native fetch reference & global 401 interceptor
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const res = await nativeFetch(input, init);
    const urlStr = typeof input === 'string' ? input : (input && input.url ? input.url : '');
    if (res && res.status === 401 && !urlStr.includes('/api/auth/login')) {
      setAuthenticatedState(false);
    }
    return res;
  };

  // Auth State Controller
  function setAuthenticatedState(authed) {
    isAuthenticated = Boolean(authed);
    if (isAuthenticated) {
      if (authModalEl) authModalEl.style.display = 'none';
      if (mainEl) mainEl.style.display = 'flex';
      if (metricsGroupEl) metricsGroupEl.style.display = 'flex';
      if (btnAuthLogoutEl) btnAuthLogoutEl.style.display = 'inline-flex';
      if (authErrorEl) {
        authErrorEl.style.display = 'none';
        authErrorEl.textContent = '';
      }
      if (authWaitlistNoticeEl) {
        authWaitlistNoticeEl.style.display = 'none';
      }
    } else {
      if (authModalEl) authModalEl.style.display = 'flex';
      if (mainEl) mainEl.style.display = 'none';
      if (metricsGroupEl) metricsGroupEl.style.display = 'none';
      if (btnAuthLogoutEl) btnAuthLogoutEl.style.display = 'none';
      if (inputAuthPasswordEl) {
        inputAuthPasswordEl.value = '';
      }
    }
  }

  // View Switcher: 'chat' | 'waitlist'
  function switchView(viewName) {
    activeView = viewName === 'waitlist' ? 'waitlist' : 'chat';
    if (activeView === 'waitlist') {
      if (chatViewEl) chatViewEl.style.display = 'none';
      if (waitlistViewEl) waitlistViewEl.style.display = 'flex';
      if (btnViewChatEl) btnViewChatEl.classList.remove('active');
      if (btnViewWaitlistEl) btnViewWaitlistEl.classList.add('active');
      loadWaitlist();
    } else {
      if (waitlistViewEl) waitlistViewEl.style.display = 'none';
      if (chatViewEl) chatViewEl.style.display = 'flex';
      if (btnViewWaitlistEl) btnViewWaitlistEl.classList.remove('active');
      if (btnViewChatEl) btnViewChatEl.classList.add('active');
    }
  }

  // Perform Login
  async function performLogin(emailParam, passwordParam) {
    let email = emailParam;
    let pwd = passwordParam;

    if (email === undefined && pwd === undefined) {
      email = inputAuthEmailEl ? inputAuthEmailEl.value.trim() : '';
      pwd = inputAuthPasswordEl ? inputAuthPasswordEl.value : '';
    } else if (pwd === undefined) {
      // Single parameter call: if it contains @, treat as email; else password
      if (typeof email === 'string' && email.includes('@')) {
        pwd = '[REDACTED]';
      } else {
        pwd = email;
        email = 'connectwithsanthoshmk@gmail.com';
      }
    }

    if (!email) {
      if (authErrorEl) {
        authErrorEl.textContent = 'Please enter an email address.';
        authErrorEl.style.display = 'block';
      }
      if (authWaitlistNoticeEl) authWaitlistNoticeEl.style.display = 'none';
      return false;
    }

    if (!pwd) {
      if (authErrorEl) {
        authErrorEl.textContent = 'Please enter a password.';
        authErrorEl.style.display = 'block';
      }
      if (authWaitlistNoticeEl) authWaitlistNoticeEl.style.display = 'none';
      return false;
    }

    if (btnAuthLoginEl) btnAuthLoginEl.disabled = true;
    try {
      const res = await nativeFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pwd })
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 403) {
        // Account Waitlisted
        if (authErrorEl) authErrorEl.style.display = 'none';
        if (authWaitlistNoticeEl) {
          authWaitlistNoticeEl.style.display = 'flex';
          if (authWaitlistMsgEl) {
            authWaitlistMsgEl.textContent = data.message || 'This account is waitlisted. An administrator will review your access request.';
          }
        }
        setAuthenticatedState(false);
        isReadyState = true;
        return false;
      }

      if (res.ok) {
        // Successful Admin Login
        setAuthenticatedState(true);
        if (inputAuthPasswordEl) inputAuthPasswordEl.value = '';
        if (authErrorEl) {
          authErrorEl.textContent = '';
          authErrorEl.style.display = 'none';
        }
        if (authWaitlistNoticeEl) {
          authWaitlistNoticeEl.style.display = 'none';
        }
        await Promise.all([loadStats(), loadConversations(), loadWaitlist()]);
        isReadyState = true;
        return true;
      } else {
        // Invalid Credentials
        if (authWaitlistNoticeEl) authWaitlistNoticeEl.style.display = 'none';
        if (authErrorEl) {
          authErrorEl.textContent = data.message || data.error || 'Incorrect password.';
          authErrorEl.style.display = 'block';
        }
        setAuthenticatedState(false);
        isReadyState = true;
        return false;
      }
    } catch (err) {
      if (authWaitlistNoticeEl) authWaitlistNoticeEl.style.display = 'none';
      if (authErrorEl) {
        authErrorEl.textContent = `Login failed: ${err.message}`;
        authErrorEl.style.display = 'block';
      }
      setAuthenticatedState(false);
      isReadyState = true;
      return false;
    } finally {
      if (btnAuthLoginEl) btnAuthLoginEl.disabled = false;
    }
  }

  // Perform Logout
  async function performLogout() {
    try {
      await nativeFetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.warn('Logout error:', err);
    }
    activeCustomer = null;
    currentConversations = [];
    currentMessages = [];
    currentStats = null;
    currentWaitlist = [];
    setAuthenticatedState(false);
    isReadyState = true;
    return true;
  }

  // Fetch Usage Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      currentStats = await res.json();

      valMonthlyCswEl.textContent = `${currentStats.monthlyServiceCount} / ${currentStats.monthlyServiceLimit} Free`;
      valDailyTierEl.textContent = `${currentStats.dailyRecipientsCount} / ${currentStats.dailyRecipientsLimit}`;
      valWalletEl.textContent = `$${currentStats.walletBalance.toFixed(2)} ${currentStats.currency}`;

      const r2Mb = (currentStats.r2.storageBytes / (1024 * 1024)).toFixed(2);
      textR2StatEl.textContent = `${r2Mb} MB / 9.00 GB`;

      if (currentStats.r2.isCapped) {
        badgeR2StatusEl.textContent = 'CAPPED';
        badgeR2StatusEl.className = 'badge badge-danger';
      } else {
        badgeR2StatusEl.textContent = 'SAFE';
        badgeR2StatusEl.className = 'badge badge-success';
      }
    } catch (err) {
      console.warn('Failed to load stats:', err);
    }
  }

  // Fetch Waitlist
  async function loadWaitlist() {
    try {
      const res = await fetch('/api/waitlist');
      if (!res.ok) return;
      const data = await res.json();
      currentWaitlist = data.waitlist || [];
      if (badgeWaitlistCountEl) {
        badgeWaitlistCountEl.textContent = currentWaitlist.length;
      }
      renderWaitlist();
    } catch (err) {
      console.warn('Failed to load waitlist:', err);
    }
  }

  // Render Waitlist Table
  function renderWaitlist() {
    if (!waitlistListEl) return;
    waitlistListEl.innerHTML = '';

    const filter = (inputWaitlistSearchEl?.value || '').toLowerCase().trim();
    const filtered = currentWaitlist.filter(w => w.email.toLowerCase().includes(filter));

    if (filtered.length === 0) {
      if (waitlistEmptyEl) waitlistEmptyEl.style.display = 'flex';
      return;
    }

    if (waitlistEmptyEl) waitlistEmptyEl.style.display = 'none';

    filtered.forEach(entry => {
      const tr = document.createElement('tr');
      const firstSeen = new Date(entry.created_at * 1000).toLocaleString();
      const lastAttempt = new Date(entry.last_attempt_at * 1000).toLocaleString();

      tr.innerHTML = `
        <td class="waitlist-email">${escapeHtml(entry.email)}</td>
        <td><span class="badge badge-warning" style="font-size: 0.72rem;">${escapeHtml(entry.status || 'pending')}</span></td>
        <td class="waitlist-attempts">${entry.attempt_count} attempt${entry.attempt_count > 1 ? 's' : ''}</td>
        <td class="waitlist-time">${firstSeen}</td>
        <td class="waitlist-time">${lastAttempt}</td>
      `;
      waitlistListEl.appendChild(tr);
    });
  }

  // Fetch Conversation List
  async function loadConversations() {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) return;
      const data = await res.json();
      currentConversations = data.conversations || [];
      renderConversations();
    } catch (err) {
      console.warn('Failed to load conversations:', err);
    }
  }

  // Render Conversation List
  function renderConversations() {
    convListEl.innerHTML = '';
    const filter = (inputSearchEl?.value || '').toLowerCase().trim();

    const filtered = currentConversations.filter(c => 
      (c.name || '').toLowerCase().includes(filter) ||
      c.phoneNumber.includes(filter) ||
      c.id.toLowerCase().includes(filter)
    );

    if (filtered.length === 0) {
      convListEl.innerHTML = '<div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">No active conversations yet.</div>';
      return;
    }

    filtered.forEach(c => {
      const item = document.createElement('div');
      item.id = `conv-${c.waId}`;
      item.className = `conv-item ${activeCustomer && activeCustomer.waId === c.waId ? 'active' : ''}`;

      const cswClass = c.csw.isActive ? 'csw-active' : 'csw-closed';
      const lastMsgText = c.lastMessage?.body || `[${c.lastMessage?.type || 'Message'}]`;

      const displayName = c.name || c.phoneNumber || 'User';
      let initials = 'WA';
      if (c.name) {
        const words = c.name.trim().split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
          initials = (words[0][0] + words[1][0]).toUpperCase();
        } else if (words.length === 1 && words[0].length >= 2) {
          initials = words[0].slice(0, 2).toUpperCase();
        } else if (words.length === 1) {
          initials = words[0].slice(0, 1).toUpperCase();
        }
      }

      item.innerHTML = `
        <div class="conv-avatar">${escapeHtml(initials)}</div>
        <div class="conv-content">
          <div class="conv-header">
            <span class="conv-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
            <span class="conv-cust-id">${escapeHtml(c.id)}</span>
          </div>
          <div class="conv-snippet">${escapeHtml(lastMsgText)}</div>
          <div class="conv-footer">
            <span class="conv-csw ${cswClass}">${escapeHtml(c.csw.label)}</span>
          </div>
        </div>
      `;

      item.addEventListener('click', () => selectCustomer(c.waId));
      convListEl.appendChild(item);
    });
  }

  // Select a Customer and load messages
  async function selectCustomer(waId) {
    activeCustomer = currentConversations.find(c => c.waId === waId) || null;
    if (!activeCustomer) return false;

    renderConversations();

    const headerAvatarEl = document.getElementById('chat-header-avatar');
    if (headerAvatarEl) {
      let initials = 'WA';
      if (activeCustomer.name) {
        const words = activeCustomer.name.trim().split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
          initials = (words[0][0] + words[1][0]).toUpperCase();
        } else if (words.length === 1 && words[0].length >= 2) {
          initials = words[0].slice(0, 2).toUpperCase();
        } else if (words.length === 1) {
          initials = words[0].slice(0, 1).toUpperCase();
        }
      }
      headerAvatarEl.textContent = initials;
    }

    // Update Chat Header
    chatEmptyEl.style.display = 'none';
    chatHeaderEl.style.display = 'flex';
    messagesContainerEl.style.display = 'flex';
    composerPaneEl.style.display = 'flex';

    chatTitleNameEl.textContent = activeCustomer.name || activeCustomer.phoneNumber;
    chatTitleIdEl.textContent = `ID: ${activeCustomer.id} | Phone: ${activeCustomer.phoneNumber}`;

    const cswClass = activeCustomer.csw.isActive ? 'csw-active' : 'csw-closed';
    chatCswPillEl.className = `conv-csw ${cswClass}`;
    chatCswPillEl.textContent = activeCustomer.csw.label;

    // CSW closed banner & composer lock
    if (!activeCustomer.csw.isActive) {
      bannerCswClosedEl.style.display = 'flex';
      inputMsgEl.disabled = true;
      btnSendEl.disabled = true;
      inputMsgEl.placeholder = 'Customer service window closed (>24h).';
    } else {
      bannerCswClosedEl.style.display = 'none';
      inputMsgEl.disabled = false;
      btnSendEl.disabled = false;
      inputMsgEl.placeholder = 'Type a message...';
    }

    // Load Messages
    try {
      const res = await fetch(`/api/messages/${waId}`);
      if (res.ok) {
        const data = await res.json();
        currentMessages = data.messages || [];
        renderMessages();
      }
    } catch (err) {
      console.warn('Failed to load messages for', waId, err);
    }

    return true;
  }

  // Render Message Thread
  function renderMessages() {
    messagesContainerEl.innerHTML = '';

    if (currentMessages.length === 0) {
      messagesContainerEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 2rem;">No messages yet.</div>';
      return;
    }

    currentMessages.forEach(msg => {
      const row = document.createElement('div');
      row.id = `msg-${msg.id}`;
      row.className = `msg-row ${msg.direction}`;

      let mediaHtml = '';
      if (msg.status === 'media_capped_free_limit') {
        mediaHtml = `
          <div class="capped-alert-card">
            <strong>R2 Free Limit Reached - Media Capped</strong>
            <div>Media download was skipped to prevent billing. Conversation text is preserved.</div>
          </div>
        `;
      } else if (msg.media_url) {
        if (msg.media_mime && msg.media_mime.startsWith('image/')) {
          mediaHtml = `
            <div class="media-card">
              <img src="${msg.media_url}" alt="WhatsApp image" loading="lazy">
            </div>
          `;
        } else if (msg.media_mime && msg.media_mime.startsWith('audio/')) {
          mediaHtml = `
            <div class="media-card">
              <audio controls src="${msg.media_url}"></audio>
            </div>
          `;
        } else {
          mediaHtml = `
            <a class="file-download-btn" href="${msg.media_url}" target="_blank" download="${escapeHtml(msg.media_filename || 'download')}">
              Download ${escapeHtml(msg.media_filename || 'Document')} (${formatBytes(msg.media_size || 0)})
            </a>
          `;
        }
      }

      let errorHtml = '';
      if (msg.status === 'failed') {
        errorHtml = `
          <div style="color: #f87171; font-size: 0.75rem; margin-top: 0.25rem;">
            Failed: ${escapeHtml(msg.error_message || msg.error_code || 'Delivery error')}
          </div>
        `;
      }

      const timeStr = new Date(msg.created_at * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const statusClass = `status-${msg.status}`;

      row.innerHTML = `
        <div class="msg-bubble">
          ${msg.body ? `<div>${escapeHtml(msg.body)}</div>` : ''}
          ${mediaHtml}
          ${errorHtml}
        </div>
        <div class="msg-footer">
          <span>${timeStr}</span>
          ${msg.direction === 'outbound' ? `<span class="msg-status ${statusClass}">• ${msg.status}</span>` : ''}
        </div>
      `;

      messagesContainerEl.appendChild(row);
    });

    messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
  }

  // Send Message
  async function sendMessage(text) {
    if (!activeCustomer) return { success: false, error: 'No active conversation' };
    const content = text || inputMsgEl.value.trim();
    if (!content) return { success: false, error: 'Empty message' };

    btnSendEl.disabled = true;
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: activeCustomer.waId, text: content })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`Error: ${data.message || data.error}`);
        btnSendEl.disabled = false;
        return { success: false, error: data.message || data.error };
      }

      inputMsgEl.value = '';
      btnSendEl.disabled = false;

      // Refresh chat & stats
      await selectCustomer(activeCustomer.waId);
      await loadStats();
      return { success: true };
    } catch (err) {
      alert(`Send failed: ${err.message}`);
      btnSendEl.disabled = false;
      return { success: false, error: err.message };
    }
  }

  // Event Listeners
  btnSendEl?.addEventListener('click', () => sendMessage());
  inputMsgEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  inputSearchEl?.addEventListener('input', renderConversations);

  // View Switcher Event Listeners
  btnViewChatEl?.addEventListener('click', () => switchView('chat'));
  btnViewWaitlistEl?.addEventListener('click', () => switchView('waitlist'));
  btnWaitlistRefreshEl?.addEventListener('click', () => loadWaitlist());
  inputWaitlistSearchEl?.addEventListener('input', renderWaitlist);

  if (btnAuthLoginEl) {
    btnAuthLoginEl.addEventListener('click', (e) => {
      e.preventDefault();
      performLogin();
    });
  }

  if (inputAuthPasswordEl) {
    inputAuthPasswordEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performLogin();
      }
    });
  }

  if (btnAuthLogoutEl) {
    btnAuthLogoutEl.addEventListener('click', (e) => {
      e.preventDefault();
      performLogout();
    });
  }

  // Helper Utilities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // =========================================================================
  // SUBAGENT TESTABILITY ENGINE (window.site)
  // Allows AI subagents to navigate, inspect, and click without screenshots
  // =========================================================================
  window.site = {
    isReady: () => isReadyState,

    login: async (emailOrPassword, maybePassword) => {
      return await performLogin(emailOrPassword, maybePassword);
    },

    logout: async () => {
      return await performLogout();
    },

    switchView: (viewName) => {
      switchView(viewName);
      return activeView;
    },

    getWaitlist: () => currentWaitlist,

    getState: () => {
      const r2 = currentStats?.r2 || {
        storageBytes: 0,
        classAOps: 0,
        classBOps: 0,
        isCapped: false,
        activeCapReason: null
      };

      return {
        isAuthenticated: isAuthenticated,
        activeView: activeView,
        route: !isAuthenticated ? '/login' : (activeView === 'waitlist' ? '/waitlist' : (activeCustomer ? `/chat/${activeCustomer.waId}` : '/conversations')),
        activeCustomerWaId: activeCustomer?.waId || null,
        activeCustomerId: activeCustomer?.id || null,
        customerCount: currentConversations.length,
        messageCount: currentMessages.length,
        waitlistCount: currentWaitlist.length,
        freeMonthlyRemaining: currentStats ? (currentStats.monthlyServiceLimit - currentStats.monthlyServiceCount) : 1000,
        dailyRemaining: currentStats ? (currentStats.dailyRecipientsLimit - currentStats.dailyRecipientsCount) : 250,
        cswActive: activeCustomer?.csw.isActive || false,
        cswRemainingMinutes: activeCustomer?.csw.remainingMinutes || 0,
        r2Usage: {
          storageBytes: r2.storageBytes,
          storageMb: Number((r2.storageBytes / (1024 * 1024)).toFixed(2)),
          classAOps: r2.classAOps,
          isCapped: r2.isCapped,
          activeCapReason: r2.activeCapReason
        }
      };
    },

    getAsciiDiagram: () => {
      if (!isAuthenticated) {
        let out = '';
        out += '+-----------------------------------------------------------------------------------------+\n';
        out += '|                           WHATSAPP BUSINESS HUB - LOGIN                                 |\n';
        out += '+-----------------------------------------------------------------------------------------+\n';
        out += '|                                                                                         |\n';
        out += '|                            +-------------------------------+                            |\n';
        out += '|                            |  [#auth-modal] Access Portal  |                            |\n';
        out += '|                            |                               |                            |\n';
        out += '|                            |  [#input-auth-email]          |                            |\n';
        out += '|                            |  [ email@example.com ]        |                            |\n';
        out += '|                            |                               |                            |\n';
        out += '|                            |  [#input-auth-password]       |                            |\n';
        out += '|                            |  [ •••••••••••••••• ]         |                            |\n';
        out += '|                            |                               |                            |\n';
        out += '|                            |  [#btn-auth-login]            |                            |\n';
        out += '|                            |  [ Unlock Dashboard ]         |                            |\n';
        if (authWaitlistNoticeEl && authWaitlistNoticeEl.style.display !== 'none') {
          out += '|                            |  [!] WAITLISTED: Access Pndg  |                            |\n';
        } else if (authErrorEl && authErrorEl.style.display !== 'none' && authErrorEl.textContent) {
          const errText = authErrorEl.textContent.slice(0, 25);
          out += `|                            |  [!] Error: ${errText.padEnd(18)}|                            |\n`;
        }
        out += '|                            +-------------------------------+                            |\n';
        out += '|                                                                                         |\n';
        out += '+-----------------------------------------------------------------------------------------+\n';
        return out;
      }

      if (activeView === 'waitlist') {
        let out = '';
        out += '+-----------------------------------------------------------------------------------------+\n';
        out += `| [Header] Phone: +91 91766 50591 | [View: Waitlist (${currentWaitlist.length})] | [#btn-auth-logout]            |\n`;
        out += '+-----------------------------------------------------------------------------------------+\n';
        out += '| [#btn-view-chat] [Messages] | *[#btn-view-waitlist] [Waitlist Requests]                 |\n';
        out += '|-----------------------------------------------------------------------------------------|\n';
        out += '| EMAIL                              | STATUS    | ATTEMPTS | FIRST SEEN | LAST ATTEMPT   |\n';
        out += '|------------------------------------+-----------+----------+------------+----------------|\n';
        if (currentWaitlist.length === 0) {
          out += '| (No waitlisted accounts yet)                                                            |\n';
        } else {
          currentWaitlist.slice(0, 5).forEach(w => {
            out += `| ${w.email.padEnd(34)} | ${w.status.padEnd(9)} | ${String(w.attempt_count).padEnd(8)} | Recent     | Just now       |\n`;
          });
        }
        out += '+-----------------------------------------------------------------------------------------+\n';
        return out;
      }

      const stats = currentStats || { monthlyServiceCount: 0, dailyRecipientsCount: 0, walletBalance: 0.5 };
      const r2 = stats.r2 || { storageBytes: 0, isCapped: false };
      const r2Mb = (r2.storageBytes / (1024 * 1024)).toFixed(2);
      const r2Badge = r2.isCapped ? '[!] ALERT: R2 CAPPED (9.0 GB)' : '[R2: SAFE]';

      let out = '';
      out += '+-----------------------------------------------------------------------------------------+\n';
      out += `| [Header] Phone: +91 91766 50591 | Monthly Free: ${stats.monthlyServiceCount}/1000 | Daily: ${stats.dailyRecipientsCount}/250 | Bal: $${stats.walletBalance.toFixed(2)} |\n`;
      out += `| ${r2Badge} Storage: ${r2Mb} MB / 9.00 GB Ceiling                        [#btn-auth-logout] |\n`;
      out += '+-----------------------------------------------------------------------------------------+\n';
      out += `| *[#btn-view-chat] [Messages] | [#btn-view-waitlist] [Waitlist (${currentWaitlist.length})]                       |\n`;
      out += '+-----------------------------------------------------------------------------------------+\n';

      if (!activeCustomer) {
        out += '| CONVERSATIONS                       | CHAT PANE                                         |\n';
        currentConversations.forEach(c => {
          out += `| [#conv-${c.waId}] ${c.name || c.phoneNumber} [${c.id}] | (No conversation selected)                        |\n`;
          out += `|   Window: [${c.csw.label}]           |                                                   |\n`;
        });
        out += '+-----------------------------------------------------------------------------------------+\n';
        return out;
      }

      out += `| CONVERSATIONS                       | CHAT: ${activeCustomer.name} (${activeCustomer.phoneNumber}) [${activeCustomer.id}]\n`;
      currentConversations.forEach(c => {
        const mark = c.waId === activeCustomer.waId ? '>' : ' ';
        out += `| ${mark}[#conv-${c.waId}] ${c.name || c.phoneNumber}     | [CSW: ${activeCustomer.csw.label}]\n`;
      });

      out += '|-------------------------------------+---------------------------------------------------|\n';
      currentMessages.slice(-6).forEach(m => {
        const who = m.direction === 'inbound' ? 'Customer' : 'Business';
        const body = (m.body || `[${m.type}]`).slice(0, 35);
        const status = m.direction === 'outbound' ? `[${m.status}]` : '';
        out += `|                                     | ${who}: ${body} ${status}\n`;
      });

      out += '|-------------------------------------+---------------------------------------------------|\n';
      out += `|                                     | [#input-msg] [ ${activeCustomer.csw.isActive ? 'Type message...' : 'Window Closed'} ]\n`;
      out += `|                                     | [#btn-send] [ Send Message ${activeCustomer.csw.isActive ? 'Enabled' : 'Disabled'} ]\n`;
      out += '+-----------------------------------------------------------------------------------------+\n';

      return out;
    },

    getClickables: () => {
      if (!isAuthenticated) {
        return [
          {
            id: 'input-auth-email',
            label: 'Email Input Field',
            selector: '#input-auth-email',
            disabled: inputAuthEmailEl ? inputAuthEmailEl.disabled : false
          },
          {
            id: 'input-auth-password',
            label: 'Password Input Field',
            selector: '#input-auth-password',
            disabled: inputAuthPasswordEl ? inputAuthPasswordEl.disabled : false
          },
          {
            id: 'btn-auth-login',
            label: 'Login Button',
            selector: '#btn-auth-login',
            disabled: btnAuthLoginEl ? btnAuthLoginEl.disabled : false
          }
        ];
      }

      const items = [
        {
          id: 'btn-view-chat',
          label: 'Messages View Button',
          selector: '#btn-view-chat',
          disabled: false
        },
        {
          id: 'btn-view-waitlist',
          label: `Waitlist View Button (${currentWaitlist.length})`,
          selector: '#btn-view-waitlist',
          disabled: false
        }
      ];

      if (activeView === 'waitlist') {
        items.push({
          id: 'input-waitlist-search',
          label: 'Search Waitlist Input',
          selector: '#input-waitlist-search',
          disabled: false
        });
        items.push({
          id: 'btn-waitlist-refresh',
          label: 'Refresh Waitlist Button',
          selector: '#btn-waitlist-refresh',
          disabled: false
        });
      } else {
        currentConversations.forEach(c => {
          items.push({
            id: `conv-${c.waId}`,
            label: `Select conversation ${c.name || c.phoneNumber}`,
            selector: `#conv-${c.waId}`,
            disabled: false,
            cswActive: c.csw.isActive
          });
        });

        items.push({
          id: 'btn-send',
          label: 'Send Message Button',
          selector: '#btn-send',
          disabled: btnSendEl ? btnSendEl.disabled : false
        });

        items.push({
          id: 'input-msg',
          label: 'Message Input Field',
          selector: '#input-msg',
          disabled: inputMsgEl ? inputMsgEl.disabled : false
        });

        items.push({
          id: 'input-search',
          label: 'Search Conversations',
          selector: '#input-search',
          disabled: false
        });
      }

      items.push({
        id: 'btn-auth-logout',
        label: 'Logout Button',
        selector: '#btn-auth-logout',
        disabled: false
      });

      return items;
    },

    selectCustomer: async (waId) => {
      if (!isAuthenticated) {
        await performLogin('connectwithsanthoshmk@gmail.com', '[REDACTED]');
      }
      return await selectCustomer(waId);
    },

    sendMessage: async (text) => {
      if (!isAuthenticated) {
        await performLogin('connectwithsanthoshmk@gmail.com', '[REDACTED]');
      }
      return await sendMessage(text);
    }
  };

  // Initial Boot
  async function init() {
    try {
      const res = await nativeFetch('/api/auth/check');
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.authenticated) {
          setAuthenticatedState(true);
          await Promise.all([loadStats(), loadConversations(), loadWaitlist()]);
        } else {
          setAuthenticatedState(false);
        }
      } else {
        setAuthenticatedState(false);
      }
    } catch (err) {
      console.warn('Auth check failed:', err);
      setAuthenticatedState(false);
    } finally {
      isReadyState = true;
    }
  }

  init();
})();
