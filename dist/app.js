// WhatsApp Dashboard Client Application & Subagent Testability Engine

(function () {
  let isReadyState = false;
  let currentConversations = [];
  let activeCustomer = null;
  let currentMessages = [];
  let currentStats = null;

  // DOM Elements
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

  // Fetch Usage Stats
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      currentStats = await res.json();

      valMonthlyCswEl.textContent = `${currentStats.monthlyServiceCount} / ${currentStats.monthlyServiceLimit} Free`;
      valDailyTierEl.textContent = `${currentStats.dailyRecipientsCount} / ${currentStats.dailyRecipientsLimit}`;
      valWalletEl.textContent = `$${currentStats.walletBalance.toFixed(2)} ${currentStats.currency}`;

      const barMonthly = document.getElementById('bar-monthly-csw');
      if (barMonthly) {
        const pct = Math.min(100, Math.round((currentStats.monthlyServiceCount / currentStats.monthlyServiceLimit) * 100));
        barMonthly.style.width = `${pct}%`;
      }
      const barDaily = document.getElementById('bar-daily-tier');
      if (barDaily) {
        const pct = Math.min(100, Math.round((currentStats.dailyRecipientsCount / currentStats.dailyRecipientsLimit) * 100));
        barDaily.style.width = `${pct}%`;
      }

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
    const filter = (inputSearchEl.value || '').toLowerCase().trim();

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

      const rawName = (c.name || c.phoneNumber || 'User').trim();
      const initials = rawName
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .split(/\s+/)
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'WA';

      const clockIcon = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:3px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

      item.innerHTML = `
        <div class="conv-avatar">${escapeHtml(initials)}</div>
        <div class="conv-content">
          <div class="conv-header">
            <span class="conv-name">${escapeHtml(c.name || c.phoneNumber)}</span>
            <span class="conv-cust-id">${escapeHtml(c.id)}</span>
          </div>
          <div class="conv-snippet">${escapeHtml(lastMsgText)}</div>
          <div class="conv-footer">
            <span class="conv-csw ${cswClass}">${c.csw.isActive ? clockIcon : ''}${escapeHtml(c.csw.label)}</span>
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

    // Update Chat Header
    chatEmptyEl.style.display = 'none';
    chatHeaderEl.style.display = 'flex';
    messagesContainerEl.style.display = 'flex';
    composerPaneEl.style.display = 'flex';

    chatTitleNameEl.textContent = activeCustomer.name || activeCustomer.phoneNumber;
    chatTitleIdEl.textContent = `ID: ${activeCustomer.id} | Phone: ${activeCustomer.phoneNumber}`;

    const headerAvatarEl = document.getElementById('chat-header-avatar');
    if (headerAvatarEl) {
      const rawName = (activeCustomer.name || activeCustomer.phoneNumber || 'User').trim();
      const initials = rawName
        .replace(/[^a-zA-Z0-9 ]/g, '')
        .trim()
        .split(/\s+/)
        .map(w => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'WA';
      headerAvatarEl.textContent = initials;
    }

    const cswClass = activeCustomer.csw.isActive ? 'csw-active' : 'csw-closed';
    chatCswPillEl.className = `conv-csw ${cswClass}`;
    const clockIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:4px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    chatCswPillEl.innerHTML = `${activeCustomer.csw.isActive ? clockIcon : ''}<span>${escapeHtml(activeCustomer.csw.label)}</span>`;

    // CSW closed banner & composer lock
    if (!activeCustomer.csw.isActive) {
      bannerCswClosedEl.style.display = 'block';
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

      let ticksHtml = '';
      if (msg.direction === 'outbound') {
        let tickSymbol = '✓✓';
        if (msg.status === 'sent') tickSymbol = '✓';
        else if (msg.status === 'failed') tickSymbol = '!';
        else if (msg.status === 'pending') tickSymbol = '•';

        ticksHtml = `<span class="status-ticks ${statusClass}" title="${escapeHtml(msg.status)}">${tickSymbol}</span>`;
      }

      row.innerHTML = `
        <div class="msg-bubble">
          ${msg.body ? `<div class="msg-text">${escapeHtml(msg.body)}</div>` : ''}
          ${mediaHtml}
          ${errorHtml}
          <div class="msg-footer">
            <span class="msg-time">${timeStr}</span>
            ${msg.direction === 'outbound' ? `<span class="msg-status ${statusClass}">${ticksHtml}</span>` : ''}
          </div>
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
  btnSendEl.addEventListener('click', () => sendMessage());
  inputMsgEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  inputSearchEl.addEventListener('input', renderConversations);

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

    getState: () => {
      const r2 = currentStats?.r2 || {
        storageBytes: 0,
        classAOps: 0,
        classBOps: 0,
        isCapped: false,
        activeCapReason: null
      };

      return {
        route: activeCustomer ? `/chat/${activeCustomer.waId}` : '/conversations',
        activeCustomerWaId: activeCustomer?.waId || null,
        activeCustomerId: activeCustomer?.id || null,
        customerCount: currentConversations.length,
        messageCount: currentMessages.length,
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
      const stats = currentStats || { monthlyServiceCount: 0, dailyRecipientsCount: 0, walletBalance: 0.5 };
      const r2 = stats.r2 || { storageBytes: 0, isCapped: false };
      const r2Mb = (r2.storageBytes / (1024 * 1024)).toFixed(2);
      const r2Badge = r2.isCapped ? '[!] ALERT: R2 CAPPED (9.0 GB)' : '[R2: SAFE]';

      let out = '';
      out += '+-----------------------------------------------------------------------------------------+\n';
      out += `| [Header] Phone: +91 91766 50591 | Monthly Free: ${stats.monthlyServiceCount}/1000 | Daily: ${stats.dailyRecipientsCount}/250 | Bal: $${stats.walletBalance.toFixed(2)} |\n`;
      out += `| ${r2Badge} Storage: ${r2Mb} MB / 9.00 GB Ceiling                                        |\n`;
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
      const items = [];

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
        disabled: btnSendEl.disabled
      });

      items.push({
        id: 'input-msg',
        label: 'Message Input Field',
        selector: '#input-msg',
        disabled: inputMsgEl.disabled
      });

      items.push({
        id: 'input-search',
        label: 'Search Conversations',
        selector: '#input-search',
        disabled: false
      });

      return items;
    },

    selectCustomer: async (waId) => {
      return await selectCustomer(waId);
    },

    sendMessage: async (text) => {
      return await sendMessage(text);
    }
  };

  // Initial Boot
  async function init() {
    await loadStats();
    await loadConversations();
    isReadyState = true;
  }

  init();
})();
