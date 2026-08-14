<template>
  <div class="app-layout">
    <a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
    <header class="app-header">
      <div class="header-inner">
        <NuxtLink to="/" class="logo-area" aria-label="Thailand Disaster Watch หน้าหลัก">
          <span class="logo-icon" aria-hidden="true"><span class="material-symbols-rounded">shield</span></span>
          <span class="brand-copy">
            <strong class="logo-text">Thailand Disaster Watch</strong>
            <span class="logo-subtitle">ระบบติดตามน้ำ ไฟ ฝุ่น และพยากรณ์</span>
          </span>
        </NuxtLink>
        <nav class="header-nav" aria-label="เมนูข้อมูลหลัก">
          <a href="#map-section">แผนที่</a>
          <a href="#water-section">น้ำ</a>
          <a href="#fire-section">ไฟป่า</a>
          <a href="#air-section">ฝุ่น</a>
          <a href="#forecast-section">พยากรณ์</a>
        </nav>
        <div class="header-status">
          <div class="header-time">
            <span class="header-live-dot" aria-hidden="true"></span>
            <span>{{ currentTime }}</span>
          </div>
          <button
            class="theme-toggle"
            type="button"
            :aria-label="isDarkMode ? 'เปลี่ยนเป็นโหมดสว่าง' : 'เปลี่ยนเป็นโหมดมืด'"
            :aria-pressed="isDarkMode"
            @click="toggleTheme"
          >
            <span class="material-symbols-rounded" aria-hidden="true">{{ isDarkMode ? 'light_mode' : 'dark_mode' }}</span>
          </button>
        </div>
      </div>
    </header>
    <main id="main-content" class="main-content" tabindex="-1">
      <slot />
    </main>
    <footer class="app-footer">
      <p>Thailand Disaster Watch · ข้อมูลเพื่อการเฝ้าระวัง โปรดติดตามประกาศทางการเมื่อเกิดเหตุฉุกเฉิน</p>
    </footer>
    <ChatbotWidget />
  </div>
</template>

<script setup>
const currentTime = ref('')
const isDarkMode = ref(false)
let timer = null

function applyTheme(theme) {
  isDarkMode.value = theme === 'dark'
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.style.colorScheme = theme
}

function toggleTheme() {
  const nextTheme = isDarkMode.value ? 'light' : 'dark'
  applyTheme(nextTheme)
  localStorage.setItem('theme', nextTheme)
}

function updateTime() {
  currentTime.value = new Date().toLocaleString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  const preferredTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  const initialTheme = document.documentElement.getAttribute('data-theme') || savedTheme || preferredTheme
  applyTheme(initialTheme)
  updateTime()
  timer = setInterval(updateTime, 60000)
})

onUnmounted(() => clearInterval(timer))
</script>
