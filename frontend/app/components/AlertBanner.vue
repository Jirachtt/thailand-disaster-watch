<template>
  <section class="alert-banner" :class="bannerClass" role="status" aria-live="polite">
    <span class="alert-icon material-symbols-rounded" aria-hidden="true">{{ alertIcon }}</span>
    <div class="alert-content">
      <div class="alert-title">{{ alertTitle }}</div>
      <div class="alert-text">{{ alertText }}</div>
      <div class="alert-sources" aria-label="สถานะแหล่งข้อมูล">
        <span v-for="source in sourceStates" :key="source.label" class="source-state" :class="source.status">
          <span class="source-state-dot" aria-hidden="true"></span>
          {{ source.label }} · {{ statusLabel(source.status) }}
        </span>
      </div>
    </div>
    <button
      v-if="primaryAlertLocation"
      class="view-map-btn"
      type="button"
      @click="$emit('view-map', primaryAlertLocation)"
    >
      <span class="material-symbols-rounded" aria-hidden="true">my_location</span>
      ดูบนแผนที่
    </button>
    <span class="risk-badge" :class="bannerClass">{{ bannerBadge }}</span>
  </section>
</template>

<script setup>
const props = defineProps({
  riskLevel: { type: String, default: 'safe' },
  stations: { type: Array, default: () => [] },
  fires: { type: Array, default: () => [] },
  waterStatus: { type: String, default: 'loading' },
  fireStatus: { type: String, default: 'loading' },
  rainStatus: { type: String, default: 'loading' },
  aqiStatus: { type: String, default: 'loading' },
})

defineEmits(['view-map'])

const isUsableStatus = (status) => ['live', 'stale'].includes(status)

const verifiedStations = computed(() => isUsableStatus(props.waterStatus) ? props.stations : [])
const verifiedFires = computed(() => isUsableStatus(props.fireStatus)
  ? props.fires.filter((fire) => fire.status === 'active')
  : [])

const floodDanger = computed(() => verifiedStations.value.filter((station) => station.riskType === 'flood' && station.riskLevel === 'danger'))
const floodWarning = computed(() => verifiedStations.value.filter((station) => station.riskType === 'flood' && station.riskLevel === 'warning'))
const droughtDanger = computed(() => verifiedStations.value.filter((station) => station.riskType === 'drought' && station.riskLevel === 'danger'))
const droughtWarning = computed(() => verifiedStations.value.filter((station) => station.riskType === 'drought' && station.riskLevel === 'warning'))
const extremeFires = computed(() => verifiedFires.value.filter((fire) => fire.intensity === 'extreme'))
const highFires = computed(() => verifiedFires.value.filter((fire) => ['extreme', 'high'].includes(fire.intensity)))
const sourceStatuses = computed(() => [props.waterStatus, props.fireStatus, props.rainStatus, props.aqiStatus])
const hasUnavailableSource = computed(() => sourceStatuses.value.some(status => ['error', 'fallback'].includes(status)))
const hasLoadingSource = computed(() => sourceStatuses.value.includes('loading'))

const normalizeSourceStatus = (status) => status === 'fallback' ? 'error' : status

const sourceStates = computed(() => [
  { label: 'น้ำ', status: normalizeSourceStatus(props.waterStatus) },
  { label: 'ไฟ', status: normalizeSourceStatus(props.fireStatus) },
  { label: 'ฝน', status: normalizeSourceStatus(props.rainStatus) },
  { label: 'ฝุ่น', status: normalizeSourceStatus(props.aqiStatus) },
])

const bannerClass = computed(() => {
  if (floodDanger.value.length || droughtDanger.value.length || extremeFires.value.length >= 5) return 'danger'
  if (floodWarning.value.length || droughtWarning.value.length || highFires.value.length) return 'warning'
  if (hasUnavailableSource.value || hasLoadingSource.value) return 'info'
  return 'safe'
})

const alertIcon = computed(() => ({
  danger: 'crisis_alert',
  warning: 'warning',
  info: hasUnavailableSource.value ? 'cloud_off' : 'sync',
  safe: 'verified_user',
}[bannerClass.value]))

const bannerBadge = computed(() => ({
  danger: 'วิกฤต',
  warning: 'เฝ้าระวัง',
  info: hasUnavailableSource.value ? 'ข้อมูลไม่ครบ' : 'กำลังซิงก์',
  safe: 'ปกติ',
}[bannerClass.value]))

const primaryAlertLocation = computed(() => (
  floodDanger.value[0]
  || droughtDanger.value[0]
  || extremeFires.value[0]
  || floodWarning.value[0]
  || droughtWarning.value[0]
  || highFires.value[0]
  || null
))

const alertTitle = computed(() => {
  if (floodDanger.value.length) return 'แจ้งเตือนระดับน้ำล้นตลิ่ง'
  if (droughtDanger.value.length) return 'แจ้งเตือนสถานการณ์น้ำน้อยวิกฤต'
  if (extremeFires.value.length >= 5) return 'พบกลุ่มจุดความร้อนรุนแรงหลายพื้นที่'
  if (floodWarning.value.length) return 'เฝ้าระวังระดับน้ำสูง'
  if (droughtWarning.value.length) return 'เฝ้าระวังสถานการณ์น้ำน้อย'
  if (highFires.value.length) return 'เฝ้าระวังจุดความร้อนจากดาวเทียม'
  if (hasUnavailableSource.value) return 'เชื่อมต่อแหล่งข้อมูลบางส่วนไม่ได้'
  if (hasLoadingSource.value) return 'กำลังเชื่อมต่อแหล่งข้อมูล'
  return 'ยังไม่พบเหตุวิกฤตจากแหล่งข้อมูลที่เชื่อมต่อ'
})

const alertText = computed(() => {
  const parts = []
  if (floodDanger.value.length) parts.push(`${floodDanger.value.length} สถานีอยู่ในสถานะล้นตลิ่ง`)
  else if (floodWarning.value.length) parts.push(`${floodWarning.value.length} สถานีมีปริมาณน้ำมาก`)

  if (droughtDanger.value.length) parts.push(`${droughtDanger.value.length} สถานีอยู่ในภาวะน้ำน้อยวิกฤต`)
  else if (droughtWarning.value.length) parts.push(`${droughtWarning.value.length} สถานีมีน้ำน้อย`)

  if (highFires.value.length) parts.push(`พบจุดความร้อนระดับสูง ${highFires.value.length} กลุ่ม`)
  if (hasUnavailableSource.value) parts.push('ยังสรุปสถานการณ์โดยรวมไม่ได้ เนื่องจากเชื่อมต่อแหล่งข้อมูลบางส่วนไม่สำเร็จ')

  if (!parts.length) {
    return hasLoadingSource.value
      ? 'หน้าแดชบอร์ดพร้อมใช้งานระหว่างรอข้อมูล แต่ละโมดูลจะแสดงผลทันทีเมื่อเชื่อมต่อสำเร็จ'
      : 'ติดตามน้ำ ไฟป่า และ PM2.5 แยกตามเวลาอัปเดตของแต่ละแหล่งข้อมูล'
  }
  return parts.join(' · ')
})

function statusLabel(status) {
  return {
    live: 'เชื่อมต่อแล้ว',
    stale: 'ข้อมูลล่าสุดที่บันทึกไว้',
    fallback: 'เชื่อมต่อไม่ได้',
    error: 'เชื่อมต่อไม่ได้',
    loading: 'กำลังโหลด',
  }[status] || 'รอตรวจสอบ'
}
</script>
