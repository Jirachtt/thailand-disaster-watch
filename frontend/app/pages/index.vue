<template>
  <div class="dashboard-page">
    <section class="dashboard-intro" aria-labelledby="dashboard-title">
      <div>
        <p class="eyebrow"><span class="eyebrow-dot" aria-hidden="true"></span> ศูนย์ติดตามสถานการณ์ประเทศไทย</p>
        <h1 id="dashboard-title">เห็นความเสี่ยงสำคัญในหน้าจอเดียว</h1>
        <p class="intro-copy">ติดตามระดับน้ำ จุดความร้อน ฝน และ PM2.5 พร้อมแนวโน้มล่วงหน้า โดยแยกสถานะของทุกแหล่งข้อมูลอย่างชัดเจน</p>
      </div>
      <div class="intro-actions">
        <div class="sync-summary" aria-live="polite">
          <span class="sync-indicator" :class="overallSyncStatus" aria-hidden="true"></span>
          <div>
            <strong>{{ overallSyncLabel }}</strong>
            <span>{{ lastUpdateLabel }}</span>
          </div>
        </div>
        <button type="button" class="primary-btn" :disabled="isRefreshing" @click="refreshAll">
          <span class="material-symbols-rounded" :class="{ spinning: isRefreshing }" aria-hidden="true">refresh</span>
          {{ isRefreshing ? 'กำลังอัปเดต' : 'อัปเดตข้อมูล' }}
        </button>
      </div>
    </section>

    <nav class="hazard-nav" aria-label="ไปยังส่วนข้อมูล">
      <button v-for="item in navigationItems" :key="item.id" type="button" @click="scrollToSection(item.id)">
        <span class="material-symbols-rounded" aria-hidden="true">{{ item.icon }}</span>
        {{ item.label }}
      </button>
    </nav>

    <AlertBanner
      :risk-level="overallRisk"
      :stations="dashboardStations"
      :fires="firesList"
      :water-status="waterStatus"
      :fire-status="fireStatus"
      :rain-status="rainStatus"
      :aqi-status="aqiStatus"
      @view-map="handleViewMap"
    />

    <section class="overview-grid" aria-label="ภาพรวมสถานการณ์">
      <button type="button" class="overview-card water" @click="scrollToSection('water-section')">
        <span class="overview-icon"><span class="material-symbols-rounded" aria-hidden="true">water_drop</span></span>
        <span class="overview-body">
          <span class="overview-label">สถานการณ์น้ำ</span>
          <strong v-if="dashboardStations.length">{{ waterAlertCount }} <small>สถานีเฝ้าระวัง</small></strong>
          <span v-else-if="pendingDashboard" class="skeleton-line short"></span>
          <strong v-else>— <small>ยังไม่มีข้อมูล</small></strong>
          <span class="overview-meta">ทั้งหมด {{ dashboardStations.length }} สถานี · {{ statusShortLabel(waterStatus) }}</span>
        </span>
        <span class="overview-arrow material-symbols-rounded" aria-hidden="true">arrow_forward</span>
      </button>

      <button type="button" class="overview-card fire" @click="scrollToSection('fire-section')">
        <span class="overview-icon"><span class="material-symbols-rounded" aria-hidden="true">local_fire_department</span></span>
        <span class="overview-body">
          <span class="overview-label">จุดความร้อน</span>
          <strong v-if="fireDashboard && isUsableStatus(fireStatus)">{{ activeFireCount }} <small>กลุ่มในไทย</small></strong>
          <span v-else-if="pendingFire" class="skeleton-line short"></span>
          <strong v-else>— <small>ยังไม่มีข้อมูล</small></strong>
          <span class="overview-meta">ย้อนหลัง 24 ชม. · {{ statusShortLabel(fireStatus) }}</span>
        </span>
        <span class="overview-arrow material-symbols-rounded" aria-hidden="true">arrow_forward</span>
      </button>

      <button type="button" class="overview-card air" @click="scrollToSection('air-section')">
        <span class="overview-icon"><span class="material-symbols-rounded" aria-hidden="true">air</span></span>
        <span class="overview-body">
          <span class="overview-label">คุณภาพอากาศ</span>
          <strong v-if="worstAqiStation"><span :style="{ color: worstAqiStation.color }">{{ worstAqi }}</span> <small>AQI · {{ worstAqiCity }}</small></strong>
          <span v-else-if="pendingAqi" class="skeleton-line short"></span>
          <strong v-else>— <small>ยังไม่มีข้อมูล</small></strong>
          <span class="overview-meta">PM2.5 AQI {{ worstAqiStation?.pm25Aqi ?? '—' }} · สถานีจริง · {{ statusShortLabel(aqiStatus) }}</span>
        </span>
        <span class="overview-arrow material-symbols-rounded" aria-hidden="true">arrow_forward</span>
      </button>

      <button type="button" class="overview-card forecast" @click="scrollToSection('forecast-section')">
        <span class="overview-icon"><span class="material-symbols-rounded" aria-hidden="true">model_training</span></span>
        <span class="overview-body">
          <span class="overview-label">ระบบพยากรณ์</span>
          <strong>{{ availableForecasts }} <small>โมดูลพร้อมใช้</small></strong>
          <span class="overview-meta">น้ำ 12 ชม. · ไฟ 12 ชม. · AQI 24 ชม.</span>
        </span>
        <span class="overview-arrow material-symbols-rounded" aria-hidden="true">arrow_forward</span>
      </button>
    </section>

    <section id="map-section" class="map-workspace dashboard-section" aria-labelledby="map-title">
      <div class="section-heading map-heading">
        <div>
          <p class="section-kicker">แผนที่สถานการณ์</p>
          <h2 id="map-title">ภาพรวมพื้นที่และชั้นข้อมูล</h2>
          <p>เปิดหรือปิดน้ำ ไฟ ฝน ฝุ่น และแนวโน้มได้จากปุ่มบนแผนที่</p>
        </div>
      </div>
      <div class="map-layout">
        <FloodMap
          ref="floodMapRef"
          :stations="dashboardStations"
          :fires="firesList"
          :world-fires="worldFiresList"
          :reports="communityReports"
          :rain-stations="rainStationsList"
          :spread-predictions="fireSpreadPredictions"
          :aqi-stations="aqiStationsList"
          :selected-fire-id="selectedFireId"
          :focus-fire="focusFire"
          :focus-station="focusStation"
          @select-station="selectStation"
          @select-fire="selectFire"
          @add-report="showReportForm = true"
        />

        <aside class="source-panel" aria-labelledby="source-panel-title">
          <div class="source-panel-header">
            <div>
              <p class="section-kicker">ความพร้อมระบบ</p>
              <h2 id="source-panel-title">สถานะแหล่งข้อมูล</h2>
            </div>
            <span class="material-symbols-rounded" aria-hidden="true">dns</span>
          </div>
          <ul class="source-list">
            <li v-for="source in sourceRows" :key="source.key">
              <span class="source-icon" :class="source.key"><span class="material-symbols-rounded" aria-hidden="true">{{ source.icon }}</span></span>
              <div>
                <strong>{{ source.label }}</strong>
                <span>{{ source.source }}</span>
                <small>{{ source.time }}</small>
              </div>
              <span class="module-status compact" :class="source.status"><span class="status-dot" aria-hidden="true"></span>{{ statusShortLabel(source.status) }}</span>
            </li>
          </ul>
          <div class="source-note">
            <span class="material-symbols-rounded" aria-hidden="true">info</span>
            <p>ระบบแสดงเฉพาะข้อมูลจาก API จริง หากเชื่อมต่อไม่ได้จะแสดงสถานะขัดข้องโดยไม่สร้างข้อมูลเหตุการณ์ทดแทน</p>
          </div>
        </aside>
      </div>
    </section>

    <section id="water-section" class="dashboard-section" aria-labelledby="water-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker water-text">สถานการณ์น้ำ</p>
          <h2 id="water-title">สถานีระดับน้ำและแนวโน้มรายจุด</h2>
          <p>รหัสสถานการณ์มาจาก ThaiWater โดยแยก “น้ำน้อย” และ “น้ำมาก” ไม่ใช้ตัวเลขเป็นลำดับความรุนแรง</p>
        </div>
        <span class="module-status" :class="waterStatus"><span class="status-dot" aria-hidden="true"></span>{{ statusLongLabel(waterStatus) }}</span>
      </div>
      <div class="water-layout">
        <div class="glass-card station-panel">
          <div class="module-header compact-header">
            <div class="module-heading">
              <span class="module-icon water"><span class="material-symbols-rounded" aria-hidden="true">sensors</span></span>
              <div><h3>สถานีตรวจวัด</h3><p>{{ dashboardStations.length }} สถานีทั่วประเทศ</p></div>
            </div>
            <button v-if="errorDashboard" type="button" class="icon-action" aria-label="โหลดสถานีน้ำใหม่" @click="refreshDashboard()"><span class="material-symbols-rounded" aria-hidden="true">refresh</span></button>
          </div>
          <div v-if="pendingDashboard && !dashboardStations.length" class="station-skeletons">
            <div v-for="index in 5" :key="index" class="skeleton-card"></div>
          </div>
          <div v-else-if="!dashboardStations.length" class="module-empty compact">
            <span class="material-symbols-rounded" aria-hidden="true">water_damage</span>
            <p>ยังไม่มีข้อมูลสถานีน้ำ</p>
            <button type="button" class="secondary-btn" @click="refreshDashboard()">ลองอีกครั้ง</button>
          </div>
          <div v-else id="station-list" class="stations-list" :class="{ expanded: showAllStations }">
            <StationCard
              v-for="station in visibleStations"
              :key="station.id"
              :station="station"
              :is-active="selectedStationId === station.id"
              @select="selectStation"
            />
          </div>
          <button
            v-if="dashboardStations.length > defaultStationLimit"
            type="button"
            class="show-more-btn"
            :aria-expanded="showAllStations"
            aria-controls="station-list"
            @click="showAllStations = !showAllStations"
          >
            <span class="material-symbols-rounded" aria-hidden="true">{{ showAllStations ? 'expand_less' : 'expand_more' }}</span>
            {{ showAllStations ? 'แสดงเฉพาะสถานีสำคัญ' : `ดูทั้งหมดอีก ${dashboardStations.length - defaultStationLimit} สถานี` }}
          </button>
        </div>
        <PredictionPanel :station="selectedStation" />
      </div>
      <WaterLevelChart
        v-if="selectedStation"
        :station-id="selectedStation.id"
        :station-name="selectedStation.name"
      />
      <div v-else class="glass-card module-skeleton chart-placeholder"><div class="skeleton-line wide"></div><div class="skeleton-chart-block"></div></div>
    </section>

    <section id="fire-section" class="dashboard-section" aria-labelledby="fire-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker fire-text">จุดความร้อนและไฟป่า</p>
          <h2 id="fire-title">ติดตามจุดความร้อนและทิศทางลุกลาม</h2>
          <p>ประมวลผลเฉพาะประเทศไทยในเส้นทางหลัก เพื่อลดภาระและตอบสนองได้เร็ว</p>
        </div>
        <span class="module-status" :class="fireStatus"><span class="status-dot" aria-hidden="true"></span>{{ statusLongLabel(fireStatus) }}</span>
      </div>
      <div v-if="pendingFire && !fireDashboard" class="glass-card module-skeleton"><div class="skeleton-line wide"></div><div class="skeleton-cards"><div v-for="index in 3" :key="index" class="skeleton-card"></div></div></div>
      <FireSpreadPanel v-else :fires="firesList" :status="fireStatus" :selected-fire-id="selectedFireId" @select-fire="handleFireSelect" />
    </section>

    <section id="air-section" class="dashboard-section" aria-labelledby="air-section-title">
      <div class="section-heading visually-merged-heading">
        <div>
          <p class="section-kicker air-text">สุขภาพและฝุ่น</p>
          <h2 id="air-section-title">คุณภาพอากาศปัจจุบันและพยากรณ์</h2>
          <p>ข้อมูล PM2.5, PM10 และ US AQI พร้อมแบบจำลองล่วงหน้า 24 ชั่วโมง</p>
        </div>
      </div>
      <AirQualityPanel
        :stations="aqiStationsList"
        :status="aqiStatus"
        :source="aqiData?.source"
        :forecast-status="aqiData?.forecastStatus"
        :pending="pendingAqi"
        :error="errorAqi"
        @focus="focusAqiStation"
        @retry="refreshAqi()"
      />
    </section>

    <section id="forecast-section" class="dashboard-section" aria-labelledby="forecast-title">
      <div class="section-heading">
        <div>
          <p class="section-kicker forecast-text">Forecast hub</p>
          <h2 id="forecast-title">สรุปแนวโน้มจากทุกระบบ</h2>
          <p>เปรียบเทียบสิ่งที่อาจเกิดขึ้นในช่วงถัดไปโดยไม่ต้องสลับหลายหน้าจอ</p>
        </div>
      </div>
      <div class="forecast-hub-grid">
        <article class="forecast-summary-card water">
          <span class="forecast-card-icon material-symbols-rounded" aria-hidden="true">water_drop</span>
          <div><span>น้ำ · 12 ชั่วโมง</span><h3>{{ waterForecastHeadline }}</h3><p>{{ waterForecastDetail }}</p></div>
          <button type="button" @click="scrollToSection('water-section')">ดูรายละเอียด <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>
        </article>
        <article class="forecast-summary-card fire">
          <span class="forecast-card-icon material-symbols-rounded" aria-hidden="true">local_fire_department</span>
          <div><span>ไฟ · 12 ชั่วโมง</span><h3>{{ fireForecastHeadline }}</h3><p>{{ fireForecastDetail }}</p></div>
          <button type="button" @click="scrollToSection('fire-section')">ดูรายละเอียด <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>
        </article>
        <article class="forecast-summary-card air">
          <span class="forecast-card-icon material-symbols-rounded" aria-hidden="true">air</span>
          <div><span>ฝุ่น · 24 ชั่วโมง</span><h3>{{ airForecastHeadline }}</h3><p>{{ airForecastDetail }}</p></div>
          <button type="button" @click="scrollToSection('air-section')">ดูรายละเอียด <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>
        </article>
        <article class="forecast-summary-card rain">
          <span class="forecast-card-icon material-symbols-rounded" aria-hidden="true">rainy</span>
          <div><span>ฝน · 6 ชั่วโมง</span><h3>{{ rainForecastHeadline }}</h3><p>{{ rainForecastDetail }}</p></div>
          <button type="button" @click="scrollToSection('map-section')">ดูบนแผนที่ <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>
        </article>
      </div>
      <p class="forecast-disclaimer"><span class="material-symbols-rounded" aria-hidden="true">verified</span> ผลพยากรณ์เป็นเครื่องมือช่วยติดตามสถานการณ์ ควรตรวจประกาศจากหน่วยงานรัฐก่อนตัดสินใจด้านความปลอดภัยเสมอ</p>
    </section>

    <ReportForm :is-open="showReportForm" @close="showReportForm = false" @submitted="handleReportSubmitted" />
  </div>
</template>

<script setup>
// Start the requests after hydration so SSR and the first client render share
// the same stable empty state. This avoids hydration mismatches while keeping
// every data source independent and progressively rendered.
// Upstream calls are capped server-side and return explicit unavailable or
// stale responses. Keep the browser budget slightly larger than that cap.
const fetchOptions = { server: false, lazy: true, immediate: false, timeout: 18000 }

const { data: dashboard, pending: pendingDashboard, error: errorDashboard, refresh: refreshDashboard } = useFetch('/api/dashboard/summary', fetchOptions)
const { data: fireDashboard, pending: pendingFire, error: errorFire, refresh: refreshFire } = useFetch('/api/dashboard/fires', fetchOptions)
const { data: reportsData, pending: pendingReports, error: errorReports, refresh: refreshReports } = useFetch('/api/reports', { ...fetchOptions, timeout: 6000 })
const { data: rainData, pending: pendingRain, error: errorRain, refresh: refreshRain } = useFetch('/api/dashboard/rain', fetchOptions)
const { data: aqiData, pending: pendingAqi, error: errorAqi, refresh: refreshAqi } = useFetch('/api/dashboard/aqi', fetchOptions)

const selectedStationId = ref('')
const selectedFireId = ref('')
const showAllStations = ref(false)
const focusFire = ref(null)
const focusStation = ref(null)
const floodMapRef = ref(null)
const showReportForm = ref(false)
const isRefreshing = ref(false)
const nowTick = ref(Date.now())
const defaultStationLimit = 8
let refreshTimer = null
let clockTimer = null

const navigationItems = [
  { id: 'map-section', label: 'แผนที่', icon: 'map' },
  { id: 'water-section', label: 'น้ำ', icon: 'water_drop' },
  { id: 'fire-section', label: 'ไฟป่า', icon: 'local_fire_department' },
  { id: 'air-section', label: 'ฝุ่น PM2.5', icon: 'air' },
  { id: 'forecast-section', label: 'พยากรณ์', icon: 'model_training' },
]

const dashboardStations = computed(() => dashboard.value?.stations || [])
const firesList = computed(() => fireDashboard.value?.fires || [])
const worldFiresList = computed(() => fireDashboard.value?.worldFires || [])
const communityReports = computed(() => reportsData.value?.reports || [])
const rainStationsList = computed(() => rainData.value?.rainStations || [])
const fireSpreadPredictions = computed(() => fireDashboard.value?.spreadPredictions || [])
const aqiStationsList = computed(() => aqiData.value?.stations || [])

const overallRisk = computed(() => dashboard.value?.overallRisk || 'safe')
const selectedStation = computed(() => dashboardStations.value.find(station => station.id === selectedStationId.value) || null)
const activeFireCount = computed(() => fireDashboard.value?.activeCount || 0)
const waterAlertCount = computed(() => dashboardStations.value.filter(station => ['warning', 'danger'].includes(station.riskLevel)).length)

const worstAqiStation = computed(() => {
  if (!aqiStationsList.value.length) return null
  return aqiStationsList.value.reduce((worst, station) => Number(station.aqi) > Number(worst.aqi) ? station : worst, aqiStationsList.value[0])
})
const worstAqi = computed(() => worstAqiStation.value?.aqi ?? '—')
const worstAqiCity = computed(() => worstAqiStation.value?.name || 'รอข้อมูล')

function resolveStatus(data, pending, error) {
  if (data?.status === 'fallback' || data?.isFallback) return 'error'
  if (data?.status) return data.status
  if (data) return 'live'
  if (pending) return 'loading'
  if (error) return 'error'
  return 'loading'
}

const waterStatus = computed(() => resolveStatus(dashboard.value, pendingDashboard.value, errorDashboard.value))
const fireStatus = computed(() => resolveStatus(fireDashboard.value, pendingFire.value, errorFire.value))
const rainStatus = computed(() => resolveStatus(rainData.value, pendingRain.value, errorRain.value))
const aqiStatus = computed(() => resolveStatus(aqiData.value, pendingAqi.value, errorAqi.value))

const allStatuses = computed(() => [waterStatus.value, fireStatus.value, rainStatus.value, aqiStatus.value])
const overallSyncStatus = computed(() => {
  if (allStatuses.value.every(status => status === 'loading')) return 'loading'
  if (allStatuses.value.some(status => ['error', 'fallback'].includes(status))) return 'error'
  if (allStatuses.value.some(status => status === 'stale')) return 'degraded'
  return 'live'
})
const overallSyncLabel = computed(() => ({
  loading: 'กำลังเชื่อมต่อข้อมูล',
  error: 'บางแหล่งเชื่อมต่อไม่ได้',
  degraded: 'ออนไลน์บางส่วน',
  live: 'เชื่อมต่อข้อมูลแล้ว',
}[overallSyncStatus.value]))

const latestTimestamp = computed(() => {
  const values = [dashboard.value?.timestamp, fireDashboard.value?.timestamp, rainData.value?.timestamp, aqiData.value?.timestamp]
    .map(value => value ? new Date(value).getTime() : 0)
    .filter(Boolean)
  return values.length ? Math.max(...values) : 0
})
const lastUpdateLabel = computed(() => latestTimestamp.value ? `อัปเดตล่าสุด ${formatRelativeTime(latestTimestamp.value)}` : 'กำลังรอข้อมูลชุดแรก')

const visibleStations = computed(() => showAllStations.value ? dashboardStations.value : dashboardStations.value.slice(0, defaultStationLimit))
const availableForecasts = computed(() => [
  isUsableStatus(waterStatus.value) && selectedStation.value,
  isUsableStatus(fireStatus.value) && fireSpreadPredictions.value.length,
  isUsableStatus(aqiStatus.value) && aqiStationsList.value.some(station => station.forecast?.length),
  isUsableStatus(rainStatus.value) && rainStationsList.value.some(station => station.predictedPath?.length),
].filter(Boolean).length)

const sourceRows = computed(() => [
  { key: 'water', label: 'ระดับน้ำ', icon: 'water_drop', status: waterStatus.value, source: dashboard.value?.source || 'ThaiWater', timestamp: dashboard.value?.timestamp },
  { key: 'fire', label: 'จุดความร้อน', icon: 'local_fire_department', status: fireStatus.value, source: fireDashboard.value?.source || 'NASA FIRMS', timestamp: fireDashboard.value?.timestamp },
  { key: 'rain', label: 'ปริมาณฝน', icon: 'rainy', status: rainStatus.value, source: rainData.value?.source || 'ThaiWater', timestamp: rainData.value?.timestamp },
  { key: 'air', label: 'PM2.5 / AQI', icon: 'air', status: aqiStatus.value, source: aqiData.value?.source || 'AQICN + Open-Meteo CAMS', timestamp: aqiData.value?.timestamp },
].map(source => ({ ...source, time: source.timestamp ? formatRelativeTime(new Date(source.timestamp).getTime()) : 'ยังไม่อัปเดต' })))

const topFireForecast = computed(() => firesList.value.find(fire => fire.status === 'active') || firesList.value[0] || null)
const topRainForecast = computed(() => rainStationsList.value[0] || null)

const waterForecastHeadline = computed(() => selectedStation.value?.peakPredicted != null && Number.isFinite(Number(selectedStation.value.peakPredicted)) ? `${Number(selectedStation.value.peakPredicted).toFixed(2)} ม.` : selectedStation.value ? 'ยังคำนวณไม่ได้' : 'รอข้อมูลสถานี')
const waterForecastDetail = computed(() => {
  if (!selectedStation.value) return waterStatus.value === 'error' ? 'เชื่อมต่อ ThaiWater ไม่ได้' : 'เลือกสถานีเพื่อดูแนวโน้ม 12 ชั่วโมง'
  const score = selectedStation.value.forecastConfidence == null ? null : Number(selectedStation.value.forecastConfidence)
  const scoreLabel = Number.isFinite(score) ? ` · คะแนนแบบจำลอง ${Math.round(score)}%` : ' · ยังไม่มีแนวโน้มก่อนหน้าเพียงพอ'
  return `${selectedStation.value.name} · ${selectedStation.value.situationLabel || 'รอตรวจสอบ'}${scoreLabel}`
})
const fireForecastHeadline = computed(() => topFireForecast.value?.peakEstimate ? `${topFireForecast.value.peakEstimate.areaSqKm} ตร.กม.` : 'ไม่พบจุดที่คำนวณได้')
const fireForecastDetail = computed(() => topFireForecast.value?.peakEstimate ? `${topFireForecast.value.name} · ประมาณการใน ${topFireForecast.value.peakEstimate.timeHours} ชม. จากข้อมูล FIRMS และสภาพอากาศจริง` : fireStatus.value === 'error' ? 'เชื่อมต่อ NASA FIRMS ไม่ได้' : 'แบบจำลองจะเริ่มเมื่อมีจุดความร้อนและข้อมูลสภาพอากาศจริง')
const airForecastPeak = computed(() => Math.max(0, ...(worstAqiStation.value?.forecast || []).map(point => Number(point.aqi) || 0)))
const airForecastHeadline = computed(() => worstAqiStation.value ? `AQI สูงสุดราว ${airForecastPeak.value || worstAqiStation.value.aqi}` : 'รอข้อมูลคุณภาพอากาศ')
const airForecastDetail = computed(() => {
  if (worstAqiStation.value?.forecast?.length) return `${worstAqiStation.value.name} · แบบจำลอง CAMS 24 ชั่วโมง`
  if (worstAqiStation.value) return `${worstAqiStation.value.name} · สถานี AQICN พร้อมใช้ แต่ CAMS เชื่อมต่อไม่ได้`
  return aqiStatus.value === 'error' ? 'เชื่อมต่อสถานี AQICN ไม่ได้' : 'กำลังเชื่อมต่อแบบจำลองคุณภาพอากาศ'
})
const rainForecastHeadline = computed(() => topRainForecast.value ? `${topRainForecast.value.rainDirection || 'รอทิศทาง'} · ${topRainForecast.value.rain24h} มม.` : 'รอข้อมูลฝน')
const rainForecastDetail = computed(() => topRainForecast.value ? `${topRainForecast.value.name} · แนวเคลื่อนตัว 1–6 ชั่วโมงจากข้อมูลลมจริง` : rainStatus.value === 'error' ? 'เชื่อมต่อข้อมูลฝนไม่ได้' : 'กำลังเชื่อมต่อสถานีวัดฝน')

watch(dashboardStations, (stations) => {
  if (stations.length && !stations.some(station => station.id === selectedStationId.value)) selectedStationId.value = stations[0].id
}, { immediate: true })

watch(firesList, (fires) => {
  if (fires.length && !fires.some(fire => fire.id === selectedFireId.value)) selectedFireId.value = fires[0].id
}, { immediate: true })

function statusShortLabel(status) {
  return { live: 'ล่าสุด', stale: 'ข้อมูล API เดิม', fallback: 'ขัดข้อง', error: 'ขัดข้อง', loading: 'กำลังโหลด' }[status] || 'รอตรวจสอบ'
}

function statusLongLabel(status) {
  return { live: 'เชื่อมต่อข้อมูลแล้ว', stale: 'ใช้ข้อมูล API ล่าสุดที่บันทึกไว้', fallback: 'เชื่อมต่อไม่ได้', error: 'เชื่อมต่อไม่ได้', loading: 'กำลังโหลด' }[status] || 'รอตรวจสอบ'
}

function isUsableStatus(status) {
  return status === 'live' || status === 'stale'
}

function formatRelativeTime(timestamp) {
  const minutes = Math.max(0, Math.round((nowTick.value - timestamp) / 60000))
  if (minutes < 1) return 'เมื่อสักครู่'
  if (minutes < 60) return `${minutes} นาทีที่แล้ว`
  const hours = Math.floor(minutes / 60)
  return `${hours} ชม.ที่แล้ว`
}

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
}

function selectStation(id) {
  selectedStationId.value = id
}

function selectFire(id) {
  selectedFireId.value = id
}

function handleViewMap(location) {
  if (!location?.lat || !location?.lng) return
  if (location.intensity) {
    selectedFireId.value = location.id
    focusFire.value = { lat: location.lat, lng: location.lng, id: location.id, ts: Date.now() }
  } else {
    selectedStationId.value = location.id
    focusStation.value = { lat: location.lat, lng: location.lng, id: location.id, layer: 'water', ts: Date.now() }
  }
  scrollToSection('map-section')
}

function handleFireSelect(id) {
  selectedFireId.value = id
  const fire = firesList.value.find(item => item.id === id)
  if (fire) focusFire.value = { lat: fire.lat, lng: fire.lng, id: fire.id, ts: Date.now() }
}

function focusAqiStation(station) {
  focusStation.value = { lat: station.lat, lng: station.lng, id: station.id, layer: 'aqi', ts: Date.now() }
  scrollToSection('map-section')
}

function handleReportSubmitted() {
  refreshReports()
}

async function refreshAll() {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await Promise.allSettled([refreshDashboard(), refreshFire(), refreshRain(), refreshAqi(), refreshReports()])
  } finally {
    isRefreshing.value = false
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(async () => {
    if (document.visibilityState === 'visible' && navigator.onLine) await refreshAll()
    scheduleRefresh()
  }, 5 * 60 * 1000)
}

onMounted(() => {
  refreshAll()
  clockTimer = setInterval(() => { nowTick.value = Date.now() }, 60000)
  scheduleRefresh()
})

onUnmounted(() => {
  clearTimeout(refreshTimer)
  clearInterval(clockTimer)
})
</script>

<style scoped>
.dashboard-page { display: grid; gap: 1.5rem; }
.dashboard-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 2rem; padding: .5rem 0 .25rem; }
.eyebrow { display: flex; align-items: center; gap: .5rem; color: var(--accent); font-size: .78rem; font-weight: 700; letter-spacing: .04em; margin-bottom: .35rem; }
.eyebrow-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-safe); box-shadow: 0 0 0 4px var(--color-safe-bg); }
.dashboard-intro h1 { font-size: clamp(1.75rem, 3vw, 2.5rem); line-height: 1.25; letter-spacing: -.035em; color: var(--text-primary); }
.intro-copy { color: var(--text-secondary); max-width: 720px; margin-top: .5rem; }
.intro-actions { display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }
.sync-summary { display: flex; align-items: center; gap: .65rem; min-width: 170px; }
.sync-summary div { display: grid; }
.sync-summary strong { font-size: .82rem; color: var(--text-primary); }
.sync-summary span:not(.sync-indicator) { font-size: .72rem; color: var(--text-muted); }
.sync-indicator { width: 10px; height: 10px; border-radius: 50%; background: var(--color-safe); box-shadow: 0 0 0 5px var(--color-safe-bg); }
.sync-indicator.loading { background: var(--accent); animation: pulse-live 1.5s infinite; }
.sync-indicator.degraded { background: var(--color-warning); box-shadow: 0 0 0 5px var(--color-warning-bg); }
.sync-indicator.error { background: var(--color-danger); box-shadow: 0 0 0 5px var(--color-danger-bg); }
.hazard-nav { position: sticky; top: 72px; z-index: 40; display: flex; gap: .4rem; width: max-content; max-width: 100%; overflow-x: auto; padding: .4rem; margin-inline: auto; border: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-secondary) 92%, transparent); backdrop-filter: blur(16px); border-radius: 14px; box-shadow: var(--shadow-card); }
.hazard-nav button { min-height: 40px; display: inline-flex; align-items: center; gap: .35rem; padding: .5rem .8rem; border: 0; border-radius: 10px; background: transparent; color: var(--text-secondary); font: inherit; font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.hazard-nav button:hover { background: var(--bg-primary); color: var(--accent); }
.hazard-nav .material-symbols-rounded { font-size: 18px; }
.overview-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
.overview-card { min-height: 132px; display: grid; grid-template-columns: 48px 1fr 24px; align-items: center; gap: .9rem; text-align: left; padding: 1rem; border: 1px solid var(--border-subtle); border-radius: 16px; background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-card); font: inherit; cursor: pointer; transition: border-color .2s, box-shadow .2s, background .2s; }
.overview-card:hover { border-color: color-mix(in srgb, var(--card-color) 45%, var(--border-subtle)); box-shadow: var(--shadow-elevated); }
.overview-card.water { --card-color: #0369a1; --card-bg: rgba(3,105,161,.1); }
.overview-card.fire { --card-color: #c2410c; --card-bg: rgba(194,65,12,.1); }
.overview-card.air { --card-color: #7c3aed; --card-bg: rgba(124,58,237,.1); }
.overview-card.forecast { --card-color: #0f766e; --card-bg: rgba(15,118,110,.1); }
.overview-icon { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; background: var(--card-bg); color: var(--card-color); }
.overview-body { min-width: 0; display: grid; gap: .25rem; }
.overview-label { color: var(--text-secondary); font-size: .8rem; font-weight: 600; }
.overview-body strong { display: flex; align-items: baseline; flex-wrap: wrap; gap: .35rem; font-size: 1.65rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
.overview-body small { font-size: .72rem; color: var(--text-muted); font-weight: 500; }
.overview-meta { color: var(--text-muted); font-size: .7rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.overview-arrow { color: var(--text-muted); font-size: 20px; }
.dashboard-section { scroll-margin-top: 140px; display: grid; gap: 1rem; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 1rem; margin-top: 1rem; }
.section-heading h2 { font-size: clamp(1.25rem, 2vw, 1.55rem); color: var(--text-primary); letter-spacing: -.02em; }
.section-heading p:not(.section-kicker) { color: var(--text-secondary); font-size: .86rem; max-width: 760px; }
.section-kicker { color: var(--accent); font-size: .72rem; font-weight: 800; text-transform: uppercase; letter-spacing: .09em; }
.water-text { color: #0369a1; }.fire-text { color: #c2410c; }.air-text { color: #7c3aed; }.forecast-text { color: #0f766e; }
.map-layout { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 1rem; align-items: stretch; }
.source-panel { display: flex; flex-direction: column; border: 1px solid var(--border-subtle); background: var(--bg-card); border-radius: 16px; padding: 1.1rem; box-shadow: var(--shadow-card); }
.source-panel-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border-subtle); }
.source-panel-header h2 { font-size: 1rem; }.source-panel-header > .material-symbols-rounded { color: var(--accent); }
.source-list { display: grid; list-style: none; }
.source-list li { display: grid; grid-template-columns: 38px 1fr auto; align-items: center; gap: .7rem; padding: .9rem 0; border-bottom: 1px solid var(--border-subtle); }
.source-list li > div { min-width: 0; display: grid; }
.source-list strong { font-size: .82rem; }.source-list span:not(.source-icon):not(.module-status):not(.status-dot) { color: var(--text-secondary); font-size: .7rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.source-list small { color: var(--text-muted); font-size: .68rem; }
.source-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; background: var(--bg-primary); color: var(--accent); }.source-icon.fire { color: #c2410c; }.source-icon.air { color: #7c3aed; }.source-icon.rain { color: #2563eb; }.source-icon .material-symbols-rounded { font-size: 20px; }
.source-note { display: flex; gap: .6rem; margin-top: auto; padding: .85rem; border-radius: 10px; background: var(--bg-primary); color: var(--text-secondary); }.source-note .material-symbols-rounded { color: var(--accent); font-size: 19px; }.source-note p { font-size: .72rem; line-height: 1.5; }
.water-layout { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(290px, .75fr); gap: 1rem; align-items: start; }
.station-panel { min-width: 0; }.compact-header { margin-bottom: 1rem; }.stations-list { max-height: 568px; overflow: hidden; display: grid; gap: .65rem; }.stations-list.expanded { max-height: none; }.station-skeletons { display: grid; gap: .65rem; }.station-skeletons .skeleton-card { min-height: 86px; }
.show-more-btn { width: 100%; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: .4rem; margin-top: .75rem; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--bg-primary); color: var(--accent); font: inherit; font-size: .78rem; font-weight: 700; cursor: pointer; }
.chart-placeholder { min-height: 360px; }.skeleton-chart-block { min-height: 280px; border-radius: 12px; background: var(--bg-primary); }
.visually-merged-heading { margin-bottom: -.35rem; }
.forecast-hub-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1rem; }
.forecast-summary-card { --forecast-color: var(--accent); min-height: 230px; display: flex; flex-direction: column; gap: 1rem; padding: 1.1rem; border: 1px solid var(--border-subtle); border-top: 3px solid var(--forecast-color); border-radius: 14px; background: var(--bg-card); box-shadow: var(--shadow-card); }.forecast-summary-card.water { --forecast-color: #0369a1; }.forecast-summary-card.fire { --forecast-color: #c2410c; }.forecast-summary-card.air { --forecast-color: #7c3aed; }.forecast-summary-card.rain { --forecast-color: #2563eb; }
.forecast-card-icon { width: 42px; height: 42px; display: grid; place-items: center; border-radius: 12px; background: color-mix(in srgb, var(--forecast-color) 10%, transparent); color: var(--forecast-color); }.forecast-summary-card > div { display: grid; gap: .35rem; }.forecast-summary-card span:not(.material-symbols-rounded) { color: var(--text-muted); font-size: .72rem; font-weight: 700; }.forecast-summary-card h3 { font-size: 1.25rem; line-height: 1.3; }.forecast-summary-card p { color: var(--text-secondary); font-size: .78rem; line-height: 1.55; }.forecast-summary-card button { min-height: 44px; display: flex; align-items: center; justify-content: space-between; margin-top: auto; border: 0; border-top: 1px solid var(--border-subtle); background: transparent; color: var(--forecast-color); font: inherit; font-size: .78rem; font-weight: 700; cursor: pointer; }.forecast-summary-card button .material-symbols-rounded { font-size: 18px; }
.forecast-disclaimer { display: flex; align-items: flex-start; gap: .6rem; color: var(--text-secondary); font-size: .78rem; padding: 1rem; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--bg-primary); }.forecast-disclaimer .material-symbols-rounded { color: var(--color-safe); font-size: 20px; }
@media (max-width: 1180px) { .overview-grid { grid-template-columns: repeat(2, 1fr); }.map-layout { grid-template-columns: 1fr; }.source-list { grid-template-columns: repeat(2, 1fr); gap: 0 1rem; }.forecast-hub-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 860px) { .dashboard-intro { align-items: flex-start; flex-direction: column; }.intro-actions { width: 100%; justify-content: space-between; }.water-layout { grid-template-columns: 1fr; }.hazard-nav { top: 66px; }.section-heading { align-items: flex-start; flex-direction: column; } }
@media (max-width: 620px) { .dashboard-page { gap: 1rem; }.overview-grid { grid-template-columns: 1fr; }.overview-card { min-height: 112px; }.intro-actions { align-items: stretch; flex-direction: column; }.primary-btn { width: 100%; }.source-list { grid-template-columns: 1fr; }.forecast-hub-grid { grid-template-columns: 1fr; }.hazard-nav { width: 100%; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .15rem; overflow: visible; }.hazard-nav button { min-width: 0; flex-direction: column; justify-content: center; gap: .05rem; padding: .35rem .1rem; font-size: .66rem; line-height: 1.2; white-space: normal; }.map-layout { margin-inline: -.25rem; } }
@media (prefers-reduced-motion: reduce) { .sync-indicator.loading { animation: none; } }
</style>
