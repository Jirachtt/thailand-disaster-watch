<template>
  <section class="glass-card air-panel" aria-labelledby="air-panel-title">
    <div class="module-header">
      <div class="module-heading">
        <span class="module-icon air" aria-hidden="true">
          <span class="material-symbols-rounded">air</span>
        </span>
        <div>
          <h2 id="air-panel-title">ฝุ่น PM2.5 และคุณภาพอากาศ</h2>
          <p>{{ sourceText }}</p>
        </div>
      </div>
      <span class="module-status" :class="normalizedStatus">
        <span class="status-dot" aria-hidden="true"></span>
        {{ statusText }}
      </span>
    </div>

    <div v-if="pending && !displayStations.length" class="module-skeleton" aria-label="กำลังโหลดข้อมูลคุณภาพอากาศ">
      <div class="skeleton-line wide"></div>
      <div class="skeleton-cards">
        <div v-for="index in 4" :key="index" class="skeleton-card"></div>
      </div>
    </div>

    <div v-else-if="!displayStations.length" class="module-empty">
      <span class="material-symbols-rounded" aria-hidden="true">cloud_off</span>
      <h3>{{ isUnavailable ? 'เชื่อมต่อข้อมูลคุณภาพอากาศไม่ได้' : 'ยังไม่มีข้อมูลคุณภาพอากาศ' }}</h3>
      <p>{{ isUnavailable ? 'ระบบจะไม่สร้างค่าทดแทน กรุณาลองเชื่อมต่อแหล่งข้อมูลอีกครั้ง' : 'กำลังรอข้อมูลสถานี' }}</p>
      <button type="button" class="secondary-btn" @click="$emit('retry')">
        <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
        ลองเชื่อมต่ออีกครั้ง
      </button>
    </div>

    <template v-else>
      <div class="air-station-tabs" role="list" aria-label="เลือกพื้นที่คุณภาพอากาศ">
        <button
          v-for="station in displayStations"
          :key="station.id"
          type="button"
          class="air-station-tab"
          :class="{ active: station.id === selectedId }"
          :aria-pressed="station.id === selectedId"
          @click="selectedId = station.id"
        >
          <span>{{ station.name }}</span>
          <strong :style="{ color: station.color }">{{ station.aqi }}</strong>
        </button>
      </div>

      <div v-if="selectedStation" class="air-content">
        <div class="air-current">
          <div class="aqi-orb" :style="{ '--aqi-color': selectedStation.color }">
            <span>AQI</span>
            <strong>{{ selectedStation.aqi }}</strong>
            <small>{{ selectedStation.label }}</small>
          </div>
          <div class="station-observation">
            <div class="observation-heading">
              <span class="data-kind measured">ตรวจวัดจริง</span>
              <span>AQICN</span>
            </div>
            <strong>{{ selectedStation.stationName || selectedStation.name }}</strong>
            <p>
              อัปเดต {{ formatDateTime(selectedStation.time) }}
              <template v-if="selectedStation.stationDistanceKm != null"> · ห่างจุดอ้างอิง {{ formatDistance(selectedStation.stationDistanceKm) }} กม.</template>
            </p>
            <a v-if="selectedStation.sourceUrl" :href="selectedStation.sourceUrl" target="_blank" rel="noopener noreferrer">
              ดูสถานีและแหล่งที่มา
              <span class="material-symbols-rounded" aria-hidden="true">open_in_new</span>
            </a>
          </div>
          <div class="air-metrics">
            <div>
              <span>PM2.5 AQI</span>
              <strong>{{ formatIndex(selectedStation.pm25Aqi) }}</strong>
              <small>ดัชนีรายมลพิษ</small>
            </div>
            <div>
              <span>PM10 AQI</span>
              <strong>{{ formatIndex(selectedStation.pm10Aqi) }}</strong>
              <small>ดัชนีรายมลพิษ</small>
            </div>
          </div>
          <div class="health-advice" :style="{ borderColor: selectedStation.color }">
            <span class="material-symbols-rounded" aria-hidden="true">health_and_safety</span>
            <div>
              <strong>คำแนะนำสุขภาพ</strong>
              <p>{{ healthAdvice }}</p>
            </div>
          </div>
          <button type="button" class="secondary-btn map-link" @click="$emit('focus', selectedStation)">
            <span class="material-symbols-rounded" aria-hidden="true">map</span>
            ดู {{ selectedStation.name }} บนแผนที่
          </button>
        </div>

        <div class="air-forecast">
          <div class="forecast-heading">
            <div>
              <h3>พยากรณ์ AQI 24 ชั่วโมง</h3>
              <p><span class="data-kind model">แบบจำลอง</span> Open-Meteo CAMS ทุก 3 ชั่วโมง · {{ forecastStatusLabel }}</p>
            </div>
            <span class="forecast-trend" :class="forecastTrend.className">
              <span class="material-symbols-rounded" aria-hidden="true">{{ forecastTrend.icon }}</span>
              {{ forecastTrend.label }}
            </span>
          </div>
          <div v-if="selectedForecast.length" class="aqi-bars" role="img" :aria-label="forecastAriaLabel">
            <div v-for="point in selectedForecast" :key="point.time" class="aqi-bar-column">
              <span class="aqi-bar-value">{{ point.aqi }}</span>
              <div class="aqi-bar-track">
                <span
                  class="aqi-bar-fill"
                  :style="{ height: `${barHeight(point.aqi)}%`, background: point.color }"
                ></span>
              </div>
              <time :datetime="point.time">{{ formatTime(point.time) }}</time>
            </div>
          </div>
          <details v-if="selectedForecast.length" class="forecast-table-details">
            <summary>ดูข้อมูลพยากรณ์แบบตาราง</summary>
            <div class="table-scroll">
              <table>
                <thead><tr><th>เวลา</th><th>AQI</th><th>PM2.5 (µg/m³)</th><th>PM10 (µg/m³)</th><th>ระดับ</th></tr></thead>
                <tbody>
                  <tr v-for="point in selectedForecast" :key="`table-${point.time}`">
                    <td>{{ formatDateTime(point.time) }}</td>
                    <td>{{ point.aqi }}</td>
                    <td>{{ point.pm25 }}</td>
                    <td>{{ point.pm10 }}</td>
                    <td>{{ point.label }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
          <div v-else class="forecast-empty">
            <span class="material-symbols-rounded" aria-hidden="true">cloud_off</span>
            <strong>พยากรณ์ CAMS ใช้งานไม่ได้ชั่วคราว</strong>
            <p>ค่าตรวจวัด AQICN ด้านซ้ายยังเป็นข้อมูลสถานีจริง ระบบไม่ได้สร้างค่าพยากรณ์ทดแทน</p>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup>
const props = defineProps({
  stations: { type: Array, default: () => [] },
  status: { type: String, default: 'loading' },
  source: { type: String, default: '' },
  forecastStatus: { type: String, default: 'loading' },
  pending: { type: Boolean, default: false },
  error: { type: [Object, String], default: null },
})

defineEmits(['focus', 'retry'])

const selectedId = ref('')
const normalizedStatus = computed(() => props.status === 'fallback' ? 'error' : props.status)
const isUsable = computed(() => ['live', 'stale'].includes(normalizedStatus.value))
const isUnavailable = computed(() => Boolean(props.error) || normalizedStatus.value === 'error')
const displayStations = computed(() => isUsable.value && !props.error ? props.stations : [])
const sourceText = computed(() => isUnavailable.value
  ? 'แหล่งข้อมูลคุณภาพอากาศเชื่อมต่อไม่ได้'
  : props.source || 'กำลังเชื่อมต่อแหล่งข้อมูล')

watch(displayStations, (stations) => {
  if (!stations.length) return
  if (!stations.some(station => station.id === selectedId.value)) {
    selectedId.value = [...stations].sort((a, b) => Number(b.aqi) - Number(a.aqi))[0]?.id || stations[0].id
  }
}, { immediate: true, deep: true })

const selectedStation = computed(() => displayStations.value.find(station => station.id === selectedId.value) || displayStations.value[0])
const selectedForecast = computed(() => selectedStation.value?.forecast || [])
const maxForecastAqi = computed(() => Math.max(100, ...selectedForecast.value.map(point => Number(point.aqi) || 0)))

const statusText = computed(() => ({
  live: 'สถานีตรวจวัดล่าสุด',
  stale: 'ข้อมูลสถานีเดิม',
  error: 'เชื่อมต่อไม่ได้',
  loading: 'กำลังโหลด',
}[normalizedStatus.value] || 'รอตรวจสอบ'))
const forecastStatusLabel = computed(() => ({
  live: 'ล่าสุด',
  stale: 'ข้อมูลแบบจำลองเดิม',
  error: 'เชื่อมต่อไม่ได้',
  loading: 'กำลังโหลด',
}[props.forecastStatus] || 'รอตรวจสอบ'))

const healthAdvice = computed(() => {
  const aqi = Number(selectedStation.value?.aqi) || 0
  if (aqi <= 50) return 'ทำกิจกรรมกลางแจ้งได้ตามปกติ และติดตามค่าฝุ่นก่อนออกจากบ้าน'
  if (aqi <= 100) return 'ผู้มีโรคทางเดินหายใจควรลดกิจกรรมกลางแจ้งที่ใช้แรงมาก'
  if (aqi <= 150) return 'กลุ่มเสี่ยงควรสวมหน้ากากกรองฝุ่นและลดเวลานอกอาคาร'
  if (aqi <= 200) return 'ทุกคนควรลดกิจกรรมกลางแจ้ง และใช้หน้ากาก N95 เมื่อจำเป็น'
  return 'หลีกเลี่ยงกิจกรรมกลางแจ้ง ปิดช่องอากาศ และติดตามประกาศสาธารณสุข'
})

const forecastTrend = computed(() => {
  const points = selectedForecast.value
  if (points.length < 2) return { label: 'ข้อมูลไม่พอ', icon: 'horizontal_rule', className: 'stable' }
  const delta = Number(points.at(-1)?.aqi) - Number(points[0]?.aqi)
  if (delta >= 8) return { label: 'มีแนวโน้มสูงขึ้น', icon: 'trending_up', className: 'up' }
  if (delta <= -8) return { label: 'มีแนวโน้มลดลง', icon: 'trending_down', className: 'down' }
  return { label: 'ค่อนข้างทรงตัว', icon: 'trending_flat', className: 'stable' }
})

const forecastAriaLabel = computed(() => selectedForecast.value
  .map(point => `${formatTime(point.time)} AQI ${point.aqi}`)
  .join(', '))

function formatIndex(value) {
  if (value === null || value === undefined || value === '') return '—'
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : '—'
}

function formatDistance(value) {
  if (value === null || value === undefined || value === '') return '—'
  return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : '—'
}

function barHeight(aqi) {
  return Math.max(12, Math.round((Number(aqi) / maxForecastAqi.value) * 100))
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return 'ไม่ทราบเวลา'
  return date.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.air-panel { overflow: hidden; }
.air-station-tabs { display: flex; gap: .5rem; margin: 1.25rem 0; overflow-x: auto; padding-bottom: .35rem; scrollbar-width: thin; }
.air-station-tab { min-width: 116px; min-height: 48px; border: 1px solid var(--border-subtle); background: var(--bg-secondary); color: var(--text-secondary); border-radius: 12px; padding: .55rem .75rem; display: flex; align-items: center; justify-content: space-between; gap: .75rem; font: inherit; cursor: pointer; transition: border-color .2s, background .2s; }
.air-station-tab:hover { border-color: var(--accent); }
.air-station-tab.active { border-color: var(--accent); background: var(--color-info-bg); color: var(--text-primary); }
.air-station-tab strong { font-size: 1.1rem; font-variant-numeric: tabular-nums; }
.air-content { display: grid; grid-template-columns: minmax(260px, .8fr) minmax(420px, 1.6fr); gap: 1.5rem; }
.air-current { display: grid; align-content: start; gap: 1rem; }
.aqi-orb { width: 150px; height: 150px; margin-inline: auto; border-radius: 50%; display: grid; place-content: center; text-align: center; color: var(--text-primary); background: color-mix(in srgb, var(--aqi-color) 10%, var(--bg-secondary)); border: 10px solid color-mix(in srgb, var(--aqi-color) 25%, transparent); box-shadow: inset 0 0 0 2px var(--aqi-color); }
.aqi-orb span { color: var(--text-muted); font-size: .8rem; font-weight: 700; letter-spacing: .08em; }
.aqi-orb strong { color: var(--aqi-color); font-size: 2.4rem; line-height: 1; font-variant-numeric: tabular-nums; }
.aqi-orb small { font-weight: 700; }
.station-observation { display: grid; gap: .35rem; border: 1px solid var(--border-subtle); background: var(--bg-primary); border-radius: 12px; padding: .85rem; }
.station-observation > strong { font-size: .84rem; line-height: 1.45; }
.station-observation p { color: var(--text-muted); font-size: .72rem; line-height: 1.5; }
.station-observation a { width: fit-content; display: inline-flex; align-items: center; gap: .25rem; color: var(--accent); font-size: .74rem; font-weight: 700; text-decoration: none; }
.station-observation a:hover { text-decoration: underline; }
.station-observation a .material-symbols-rounded { font-size: 15px; }
.observation-heading { display: flex; align-items: center; gap: .45rem; color: var(--text-muted); font-size: .72rem; }
.data-kind { display: inline-flex; align-items: center; width: fit-content; padding: .16rem .45rem; border-radius: 999px; font-size: .66rem; font-weight: 800; line-height: 1.35; }
.data-kind.measured { color: #166534; background: #dcfce7; }
.data-kind.model { color: #1d4ed8; background: #dbeafe; vertical-align: middle; margin-right: .2rem; }
.air-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: .75rem; }
.air-metrics > div { border: 1px solid var(--border-subtle); background: var(--bg-primary); border-radius: 12px; padding: .8rem; display: grid; }
.air-metrics span, .air-metrics small { color: var(--text-muted); font-size: .75rem; }
.air-metrics strong { font-size: 1.35rem; font-variant-numeric: tabular-nums; }
.health-advice { display: flex; gap: .75rem; border-left: 3px solid; border-radius: 8px; background: var(--bg-primary); padding: .85rem; }
.health-advice .material-symbols-rounded { color: var(--accent); }
.health-advice strong { display: block; font-size: .85rem; }
.health-advice p { color: var(--text-secondary); font-size: .8rem; line-height: 1.55; margin-top: .15rem; }
.map-link { width: 100%; }
.air-forecast { border-left: 1px solid var(--border-subtle); padding-left: 1.5rem; min-width: 0; }
.forecast-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.25rem; }
.forecast-heading h3 { font-size: 1rem; }
.forecast-heading p { color: var(--text-muted); font-size: .8rem; }
.forecast-trend { display: inline-flex; align-items: center; gap: .25rem; font-size: .78rem; font-weight: 700; white-space: nowrap; }
.forecast-trend.up { color: var(--color-danger); }
.forecast-trend.down { color: var(--color-safe); }
.forecast-trend.stable { color: var(--text-secondary); }
.forecast-trend .material-symbols-rounded { font-size: 18px; }
.aqi-bars { height: 220px; display: grid; grid-template-columns: repeat(8, minmax(36px, 1fr)); gap: .6rem; align-items: end; border-bottom: 1px solid var(--border-subtle); padding: 0 .25rem .5rem; overflow-x: auto; }
.aqi-bar-column { height: 100%; min-width: 36px; display: grid; grid-template-rows: 22px 1fr 28px; gap: .25rem; align-items: end; text-align: center; }
.aqi-bar-value { color: var(--text-secondary); font-size: .75rem; font-weight: 700; font-variant-numeric: tabular-nums; }
.aqi-bar-track { height: 100%; width: 18px; margin-inline: auto; display: flex; align-items: end; background: var(--bg-primary); border-radius: 9px; overflow: hidden; }
.aqi-bar-fill { width: 100%; min-height: 10px; border-radius: 9px; transition: height .25s ease; }
.aqi-bar-column time { color: var(--text-muted); font-size: .7rem; white-space: nowrap; }
.forecast-table-details { margin-top: 1rem; color: var(--text-secondary); font-size: .8rem; }
.forecast-table-details summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; color: var(--accent); font-weight: 700; }
.forecast-empty { min-height: 220px; display: grid; place-content: center; justify-items: center; gap: .5rem; border: 1px dashed var(--border-subtle); border-radius: 14px; padding: 1.5rem; text-align: center; }
.forecast-empty .material-symbols-rounded { color: var(--text-muted); font-size: 32px; }
.forecast-empty strong { font-size: .9rem; }
.forecast-empty p { max-width: 440px; color: var(--text-muted); font-size: .78rem; line-height: 1.55; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .55rem; border-bottom: 1px solid var(--border-subtle); text-align: left; white-space: nowrap; }
th { color: var(--text-primary); }
@media (max-width: 900px) { .air-content { grid-template-columns: 1fr; } .air-forecast { border-left: 0; border-top: 1px solid var(--border-subtle); padding: 1.25rem 0 0; } }
@media (max-width: 520px) { .forecast-heading { display: grid; } .aqi-bars { grid-template-columns: repeat(8, 42px); } }
@media (prefers-reduced-motion: reduce) { .aqi-bar-fill { transition: none; } }
</style>
