// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@nuxtjs/leaflet', '@vite-pwa/nuxt'],
  hooks: {
    // @nuxtjs/leaflet injects its CSS as a server stylesheet. On Windows dev
    // that bare path can be emitted more than once and one copy resolves to a
    // 404 URL. The main stylesheet imports it once before the map mounts.
    ready(nuxt) {
      nuxt.options.css = nuxt.options.css.filter(entry => entry !== 'leaflet/dist/leaflet.css')
    },
  },
  vite: {
    ssr: {
      external: ['@prisma/client']
    }
  },
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Thailand Disaster Watch',
      short_name: 'TH Disaster',
      description: 'ระบบติดตามน้ำ ไฟป่า ฝุ่น PM2.5 ฝน และแนวโน้มสถานการณ์ทั่วประเทศไทย',
      theme_color: '#f7f5ef',
      background_color: '#f7f5ef',
      display: 'standalone',
      icons: [
        {
          src: '/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ]
    },
    workbox: {
      navigateFallback: '/',
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      cleanupOutdatedCaches: true,
      clientsClaim: true,
      skipWaiting: true,
      // Dashboard responses are never cached by the service worker. The
      // server may return a short-lived stale cache only when it came from a
      // real upstream API and labels that response explicitly.
      runtimeCaching: [],
    },
    devOptions: {
      enabled: false,
      type: 'module'
    }
  },
  app: {
    head: {
      htmlAttrs: { lang: 'th' },
      title: 'Thailand Disaster Watch — น้ำ ไฟ ฝุ่น และพยากรณ์',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'ติดตามระดับน้ำ จุดความร้อน ฝน PM2.5 และแนวโน้มสถานการณ์ทั่วประเทศไทยจาก Open Data' },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,300;6..72,400;6..72,500;6..72,600&family=Noto+Sans+Thai:wght@300;400;500;600;700&family=Noto+Serif+Thai:wght@300;400;500;600&display=swap' },
        { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0' },
      ],
      script: [
        {
          innerHTML: "try{const t=localStorage.getItem('theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t}catch{}",
        },
      ],
    },
  },
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    firmsMapKey: process.env.FIRMS_MAP_KEY || '',
    openweatherApiKey: process.env.OPENWEATHER_API_KEY || '',
    aqicnApiToken: process.env.AQICN_API_TOKEN || '',
  },
  nitro: {
    routeRules: {
      '/api/**': { cors: true },
    },
  },
})
