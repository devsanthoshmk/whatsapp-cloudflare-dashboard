// WhatsApp Business Hub & AYUSH Store CRM Client Application
// Includes Subagent Testability Engine (window.site)

(function () {
  let isReadyState = false;
  let isAuthenticated = false;
  let activeView = 'chat'; // 'chat' | 'waitlist' | 'multisend'
  let currentConversations = [];
  let activeCustomer = null;
  let currentMessages = [];
  let currentStats = null;
  let currentWaitlist = [];

  // Vydy AYUSH Store Constants & Templates
  const VYDY_FLYER_URL = '/api/media/media%2F917904127446%2F1793886372_file';
  const VYDY_FLYER_NAME = 'Vydy_Festive_AYUSH_Flyer.jpg';

  const AYUSH_TEMPLATES = {
    festive_offer: "Festive Wellness Offer! Flat 10% OFF on selected AYUSH products (Ayurveda, Homoeopathy, Siddha & Unani) at Vydy Online Store. Use coupon code AYUSH10 at checkout or reply with your order list here!",
    prescription_rcvd: "Thank you for sharing your prescription. Our certified AYUSH pharmacist is reviewing it now. We will confirm medicine availability and pricing within 15 minutes.",
    order_dispatched: "Your Vydy AYUSH medicine parcel has been packed with care and dispatched! Delivery is estimated within 2-3 business days. Reply to this chat for tracking updates.",
    ayurvedic_consult: "Greetings from Vydy Online AYUSH Store. Our Ayurvedic wellness consultant is available to assist you with personalized herbal guidance. Please reply with your symptoms or preferred consultation time.",
    store_hours: "Vydy AYUSH Customer Support is active Monday through Saturday, 9:00 AM to 8:00 PM IST. How can we assist your wellness journey today?"
  };

  // State for Attachments, Modals & Live Sync
  let stagedAttachment = null; // { type: 'image'|'document'|'audio', url: string, filename: string, size: number, file: File|null }
  let activeForwardMessageId = null;
  let liveSyncTimer = null;
  let cswClockTimer = null;
  let lastSyncTimestamp = Date.now();
  let lightboxZoom = 1;
  let lightboxRotation = 0;
  let activeModalName = null; // 'pdf' | 'lightbox' | 'forward' | 'multisend' | null
  let isCustomerDrawerOpen = false;
  let mobileActiveView = 'list'; // 'list' | 'chat'

  // DOM Elements - Navigation & Views
  const btnViewChatEl = document.getElementById('btn-view-chat');
  const btnViewWaitlistEl = document.getElementById('btn-view-waitlist');
  const btnViewMultisendEl = document.getElementById('btn-view-multisend');
  const badgeWaitlistCountEl = document.getElementById('badge-waitlist-count');
  const chatViewEl = document.getElementById('chat-view');
  const waitlistViewEl = document.getElementById('waitlist-view');
  const inputWaitlistSearchEl = document.getElementById('input-waitlist-search');
  const btnWaitlistRefreshEl = document.getElementById('btn-waitlist-refresh');
  const waitlistListEl = document.getElementById('waitlist-list');
  const waitlistEmptyEl = document.getElementById('waitlist-empty');

  // DOM Elements - Live Sync
  const liveSyncTimeEl = document.getElementById('live-sync-time');
  const btnSyncNowEl = document.getElementById('btn-sync-now');
  const iconSyncSpinEl = document.getElementById('icon-sync-spin');

  // DOM Elements - Chat & Header
  const convListEl = document.getElementById('conv-list');
  const chatEmptyEl = document.getElementById('chat-empty');
  const chatHeaderEl = document.getElementById('chat-header');
  const btnChatBackEl = document.getElementById('btn-chat-back');
  const chatTitleNameEl = document.getElementById('chat-title-name');
  const chatTitleIdEl = document.getElementById('chat-title-id');
  const chatCswPillEl = document.getElementById('chat-csw-pill');
  const btnSearchMessagesEl = document.getElementById('btn-search-messages');
  const btnToggleCustomerDrawerEl = document.getElementById('btn-toggle-customer-drawer');
  const chatSearchBarEl = document.getElementById('chat-search-bar');
  const inputMsgSearchEl = document.getElementById('input-msg-search');
  const chatSearchCountEl = document.getElementById('chat-search-count');
  const btnCloseMsgSearchEl = document.getElementById('btn-close-msg-search');

  // DOM Elements - Messages & Composer
  const messagesContainerEl = document.getElementById('messages-container');
  const composerPaneEl = document.getElementById('composer-pane');
  const bannerCswClosedEl = document.getElementById('banner-csw-closed');
  const stagedAttachmentBarEl = document.getElementById('staged-attachment-bar');
  const stagedIconEl = document.getElementById('staged-icon');
  const stagedFilenameEl = document.getElementById('staged-filename');
  const stagedSizeEl = document.getElementById('staged-size');
  const btnRemoveAttachmentEl = document.getElementById('btn-remove-attachment');
  const btnAttachmentEl = document.getElementById('btn-attachment');
  const btnQuickTemplatesEl = document.getElementById('btn-quick-templates');
  const inputMsgEl = document.getElementById('input-msg');
  const btnSendEl = document.getElementById('btn-send');
  const inputSearchEl = document.getElementById('input-search');

  // DOM Elements - Popovers
  const attachmentPopoverEl = document.getElementById('attachment-popover');
  const templatesPopoverEl = document.getElementById('templates-popover');
  const popAttachImageEl = document.getElementById('pop-attach-image');
  const popAttachDocEl = document.getElementById('pop-attach-doc');
  const popAttachAudioEl = document.getElementById('pop-attach-audio');
  const popAttachFlyerEl = document.getElementById('pop-attach-flyer');
  const fileInputImageEl = document.getElementById('file-input-image');
  const fileInputDocEl = document.getElementById('file-input-doc');
  const fileInputAudioEl = document.getElementById('file-input-audio');

  // DOM Elements - Customer Drawer
  const customerDrawerEl = document.getElementById('customer-drawer');
  const btnCloseDrawerEl = document.getElementById('btn-close-drawer');
  const drawerAvatarEl = document.getElementById('drawer-avatar');
  const drawerNameEl = document.getElementById('drawer-name');
  const drawerPhoneEl = document.getElementById('drawer-phone');
  const drawerIdEl = document.getElementById('drawer-id');
  const drawerCswStatusEl = document.getElementById('drawer-csw-status');
  const drawerCswClockEl = document.getElementById('drawer-csw-clock');
  const drawerNotesInputEl = document.getElementById('drawer-notes-input');
  const btnSaveDrawerNotesEl = document.getElementById('btn-save-drawer-notes');
  const drawerNotesSavedMsgEl = document.getElementById('drawer-notes-saved-msg');

  // DOM Elements - PDF Modal
  const pdfModalEl = document.getElementById('pdf-modal');
  const pdfViewerFilenameEl = document.getElementById('pdf-viewer-filename');
  const pdfViewerMetaEl = document.getElementById('pdf-viewer-meta');
  const pdfViewerFrameEl = document.getElementById('pdf-viewer-frame');
  const pdfFallbackViewEl = document.getElementById('pdf-fallback-view');
  const btnPdfFallbackDlEl = document.getElementById('btn-pdf-fallback-dl');
  const btnPdfOpenTabEl = document.getElementById('btn-pdf-open-tab');
  const btnPdfDownloadEl = document.getElementById('btn-pdf-download');
  const btnPdfForwardEl = document.getElementById('btn-pdf-forward');
  const btnPdfCloseEl = document.getElementById('btn-pdf-close');

  // DOM Elements - Lightbox Modal
  const lightboxModalEl = document.getElementById('lightbox-modal');
  const lightboxTitleEl = document.getElementById('lightbox-title');
  const lightboxImgEl = document.getElementById('lightbox-img');
  const btnLightboxZoomInEl = document.getElementById('btn-lightbox-zoom-in');
  const btnLightboxZoomOutEl = document.getElementById('btn-lightbox-zoom-out');
  const btnLightboxRotateEl = document.getElementById('btn-lightbox-rotate');
  const btnLightboxForwardEl = document.getElementById('btn-lightbox-forward');
  const btnLightboxDownloadEl = document.getElementById('btn-lightbox-download');
  const btnLightboxCloseEl = document.getElementById('btn-lightbox-close');

  // DOM Elements - Forward Modal
  const forwardModalEl = document.getElementById('forward-modal');
  const forwardPreviewStripEl = document.getElementById('forward-preview-strip');
  const inputForwardSearchEl = document.getElementById('input-forward-search');
  const forwardContactsListEl = document.getElementById('forward-contacts-list');
  const btnForwardCancelEl = document.getElementById('btn-forward-cancel');
  const btnForwardSubmitEl = document.getElementById('btn-forward-submit');
  const btnForwardCloseEl = document.getElementById('btn-forward-close');

  // DOM Elements - Multi-Send Modal
  const multisendModalEl = document.getElementById('multisend-modal');
  const btnMsSelectActiveCswEl = document.getElementById('btn-ms-select-active-csw');
  const btnMsSelectAllEl = document.getElementById('btn-ms-select-all');
  const btnMsDeselectAllEl = document.getElementById('btn-ms-deselect-all');
  const inputMsSearchEl = document.getElementById('input-ms-search');
  const msContactsListEl = document.getElementById('ms-contacts-list');
  const inputMsTextEl = document.getElementById('input-ms-text');
  const btnMsAttachFlyerEl = document.getElementById('btn-ms-attach-flyer');
  const msFileInputEl = document.getElementById('ms-file-input');
  const msStagedAttachmentEl = document.getElementById('ms-staged-attachment');
  const msStagedNameEl = document.getElementById('ms-staged-name');
  const btnMsRemoveMediaEl = document.getElementById('btn-ms-remove-media');
  const msProgressPanelEl = document.getElementById('ms-progress-panel');
  const msProgressLabelEl = document.getElementById('ms-progress-label');
  const msProgressFillEl = document.getElementById('ms-progress-fill');
  const msStatusReportEl = document.getElementById('ms-status-report');
  const btnMsCancelEl = document.getElementById('btn-ms-cancel');
  const btnMsSendEl = document.getElementById('btn-ms-send');
  const btnMultisendCloseEl = document.getElementById('btn-multisend-close');

  // Stats DOM
  const valMonthlyCswEl = document.getElementById('val-monthly-csw');
  const valDailyTierEl = document.getElementById('val-daily-tier');
  const valWalletEl = document.getElementById('val-wallet');
  const textR2StatEl = document.getElementById('text-r2-stat');
  const badgeR2StatusEl = document.getElementById('badge-r2-status');
  const barMonthlyCswEl = document.getElementById('bar-monthly-csw');
  const barDailyTierEl = document.getElementById('bar-daily-tier');

  // Auth DOM
  const authModalEl = document.getElementById('auth-modal');
  const inputAuthEmailEl = document.getElementById('input-auth-email');
  const inputAuthPasswordEl = document.getElementById('input-auth-password');
  const btnTogglePasswordEl = document.getElementById('btn-toggle-password');
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
      startLiveSync();
    } else {
      if (authModalEl) authModalEl.style.display = 'flex';
      if (mainEl) mainEl.style.display = 'none';
      if (metricsGroupEl) metricsGroupEl.style.display = 'none';
      if (btnAuthLogoutEl) btnAuthLogoutEl.style.display = 'none';
      if (inputAuthPasswordEl) {
        inputAuthPasswordEl.value = '';
        inputAuthPasswordEl.type = 'password';
      }
      if (btnTogglePasswordEl) {
        btnTogglePasswordEl.setAttribute('aria-pressed', 'false');
        btnTogglePasswordEl.setAttribute('aria-label', 'Show password');
        btnTogglePasswordEl.innerHTML = `<svg class="icon-eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
      }
      stopLiveSync();
    }
  }

  // View Switcher
  function switchView(viewName) {
    if (viewName === 'multisend') {
      openMultiSendModal();
      return;
    }

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

  // Mobile Single-Pane View Switcher ('list' | 'chat')
  function setMobileView(view, pushHistory = true) {
    mobileActiveView = view === 'chat' ? 'chat' : 'list';
    const headerEl = document.querySelector('header');
    if (chatViewEl) {
      if (mobileActiveView === 'chat') {
        chatViewEl.classList.add('mobile-chat-active');
        document.body.classList.add('mobile-chat-active');
        if (headerEl && window.innerWidth <= 900) {
          headerEl.style.display = 'none';
        }
      } else {
        chatViewEl.classList.remove('mobile-chat-active');
        document.body.classList.remove('mobile-chat-active');
        if (headerEl) {
          headerEl.style.removeProperty('display');
        }
      }
    }
    if (pushHistory && window.history && window.history.pushState) {
      window.history.pushState({ mobileView: mobileActiveView }, '');
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
      pwd = '';
    }

    if (!email) {
      if (authErrorEl) {
        authErrorEl.textContent = 'Please enter an email address.';
        authErrorEl.style.display = 'block';
      }
      return false;
    }

    if (!pwd) {
      if (authErrorEl) {
        authErrorEl.textContent = 'Please enter a password.';
        authErrorEl.style.display = 'block';
      }
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
        setAuthenticatedState(true);
        if (inputAuthPasswordEl) inputAuthPasswordEl.value = '';
        await Promise.all([loadStats(), loadConversations(), loadWaitlist()]);
        isReadyState = true;
        return true;
      } else {
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

  // Load Stats from Live API
  async function loadStats() {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return;
      currentStats = await res.json();
      lastSyncTimestamp = Date.now();

      valMonthlyCswEl.textContent = `${currentStats.monthlyServiceCount} / ${currentStats.monthlyServiceLimit} Free`;
      valDailyTierEl.textContent = `${currentStats.dailyRecipientsCount} / ${currentStats.dailyRecipientsLimit}`;
      valWalletEl.textContent = `$${currentStats.walletBalance.toFixed(2)} ${currentStats.currency}`;

      if (barMonthlyCswEl) {
        const pct = Math.min(100, (currentStats.monthlyServiceCount / currentStats.monthlyServiceLimit) * 100);
        barMonthlyCswEl.style.width = `${pct}%`;
      }
      if (barDailyTierEl) {
        const pct = Math.min(100, (currentStats.dailyRecipientsCount / currentStats.dailyRecipientsLimit) * 100);
        barDailyTierEl.style.width = `${pct}%`;
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

      updateSyncIndicator();
    } catch (err) {
      console.warn('Failed to load stats:', err);
    }
  }

  // Live Sync Engine & Polling Loop
  function startLiveSync() {
    if (liveSyncTimer) clearInterval(liveSyncTimer);
    liveSyncTimer = setInterval(async () => {
      if (!isAuthenticated) return;
      await fetchLiveUpdates();
    }, 5000);
  }

  function stopLiveSync() {
    if (liveSyncTimer) {
      clearInterval(liveSyncTimer);
      liveSyncTimer = null;
    }
    if (cswClockTimer) {
      clearInterval(cswClockTimer);
      cswClockTimer = null;
    }
  }

  async function fetchLiveUpdates() {
    if (iconSyncSpinEl) iconSyncSpinEl.classList.add('spinning');
    try {
      await Promise.all([
        loadStats(),
        loadConversationsSilent(),
        activeCustomer ? loadMessagesSilent(activeCustomer.waId) : Promise.resolve()
      ]);
    } finally {
      setTimeout(() => {
        if (iconSyncSpinEl) iconSyncSpinEl.classList.remove('spinning');
      }, 500);
    }
  }

  function updateSyncIndicator() {
    if (!liveSyncTimeEl) return;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastSyncTimestamp) / 1000));
    if (elapsedSeconds < 5) {
      liveSyncTimeEl.textContent = 'Just now';
    } else {
      liveSyncTimeEl.textContent = `${elapsedSeconds}s ago`;
    }
  }

  // Load Conversations Silently without flickering DOM
  async function loadConversationsSilent() {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) return;
      const data = await res.json();
      currentConversations = data.conversations || [];
      renderConversations();
    } catch (err) {
      console.warn('Silent conversations update error:', err);
    }
  }

  // Load Messages Silently for Active Chat
  async function loadMessagesSilent(waId) {
    if (!activeCustomer || activeCustomer.waId !== waId) return;
    try {
      const res = await fetch(`/api/messages/${waId}`);
      if (!res.ok) return;
      const data = await res.json();
      const newMessages = data.messages || [];
      if (newMessages.length !== currentMessages.length) {
        currentMessages = newMessages;
        renderMessages();
      }
    } catch (err) {
      console.warn('Silent messages update error:', err);
    }
  }

  // Load Waitlist
  async function loadWaitlist() {
    try {
      const res = await fetch('/api/waitlist');
      if (!res.ok) return;
      const data = await res.json();
      currentWaitlist = data.waitlist || [];
      const pendingCount = currentWaitlist.filter(w => w.status === 'pending').length;
      if (badgeWaitlistCountEl) {
        badgeWaitlistCountEl.textContent = pendingCount;
      }
      renderWaitlist();
    } catch (err) {
      console.warn('Failed to load waitlist:', err);
    }
  }

  // Update Waitlist Status
  async function updateWaitlistStatus(id, newStatus) {
    try {
      const res = await nativeFetch(`/api/waitlist/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Failed to update status: ${data.message || data.error || 'Server error'}`);
        return false;
      }
      const item = currentWaitlist.find(w => w.id === id);
      if (item) item.status = newStatus;
      const pendingCount = currentWaitlist.filter(w => w.status === 'pending').length;
      if (badgeWaitlistCountEl) badgeWaitlistCountEl.textContent = pendingCount;
      renderWaitlist();
      return true;
    } catch (err) {
      alert(`Error updating status: ${err.message}`);
      return false;
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
      const statusBadgeClass = `badge-status-${entry.status || 'pending'}`;

      tr.innerHTML = `
        <td class="waitlist-email">${escapeHtml(entry.email)}</td>
        <td><span class="badge ${statusBadgeClass}" style="font-size: 0.72rem;">${escapeHtml(entry.status || 'pending')}</span></td>
        <td class="waitlist-attempts">${entry.attempt_count} attempt${entry.attempt_count > 1 ? 's' : ''}</td>
        <td class="waitlist-time">${firstSeen}</td>
        <td class="waitlist-time">${lastAttempt}</td>
        <td>
          <div class="btn-action-group">
            <button id="btn-approve-${entry.id}" class="btn-action btn-action-approve" data-id="${entry.id}" data-action="approved" title="Approve access" ${entry.status === 'approved' ? 'disabled style="opacity:0.4;cursor:default"' : ''}>Approve</button>
            <button id="btn-reject-${entry.id}" class="btn-action btn-action-reject" data-id="${entry.id}" data-action="rejected" title="Reject access" ${entry.status === 'rejected' ? 'disabled style="opacity:0.4;cursor:default"' : ''}>Reject</button>
            <button id="btn-archive-${entry.id}" class="btn-action btn-action-archive" data-id="${entry.id}" data-action="archived" title="Archive entry" ${entry.status === 'archived' ? 'disabled style="opacity:0.4;cursor:default"' : ''}>Archive</button>
          </div>
        </td>
      `;

      tr.querySelectorAll('.btn-action').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = btn.getAttribute('data-id');
          const action = btn.getAttribute('data-action');
          if (id && action) updateWaitlistStatus(id, action);
        });
      });

      waitlistListEl.appendChild(tr);
    });
  }

  // Load Conversations
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

  // Render Conversations
  function renderConversations() {
    if (!convListEl) return;
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
      let initials = getInitials(c.name);

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

  function getInitials(name) {
    if (!name) return 'WA';
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    if (words.length === 1 && words[0].length >= 2) return words[0].slice(0, 2).toUpperCase();
    return (words[0] || 'WA').slice(0, 1).toUpperCase();
  }

  // Select Customer & Load Messages
  async function selectCustomer(waId) {
    activeCustomer = currentConversations.find(c => c.waId === waId) || null;
    if (!activeCustomer) return false;

    renderConversations();
    setMobileView('chat', true);

    const headerAvatarEl = document.getElementById('chat-header-avatar');
    if (headerAvatarEl) headerAvatarEl.textContent = getInitials(activeCustomer.name);

    chatEmptyEl.style.display = 'none';
    chatHeaderEl.style.display = 'flex';
    messagesContainerEl.style.display = 'flex';
    composerPaneEl.style.display = 'flex';

    chatTitleNameEl.textContent = activeCustomer.name || activeCustomer.phoneNumber;

    // Subtitle formatted like WhatsApp status under contact name
    if (activeCustomer.csw.isActive) {
      chatTitleIdEl.innerHTML = `<span style="color:#25d366; font-weight:500;">online • Free reply ${activeCustomer.csw.remainingHours}h left</span>`;
    } else {
      chatTitleIdEl.innerHTML = `<span style="color:#f59e0b; font-weight:500;">Window closed • templates only</span>`;
    }

    const cswClass = activeCustomer.csw.isActive ? 'csw-active' : 'csw-closed';
    chatCswPillEl.className = `conv-csw ${cswClass}`;
    chatCswPillEl.textContent = activeCustomer.csw.label;

    if (!activeCustomer.csw.isActive) {
      bannerCswClosedEl.style.display = 'flex';
      inputMsgEl.disabled = true;
      btnSendEl.disabled = true;
      inputMsgEl.placeholder = 'Customer service window closed (>24h).';
    } else {
      bannerCswClosedEl.style.display = 'none';
      inputMsgEl.disabled = false;
      btnSendEl.disabled = false;
      inputMsgEl.placeholder = 'Type a message or consultation reply...';
    }

    startCswCountdown(activeCustomer.csw.expiresAt);
    updateCustomerDrawerData();

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

  // CSW Countdown Clock for Drawer
  function startCswCountdown(expiresAt) {
    if (cswClockTimer) clearInterval(cswClockTimer);
    function tick() {
      const now = Math.floor(Date.now() / 1000);
      const remaining = Math.max(0, expiresAt - now);
      if (drawerCswClockEl) {
        if (remaining <= 0) {
          drawerCswClockEl.textContent = 'Window expired';
          drawerCswClockEl.style.color = '#f87171';
        } else {
          const hours = Math.floor(remaining / 3600);
          const mins = Math.floor((remaining % 3600) / 60);
          const secs = remaining % 60;
          drawerCswClockEl.textContent = `${hours}h ${mins}m ${secs}s remaining`;
          drawerCswClockEl.style.color = '#38bdf8';
        }
      }
    }
    tick();
    cswClockTimer = setInterval(tick, 1000);
  }

  // Render Messages with Rich PDF, Lightbox, and Audio Options
  function renderMessages() {
    if (!messagesContainerEl) return;
    messagesContainerEl.innerHTML = '';

    const filterText = (inputMsgSearchEl?.value || '').toLowerCase().trim();
    let matchCount = 0;

    if (currentMessages.length === 0) {
      messagesContainerEl.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; margin-top: 2rem;">No messages yet.</div>';
      return;
    }

    currentMessages.forEach(msg => {
      const isMatch = !filterText || (msg.body && msg.body.toLowerCase().includes(filterText)) || (msg.media_filename && msg.media_filename.toLowerCase().includes(filterText));
      if (isMatch && filterText) matchCount++;

      const row = document.createElement('div');
      row.id = `msg-${msg.id}`;
      row.className = `msg-row ${msg.direction}`;
      if (!isMatch && filterText) {
        row.style.opacity = '0.25';
      }

      let mediaHtml = '';
      if (msg.status === 'media_capped_free_limit') {
        mediaHtml = `
          <div class="capped-alert-card">
            <strong>R2 Free Limit Reached - Media Capped</strong>
            <div>Media download was skipped to prevent billing. Conversation text is preserved.</div>
          </div>
        `;
      } else if (msg.media_url) {
        const isPdf = (msg.media_mime && msg.media_mime.includes('pdf')) || (msg.media_filename && msg.media_filename.toLowerCase().endsWith('.pdf'));
        const isImage = msg.media_mime ? msg.media_mime.startsWith('image/') : (msg.type === 'image' || (!isPdf && !msg.media_mime?.startsWith('audio/')));
        const isAudio = msg.media_mime ? msg.media_mime.startsWith('audio/') : (msg.type === 'audio');

        if (isImage) {
          mediaHtml = `
            <div class="media-card-wrap">
              <img src="${msg.media_url}" alt="${escapeHtml(msg.media_filename || 'WhatsApp Image')}" loading="lazy" data-msg-id="${msg.id}" data-url="${msg.media_url}">
              <div class="media-hover-bar">
                <button class="media-action-pill primary btn-view-image" data-url="${msg.media_url}" data-title="${escapeHtml(msg.media_filename || 'Image Preview')}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="21" y2="21"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                  <span>View</span>
                </button>
                <button class="media-action-pill btn-fwd-msg" data-msg-id="${msg.id}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 14 20 9 15 4"/><path d="M4 20v-7a4 4 0 0 1 4-4h12"/></svg>
                  <span>Forward</span>
                </button>
                <a class="media-action-pill" href="${msg.media_url}" download="${escapeHtml(msg.media_filename || 'image.jpg')}" target="_blank">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  <span>Download</span>
                </a>
              </div>
            </div>
          `;
        } else if (isPdf) {
          const cleanDocName = msg.media_filename || 'Prescription_Vydy.pdf';
          const cleanSize = formatBytes(msg.media_size || 0);

          mediaHtml = `
            <div class="doc-card">
              <div class="doc-card-main">
                <div class="doc-icon-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div class="doc-meta-col">
                  <span class="doc-title" title="${escapeHtml(cleanDocName)}">${escapeHtml(cleanDocName)}</span>
                  <span class="doc-subtitle">PDF Document • ${cleanSize}</span>
                </div>
              </div>
              <div class="doc-card-actions">
                <button class="media-action-pill primary btn-view-pdf" data-url="${msg.media_url}" data-filename="${escapeHtml(cleanDocName)}" data-size="${cleanSize}" data-msg-id="${msg.id}">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><line x1="16" y1="16" x2="21" y2="21"/></svg>
                  <span>View PDF</span>
                </button>
                <a class="media-action-pill" href="${msg.media_url}" target="_blank">
                  <span>Open tab</span>
                </a>
                <a class="media-action-pill" href="${msg.media_url}" download="${escapeHtml(cleanDocName)}" target="_blank">
                  <span>Download</span>
                </a>
                <button class="media-action-pill btn-fwd-msg" data-msg-id="${msg.id}">
                  <span>Forward</span>
                </button>
              </div>
            </div>
          `;
        } else if (isAudio) {
          mediaHtml = `
            <div class="audio-card">
              <div class="audio-header">
                <span>Voice Consultation Record</span>
                <button class="media-action-pill btn-fwd-msg" data-msg-id="${msg.id}" style="padding: 0.15rem 0.45rem;">Forward</button>
              </div>
              <audio controls src="${msg.media_url}" class="audio-element"></audio>
              <div class="audio-actions">
                <button class="media-action-pill btn-audio-speed" type="button">1.0x</button>
                <a class="media-action-pill" href="${msg.media_url}" download="${escapeHtml(msg.media_filename || 'voice_note.mp3')}" target="_blank">Download</a>
              </div>
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
          ${msg.body ? `<div class="msg-text">${escapeHtml(msg.body)}</div>` : ''}
          ${mediaHtml}
          ${errorHtml}
          <div class="msg-footer">
            <span class="msg-time">${timeStr}</span>
            ${msg.direction === 'outbound' ? `<span class="msg-status ${statusClass}">• ${msg.status}</span>` : ''}
            ${!mediaHtml ? `<button class="btn-msg-fwd-icon btn-fwd-msg" data-msg-id="${msg.id}" title="Forward this message" type="button"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 14 20 9 15 4"></polyline><path d="M4 20v-7a4 4 0 0 1 4-4h12"></path></svg></button>` : ''}
          </div>
        </div>
      `;

      // Attach button event listeners
      row.querySelectorAll('.btn-view-image').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          openImageLightbox(b.getAttribute('data-url'), b.getAttribute('data-title'));
        });
      });

      row.querySelectorAll('.btn-view-pdf').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          openPdfViewer(b.getAttribute('data-url'), b.getAttribute('data-filename'), b.getAttribute('data-size'), b.getAttribute('data-msg-id'));
        });
      });

      row.querySelectorAll('.btn-fwd-msg').forEach(b => {
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          openForwardModal(b.getAttribute('data-msg-id'));
        });
      });

      row.querySelectorAll('.btn-audio-speed').forEach(b => {
        b.addEventListener('click', () => {
          const audio = row.querySelector('audio');
          if (!audio) return;
          if (audio.playbackRate === 1.0) {
            audio.playbackRate = 1.5;
            b.textContent = '1.5x';
          } else if (audio.playbackRate === 1.5) {
            audio.playbackRate = 2.0;
            b.textContent = '2.0x';
          } else {
            audio.playbackRate = 1.0;
            b.textContent = '1.0x';
          }
        });
      });

      const imgEl = row.querySelector('.media-card-wrap img');
      if (imgEl) {
        imgEl.addEventListener('click', () => {
          openImageLightbox(imgEl.getAttribute('data-url'), imgEl.alt);
        });
      }

      messagesContainerEl.appendChild(row);
    });

    if (filterText && chatSearchCountEl) {
      chatSearchCountEl.textContent = `${matchCount} match${matchCount !== 1 ? 'es' : ''}`;
    }

    messagesContainerEl.scrollTop = messagesContainerEl.scrollHeight;
  }

  // PDF Viewer Modal Controller
  function openPdfViewer(url, filename, size, msgId) {
    if (!pdfModalEl) return;
    activeModalName = 'pdf';
    pdfViewerFilenameEl.textContent = filename || 'Prescription_Document.pdf';
    pdfViewerMetaEl.textContent = `PDF Document • ${size || 'Verified'}`;
    btnPdfDownloadEl.href = url;
    btnPdfDownloadEl.setAttribute('download', filename || 'document.pdf');
    btnPdfFallbackDlEl.href = url;

    btnPdfOpenTabEl.onclick = () => window.open(url, '_blank');
    btnPdfForwardEl.onclick = () => {
      closePdfViewer();
      if (msgId) openForwardModal(msgId);
    };

    pdfViewerFrameEl.src = `${url}#toolbar=1&navpanes=0`;
    pdfModalEl.style.display = 'flex';
  }

  function closePdfViewer() {
    if (!pdfModalEl) return;
    pdfModalEl.style.display = 'none';
    if (pdfViewerFrameEl) pdfViewerFrameEl.src = 'about:blank';
    if (activeModalName === 'pdf') activeModalName = null;
  }

  // Lightbox Modal Controller
  function openImageLightbox(url, title) {
    if (!lightboxModalEl) return;
    activeModalName = 'lightbox';
    lightboxTitleEl.textContent = title || 'Vydy AYUSH Store Image';
    lightboxImgEl.src = url;
    btnLightboxDownloadEl.href = url;
    lightboxZoom = 1;
    lightboxRotation = 0;
    updateLightboxTransform();

    btnLightboxForwardEl.onclick = () => {
      closeLightbox();
      const matched = currentMessages.find(m => m.media_url === url);
      if (matched) openForwardModal(matched.id);
    };

    lightboxModalEl.style.display = 'flex';
  }

  function updateLightboxTransform() {
    if (lightboxImgEl) {
      lightboxImgEl.style.transform = `scale(${lightboxZoom}) rotate(${lightboxRotation}deg)`;
    }
  }

  function closeLightbox() {
    if (!lightboxModalEl) return;
    lightboxModalEl.style.display = 'none';
    if (lightboxImgEl) lightboxImgEl.src = '';
    if (activeModalName === 'lightbox') activeModalName = null;
  }

  // Forward Modal Controller
  function openForwardModal(messageId) {
    if (!forwardModalEl) return;
    activeModalName = 'forward';
    activeForwardMessageId = messageId;
    const msg = currentMessages.find(m => m.id === messageId);

    if (forwardPreviewStripEl) {
      if (msg) {
        const previewText = msg.body ? escapeHtml(msg.body.slice(0, 75)) : (msg.media_filename || `[${msg.type || 'Media'}]`);
        forwardPreviewStripEl.innerHTML = `<strong>Forwarding:</strong> <span>${previewText}</span>`;
      } else {
        forwardPreviewStripEl.innerHTML = `<strong>Forwarding message ID:</strong> <span>${escapeHtml(messageId)}</span>`;
      }
    }

    renderForwardContacts();
    forwardModalEl.style.display = 'flex';
  }

  function closeForwardModal() {
    if (!forwardModalEl) return;
    forwardModalEl.style.display = 'none';
    activeForwardMessageId = null;
    if (activeModalName === 'forward') activeModalName = null;
  }

  function renderForwardContacts() {
    if (!forwardContactsListEl) return;
    forwardContactsListEl.innerHTML = '';
    const query = (inputForwardSearchEl?.value || '').toLowerCase().trim();

    const filtered = currentConversations.filter(c =>
      (c.name || '').toLowerCase().includes(query) ||
      c.phoneNumber.includes(query)
    );

    if (filtered.length === 0) {
      forwardContactsListEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No contacts match search.</div>';
      updateForwardButton();
      return;
    }

    filtered.forEach(c => {
      const item = document.createElement('label');
      item.className = 'forward-contact-item';
      const cswBadge = c.csw.isActive
        ? `<span class="badge badge-success" style="font-size: 0.68rem;">Active Free (${c.csw.remainingHours}h)</span>`
        : `<span class="badge badge-warning" style="font-size: 0.68rem;">Window Closed</span>`;

      item.innerHTML = `
        <input type="checkbox" class="contact-check fwd-check" value="${c.waId}">
        <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
          <strong style="font-size:0.84rem; color:#f1f5f9;">${escapeHtml(c.name || c.phoneNumber)}</strong>
          <small style="color:var(--text-secondary); font-size:0.72rem;">${escapeHtml(c.phoneNumber)}</small>
        </div>
        ${cswBadge}
      `;

      item.querySelector('input').addEventListener('change', updateForwardButton);
      forwardContactsListEl.appendChild(item);
    });

    updateForwardButton();
  }

  function updateForwardButton() {
    const selected = document.querySelectorAll('.fwd-check:checked');
    if (!btnForwardSubmitEl) return;
    const count = selected.length;
    btnForwardSubmitEl.disabled = count === 0;
    btnForwardSubmitEl.textContent = `Forward (${count} selected)`;
  }

  async function executeForward() {
    if (!activeForwardMessageId) return false;
    const selected = Array.from(document.querySelectorAll('.fwd-check:checked')).map(cb => cb.value);
    if (selected.length === 0) return false;

    btnForwardSubmitEl.disabled = true;
    btnForwardSubmitEl.textContent = 'Forwarding...';

    try {
      const res = await nativeFetch('/api/messages/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: activeForwardMessageId, targetWaIds: selected })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(`Forwarded successfully to ${data.sentCount || selected.length} recipient(s).`);
        closeForwardModal();
        if (activeCustomer && selected.includes(activeCustomer.waId)) {
          await selectCustomer(activeCustomer.waId);
        }
        await loadConversations();
        return true;
      } else {
        alert(`Forward failed: ${data.message || data.error || 'Server error'}`);
        btnForwardSubmitEl.disabled = false;
        return false;
      }
    } catch (err) {
      alert(`Forward failed: ${err.message}`);
      btnForwardSubmitEl.disabled = false;
      return false;
    }
  }

  // Multi-Send Modal Controller
  function openMultiSendModal() {
    if (!multisendModalEl) return;
    activeModalName = 'multisend';
    if (msProgressPanelEl) msProgressPanelEl.style.display = 'none';
    renderMultiSendContacts();
    multisendModalEl.style.display = 'flex';
  }

  function closeMultiSendModal() {
    if (!multisendModalEl) return;
    multisendModalEl.style.display = 'none';
    if (activeModalName === 'multisend') activeModalName = null;
  }

  function renderMultiSendContacts() {
    if (!msContactsListEl) return;
    msContactsListEl.innerHTML = '';
    const query = (inputMsSearchEl?.value || '').toLowerCase().trim();

    const filtered = currentConversations.filter(c =>
      (c.name || '').toLowerCase().includes(query) ||
      c.phoneNumber.includes(query)
    );

    if (filtered.length === 0) {
      msContactsListEl.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem;">No contacts found.</div>';
      updateMultiSendButton();
      return;
    }

    filtered.forEach(c => {
      const item = document.createElement('label');
      item.className = 'forward-contact-item';
      const cswActive = c.csw.isActive;
      const cswBadge = cswActive
        ? `<span class="badge badge-success" style="font-size: 0.65rem;">Free (${c.csw.remainingHours}h)</span>`
        : `<span class="badge badge-warning" style="font-size: 0.65rem;">Closed</span>`;

      item.innerHTML = `
        <input type="checkbox" class="contact-check ms-check" value="${c.waId}" data-active-csw="${cswActive ? '1' : '0'}">
        <div style="flex:1; display:flex; flex-direction:column; gap:2px;">
          <strong style="font-size:0.82rem; color:#f1f5f9;">${escapeHtml(c.name || c.phoneNumber)}</strong>
          <small style="color:var(--text-secondary); font-size:0.7rem;">${escapeHtml(c.phoneNumber)}</small>
        </div>
        ${cswBadge}
      `;

      item.querySelector('input').addEventListener('change', updateMultiSendButton);
      msContactsListEl.appendChild(item);
    });

    updateMultiSendButton();
  }

  function updateMultiSendButton() {
    const selected = document.querySelectorAll('.ms-check:checked');
    if (!btnMsSendEl) return;
    const count = selected.length;
    btnMsSendEl.disabled = count === 0;
    btnMsSendEl.textContent = `Send Broadcast (${count} recipient${count !== 1 ? 's' : ''})`;
  }

  async function executeMultiSend(customPayload) {
    const selected = customPayload?.recipients || Array.from(document.querySelectorAll('.ms-check:checked')).map(cb => cb.value);
    const text = customPayload?.text || (inputMsTextEl ? inputMsTextEl.value.trim() : '');
    const flyerAttached = customPayload?.media_url || (btnMsAttachFlyerEl && btnMsAttachFlyerEl.classList.contains('active'));

    if (selected.length === 0) {
      alert('Please select at least one recipient.');
      return false;
    }

    if (!text && !flyerAttached) {
      alert('Please enter a broadcast message or attach the festive flyer.');
      return false;
    }

    if (btnMsSendEl) btnMsSendEl.disabled = true;
    if (msProgressPanelEl) msProgressPanelEl.style.display = 'flex';
    if (msProgressLabelEl) msProgressLabelEl.textContent = `Broadcasting to ${selected.length} customer(s)...`;
    if (msProgressFillEl) msProgressFillEl.style.width = '45%';

    const payload = {
      recipients: selected,
      text: text || undefined,
      type: flyerAttached ? 'image' : 'text',
      media_url: flyerAttached ? (customPayload?.media_url || VYDY_FLYER_URL) : undefined,
      media_filename: flyerAttached ? VYDY_FLYER_NAME : undefined,
      caption: flyerAttached ? (text || 'Festive AYUSH Offer') : undefined
    };

    try {
      const res = await nativeFetch('/api/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (msProgressFillEl) msProgressFillEl.style.width = '100%';
        if (msProgressLabelEl) msProgressLabelEl.textContent = `Broadcast completed!`;
        if (msStatusReportEl) {
          msStatusReportEl.textContent = `Successfully sent: ${data.sentCount || selected.length} | Failed / Window Expired: ${data.failedCount || 0}`;
        }
        await loadConversations();
        await loadStats();
        return true;
      } else {
        alert(`Broadcast error: ${data.message || data.error || 'Server error'}`);
        if (btnMsSendEl) btnMsSendEl.disabled = false;
        return false;
      }
    } catch (err) {
      alert(`Broadcast failed: ${err.message}`);
      if (btnMsSendEl) btnMsSendEl.disabled = false;
      return false;
    }
  }

  // Customer Drawer Controller
  function toggleCustomerDrawer() {
    isCustomerDrawerOpen = !isCustomerDrawerOpen;
    if (customerDrawerEl) {
      customerDrawerEl.style.display = isCustomerDrawerOpen ? 'flex' : 'none';
    }
    if (isCustomerDrawerOpen) updateCustomerDrawerData();
  }

  function updateCustomerDrawerData() {
    if (!activeCustomer) return;
    if (drawerAvatarEl) drawerAvatarEl.textContent = getInitials(activeCustomer.name);
    if (drawerNameEl) drawerNameEl.textContent = activeCustomer.name || activeCustomer.phoneNumber;
    if (drawerPhoneEl) drawerPhoneEl.textContent = activeCustomer.phoneNumber;
    if (drawerIdEl) drawerIdEl.textContent = `Customer ID: ${activeCustomer.id}`;

    if (drawerCswStatusEl) {
      drawerCswStatusEl.textContent = activeCustomer.csw.isActive
        ? `Active (${activeCustomer.csw.source === 'ad' ? 'Ad 72h' : 'Organic 24h'})`
        : 'Closed (>24h)';
      drawerCswStatusEl.className = activeCustomer.csw.isActive ? 'badge badge-success' : 'badge badge-warning';
    }

    if (drawerNotesInputEl) {
      const saved = localStorage.getItem(`vydy_notes_${activeCustomer.waId}`) || '';
      drawerNotesInputEl.value = saved;
    }
  }

  // Staged Attachment Handlers
  function stageAttachment(type, url, filename, size, file = null) {
    stagedAttachment = { type, url, filename, size, file };
    if (stagedAttachmentBarEl) stagedAttachmentBarEl.style.display = 'flex';
    if (stagedFilenameEl) stagedFilenameEl.textContent = filename;
    if (stagedSizeEl) stagedSizeEl.textContent = formatBytes(size);
    if (stagedIconEl) {
      if (type === 'image') stagedIconEl.textContent = '🖼️';
      else if (type === 'document') stagedIconEl.textContent = '📄';
      else if (type === 'audio') stagedIconEl.textContent = '🎙️';
      else stagedIconEl.textContent = '📎';
    }
  }

  function clearStagedAttachment() {
    stagedAttachment = null;
    if (stagedAttachmentBarEl) stagedAttachmentBarEl.style.display = 'none';
    if (fileInputImageEl) fileInputImageEl.value = '';
    if (fileInputDocEl) fileInputDocEl.value = '';
    if (fileInputAudioEl) fileInputAudioEl.value = '';
  }

  // Send Message (Text or Media Attachment)
  async function sendMessage(customText) {
    if (!activeCustomer) return { success: false, error: 'No active conversation' };
    const content = customText !== undefined ? customText : (inputMsgEl ? inputMsgEl.value.trim() : '');

    if (!content && !stagedAttachment) {
      return { success: false, error: 'Empty message' };
    }

    btnSendEl.disabled = true;

    try {
      let finalMediaUrl = stagedAttachment?.url;
      let finalFilename = stagedAttachment?.filename;
      let finalType = stagedAttachment?.type || 'text';

      // If a local file was uploaded via file picker, stream it into /api/upload first
      if (stagedAttachment && stagedAttachment.file) {
        const uploadRes = await nativeFetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': stagedAttachment.file.type || 'application/octet-stream' },
          body: stagedAttachment.file
        });

        if (!uploadRes.ok) {
          const errData = await uploadRes.json().catch(() => ({}));
          alert(`Upload failed: ${errData.message || 'Resource limit'}`);
          btnSendEl.disabled = false;
          return { success: false, error: errData.message };
        }

        const uploadData = await uploadRes.json();
        finalMediaUrl = uploadData.url;
      }

      const payload = {
        to: activeCustomer.waId,
        text: content || undefined,
        type: finalType,
        media_url: finalMediaUrl,
        media_filename: finalFilename,
        caption: content || undefined
      };

      const res = await nativeFetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        alert(`Error: ${data.message || data.error}`);
        btnSendEl.disabled = false;
        return { success: false, error: data.message || data.error };
      }

      if (inputMsgEl) inputMsgEl.value = '';
      clearStagedAttachment();
      btnSendEl.disabled = false;

      await selectCustomer(activeCustomer.waId);
      await loadStats();
      return { success: true };
    } catch (err) {
      alert(`Send failed: ${err.message}`);
      btnSendEl.disabled = false;
      return { success: false, error: err.message };
    }
  }

  // Global Event Listeners Setup
  function setupEventListeners() {
    btnSendEl?.addEventListener('click', () => sendMessage());
    inputMsgEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    inputSearchEl?.addEventListener('input', renderConversations);
    btnViewChatEl?.addEventListener('click', () => switchView('chat'));
    btnViewWaitlistEl?.addEventListener('click', () => switchView('waitlist'));
    btnViewMultisendEl?.addEventListener('click', () => switchView('multisend'));
    btnWaitlistRefreshEl?.addEventListener('click', () => loadWaitlist());
    inputWaitlistSearchEl?.addEventListener('input', renderWaitlist);

    // Live Sync Manual Trigger
    btnSyncNowEl?.addEventListener('click', () => fetchLiveUpdates());

    // Search inside Messages
    btnSearchMessagesEl?.addEventListener('click', () => {
      if (!chatSearchBarEl) return;
      const isVisible = chatSearchBarEl.style.display !== 'none';
      chatSearchBarEl.style.display = isVisible ? 'none' : 'flex';
      if (!isVisible && inputMsgSearchEl) {
        inputMsgSearchEl.focus();
      } else {
        if (inputMsgSearchEl) inputMsgSearchEl.value = '';
        renderMessages();
      }
    });

    btnCloseMsgSearchEl?.addEventListener('click', () => {
      if (chatSearchBarEl) chatSearchBarEl.style.display = 'none';
      if (inputMsgSearchEl) inputMsgSearchEl.value = '';
      renderMessages();
    });

    inputMsgSearchEl?.addEventListener('input', renderMessages);

    // Customer Drawer Toggle
    btnToggleCustomerDrawerEl?.addEventListener('click', toggleCustomerDrawer);
    btnCloseDrawerEl?.addEventListener('click', toggleCustomerDrawer);
    btnSaveDrawerNotesEl?.addEventListener('click', () => {
      if (activeCustomer && drawerNotesInputEl) {
        localStorage.setItem(`vydy_notes_${activeCustomer.waId}`, drawerNotesInputEl.value.trim());
        if (drawerNotesSavedMsgEl) {
          drawerNotesSavedMsgEl.style.display = 'inline';
          setTimeout(() => { drawerNotesSavedMsgEl.style.display = 'none'; }, 2000);
        }
      }
    });

    // Composer Tools & Popovers
    btnAttachmentEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (templatesPopoverEl) templatesPopoverEl.style.display = 'none';
      if (attachmentPopoverEl) {
        const isOpen = attachmentPopoverEl.style.display === 'flex';
        attachmentPopoverEl.style.display = isOpen ? 'none' : 'flex';
      }
    });

    btnQuickTemplatesEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (attachmentPopoverEl) attachmentPopoverEl.style.display = 'none';
      if (templatesPopoverEl) {
        const isOpen = templatesPopoverEl.style.display === 'flex';
        templatesPopoverEl.style.display = isOpen ? 'none' : 'flex';
      }
    });

    // Close popovers on click outside
    document.addEventListener('click', (e) => {
      if (attachmentPopoverEl && !attachmentPopoverEl.contains(e.target) && e.target !== btnAttachmentEl) {
        attachmentPopoverEl.style.display = 'none';
      }
      if (templatesPopoverEl && !templatesPopoverEl.contains(e.target) && e.target !== btnQuickTemplatesEl) {
        templatesPopoverEl.style.display = 'none';
      }
    });

    // Attachment Popover Actions
    popAttachImageEl?.addEventListener('click', () => {
      attachmentPopoverEl.style.display = 'none';
      fileInputImageEl?.click();
    });
    popAttachDocEl?.addEventListener('click', () => {
      attachmentPopoverEl.style.display = 'none';
      fileInputDocEl?.click();
    });
    popAttachAudioEl?.addEventListener('click', () => {
      attachmentPopoverEl.style.display = 'none';
      fileInputAudioEl?.click();
    });
    popAttachFlyerEl?.addEventListener('click', () => {
      attachmentPopoverEl.style.display = 'none';
      stageAttachment('image', VYDY_FLYER_URL, VYDY_FLYER_NAME, 286000);
    });

    btnRemoveAttachmentEl?.addEventListener('click', clearStagedAttachment);

    // File Input Handlers
    fileInputImageEl?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) stageAttachment('image', URL.createObjectURL(file), file.name, file.size, file);
    });
    fileInputDocEl?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) stageAttachment('document', URL.createObjectURL(file), file.name, file.size, file);
    });
    fileInputAudioEl?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) stageAttachment('audio', URL.createObjectURL(file), file.name, file.size, file);
    });

    // Templates Popover Actions
    templatesPopoverEl?.querySelectorAll('[data-template]').forEach(item => {
      item.addEventListener('click', () => {
        const key = item.getAttribute('data-template');
        if (key && AYUSH_TEMPLATES[key]) {
          if (inputMsgEl) inputMsgEl.value = AYUSH_TEMPLATES[key];
        }
        templatesPopoverEl.style.display = 'none';
      });
    });

    // PDF Viewer Modal Controls
    btnPdfCloseEl?.addEventListener('click', closePdfViewer);

    // Lightbox Controls
    btnLightboxCloseEl?.addEventListener('click', closeLightbox);
    btnLightboxZoomInEl?.addEventListener('click', () => {
      lightboxZoom = Math.min(3, lightboxZoom + 0.25);
      updateLightboxTransform();
    });
    btnLightboxZoomOutEl?.addEventListener('click', () => {
      lightboxZoom = Math.max(0.5, lightboxZoom - 0.25);
      updateLightboxTransform();
    });
    btnLightboxRotateEl?.addEventListener('click', () => {
      lightboxRotation = (lightboxRotation + 90) % 360;
      updateLightboxTransform();
    });

    // Forward Modal Controls
    btnForwardCloseEl?.addEventListener('click', closeForwardModal);
    btnForwardCancelEl?.addEventListener('click', closeForwardModal);
    btnForwardSubmitEl?.addEventListener('click', executeForward);
    inputForwardSearchEl?.addEventListener('input', renderForwardContacts);

    // Multi-Send Modal Controls
    btnMultisendCloseEl?.addEventListener('click', closeMultiSendModal);
    btnMsCancelEl?.addEventListener('click', closeMultiSendModal);
    btnMsSendEl?.addEventListener('click', () => executeMultiSend());
    inputMsSearchEl?.addEventListener('input', renderMultiSendContacts);

    btnMsSelectActiveCswEl?.addEventListener('click', () => {
      document.querySelectorAll('.ms-check').forEach(cb => {
        cb.checked = cb.getAttribute('data-active-csw') === '1';
      });
      updateMultiSendButton();
    });
    btnMsSelectAllEl?.addEventListener('click', () => {
      document.querySelectorAll('.ms-check').forEach(cb => { cb.checked = true; });
      updateMultiSendButton();
    });
    btnMsDeselectAllEl?.addEventListener('click', () => {
      document.querySelectorAll('.ms-check').forEach(cb => { cb.checked = false; });
      updateMultiSendButton();
    });

    btnMsAttachFlyerEl?.addEventListener('click', () => {
      btnMsAttachFlyerEl.classList.toggle('active');
      if (msStagedAttachmentEl) {
        const isActive = btnMsAttachFlyerEl.classList.contains('active');
        msStagedAttachmentEl.style.display = isActive ? 'flex' : 'none';
        if (msStagedNameEl) msStagedNameEl.textContent = VYDY_FLYER_NAME;
      }
    });

    btnMsRemoveMediaEl?.addEventListener('click', () => {
      if (btnMsAttachFlyerEl) btnMsAttachFlyerEl.classList.remove('active');
      if (msStagedAttachmentEl) msStagedAttachmentEl.style.display = 'none';
    });

    msFileInputEl?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file && msStagedAttachmentEl) {
        msStagedAttachmentEl.style.display = 'flex';
        if (msStagedNameEl) msStagedNameEl.textContent = file.name;
      }
    });

    // Multi-Send Template Tag Buttons
    multisendModalEl?.querySelectorAll('.btn-template-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const key = tag.getAttribute('data-template');
        if (key && AYUSH_TEMPLATES[key] && inputMsTextEl) {
          inputMsTextEl.value = AYUSH_TEMPLATES[key];
        }
      });
    });

    // Auth Buttons
    btnTogglePasswordEl?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!inputAuthPasswordEl) return;
      const isPassword = inputAuthPasswordEl.type === 'password';
      inputAuthPasswordEl.type = isPassword ? 'text' : 'password';
      btnTogglePasswordEl.setAttribute('aria-pressed', isPassword ? 'true' : 'false');
      btnTogglePasswordEl.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
      btnTogglePasswordEl.innerHTML = isPassword
        ? `<svg class="icon-eye-off" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg class="icon-eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    });

    btnAuthLoginEl?.addEventListener('click', (e) => {
      e.preventDefault();
      performLogin();
    });
    inputAuthPasswordEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        performLogin();
      }
    });
    btnAuthLogoutEl?.addEventListener('click', (e) => {
      e.preventDefault();
      performLogout();
    });

    // Mobile Back Button
    btnChatBackEl?.addEventListener('click', (e) => {
      e.stopPropagation();
      setMobileView('list', true);
    });

    // Window resize handler (ensures header state matches screen width)
    window.addEventListener('resize', () => {
      const headerEl = document.querySelector('header');
      if (mobileActiveView === 'chat' && window.innerWidth <= 900) {
        if (headerEl) headerEl.style.display = 'none';
      } else if (headerEl) {
        headerEl.style.removeProperty('display');
      }
    });

    // Browser / Android Hardware Back Gesture
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.mobileView) {
        setMobileView(e.state.mobileView, false);
      } else if (mobileActiveView === 'chat') {
        setMobileView('list', false);
      }
    });

    // Keyboard shortcuts (Escape closes modals)
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (pdfModalEl?.style.display !== 'none') closePdfViewer();
        if (lightboxModalEl?.style.display !== 'none') closeLightbox();
        if (forwardModalEl?.style.display !== 'none') closeForwardModal();
        if (multisendModalEl?.style.display !== 'none') closeMultiSendModal();
        if (isCustomerDrawerOpen) toggleCustomerDrawer();
      }
    });
  }

  // Format Helper Utilities
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // =========================================================================
  // SUBAGENT TESTABILITY ENGINE (window.site)
  // Allows AI subagents to navigate, inspect, and test without screenshots
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

    setMobileView: (view) => {
      setMobileView(view, false);
      return mobileActiveView;
    },

    getMobileView: () => mobileActiveView,

    getWaitlist: () => currentWaitlist,

    openPdfViewer: (url, filename, size) => {
      openPdfViewer(url || VYDY_FLYER_URL, filename || 'Prescription.pdf', size || '420 KB');
      return true;
    },

    closePdfViewer: () => {
      closePdfViewer();
      return true;
    },

    openImageLightbox: (url, title) => {
      openImageLightbox(url || VYDY_FLYER_URL, title || 'AYUSH Flyer');
      return true;
    },

    closeLightbox: () => {
      closeLightbox();
      return true;
    },

    openForwardModal: (msgId) => {
      const targetId = msgId || (currentMessages[0] ? currentMessages[0].id : 'msg_default');
      openForwardModal(targetId);
      return true;
    },

    closeForwardModal: () => {
      closeForwardModal();
      return true;
    },

    executeForward: async (msgId, targetWaIds) => {
      activeForwardMessageId = msgId || activeForwardMessageId;
      const targets = Array.isArray(targetWaIds) ? targetWaIds : [targetWaIds];
      const res = await nativeFetch('/api/messages/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId: activeForwardMessageId, targetWaIds: targets })
      });
      return await res.json();
    },

    openMultiSendModal: () => {
      openMultiSendModal();
      return true;
    },

    closeMultiSendModal: () => {
      closeMultiSendModal();
      return true;
    },

    executeMultiSend: async (payload) => {
      return await executeMultiSend(payload);
    },

    toggleCustomerDrawer: () => {
      toggleCustomerDrawer();
      return isCustomerDrawerOpen;
    },

    stageFestiveFlyer: () => {
      stageAttachment('image', VYDY_FLYER_URL, VYDY_FLYER_NAME, 286000);
      return stagedAttachment;
    },

    clearStagedAttachment: () => {
      clearStagedAttachment();
      return true;
    },

    insertTemplate: (templateKey) => {
      if (AYUSH_TEMPLATES[templateKey] && inputMsgEl) {
        inputMsgEl.value = AYUSH_TEMPLATES[templateKey];
        return inputMsgEl.value;
      }
      return null;
    },

    triggerLiveSync: async () => {
      await fetchLiveUpdates();
      return { lastSyncTimestamp, stats: currentStats };
    },

    selectCustomer: async (waId) => {
      if (!isAuthenticated) {
        console.warn('Authentication required before selecting customer.');
        return false;
      }
      return await selectCustomer(waId);
    },

    sendMessage: async (text) => {
      if (!isAuthenticated) {
        console.warn('Authentication required before sending message.');
        return false;
      }
      return await sendMessage(text);
    },

    getState: () => {
      const r2 = currentStats?.r2 || {
        storageBytes: 0,
        classAOps: 0,
        classBOps: 0,
        isCapped: false,
        activeCapReason: null
      };

      return {
        isAuthenticated,
        activeView,
        mobileView: mobileActiveView,
        activeModal: activeModalName,
        isCustomerDrawerOpen,
        stagedAttachment: stagedAttachment ? { type: stagedAttachment.type, filename: stagedAttachment.filename } : null,
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
        lastSyncTimestamp,
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
        return `
+-----------------------------------------------------------------------------------------+
|                           WHATSAPP BUSINESS HUB - LOGIN                                 |
+-----------------------------------------------------------------------------------------+
|                            +-------------------------------+                            |
|                            |  [#auth-modal] Access Portal  |                            |
|                            |                               |                            |
|                            |  [#input-auth-email]          |                            |
|                            |  [ email@example.com ]        |                            |
|                            |                               |                            |
|                            |  [#input-auth-password]       |                            |
|                            |  [ •••••••••••••••• ]         |                            |
|                            |                               |                            |
|                            |  [#btn-auth-login]            |                            |
|                            |  [ Unlock Dashboard ]         |                            |
|                            +-------------------------------+                            |
+-----------------------------------------------------------------------------------------+`;
      }

      if (activeModalName === 'pdf') {
        return `
+-----------------------------------------------------------------------------------------+
| [MODAL: PDF Document Viewer] ${pdfViewerFilenameEl?.textContent || 'Prescription.pdf'}   |
+-----------------------------------------------------------------------------------------+
| [#btn-pdf-open-tab] Open Tab | [#btn-pdf-download] Download | [#btn-pdf-forward] Forward|
| [#btn-pdf-close] Close [X]                                                              |
|-----------------------------------------------------------------------------------------|
| [==================== EMBEDDED HIGH RESOLUTION PDF VIEWER ============================] |
| [ Document: AYUSH Prescription / Catalog / Invoice                                    ] |
| [ Scale: 100% | Pages: Multi-page document support                                    ] |
| [=====================================================================================] |
+-----------------------------------------------------------------------------------------+`;
      }

      if (activeModalName === 'multisend') {
        return `
+-----------------------------------------------------------------------------------------+
| [MODAL: Multi-Send & AYUSH Broadcast Campaign]                                          |
+-----------------------------------------------------------------------------------------+
| RECIPIENTS (Select All / Active CSW Only)    | COMPOSER & ATTACHMENT                    |
|----------------------------------------------+------------------------------------------|
| [x] Santhosh M K (+917904127446) [Active CSW]| [#input-ms-text] [Type announcement...]  |
| [ ] Customer B (+919876543210) [Window Close]| AYUSH Templates: [Festive 10% OFF] [Rx]  |
|                                              | Attachment: [Vydy Festive AYUSH Flyer]   |
|                                              | [#btn-ms-send] Send Broadcast (1 chosen) |
+-----------------------------------------------------------------------------------------+`;
      }

      if (activeModalName === 'forward') {
        return `
+-----------------------------------------------------------------------------------------+
| [MODAL: Forward Message]                                                                |
+-----------------------------------------------------------------------------------------+
| Forwarding: ${forwardPreviewStripEl?.textContent || 'Message Content'}                  |
| Search: [#input-forward-search]                                                         |
| [x] Select target recipients...                                                         |
| [#btn-forward-cancel] Cancel | [#btn-forward-submit] Forward Message                     |
+-----------------------------------------------------------------------------------------+`;
      }

      if (activeView === 'waitlist') {
        return `
+-----------------------------------------------------------------------------------------+
| [Header] Phone: +91 91766 50591 | [View: Waitlist (${currentWaitlist.length})] | [#btn-auth-logout]            |
+-----------------------------------------------------------------------------------------+
| [#btn-view-chat] [Messages] | *[#btn-view-waitlist] [Waitlist Requests]                 |
+-----------------------------------------------------------------------------------------+`;
      }

      const stats = currentStats || { monthlyServiceCount: 0, dailyRecipientsCount: 0, walletBalance: 0.5 };
      const r2 = stats.r2 || { storageBytes: 0, isCapped: false };
      const r2Mb = (r2.storageBytes / (1024 * 1024)).toFixed(2);

      let out = `
+-----------------------------------------------------------------------------------------+
| [Header] Vydy WhatsApp Hub | Monthly: ${stats.monthlyServiceCount}/1000 | Daily: ${stats.dailyRecipientsCount}/250 | Bal: $${stats.walletBalance.toFixed(2)} |
| [Live Sync: Active] | R2: ${r2Mb} MB / 9.00 GB SAFE | [#btn-sync-now] [Sync]                    |
+-----------------------------------------------------------------------------------------+
| [#btn-view-chat] [Messages] | [#btn-view-waitlist] [Waitlist] | [#btn-view-multisend] [Multi Send]|
+-----------------------------------------------------------------------------------------+\n`;

      if (!activeCustomer) {
        out += '| (No conversation selected - pick one from sidebar)                              |\n';
        out += '+-----------------------------------------------------------------------------------------+\n';
        return out;
      }

      out += `| CONVERSATIONS                       | CHAT: ${activeCustomer.name} (${activeCustomer.phoneNumber}) [${activeCustomer.id}]\n`;
      out += `|                                     | [CSW: ${activeCustomer.csw.label}] [#btn-search-messages] [#btn-toggle-customer-drawer]\n`;
      out += '|-------------------------------------+---------------------------------------------------|\n';
      currentMessages.slice(-5).forEach(m => {
        const who = m.direction === 'inbound' ? 'Customer' : 'Store';
        const typeInfo = m.type !== 'text' ? `[${m.type.toUpperCase()}: ${m.media_filename || 'media'}]` : '';
        const body = (m.body || typeInfo).slice(0, 35);
        out += `|                                     | ${who}: ${body}\n`;
      });
      out += '|-------------------------------------+---------------------------------------------------|\n';
      if (stagedAttachment) {
        out += `|                                     | [STAGED ATTACHMENT: ${stagedAttachment.type} - ${stagedAttachment.filename}]\n`;
      }
      out += `|                                     | [#btn-attachment] [#btn-quick-templates] [#input-msg]\n`;
      out += `|                                     | [#btn-send] Send Reply\n`;
      out += '+-----------------------------------------------------------------------------------------+\n';
      return out;
    }
  };

  // Initial Boot
  async function init() {
    setupEventListeners();
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
