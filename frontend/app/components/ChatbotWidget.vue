<template>
  <div class="chatbot-container">
    <!-- Chat Window -->
    <Transition name="slide-up">
      <div
        v-if="isOpen"
        id="chat-assistant-panel"
        class="chat-window glass-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="chat-assistant-title"
        @keydown.esc="closeChat"
      >
        <div class="chat-header">
          <div class="header-info">
            <span class="material-symbols-rounded" aria-hidden="true">robot_2</span>
            <div>
              <h3 id="chat-assistant-title" class="chat-title">ผู้ช่วยข้อมูลภัยพิบัติ</h3>
              <p class="chat-subtitle">ถามข่าวสารน้ำท่วม/ไฟป่าได้เลย</p>
            </div>
          </div>
          <button type="button" class="icon-btn" aria-label="ปิดผู้ช่วยข้อมูล" @click="closeChat">
            <span class="material-symbols-rounded" aria-hidden="true">close</span>
          </button>
        </div>

        <div
          ref="messagesContainer"
          class="chat-messages"
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          :aria-busy="isLoading"
        >
          <div 
            v-for="(msg, index) in messages" 
            :key="index"
            class="message-wrapper"
            :class="msg.role"
          >
            <div class="message-bubble">
              {{ msg.content }}
            </div>
          </div>
          
          <div v-if="isLoading" class="message-wrapper assistant">
            <div class="message-bubble loading-bubble" aria-label="กำลังค้นหาคำตอบ">
              <span class="typing-dot" aria-hidden="true"></span>
              <span class="typing-dot" aria-hidden="true"></span>
              <span class="typing-dot" aria-hidden="true"></span>
            </div>
          </div>
        </div>

        <div class="chat-input-area">
          <p class="chat-disclaimer">ไม่ใช้แทนประกาศฉุกเฉินจากหน่วยงานรัฐ</p>
          <form class="chat-form" @submit.prevent="sendMessage">
            <input 
              ref="chatInput"
              v-model="inputMsg" 
              type="text" 
              placeholder="พิมพ์คำถามที่นี่..." 
              aria-label="คำถามถึงผู้ช่วยข้อมูลภัยพิบัติ"
              :disabled="isLoading"
              class="chat-input"
            />
            <button type="submit" class="send-btn" aria-label="ส่งคำถาม" :disabled="!inputMsg.trim() || isLoading">
              <span class="material-symbols-rounded" aria-hidden="true">send</span>
            </button>
          </form>
        </div>
      </div>
    </Transition>

    <!-- Floating Action Button -->
    <button 
      ref="fabButton"
      type="button"
      class="chat-fab" 
      @click="toggleChat"
      :class="{ 'is-open': isOpen }"
      :aria-label="isOpen ? 'ปิดผู้ช่วยข้อมูล' : 'เปิดผู้ช่วยข้อมูล'"
      :aria-expanded="isOpen"
      aria-controls="chat-assistant-panel"
    >
      <span class="material-symbols-rounded" aria-hidden="true">{{ isOpen ? 'keyboard_arrow_down' : 'chat' }}</span>
    </button>
  </div>
</template>

<script setup>
const isOpen = ref(false)
const inputMsg = ref('')
const isLoading = ref(false)
const messagesContainer = ref(null)
const chatInput = ref(null)
const fabButton = ref(null)

const messages = ref([
  {
    role: 'assistant',
    content: 'สวัสดีครับ ผมช่วยสรุปข้อมูลน้ำ ไฟป่า และคุณภาพอากาศบนแดชบอร์ดนี้ได้ ต้องการดูเรื่องใดครับ?'
  }
])

async function sendMessage() {
  if (!inputMsg.value.trim() || isLoading.value) return
  
  const userMsg = inputMsg.value
  messages.value.push({ role: 'user', content: userMsg })
  inputMsg.value = ''
  isLoading.value = true
  scrollToBottom()
  
  try {
    const data = await $fetch('/api/chat', {
      method: 'POST',
      body: { message: userMsg },
      timeout: 20000,
    })

    messages.value.push({ 
      role: 'assistant', 
      content: normalizeAssistantText(data?.response || 'ขออภัยครับ ยังไม่สามารถประมวลผลคำถามนี้ได้')
    })
  } catch (err) {
    console.error(err)
    messages.value.push({ 
      role: 'assistant', 
      content: 'ผู้ช่วยข้อมูลขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้งครับ'
    })
  } finally {
    isLoading.value = false
    scrollToBottom()
  }
}

function normalizeAssistantText(value) {
  return String(value)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

async function toggleChat() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    await nextTick()
    chatInput.value?.focus()
  }
}

async function closeChat() {
  isOpen.value = false
  await nextTick()
  fabButton.value?.focus()
}

function scrollToBottom() {
  setTimeout(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  }, 50)
}
</script>

<style scoped>
.chatbot-container {
  position: fixed;
  right: clamp(14px, 2vw, 24px);
  bottom: clamp(14px, 2vw, 24px);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.chat-fab {
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--accent) 72%, var(--border-subtle));
  border-radius: 18px;
  color: #fff;
  background: var(--accent);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--accent) 25%, transparent);
  cursor: pointer;
  transition: transform 220ms cubic-bezier(.2, .8, .2, 1), box-shadow 220ms ease, background 180ms ease, color 180ms ease;
}

.chat-fab:hover {
  transform: translateY(-2px);
  background: var(--accent-hover);
  box-shadow: 0 16px 34px color-mix(in srgb, var(--accent) 31%, transparent);
}

.chat-fab:active { transform: translateY(0) scale(.98); }
.chat-fab.is-open { color: var(--accent); background: var(--bg-card); }
.chat-fab .material-symbols-rounded {
  font-size: 25px;
}

.chat-window {
  position: relative;
  isolation: isolate;
  width: min(390px, calc(100vw - 32px));
  height: min(570px, calc(100vh - 112px));
  max-height: calc(100dvh - 96px);
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl, 22px);
  background: color-mix(in srgb, var(--bg-card) 96%, transparent);
  box-shadow: var(--shadow-elevated);
  overflow: hidden;
  backdrop-filter: blur(20px) saturate(125%);
}

.chat-window::before {
  position: absolute;
  inset: 0 0 auto;
  z-index: 2;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--accent), transparent);
  content: '';
  opacity: .7;
  pointer-events: none;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 18px 18px 16px;
  background: color-mix(in srgb, var(--bg-card) 90%, var(--accent-soft));
  border-bottom: 1px solid var(--border-subtle);
}

.header-info {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
}

.header-info .material-symbols-rounded {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 14px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 23px;
}

.chat-title {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-serif, Georgia, serif);
  font-size: 1rem;
  line-height: 1.3;
  letter-spacing: -.015em;
}

.chat-subtitle { margin: 2px 0 0; color: var(--text-muted); font-size: .72rem; }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 11px;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.message-wrapper {
  display: flex;
  width: 100%;
}

.message-wrapper.user {
  justify-content: flex-end;
}

.message-wrapper.assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 88%;
  padding: 10px 13px;
  border-radius: 16px;
  font-size: .86rem;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.user .message-bubble {
  background: var(--accent);
  color: #ffffff;
  border-bottom-right-radius: 5px;
  box-shadow: 0 5px 16px color-mix(in srgb, var(--accent) 15%, transparent);
}

.assistant .message-bubble {
  color: var(--text-primary);
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-bottom-left-radius: 5px;
}

.chat-input-area {
  padding: 12px 14px 14px;
  border-top: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-primary) 75%, var(--bg-card));
}

.chat-disclaimer {
  margin: 0 0 7px;
  color: var(--text-muted);
  font-size: .68rem;
  line-height: 1.4;
  text-align: center;
}

.chat-form {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--border-subtle);
  border-radius: 17px;
  background: var(--bg-secondary);
  transition: border-color 180ms ease, box-shadow 180ms ease;
}

.chat-form:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }

.chat-input {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  border-radius: 13px;
  padding: 8px 11px;
  outline: none;
}

.chat-input::placeholder { color: var(--text-muted); }
.chat-input:disabled { cursor: wait; opacity: .7; }

.send-btn {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 0;
  border-radius: 13px;
  color: #ffffff;
  background: var(--accent);
  cursor: pointer;
  transition: opacity 180ms ease, transform 150ms ease, background 180ms ease;
}

.send-btn:hover:not(:disabled) { background: var(--accent-hover); }
.send-btn:active { transform: scale(.97); }

.send-btn:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.loading-bubble {
  display: flex;
  gap: 4px;
  align-items: center;
  min-height: 38px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  background: var(--text-secondary);
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out both;
}

.typing-dot:nth-child(1) { animation-delay: -0.32s; }
.typing-dot:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0); }
  40% { transform: scale(1); }
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 220ms ease, transform 260ms cubic-bezier(.2, .8, .2, 1);
  transform-origin: bottom right;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: scale(.96) translateY(12px);
}

@media (max-width: 480px) {
  .chatbot-container { right: 12px; bottom: 12px; left: 12px; }
  .chat-window {
    width: 100%;
    height: min(68dvh, 560px);
    max-height: calc(100dvh - 88px);
    margin-bottom: 10px;
    border-radius: 20px;
  }
  .chat-header { padding: 14px; }
  .chat-messages { padding: 14px; }
  .message-bubble { max-width: 92%; }
  .chat-fab { width: 54px; height: 54px; border-radius: 17px; }
}

@media (prefers-reduced-motion: reduce) {
  .chat-fab,
  .slide-up-enter-active,
  .slide-up-leave-active,
  .send-btn { transition: none; }
  .typing-dot { animation: none; opacity: .65; }
}
</style>
