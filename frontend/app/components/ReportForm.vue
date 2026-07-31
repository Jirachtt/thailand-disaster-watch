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
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-content {
  width: 100%;
  max-width: 500px;
  background: var(--bg-card);
  border: 1px solid var(--border-glass);
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-card);
  max-height: min(90vh, 760px);
  overflow-y: auto;
}

[data-theme="light"] .modal-content {
  background: #ffffff;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-title h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.modal-title .material-symbols-rounded {
  color: var(--accent);
  font-size: 28px;
}

.report-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label,
.form-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.type-selector {
  display: flex;
  gap: 12px;
}

.type-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 48px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
  font-family: inherit;
  font-weight: 600;
}

[data-theme="light"] .type-btn {
  background: #f1f5f9;
}

.type-btn.active {
  background: rgba(56, 189, 248, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

.type-btn.active.danger {
  background: rgba(239, 68, 68, 0.15);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

textarea {
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 12px;
  color: var(--text-primary);
  font-family: inherit;
  resize: vertical;
}

[data-theme="light"] textarea {
  background: #f8fafc;
}

textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.location-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: var(--radius-md);
  font-size: 0.9rem;
}

.location-retry {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .4rem;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  color: var(--accent);
  background: var(--bg-secondary);
  font-weight: 700;
  cursor: pointer;
}
.location-retry .material-symbols-rounded { font-size: 19px; }
.manual-coordinates { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: .55rem .75rem; padding: .75rem; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--bg-primary); }
.manual-coordinates p { grid-column: 1 / -1; color: var(--text-secondary); font-size: .78rem; }
.manual-coordinates label { font-size: .75rem; }
.manual-coordinates input { width: 100%; min-height: 42px; border: 1px solid var(--border-subtle); border-radius: 8px; padding: .45rem .6rem; color: var(--text-primary); background: var(--bg-secondary); }
.form-message { border-radius: 9px; padding: .7rem; color: var(--color-danger); background: var(--color-danger-bg); font-size: .8rem; }

[data-theme="light"] .location-status {
  background: #f8fafc;
}

.text-success { color: var(--color-safe); }
.text-warning { color: var(--color-warning); }
.coords { color: var(--text-muted); font-size: 0.8rem; }

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 12px;
}

.btn-cancel {
  min-height: 44px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.btn-submit {
  min-height: 44px;
  padding: 10px 24px;
  background: var(--accent);
  border: none;
  color: white;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  transition: opacity 0.2s;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
  transition: opacity 0.3s;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
