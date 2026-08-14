<template>
  <div class="glass-card fire-panel">
    <div class="fire-panel-header">
      <div class="fire-panel-icon">
        <span class="material-symbols-rounded" aria-hidden="true">local_fire_department</span>
      </div>
      <div>
        <div class="card-title fire-panel-title">คาดการณ์การลุกลามของไฟ</div>
        <div class="fire-panel-summary">{{ fireSummaryText }}</div>
      </div>
    </div>

    <!-- Fire selector tabs (limited with show more) -->
    <div class="fire-tabs" v-if="displayFires.length > 0" role="list" aria-label="รายการจุดความร้อน">
      <button
        v-for="fire in visibleFires"
        :key="fire.id"
        type="button"
        :aria-pressed="selectedFireId === fire.id"
        class="fire-tab"
        :class="{ active: selectedFireId === fire.id, [fire.intensity]: true }"
        @click="openFirePopup(fire, $event)"
      >
        <span class="fire-tab-dot" :class="fire.intensity"></span>
        {{ fire.name }}
      </button>
    </div>
    <button
      v-if="displayFires.length > 6"
      type="button"
      class="show-more-btn"
      @click="showAllFires = !showAllFires"
    >
      <span class="material-symbols-rounded">{{ showAllFires ? 'expand_less' : 'expand_more' }}</span>
      {{ showAllFires ? 'แสดงน้อยลง' : `ดูเพิ่มเติม (${displayFires.length - 6} จุด)` }}
    </button>

    <!-- Empty hint -->
    <div v-if="isUnavailable" class="fire-empty error" role="alert">
      <span class="material-symbols-rounded fire-state-icon" aria-hidden="true">sync_problem</span>
      <p>เชื่อมต่อข้อมูลจุดความร้อนจาก NASA FIRMS ไม่ได้</p>
    </div>
    <div v-else-if="isLoading" class="fire-empty" role="status" aria-live="polite">
      <span class="material-symbols-rounded fire-state-icon muted" aria-hidden="true">sync</span>
      <p>กำลังเชื่อมต่อข้อมูลจุดความร้อน</p>
    </div>
    <div v-else-if="displayFires.length === 0" class="fire-empty" role="status">
      <span class="material-symbols-rounded fire-state-icon muted" aria-hidden="true">local_fire_department</span>
      <p>ไม่พบจุดความร้อนในข้อมูลล่าสุด</p>
    </div>
    <div v-else-if="!popupFire" class="fire-hint">
      <span class="material-symbols-rounded fire-hint-icon" aria-hidden="true">touch_app</span>
      <span>กดจุดไฟด้านบนเพื่อดูรายละเอียดและตำแหน่ง</span>
    </div>

    <!-- POPUP MODAL for fire details -->
    <Teleport to="body">
      <Transition name="popup">
        <div v-if="popupFire" class="fire-popup-overlay" @click.self="closePopup" @keydown.esc="closePopup">
          <div ref="popupDialog" class="fire-popup" role="dialog" aria-modal="true" aria-labelledby="fire-popup-title" tabindex="-1">
            <div class="fire-popup-header">
              <div id="fire-popup-title" class="fire-popup-title">
                <span class="material-symbols-rounded" aria-hidden="true">local_fire_department</span>
                {{ popupFire.name }}
              </div>
              <button ref="closeButton" type="button" class="popup-close" aria-label="ปิดรายละเอียดจุดความร้อน" @click="closePopup">
                <span class="material-symbols-rounded" aria-hidden="true">close</span>
              </button>
            </div>

            <!-- Location -->
            <div class="fire-location">
              <span class="material-symbols-rounded fire-accent-icon" aria-hidden="true">location_on</span>
              <div>
                <div class="fire-location-name">{{ popupFire.province || getProvinceFromCoords(popupFire.lat, popupFire.lng) }}</div>
                <div class="fire-location-coords">{{ popupFire.lat.toFixed(4) }}°N, {{ popupFire.lng.toFixed(4) }}°E</div>
              </div>
              <button type="button" class="fly-to-btn" aria-label="ดูตำแหน่งจุดความร้อนบนแผนที่" @click="flyToFire" title="ดูบนแผนที่">
                <span class="material-symbols-rounded" aria-hidden="true">my_location</span>
              </button>
            </div>

            <div class="fire-popup-body">
              <!-- Status & Intensity -->
              <div class="fire-status-row">
                <span class="fire-intensity-badge" :class="popupFire.intensity">
                  {{ getIntensityLabel(popupFire.intensity) }}
                </span>
                <span class="fire-status-badge">
                  <span class="material-symbols-rounded" aria-hidden="true">{{ popupFire.status === 'active' ? 'radio_button_checked' : 'check_circle' }}</span>
                  {{ popupFire.status === 'active' ? 'กำลังติดตาม' : 'ควบคุมได้แล้ว' }}
                </span>
              </div>

              <!-- Stats grid -->
              <div class="fire-stats-grid">
                <div class="fire-stat-item">
                  <span class="material-symbols-rounded">schedule</span>
                  <div class="fire-stat-value">{{ popupFire.hoursActive?.toFixed(1) || 0 }} ชม.</div>
                  <div class="fire-stat-label">ตรวจพบเมื่อ</div>
                </div>
                <div class="fire-stat-item">
                  <span class="material-symbols-rounded">square_foot</span>
                    <div class="fire-stat-value fire-value-accent">{{ popupFire.areaSqKm }} ตร.กม.</div>
                  <div class="fire-stat-label">พื้นที่ตรวจจับโดยประมาณ</div>
                </div>
                <div class="fire-stat-item">
                  <span class="material-symbols-rounded">bolt</span>
                  <div class="fire-stat-value">{{ popupFire.frp || 'N/A' }} MW</div>
                  <div class="fire-stat-label">FRP พลังงาน</div>
                </div>
              </div>

              <!-- Weather -->
              <div class="fire-weather">
                <div class="fire-weather-item">
                  <span class="material-symbols-rounded">air</span>
                  <div>
                    <div class="fire-weather-value">{{ popupFire.windSpeed }} กม./ชม.</div>
                    <div class="fire-weather-label">ลม {{ popupFire.windDirection }}</div>
                  </div>
                </div>
                <div class="fire-weather-item">
                  <span class="material-symbols-rounded">humidity_percentage</span>
                  <div>
                    <div class="fire-weather-value">{{ popupFire.humidity }}%</div>
                    <div class="fire-weather-label">ความชื้น</div>
                  </div>
                </div>
                <div class="fire-weather-item">
                  <span class="material-symbols-rounded">thermostat</span>
                  <div>
                    <div class="fire-weather-value">{{ popupFire.temperature }}°C</div>
                    <div class="fire-weather-label">อุณหภูมิ</div>
                  </div>
                </div>
              </div>

              <!-- Spread Predictions -->
              <div class="spread-timeline" v-if="popupPredictions.length > 0">
                <div class="spread-timeline-title">
                  <span class="material-symbols-rounded fire-accent-icon" aria-hidden="true">timeline</span>
                  คาดการณ์การลุกลาม
                </div>
                <p class="spread-model-note">พื้นที่และคะแนนเป็นผลคำนวณของแบบจำลอง ไม่ใช่ค่าที่ NASA FIRMS ยืนยัน</p>
                <div class="spread-timeline-grid">
                  <div
                    v-for="pred in popupPredictions"
                    :key="pred.hoursFromNow"
                    class="spread-step"
                    :class="getSpreadClass(pred)"
                  >
                    <div class="spread-step-time">+{{ pred.hoursFromNow }} ชม.</div>
                    <div class="spread-step-area">{{ pred.estimatedAreaSqKm }} ตร.กม.</div>
                    <div class="spread-step-radius">รัศมี {{ pred.estimatedRadiusKm }} กม.</div>
                    <div class="spread-step-confidence">
                      <div class="confidence-bar">
                        <div class="confidence-fill" :style="{ width: pred.confidence + '%' }"></div>
                      </div>
                      <span class="confidence-text">คะแนนแบบจำลอง {{ pred.confidence }}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup>
const props = defineProps({
  fires: { type: Array, default: () => [] },
  selectedFireId: { type: String, default: null },
  status: { type: String, default: 'loading' },
})

const emit = defineEmits(['selectFire'])

const showAllFires = ref(false)
const popupFire = ref(null)
const popupDialog = ref(null)
const closeButton = ref(null)
let lastTrigger = null

const normalizedStatus = computed(() => props.status === 'fallback' ? 'error' : props.status)
const isUsable = computed(() => ['live', 'stale'].includes(normalizedStatus.value))
const isUnavailable = computed(() => normalizedStatus.value === 'error')
const isLoading = computed(() => !isUsable.value && !isUnavailable.value)
const displayFires = computed(() => isUsable.value ? props.fires : [])
const fireSummaryText = computed(() => {
  if (isUnavailable.value) return 'ยังตรวจสอบจำนวนจุดไม่ได้'
  if (isLoading.value) return 'กำลังตรวจสอบจุดความร้อน'
  return `จำนวน ${displayFires.value.length} จุด`
})

const visibleFires = computed(() => {
  if (showAllFires.value) return displayFires.value
  return displayFires.value.slice(0, 6)
})

const popupPredictions = computed(() => {
  if (!popupFire.value?.predictions) return []
  return popupFire.value.predictions.filter((p) =>
    [1, 3, 6, 12].includes(p.hoursFromNow)
  )
})

watch(isUsable, (usable) => {
  if (usable) return
  popupFire.value = null
  lastTrigger = null
})

function openFirePopup(fire, event) {
  lastTrigger = event?.currentTarget || null
  popupFire.value = fire
  emit('selectFire', fire.id)
  nextTick(() => closeButton.value?.focus())
}

function closePopup() {
  popupFire.value = null
  nextTick(() => lastTrigger?.focus())
}

function flyToFire() {
  if (popupFire.value) {
    emit('selectFire', popupFire.value.id)
    closePopup()
  }
}

function getIntensityLabel(intensity) {
  switch (intensity) {
    case 'extreme': return 'รุนแรงมาก'
    case 'high': return 'รุนแรง'
    case 'medium': return 'ปานกลาง'
    case 'low': return 'ระดับต่ำ'
    default: return ''
  }
}

function getSpreadClass(pred) {
  if (pred.estimatedAreaSqKm > 10) return 'extreme'
  if (pred.estimatedAreaSqKm > 5) return 'high'
  if (pred.estimatedAreaSqKm > 2) return 'medium'
  return 'low'
}

function getProvinceFromCoords(lat, lng) {
  const provinces = [
    { name: 'เชียงใหม่', latMin: 18.0, latMax: 20.0, lngMin: 98.0, lngMax: 99.5 },
    { name: 'เชียงราย', latMin: 19.0, latMax: 20.5, lngMin: 99.5, lngMax: 100.5 },
    { name: 'แม่ฮ่องสอน', latMin: 18.0, latMax: 20.0, lngMin: 97.0, lngMax: 98.5 },
    { name: 'ลำปาง', latMin: 17.5, latMax: 19.5, lngMin: 99.0, lngMax: 100.5 },
    { name: 'พะเยา', latMin: 18.5, latMax: 19.5, lngMin: 99.5, lngMax: 100.5 },
    { name: 'แพร่', latMin: 17.5, latMax: 18.5, lngMin: 99.5, lngMax: 100.5 },
    { name: 'น่าน', latMin: 18.0, latMax: 19.5, lngMin: 100.5, lngMax: 101.5 },
    { name: 'ตาก', latMin: 15.5, latMax: 17.5, lngMin: 98.0, lngMax: 99.5 },
    { name: 'กำแพงเพชร', latMin: 15.5, latMax: 17.0, lngMin: 99.0, lngMax: 100.0 },
    { name: 'พิษณุโลก', latMin: 16.0, latMax: 17.5, lngMin: 100.0, lngMax: 101.0 },
    { name: 'เพชรบูรณ์', latMin: 15.5, latMax: 17.0, lngMin: 100.5, lngMax: 101.5 },
    { name: 'เลย', latMin: 16.5, latMax: 18.0, lngMin: 101.0, lngMax: 102.5 },
    { name: 'อุดรธานี', latMin: 16.5, latMax: 18.0, lngMin: 102.0, lngMax: 103.5 },
    { name: 'ขอนแก่น', latMin: 15.5, latMax: 17.0, lngMin: 102.0, lngMax: 103.5 },
    { name: 'นครราชสีมา', latMin: 14.0, latMax: 15.5, lngMin: 101.5, lngMax: 103.0 },
    { name: 'ชัยภูมิ', latMin: 15.0, latMax: 16.5, lngMin: 101.0, lngMax: 102.5 },
    { name: 'อุบลราชธานี', latMin: 14.5, latMax: 16.0, lngMin: 104.0, lngMax: 106.0 },
    { name: 'นครสวรรค์', latMin: 15.0, latMax: 16.5, lngMin: 99.5, lngMax: 100.5 },
    { name: 'กาญจนบุรี', latMin: 13.5, latMax: 15.5, lngMin: 98.0, lngMax: 100.0 },
    { name: 'กรุงเทพมหานคร', latMin: 13.5, latMax: 14.0, lngMin: 100.3, lngMax: 100.8 },
    { name: 'สุราษฎร์ธานี', latMin: 8.5, latMax: 10.0, lngMin: 98.5, lngMax: 100.0 },
    { name: 'นครศรีธรรมราช', latMin: 7.5, latMax: 9.0, lngMin: 99.5, lngMax: 100.5 },
    { name: 'สกลนคร', latMin: 16.5, latMax: 18.0, lngMin: 103.5, lngMax: 104.5 },
    { name: 'มุกดาหาร', latMin: 16.0, latMax: 17.0, lngMin: 104.0, lngMax: 105.0 },
    { name: 'บุรีรัมย์', latMin: 14.0, latMax: 15.5, lngMin: 102.5, lngMax: 103.5 },
    { name: 'สุรินทร์', latMin: 14.0, latMax: 15.5, lngMin: 103.0, lngMax: 104.0 },
  ]

  for (const p of provinces) {
    if (lat >= p.latMin && lat <= p.latMax && lng >= p.lngMin && lng <= p.lngMax) {
      return `จ.${p.name}, ประเทศไทย`
    }
  }
  return 'ประเทศไทย'
}
</script>

<style scoped>
.fire-panel {
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  border-color: color-mix(in srgb, var(--color-fire) 18%, var(--border-subtle));
  background: var(--bg-card);
  transition: border-color 200ms ease, box-shadow 220ms ease;
}

.fire-panel:hover {
  border-color: color-mix(in srgb, var(--color-fire) 34%, var(--border-subtle));
  box-shadow: var(--shadow-elevated);
}

.fire-panel-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 1.1rem;
}

.fire-panel-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--color-fire) 22%, transparent);
  border-radius: 14px;
  color: var(--color-fire);
  background: var(--color-fire-bg);
}

.fire-panel-icon .material-symbols-rounded { font-size: 22px; }
.fire-panel-title { margin-bottom: 0; font-family: var(--font-serif, Georgia, serif); font-weight: 500; }
.fire-panel-summary { margin-top: 2px; color: var(--text-muted); font-size: .7rem; line-height: 1.45; }

.fire-tabs {
  display: flex;
  gap: .45rem;
  margin-bottom: .65rem;
  flex-wrap: wrap;
}

.fire-tab {
  min-height: 44px;
  padding: 7px 13px;
  border-radius: 999px;
  font-size: .72rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;
}

.fire-tab:hover {
  color: var(--color-fire);
  border-color: color-mix(in srgb, var(--color-fire) 38%, var(--border-subtle));
  background: var(--color-fire-bg);
  transform: translateY(-1px);
}

.fire-tab.active {
  background: var(--color-fire-bg);
  color: var(--color-fire);
  border-color: color-mix(in srgb, var(--color-fire) 58%, var(--border-subtle));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-fire) 13%, transparent);
}

.fire-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.fire-tab-dot.extreme { background: #dc2626; box-shadow: 0 0 6px #dc2626; }
.fire-tab-dot.high { background: #f97316; box-shadow: 0 0 6px #f97316; }
.fire-tab-dot.medium { background: #f59e0b; }
.fire-tab-dot.low { background: #22c55e; }

.show-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-height: 44px;
  padding: 7px 12px;
  margin-top: 0.25rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--color-fire);
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
  font-family: inherit;
}

.show-more-btn:hover {
  background: var(--color-fire-bg);
  border-color: color-mix(in srgb, var(--color-fire) 38%, var(--border-subtle));
}

.show-more-btn .material-symbols-rounded {
  font-size: 16px;
}

.fire-empty, .fire-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 132px;
  padding: 1.25rem;
  border: 1px dashed var(--border-subtle);
  border-radius: 14px;
  background: var(--bg-primary);
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: center;
}

.fire-empty.error {
  color: var(--color-danger);
  background: var(--color-danger-bg);
  border-color: color-mix(in srgb, var(--color-danger) 24%, transparent);
}

.fire-state-icon { font-size: 36px; }
.fire-state-icon.muted { color: var(--text-muted); opacity: .58; }
.fire-hint-icon { color: var(--text-muted); font-size: 20px; }

/* ============================================
   POPUP MODAL
   ============================================ */

.fire-popup-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(31, 29, 26, .58);
  backdrop-filter: blur(8px) saturate(90%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 3vw, 28px);
}

.fire-popup {
  width: 100%;
  max-width: 620px;
  max-height: min(88dvh, 820px);
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--color-fire) 24%, var(--border-subtle));
  border-radius: var(--radius-xl, 22px);
  background: var(--bg-card);
  box-shadow: var(--shadow-elevated);
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.fire-popup-header {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid var(--border-subtle);
  background: color-mix(in srgb, var(--bg-card) 94%, transparent);
  backdrop-filter: blur(16px);
}

.fire-popup-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--color-fire);
  font-family: var(--font-serif, Georgia, serif);
  font-size: 1.05rem;
  font-weight: 600;
  line-height: 1.35;
}

.popup-close {
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  border-radius: 13px;
  border: 1px solid var(--border-subtle);
  background: transparent;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease, transform 180ms ease;
}

.popup-close:hover {
  background: var(--bg-card-hover);
  border-color: var(--border);
  color: var(--text-primary);
  transform: rotate(3deg);
}

.popup-close .material-symbols-rounded {
  font-size: 18px;
}

.fire-popup-body {
  padding: 1.2rem;
}

/* Location */
.fire-location {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: .75rem 1.2rem;
  background: var(--color-fire-bg);
  border-bottom: 1px solid var(--border-subtle);
}

.fire-location-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-primary);
}

.fire-location-coords {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.fire-accent-icon { color: var(--color-fire); font-size: 18px; }
.fire-value-accent { color: var(--color-fire); }

.fly-to-btn {
  margin-left: auto;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  border: 1px solid color-mix(in srgb, var(--color-fire) 30%, var(--border-subtle));
  background: var(--bg-card);
  color: var(--color-fire);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease, transform 180ms ease;
  flex-shrink: 0;
}

.fly-to-btn:hover {
  background: color-mix(in srgb, var(--color-fire-bg) 86%, var(--bg-card));
  border-color: var(--color-fire);
  transform: translateY(-1px);
}

.fly-to-btn .material-symbols-rounded {
  font-size: 16px;
}

/* Status */
.fire-status-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.1rem;
}

.fire-intensity-badge {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.72rem;
  font-weight: 700;
}

.fire-intensity-badge.extreme {
  background: var(--color-danger-bg);
  color: var(--color-danger);
  border: 1px solid color-mix(in srgb, var(--color-danger) 32%, transparent);
}

.fire-intensity-badge.high {
  background: var(--color-fire-bg);
  color: var(--color-fire);
  border: 1px solid color-mix(in srgb, var(--color-fire) 32%, transparent);
}

.fire-intensity-badge.medium {
  background: var(--color-warning-bg);
  color: var(--color-warning);
  border: 1px solid color-mix(in srgb, var(--color-warning) 32%, transparent);
}

.fire-intensity-badge.low {
  background: var(--color-safe-bg);
  color: var(--color-safe);
  border: 1px solid color-mix(in srgb, var(--color-safe) 32%, transparent);
}

.fire-status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-secondary);
}

/* Stats grid */
.fire-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.fire-stat-item {
  text-align: center;
  min-width: 0;
  padding: .85rem .65rem;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
}

.fire-stat-item .material-symbols-rounded {
  font-size: 18px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.fire-stat-value {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.fire-stat-label {
  font-size: 0.62rem;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Weather */
.fire-weather {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.fire-weather-item {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: .7rem;
}

.fire-weather-item .material-symbols-rounded {
  font-size: 18px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.fire-weather-value {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text-primary);
}

.fire-weather-label {
  font-size: 0.62rem;
  color: var(--text-muted);
}

/* Spread timeline */
.spread-timeline-title {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 0.6rem;
  letter-spacing: .02em;
}

.spread-model-note {
  margin: -0.25rem 0 0.6rem;
  color: var(--text-muted);
  font-size: 0.68rem;
  line-height: 1.5;
}

.spread-timeline-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.spread-step {
  min-width: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.6rem;
  text-align: center;
}

.spread-step.extreme { border-left: 3px solid #dc2626; }
.spread-step.high { border-left: 3px solid #f97316; }
.spread-step.medium { border-left: 3px solid #f59e0b; }
.spread-step.low { border-left: 3px solid #22c55e; }

.spread-step-time {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-fire);
  margin-bottom: 4px;
}

.spread-step-area {
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.spread-step-radius {
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.spread-step-confidence {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  justify-content: center;
}

.confidence-bar {
  width: 100%;
  height: 3px;
  background: var(--border-subtle);
  border-radius: 3px;
  overflow: hidden;
  max-width: 40px;
}

.confidence-fill {
  height: 100%;
  background: var(--color-fire);
  border-radius: 3px;
}

.confidence-text {
  font-size: 0.6rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
}

.popup-enter-active { transition: opacity 220ms ease; }
.popup-leave-active { transition: opacity 180ms ease; }
.popup-enter-from, .popup-leave-to {
  opacity: 0;
}
.popup-enter-from .fire-popup, .popup-leave-to .fire-popup {
  transform: scale(.98) translateY(12px);
}
.popup-enter-active .fire-popup,
.popup-leave-active .fire-popup { transition: transform 260ms cubic-bezier(.2, .8, .2, 1), opacity 220ms ease; }

@media (max-width: 700px) {
  .fire-popup-overlay { align-items: flex-end; padding: 10px; }
  .fire-popup { max-height: calc(100dvh - 20px); border-radius: 21px; }
  .fire-popup-header { padding: .85rem 1rem; }
  .fire-location { padding: .7rem 1rem; }
  .fire-popup-body { padding: 1rem; }
  .spread-timeline-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 520px) {
  .fire-tabs { flex-wrap: nowrap; margin-inline: -1rem; padding: 0 1rem .35rem; overflow-x: auto; scrollbar-width: none; scroll-snap-type: x proximity; }
  .fire-tabs::-webkit-scrollbar { display: none; }
  .fire-tab { flex: 0 0 auto; scroll-snap-align: start; }
  .fire-stats-grid,
  .fire-weather { grid-template-columns: 1fr; }
  .fire-stat-item { display: grid; grid-template-columns: 24px minmax(0, 1fr); grid-template-areas: 'icon value' 'icon label'; align-items: center; column-gap: .55rem; text-align: left; }
  .fire-stat-item .material-symbols-rounded { grid-area: icon; margin: 0; }
  .fire-stat-value { grid-area: value; }
  .fire-stat-label { grid-area: label; }
}

@media (max-width: 380px) {
  .spread-timeline-grid { grid-template-columns: 1fr; }
  .fire-location-coords { font-size: .62rem; }
}

@media (prefers-reduced-motion: reduce) {
  .fire-panel,
  .fire-tab,
  .show-more-btn,
  .popup-close,
  .fly-to-btn,
  .popup-enter-active,
  .popup-leave-active,
  .popup-enter-active .fire-popup,
  .popup-leave-active .fire-popup { transition: none; }
}
</style>
