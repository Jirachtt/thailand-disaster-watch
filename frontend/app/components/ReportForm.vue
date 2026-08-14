<template>
  <ClientOnly>
    <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="modal-overlay" @click.self="close" @keydown.esc="close">
        <div ref="modalContent" class="modal-content glass-card" role="dialog" aria-modal="true" aria-labelledby="report-dialog-title" tabindex="-1">
          <div class="modal-header">
            <div class="modal-title">
              <span class="material-symbols-rounded" aria-hidden="true">campaign</span>
              <h2 id="report-dialog-title">แจ้งเหตุภัยพิบัติ</h2>
            </div>
            <button type="button" class="icon-btn" aria-label="ปิดแบบฟอร์มแจ้งเหตุ" @click="close">
              <span class="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
          </div>

          <form @submit.prevent="submitReport" class="report-form">
            <div class="form-group">
              <span class="form-label">ประเภทภัยพิบัติ</span>
              <div class="type-selector" role="radiogroup" aria-label="ประเภทภัยพิบัติ">
                <button 
                  type="button" 
                  class="type-btn" 
                  :class="{ active: form.type === 'flood' }" 
                  role="radio"
                  :aria-checked="form.type === 'flood'"
                  @click="form.type = 'flood'"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">water_drop</span>
                  น้ำท่วม
                </button>
                <button 
                  type="button" 
                  class="type-btn" 
                  :class="{ active: form.type === 'fire', danger: form.type === 'fire' }" 
                  role="radio"
                  :aria-checked="form.type === 'fire'"
                  @click="form.type = 'fire'"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">local_fire_department</span>
                  ไฟป่า
                </button>
              </div>
            </div>

            <div class="form-group">
              <label for="report-description">รายละเอียดเหตุการณ์</label>
              <textarea 
                id="report-description"
                v-model="form.description" 
                rows="4" 
                placeholder="ระบุความรุนแรง หรือสังเกตการณ์เบื้องต้น..."
                required
              ></textarea>
            </div>

            <div class="form-group location-group">
              <span class="form-label">ตำแหน่งเหตุการณ์</span>
              <div class="location-status">
                <span class="material-symbols-rounded" :class="{ 'text-success': locationFound, 'text-warning': !locationFound }">
                  {{ locationFound ? 'my_location' : locationError ? 'location_off' : 'location_searching' }}
                </span>
                <span>{{ locationFound ? 'ระบุตำแหน่งแล้ว' : locationError ? locationError : 'กำลังขอตำแหน่งจากอุปกรณ์...' }}</span>
                <span v-if="locationFound" class="coords">({{ form.lat.toFixed(4) }}, {{ form.lng.toFixed(4) }})</span>
              </div>
              <button v-if="locationError" type="button" class="location-retry" @click="requestLocation">
                <span class="material-symbols-rounded" aria-hidden="true">my_location</span> ลองใช้ตำแหน่งอุปกรณ์อีกครั้ง
              </button>
              <div v-if="locationError" class="manual-coordinates">
                <p>หรือกรอกพิกัดในประเทศไทยเอง (ละติจูด 5–21, ลองจิจูด 97–106.5)</p>
                <label for="report-lat">ละติจูด</label>
                <input id="report-lat" v-model.number="form.lat" type="number" min="5" max="21" step="0.000001" placeholder="เช่น 18.7883" @input="validateManualLocation" />
                <label for="report-lng">ลองจิจูด</label>
                <input id="report-lng" v-model.number="form.lng" type="number" min="97" max="106.5" step="0.000001" placeholder="เช่น 98.9853" @input="validateManualLocation" />
              </div>
            </div>

            <p v-if="submitMessage" class="form-message" role="status">{{ submitMessage }}</p>

            <div class="form-actions">
              <button type="button" class="btn-cancel" @click="close">ยกเลิก</button>
              <button type="submit" class="btn-submit" :disabled="isSubmitting || !locationFound">
                <span class="material-symbols-rounded" v-if="!isSubmitting">send</span>
                <span class="spinner" v-else></span>
                {{ isSubmitting ? 'กำลังส่งข้อมูล...' : 'ส่งรายงาน' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
    </Teleport>
  </ClientOnly>
</template>

<script setup>
const props = defineProps({ isOpen: Boolean })
const emit = defineEmits(['close', 'submitted'])

const isSubmitting = ref(false)
const locationFound = ref(false)
const locationError = ref('')
const submitMessage = ref('')
const modalContent = ref(null)
let locationTimer = null
let locationRequestToken = 0
let previousFocus = null
const form = ref({
  type: 'flood',
  description: '',
  lat: null,
  lng: null,
})

watch(() => props.isOpen, async (newVal) => {
  if (newVal) {
    previousFocus = document.activeElement
    // Reset form and get location
    form.value.description = ''
    form.value.type = 'flood'
    locationFound.value = false
    locationError.value = ''
    submitMessage.value = ''
    form.value.lat = null
    form.value.lng = null
    requestLocation()
    await nextTick()
    modalContent.value?.focus()
  }
})

function requestLocation() {
  const token = ++locationRequestToken
  clearTimeout(locationTimer)
  locationFound.value = false
  locationError.value = ''
  if (!navigator.geolocation) {
    locationError.value = 'อุปกรณ์นี้ไม่รองรับตำแหน่ง กรุณากรอกพิกัดเอง'
    return
  }
  locationTimer = setTimeout(() => {
    if (token === locationRequestToken && !locationFound.value) {
      locationError.value = 'ยังไม่ได้รับตำแหน่งจากอุปกรณ์ กรุณาอนุญาตตำแหน่งหรือกรอกพิกัดเอง'
    }
  }, 9000)
  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (token !== locationRequestToken) return
      clearTimeout(locationTimer)
      form.value.lat = position.coords.latitude
      form.value.lng = position.coords.longitude
      if (isInThailandBounds(form.value.lat, form.value.lng)) {
        locationFound.value = true
      } else {
        locationError.value = 'ตำแหน่งอุปกรณ์อยู่นอกประเทศไทย กรุณากรอกพิกัดเหตุการณ์เอง'
      }
    },
    () => {
      if (token !== locationRequestToken) return
      clearTimeout(locationTimer)
      locationError.value = 'ไม่สามารถเข้าถึงตำแหน่งได้ กรุณาอนุญาตตำแหน่งหรือกรอกพิกัดเอง'
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
  )
}

function validateManualLocation() {
  const lat = Number(form.value.lat)
  const lng = Number(form.value.lng)
  locationFound.value = form.value.lat !== '' && form.value.lat !== null
    && form.value.lng !== '' && form.value.lng !== null
    && isInThailandBounds(lat, lng)
}

function isInThailandBounds(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
    && Number(lat) >= 5 && Number(lat) <= 21
    && Number(lng) >= 97 && Number(lng) <= 106.5
}

async function close() {
  locationRequestToken += 1
  clearTimeout(locationTimer)
  emit('close')
  await nextTick()
  previousFocus?.focus?.()
}

async function submitReport() {
  isSubmitting.value = true
  submitMessage.value = ''
  try {
    const data = await $fetch('/api/reports', {
      method: 'POST',
      body: form.value,
      timeout: 8000,
    })
    emit('submitted', data.report)
    close()
  } catch (err) {
    console.error('Submit report failed:', err)
    submitMessage.value = 'ส่งรายงานไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง'
  } finally {
    isSubmitting.value = false
  }
}

onUnmounted(() => clearTimeout(locationTimer))
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(12px, 3vw, 28px);
  background: rgba(31, 29, 26, .58);
  backdrop-filter: blur(8px) saturate(90%);
}

.modal-content {
  width: 100%;
  max-width: 520px;
  max-height: min(90dvh, 780px);
  overflow-y: auto;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl, 22px);
  padding: clamp(20px, 4vw, 28px);
  box-shadow: var(--shadow-elevated);
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 26px;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 11px;
}

.modal-title h2 {
  margin: 0;
  color: var(--text-primary);
  font-family: var(--font-serif, Georgia, serif);
  font-size: 1.28rem;
  font-weight: 500;
  line-height: 1.3;
  letter-spacing: -.02em;
}

.modal-title .material-symbols-rounded {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 14px;
  color: var(--accent);
  background: var(--accent-soft);
  font-size: 23px;
}

.report-form {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.form-group label,
.form-label {
  color: var(--text-primary);
  font-size: .86rem;
  font-weight: 700;
}

.type-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.type-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 52px;
  padding: 11px 14px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  cursor: pointer;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
  font-family: inherit;
  font-weight: 700;
}

.type-btn:hover { transform: translateY(-1px); border-color: var(--accent); background: var(--bg-card-hover); }

.type-btn.active {
  color: var(--color-info);
  background: var(--color-info-bg);
  border-color: color-mix(in srgb, var(--color-info) 55%, var(--border-subtle));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-info) 16%, transparent);
}

.type-btn.active.danger {
  background: var(--color-danger-bg);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

textarea {
  width: 100%;
  min-height: 128px;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 12px 14px;
  color: var(--text-primary);
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

textarea:focus {
  outline: none;
  border-color: var(--accent);
  background: var(--bg-secondary);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

textarea::placeholder { color: var(--text-muted); }

.location-status {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 48px;
  padding: 11px 13px;
  color: var(--text-secondary);
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: 13px;
  font-size: .84rem;
}

.location-retry {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .4rem;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  color: var(--accent);
  background: var(--bg-secondary);
  font-weight: 700;
  cursor: pointer;
  transition: border-color 180ms ease, background 180ms ease, transform 180ms ease;
}
.location-retry:hover { transform: translateY(-1px); border-color: var(--accent); background: var(--accent-soft); }
.location-retry .material-symbols-rounded { font-size: 19px; }
.manual-coordinates { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .65rem .75rem; padding: .85rem; border: 1px solid var(--border-subtle); border-radius: 13px; background: var(--bg-primary); }
.manual-coordinates p { grid-column: 1 / -1; color: var(--text-secondary); font-size: .78rem; }
.manual-coordinates label { font-size: .75rem; }
.manual-coordinates input { width: 100%; min-height: 44px; border: 1px solid var(--border-subtle); border-radius: 10px; padding: .5rem .7rem; color: var(--text-primary); background: var(--bg-secondary); outline: 0; }
.manual-coordinates input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.form-message { border: 1px solid color-mix(in srgb, var(--color-danger) 20%, transparent); border-radius: 11px; padding: .75rem .85rem; color: var(--color-danger); background: var(--color-danger-bg); font-size: .8rem; }

.text-success { color: var(--color-safe); }
.text-warning { color: var(--color-warning); }
.coords { color: var(--text-muted); font-size: 0.8rem; }

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.btn-cancel {
  min-height: 44px;
  padding: 10px 19px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: 12px;
  cursor: pointer;
  font-weight: 700;
  transition: border-color 180ms ease, color 180ms ease, background 180ms ease;
}
.btn-cancel:hover { color: var(--text-primary); border-color: var(--border); background: var(--bg-card-hover); }

.btn-submit {
  min-height: 44px;
  padding: 10px 22px;
  background: var(--accent);
  border: 1px solid var(--accent);
  color: white;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 700;
  box-shadow: 0 7px 18px color-mix(in srgb, var(--accent) 20%, transparent);
  transition: opacity 180ms ease, background 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.btn-submit:hover:not(:disabled) { transform: translateY(-1px); background: var(--accent-hover); border-color: var(--accent-hover); box-shadow: 0 10px 22px color-mix(in srgb, var(--accent) 25%, transparent); }

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  box-shadow: none;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 220ms ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
.fade-enter-active .modal-content,
.fade-leave-active .modal-content { transition: transform 260ms cubic-bezier(.2, .8, .2, 1), opacity 220ms ease; }
.fade-enter-from .modal-content,
.fade-leave-to .modal-content { opacity: 0; transform: translateY(12px) scale(.98); }

@media (max-width: 540px) {
  .modal-overlay { align-items: flex-end; padding: 10px; }
  .modal-content { max-height: calc(100dvh - 20px); border-radius: 21px; padding: 20px 16px 16px; }
  .modal-header { margin-bottom: 20px; }
  .manual-coordinates { grid-template-columns: 1fr; }
  .manual-coordinates p { grid-column: auto; }
  .form-actions { display: grid; grid-template-columns: 1fr 1.25fr; }
}

@media (max-width: 360px) {
  .type-selector,
  .form-actions { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .type-btn,
  .location-retry,
  .btn-submit,
  .fade-enter-active,
  .fade-leave-active,
  .fade-enter-active .modal-content,
  .fade-leave-active .modal-content { transition: none; }
  .spinner { animation: none; }
}
</style>
