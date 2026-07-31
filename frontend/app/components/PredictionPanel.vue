<template>
  <section class="glass-card prediction-card" aria-labelledby="water-forecast-title">
    <div class="prediction-header">
      <div class="prediction-icon">
        <span class="material-symbols-rounded" aria-hidden="true">model_training</span>
      </div>
      <div>
        <h3 id="water-forecast-title" class="card-title">แนวโน้มระดับน้ำ 12 ชั่วโมง</h3>
        <p class="card-subtitle">{{ station?.name || 'เลือกสถานีเพื่อดูพยากรณ์' }}</p>
      </div>
    </div>

    <div v-if="hasData" class="prediction-details">
      <div class="prediction-row">
        <span class="prediction-label">ระดับปัจจุบัน</span>
        <span class="prediction-value" :style="{ color: levelColor }">{{ formatLevel(currentLevel) }}</span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">ค่าสูงสุดที่คาด</span>
        <span class="prediction-value" :style="{ color: levelColor }">{{ formatLevel(peakPredicted) }}</span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">เวลาถึงค่าสูงสุด</span>
        <span class="prediction-value">{{ peakHours > 0 ? `ประมาณ ${peakHours} ชม.` : 'ทรงตัว/ลดลง' }}</span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">ความเชื่อมั่นของแบบจำลอง</span>
        <span class="prediction-value forecast-confidence">{{ confidence }}%</span>
      </div>
      <div class="prediction-row">
        <span class="prediction-label">สถานการณ์จาก ThaiWater</span>
        <span class="risk-badge" :class="riskLevel">{{ riskLabel }}</span>
      </div>
      <div v-if="riskType === 'flood' && flowTime > 0" class="prediction-row">
        <span class="prediction-label">เวลาประมาณถึงพื้นที่ปลายน้ำ</span>
        <span class="prediction-value warning-text">ประมาณ {{ flowTime }} ชม.</span>
      </div>
      <p class="model-note">
        <span class="material-symbols-rounded" aria-hidden="true">info</span>
        คำนวณจากแนวโน้มเซ็นเซอร์และฝนใกล้เคียง ความแม่นยำลดลงตามระยะเวลา และไม่ใช่คำสั่งอพยพ
      </p>
    </div>
    <div v-else class="module-empty compact">
      <span class="material-symbols-rounded" aria-hidden="true">water_drop</span>
      <p>ยังไม่มีข้อมูลสถานีสำหรับคำนวณแนวโน้ม</p>
    </div>
  </section>
</template>

<script setup>
const props = defineProps({
  station: { type: Object, default: null },
})

const hasData = computed(() => Number.isFinite(Number(props.station?.currentLevel)))
const currentLevel = computed(() => Number(props.station?.currentLevel))
const peakPredicted = computed(() => Number.isFinite(Number(props.station?.peakPredicted))
  ? Number(props.station.peakPredicted)
  : currentLevel.value)
const riskLevel = computed(() => props.station?.riskLevel || 'safe')
const riskType = computed(() => props.station?.riskType || 'normal')
const flowTime = computed(() => Number(props.station?.flowTimeToDownstream) || 0)
const peakHours = computed(() => Number(props.station?.peakInHours) || 0)
const confidence = computed(() => Math.round(Number(props.station?.forecastConfidence) || 75))

const riskLabel = computed(() => props.station?.situationLabel || ({
  danger: 'วิกฤต',
  warning: 'เฝ้าระวัง',
  safe: 'ปกติ',
}[riskLevel.value]))

const levelColor = computed(() => ({
  danger: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  safe: 'var(--color-safe)',
}[riskLevel.value] || 'var(--text-primary)'))

function formatLevel(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} ม.` : 'ยังไม่มีข้อมูล'
}
</script>
