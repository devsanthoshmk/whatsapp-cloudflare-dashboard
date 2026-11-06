# Unity-Lite Plan: WhatsApp Dashboard Mobile Responsiveness Overhaul

**Target Repository:** `/home/santhoshmk/EDUCATION CONTENT/Freelancing/wa automation vydy`  
**Target Deployment:** `https://whatsapp-cloudflare-dashboard.sanpro.workers.dev`  
**Primary Files:** `dist/index.html`, `dist/app.js`  
**Status:** Approved for Implementation  
**Workflow:** Unity-Lite (Planning Level 1)  

---

## 1. Executive Summary & Root Cause Analysis

### Identified Failure Modes on Mobile Viewports (360px – 412px):
1. **Side-by-Side Squish (45% / 55%)**:
   - In `dist/index.html`, `#chat-view` uses `display: flex;` with no media queries for mobile.
   - `.sidebar` has fixed constraints (`width: 330px; min-width: 290px; max-width: 380px;`).
   - `.chat-pane` has `flex: 1;`.
   - On narrow mobile viewports (< 420px), both containers flex-shrink against each other into cramped columns (~160px–180px), crushing text, clipping avatars, truncating message bubbles into single-character slivers, and breaking the composer.
2. **Header Wrapping & Height Overflow**:
   - `header` uses `flex-wrap: wrap; gap: 0.85rem;` containing brand, connection status badge, view switcher, live sync indicator, sync button, 4 segmented metric cards, and logout.
   - On mobile, this wraps indiscriminately into 4 to 5 chaotic rows (~220px tall).
   - Meanwhile, `main` uses `height: calc(100vh - 61px);`. When the header exceeds 61px, `main` is pushed down, cutting off the bottom composer beneath the viewport fold and creating awkward double-scroll behavior.
   - In the segmented metrics strip, cards with `min-width: 130px` overflow horizontally and text such as "0 / 1000 Free" is clipped on the left edge.
3. **Absence of Standard Mobile Messaging UX**:
   - No single-pane state management. On mobile, standard messaging apps (WhatsApp / Telegram) show a **full-width conversations list** when no chat is open, and seamlessly transition into a **full-width chat view** upon selecting a customer.
   - Missing mobile `< Back` button in the chat header to return to the conversation list.
   - Missing `popstate` / browser history handling for native Android back button or mobile edge-swipe gestures.
   - Composer lacks safe-area inset padding (`env(safe-area-inset-bottom)`) and iOS Safari 16px font-size protection against auto-zooming.
   - Modals (PDF viewer, Image lightbox, Forward modal, Multi-send modal, Customer details drawer) lack full-screen or bottom-sheet responsiveness. The lightbox header at `top: -48px` renders offscreen on mobile.

---

## 2. Implementation Direction & Architectural Decisions

### 2.1 Mobile Breakpoint Strategy
- **Primary Mobile Breakpoint**: `@media (max-width: 768px)` (tablets and phones).
- **Compact Mobile Breakpoint**: `@media (max-width: 480px)` (narrow mobile devices: 360px–412px).
- **Desktop Invariance**: Viewports > 768px remain strictly identical to current production layout with zero regressions.

### 2.2 Layout & Viewport Architecture
1. **Viewport Meta Tag**:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
   ```
2. **Dynamic Viewport Height (`100dvh`)**:
   - Replace brittle `calc(100vh - 61px)` with a flex column container:
   ```css
   body {
     display: flex;
     flex-direction: column;
     height: 100dvh;
     min-height: 100dvh;
     overflow: hidden;
   }
   header {
     flex-shrink: 0;
   }
   main {
     flex: 1;
     min-height: 0;
     height: auto;
     display: flex;
     overflow: hidden;
   }
   ```

### 2.3 Mobile State Management: Single-Pane Navigation
- **State Definition**: In `dist/app.js`, track `mobileActiveView: 'list' | 'chat'` (initial state: `'list'`).
- **DOM State Binding**: Apply class `.mobile-chat-active` to `#chat-view`.
- **CSS Pane Switching (<= 768px)**:
  - Default (`#chat-view:not(.mobile-chat-active)`):
    - `.sidebar`: `display: flex; width: 100%; min-width: 100%; max-width: 100%; height: 100%;`
    - `.chat-pane`: `display: none !important;`
  - Active Chat (`#chat-view.mobile-chat-active`):
    - `.sidebar`: `display: none !important;`
    - `.chat-pane`: `display: flex !important; width: 100%; min-width: 100%; max-width: 100%; height: 100%;`
- **Mobile Back Button**:
  - Insert `#btn-chat-back` in `#chat-header` before `#chat-header-avatar`:
    ```html
    <button id="btn-chat-back" class="btn-chat-back" type="button" aria-label="Back to conversations" title="Back">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
    </button>
    ```
  - Desktop (`> 768px`): `display: none;`
  - Mobile (`<= 768px`): `display: flex;`
- **History & Gestures**:
  - Upon `selectCustomer(waId)`:
    - Set `mobileActiveView = 'chat'`.
    - Add class `mobile-chat-active` to `#chat-view`.
    - Push state: `history.pushState({ view: 'chat', waId }, '')`.
  - Upon `#btn-chat-back` click or window `popstate`:
    - Set `mobileActiveView = 'list'`.
    - Remove class `mobile-chat-active` from `#chat-view`.
    - Deselect active conversation (`activeCustomer = null`), reset header, and show conversations list.

### 2.4 Header Reorganization: 3-Tier Mobile App Bar
On mobile viewports (<= 768px), reorganize `header` into 3 compact tiers:
1. **Tier 1 (Top App Bar)**:
   - Left: Brand Logo (30x30px) + "Santhosh Freelancing" (0.85rem) + Connection status dot.
   - Right: Live Sync indicator dot + `#btn-sync-now` (icon only or compact) + `#btn-toggle-metrics` ("Limits ▾") + `#btn-auth-logout` (compact icon).
2. **Tier 2 (View Switcher Tabs)**:
   - Full-width segmented pill control:
     `[ Messages ]  [ Waitlist (0) ]  [ Multi Send ]`
   - Spans 100% width, equal tab widths (`flex: 1`), minimum touch height 40px.
3. **Tier 3 (Horizontally Swipeable Metrics Strip)**:
   - `.metrics-group`: Horizontally scrollable strip with touch momentum and snap alignment:
     ```css
     display: flex;
     overflow-x: auto;
     -webkit-overflow-scrolling: touch;
     scroll-snap-type: x mandatory;
     gap: 0.5rem;
     padding: 0.35rem 0.5rem;
     scrollbar-width: none;
     ```
   - Each `.metric-card`: `flex: 0 0 auto; min-width: 135px; scroll-snap-align: start;` with individual subtle border and compact font sizes (label: 0.65rem, value: 0.78rem).
   - Collapsible via Tier 1 toggle button (`#btn-toggle-metrics`) to free vertical space on small viewports.

### 2.5 Bottom Composer & Safe-Area Insets
- **Safe Area**:
  ```css
  .composer {
    padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));
    box-sizing: border-box;
  }
  ```
- **Input Zoom Fix**: `input, textarea { font-size: 16px; }` on mobile to prevent iOS Safari auto-zooming on focus.
- **Tools & Buttons**: Minimum touch target 40px × 40px for `#btn-attachment`, `#btn-quick-templates`, and `#btn-send`.
- **Canned Responses Popover (`#templates-popover`)**:
  - Mobile: Full width bottom sheet anchored above composer: `left: 8px; right: 8px; bottom: 70px; max-width: none; min-width: auto;`.

### 2.6 Fullscreen / Bottom-Sheet Overlays for Modals & Drawers
1. **PDF Viewer Modal (`#pdf-modal`)**:
   - Mobile: Fullscreen `inset: 0; width: 100%; height: 100dvh; max-width: 100%; max-height: 100%; border-radius: 0;`.
   - Compact header with icon-only action buttons.
2. **Image Lightbox (`#lightbox-modal`)**:
   - Mobile: Fullscreen `width: 100vw; height: 100dvh; max-width: 100vw; max-height: 100dvh;`.
   - Header moved inside top edge (`top: 0; padding: env(safe-area-inset-top, 8px) 12px;`) preventing the `-48px` clipping bug.
3. **Customer Details Drawer (`#customer-drawer`)**:
   - Mobile: Full-width slide-in drawer (`width: 100%; max-width: 100%; inset: 0;`) with mobile back/close button and tap-to-dismiss backdrop.
4. **Forward Modal (`#forward-modal`) & Multi-Send Modal (`#multisend-modal`)**:
   - Mobile: Bottom-sheet card anchored to bottom (`border-radius: 16px 16px 0 0; max-height: 90dvh; width: 100%;`).
   - Single-column layout for Multi-Send modal (`grid-template-columns: 1fr;`).
5. **Waitlist View (`#waitlist-view`)**:
   - Mobile: `padding: 0.75rem;` with horizontal table scroll containment (`overflow-x: auto; -webkit-overflow-scrolling: touch;`).

---

## 3. Subagent Structure Graph

```text
                        +-----------------------------+
                        |      IMPLEMENTER (L0)       |
                        +-----------------------------+
                          /         |         \      \
                         /          |          \      \
                        v           |           v      v
              +------------------+  |  +--------------------+  +----------------------+
              | Group 1: Found-  |<-+  | Group 2: Chat &    |  | Group 3: Modals &    |
              | ations & Test    |     | Header Navigation  |  | Secondary Views      |
              | Harness          |     | Implementation     |  | Implementation       |
              +------------------+     +--------------------+  +----------------------+
                        \                    /                   /
                         \                  /                   /
                          v                v                   v
                        +---------------------------------------+
                        | Group 4: Multi-Viewport Verification  |
                        | & Visual Regression Testing (L1)      |
                        +---------------------------------------+
```

---

## 4. Execution Group Diagram

```text
[Group 1: Foundations & Architecture]
 ├── Task 1.1: Viewport Meta & 100dvh Flex Layout Structure (dist/index.html)
 ├── Task 1.2: Mobile State Machine & Back Button Engine (dist/app.js)
 └── Task 1.3: Playwright Multi-Viewport Headless Test Suite Setup
      │
      ▼
[Group 2: Core Mobile UX & Navigation]
 ├── Task 2.1: Full-Width Conversations List & Chat Pane Transitions (dist/index.html, dist/app.js)
 ├── Task 2.2: Compact Header & Swipeable Metrics Strip (dist/index.html, dist/app.js)
 └── Task 2.3: Mobile Keyboard Composer & In-Chat Search Optimization (dist/index.html)
      │
      ▼
[Group 3: Modals, Drawers & Secondary Views]
 ├── Task 3.1: Fullscreen PDF Viewer & Repositioned Lightbox (dist/index.html)
 ├── Task 3.2: Mobile Customer Drawer & Bottom-Sheet Modals (dist/index.html, dist/app.js)
 └── Task 3.3: Mobile Waitlist View & Table Scroll Containment (dist/index.html)
      │
      ▼
[Group 4: Verification & Sign-Off]
 ├── Task 4.1: Automated Playwright Tests across 375px, 390px, 412px, 768px, 1280px
 ├── Task 4.2: End-to-End Interaction & History Popstate Verification
 └── Task 4.3: Visual Screenshot Audit & Acceptance Criteria Verification
```

---

## 5. Detailed Task Specifications

### Group 1: Foundations & Architecture Setup

#### Task 1.1: Viewport Meta & 100dvh Flex Layout Structure
- **Target File**: `dist/index.html`
- **Actions**:
  1. Update viewport meta tag:
     `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`.
  2. Remove fixed `height: calc(100vh - 61px);` on `main`.
  3. Set `body` to `display: flex; flex-direction: column; height: 100dvh; min-height: 100dvh; overflow: hidden;`.
  4. Set `header` to `flex-shrink: 0;`.
  5. Set `main` to `flex: 1; min-height: 0; height: auto; display: flex; overflow: hidden;`.
- **Verification**: `main` dynamically fills the remaining space beneath `header` regardless of header height.

#### Task 1.2: Mobile State Machine & Back Navigation Engine
- **Target File**: `dist/app.js`
- **Actions**:
  1. Define module-level state `let mobileActiveView = 'list';` (`'list' | 'chat'`).
  2. Define helper `setMobileView(view: 'list' | 'chat', pushHistory = true)`:
     - If `view === 'chat'`:
       - Add class `mobile-chat-active` to `#chat-view`.
       - If `pushHistory`, `history.pushState({ mobileView: 'chat', waId: activeCustomer?.waId }, '')`.
     - If `view === 'list'`:
       - Remove class `mobile-chat-active` from `#chat-view`.
       - If `pushHistory`, `history.pushState({ mobileView: 'list' }, '')`.
  3. Hook into `selectCustomer(waId)`:
     - After loading conversation, call `setMobileView('chat')`.
  4. Add `window.addEventListener('popstate', (e) => { ... })`:
     - If state is `'list'` or null, switch to list view without reloading.
  5. Expose `window.WhatsAppDashboard.setMobileView(view)` for testing.
- **Verification**: Invoking `setMobileView('chat')` and `setMobileView('list')` toggles the `.mobile-chat-active` class and reflects in state.

#### Task 1.3: Playwright Multi-Viewport Test Harness
- **Target File**: `scripts/verify-mobile.py` (or node test script)
- **Actions**:
  1. Create automated script running Chromium headless.
  2. Test viewports:
     - iPhone SE / 13 mini: `375 x 812`
     - iPhone 14 / 15: `390 x 844`
     - Samsung Galaxy / Pixel: `412 x 915`
     - Tablet portrait: `768 x 1024`
     - Desktop: `1280 x 800`
  3. Assert no horizontal page overflow (`document.documentElement.scrollWidth <= window.innerWidth`).
  4. Assert bounding boxes of `.sidebar` and `.chat-pane`.
- **Verification**: Script runs in < 3 seconds and outputs pass/fail metrics.

---

### Group 2: Core Mobile UX & Navigation (Chat View & Header)

#### Task 2.1: Full-Width Conversations List & Chat Pane Transitions
- **Target Files**: `dist/index.html`, `dist/app.js`
- **Actions**:
  1. In `dist/index.html`:
     - Inside `#chat-header`, insert `#btn-chat-back` button with SVG arrow icon.
     - Add CSS rules for `@media (max-width: 768px)`:
       ```css
       @media (max-width: 768px) {
         #chat-view {
           position: relative;
           width: 100%;
           height: 100%;
         }
         #chat-view:not(.mobile-chat-active) .sidebar {
           display: flex !important;
           width: 100% !important;
           min-width: 100% !important;
           max-width: 100% !important;
           flex: 1;
           border-right: none;
         }
         #chat-view:not(.mobile-chat-active) .chat-pane {
           display: none !important;
         }
         #chat-view.mobile-chat-active .sidebar {
           display: none !important;
         }
         #chat-view.mobile-chat-active .chat-pane {
           display: flex !important;
           width: 100% !important;
           min-width: 100% !important;
           max-width: 100% !important;
           flex: 1;
         }
         .btn-chat-back {
           display: flex;
           align-items: center;
           justify-content: center;
           width: 36px;
           height: 36px;
           background: transparent;
           border: none;
           color: #f1f5f9;
           cursor: pointer;
           border-radius: 8px;
           margin-right: 0.35rem;
           flex-shrink: 0;
         }
         .chat-header {
           padding: 0.5rem 0.75rem;
         }
         .chat-header-avatar {
           width: 34px;
           height: 34px;
           font-size: 0.8rem;
         }
         .chat-user-title {
           font-size: 0.88rem;
         }
         .chat-meta {
           font-size: 0.68rem;
         }
       }
       @media (min-width: 769px) {
         .btn-chat-back {
           display: none !important;
         }
       }
       ```
  2. In `dist/app.js`:
     - Bind click listener on `#btn-chat-back` to call `setMobileView('list')`.
- **Verification**: On 375px viewport, opening conversation slides into full-width chat pane; clicking back returns to full-width conversation list.

#### Task 2.2: Compact Mobile Header & Horizontally Swipeable Metrics Strip
- **Target Files**: `dist/index.html`, `dist/app.js`
- **Actions**:
  1. In `dist/index.html`:
     - Restructure header layout under `@media (max-width: 768px)`:
       - `.brand-section`: Compact flex row with brand logo, title, and connected dot.
       - `#view-switcher`: Full-width row beneath brand with 3 equal tabs (`Messages`, `Waitlist`, `Multi Send`).
       - `.header-actions`: Compact actions bar containing sync button, metrics toggle, and logout button.
       - `#metrics-group`: Horizontally scrollable strip:
         ```css
         @media (max-width: 768px) {
           .metrics-group {
             display: flex;
             overflow-x: auto;
             -webkit-overflow-scrolling: touch;
             scroll-snap-type: x mandatory;
             gap: 0.5rem;
             padding: 0.35rem 0.5rem;
             width: 100%;
             box-sizing: border-box;
             scrollbar-width: none;
           }
           .metrics-group::-webkit-scrollbar {
             display: none;
           }
           .metric-card {
             flex: 0 0 auto;
             min-width: 135px;
             scroll-snap-align: start;
             padding: 0.35rem 0.6rem;
             border-radius: 8px;
             background: rgba(0, 0, 0, 0.4);
             border: 1px solid var(--border-subtle);
           }
           .metric-divider {
             display: none;
           }
         }
         ```
     - Add collapsible toggle `#btn-toggle-metrics` so users can expand/collapse the metrics strip on mobile.
  2. In `dist/app.js`:
     - Toggle visibility class on `.metrics-group` when `#btn-toggle-metrics` is clicked (default: visible or collapsed based on screen height).
- **Verification**: On 375px viewport, header is compact (<= 95px tall), tabs span 100%, and metrics strip swipes smoothly horizontally without wrapping into 5 rows.

#### Task 2.3: Mobile Keyboard Friendly Composer & In-Chat Search
- **Target File**: `dist/index.html`
- **Actions**:
  1. In `.composer`:
     - Add safe-area padding: `padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom, 0px));`.
     - Set `input#input-msg { font-size: 16px; }` on mobile to prevent iOS Safari auto-zoom.
     - `.composer-row`: compact padding `0.25rem 0.45rem 0.25rem 0.65rem;`.
     - Attachment chip and 24h CSW banner: responsive sizing, `font-size: 0.72rem`, word wrap.
  2. In `.messages-container`:
     - Reduce mobile padding: `padding: 0.75rem 0.65rem;`.
     - Increase `.msg-row` max-width: `max-width: 86%;`.
  3. In `#chat-search-bar`:
     - Ensure search bar stretches full width with compact input and touch-friendly close button.
- **Verification**: Message bubbles are spacious and readable; composer input does not trigger browser viewport zoom on focus.

---

### Group 3: Modals, Drawers & Secondary Views

#### Task 3.1: Fullscreen PDF Viewer & Repositioned Lightbox
- **Target File**: `dist/index.html`
- **Actions**:
  1. `#pdf-modal .pdf-modal-container`:
     ```css
     @media (max-width: 768px) {
       .pdf-modal-container {
         width: 100vw;
         height: 100dvh;
         max-width: 100vw;
         max-height: 100dvh;
         border-radius: 0;
         border: none;
       }
       .pdf-modal-header {
         padding: 0.65rem 0.85rem;
       }
       .pdf-title-text {
         max-width: 160px;
         white-space: nowrap;
         overflow: hidden;
         text-overflow: ellipsis;
       }
     }
     ```
  2. `#lightbox-modal .lightbox-container`:
     ```css
     @media (max-width: 768px) {
       .lightbox-container {
         width: 100vw;
         height: 100dvh;
         max-width: 100vw;
         max-height: 100dvh;
       }
       .lightbox-header {
         position: static;
         width: 100%;
         padding: 0.75rem 1rem;
         background: rgba(17, 19, 27, 0.9);
       }
       .lightbox-body {
         flex: 1;
         display: flex;
         align-items: center;
         justify-content: center;
         padding: 0.5rem;
       }
       .lightbox-body img {
         max-width: 100%;
         max-height: 100%;
         object-fit: contain;
       }
     }
     ```
- **Verification**: PDF viewer and image lightbox take 100% of mobile viewport; lightbox close button is visible and tappable inside the screen.

#### Task 3.2: Mobile Customer Details Drawer & Bottom-Sheet Modals
- **Target Files**: `dist/index.html`, `dist/app.js`
- **Actions**:
  1. `#customer-drawer`:
     - Mobile: `width: 100%; max-width: 100%; inset: 0;` (full screen slide-over).
     - Add tap-to-close backdrop overlay `#drawer-backdrop`.
  2. `#forward-modal` & `#multisend-modal`:
     - Mobile: Bottom-sheet card anchored to bottom (`border-radius: 16px 16px 0 0; max-height: 90dvh;`).
     - `#multisend-body`: Already single column at 820px, optimize padding and contact chips for mobile touch.
  3. `#templates-popover`:
     - Mobile: Anchored as bottom sheet above composer (`left: 8px; right: 8px; bottom: 70px; max-width: none; min-width: auto;`).
- **Verification**: Opening customer drawer, forward modal, or templates popover covers mobile screen cleanly without off-screen clipping.

#### Task 3.3: Mobile Waitlist View & Table Scroll Containment
- **Target File**: `dist/index.html`
- **Actions**:
  1. `#waitlist-view`:
     - Mobile: `padding: 0.75rem;`.
     - Filter bar: wrap cleanly into 2 rows.
     - Table container: `overflow-x: auto; -webkit-overflow-scrolling: touch;`.
     - Action buttons: compact size, minimum touch target 36px.
- **Verification**: Switching to Waitlist view on 375px renders full data with smooth horizontal scrolling for wide columns.

---

### Group 4: Multi-Viewport Automated Testing & Verification

#### Task 4.1: Automated Multi-Viewport Playwright Test Suite
- **Target**: Execute Playwright suite across 5 viewports:
  1. `375 x 812` (iPhone SE / Mini)
  2. `390 x 844` (iPhone 14 / 15)
  3. `412 x 915` (Pixel 8 / Galaxy S24)
  4. `768 x 1024` (iPad portrait)
  5. `1280 x 800` (Desktop benchmark)
- **Checklist**:
  - `document.documentElement.scrollWidth === window.innerWidth` (no horizontal window overflow).
  - Header height <= 110px on mobile.
  - Sidebar width = 100% when no conversation selected.
  - Chat pane width = 100% when conversation selected.
  - Back button visible on mobile and hidden on desktop.
  - Modals render inside viewport bounds.

#### Task 4.2: End-to-End User Interaction Verification
- **Actions**:
  1. Load page at `375 x 812`.
  2. Click conversation item `#conv-cust_ayush_01`.
  3. Verify `#chat-view` receives `.mobile-chat-active`.
  4. Verify `.chat-pane` is visible and full width.
  5. Click `#btn-chat-back`.
  6. Verify `#chat-view` removes `.mobile-chat-active`.
  7. Verify `.sidebar` is visible and full width.
  8. Test browser `history.back()` behaves identically to `#btn-chat-back`.

#### Task 4.3: Visual Comparison & Sign-Off
- **Actions**:
  1. Capture screenshots at all test viewports.
  2. Compare against initial broken state (`/tmp/opencode/test-mobile-375.png`).
  3. Verify clean aesthetics, crisp typography, and touch target compliance.

---

## 6. Verification Criteria Matrix

| Viewport | Component | Expected Outcome | Verification Method |
|---|---|---|---|
| **375x812** | Conversations List | Full width (375px), 0 horizontal overflow, unclipped avatars & labels | Playwright bounding box check |
| **375x812** | Chat Thread | Full width (375px), message bubbles 86% max-width, no text truncation | Playwright DOM check & screenshot |
| **375x812** | Chat Header | Shows `< Back` button, customer avatar, name, CSW pill, Details button | Selector visibility assert |
| **375x812** | Back Button | Tap returns to full-width conversation list | Playwright click & state assert |
| **375x812** | Header Metrics | Horizontally swipeable strip, 0 clipped text, toggle button works | Scroll width & swipe simulation |
| **375x812** | Composer | Safe-area padding, 16px input, attachment & send buttons accessible | Bounding box & computed style check |
| **375x812** | PDF Modal | Fullscreen 100dvh, close button visible | Modal open & bounding box check |
| **375x812** | Lightbox | Header inside screen (no -48px clipping), image contained | Lightbox open & header bbox check |
| **375x812** | Customer Drawer | Full-width slide-over with dismiss backdrop | Drawer toggle & bbox check |
| **390x844** | Whole App | Zero page-level horizontal overflow (`scrollWidth == innerWidth`) | Window scrollWidth assertion |
| **412x915** | Android Nav | Hardware back gesture returns from chat to conversation list | `window.history.back()` event test |
| **1280x800** | Desktop Layout | Unchanged side-by-side 330px sidebar + flex chat pane; no back button | Regression check against baseline |

---

## 7. Rollback & Safety Strategy

1. **Direct File Targeting**: All changes reside strictly within `dist/index.html` and `dist/app.js`.
2. **Git Checkpoint**: A clean git branch / working tree allows instant revert with `git checkout -- dist/index.html dist/app.js`.
3. **Desktop Regression Guard**: All mobile CSS rules are encapsulated strictly within `@media (max-width: 768px)`, leaving the desktop rules completely untouched.
