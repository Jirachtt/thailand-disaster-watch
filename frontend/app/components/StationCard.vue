<template>
  <button
    type="button"
    class="station-card"
    :class="{ active: isActive }"
    :aria-pressed="isActive"
    @click="$emit('select', station.id)"
  >
    <div class="station-indicator" :class="station.type">
      <span class="material-symbols-rounded">
        {{ station.type === 'upstream' ? 'landscape' : station.type === 'midstream' ? 'location_city' : 'water' }}
      </span>
    </div>
    <div class="station-info">
      <div class="station-name">{{ station.name }}</div>
      <div class="station-location">{{ station.description || station.typeLabel }}</div>
      <span class="station-status-label" :class="station.riskLevel">{{ station.situationLabel || statusLabel }}</span>
    </div>
    <div class="station-data">
      <div class="station-level" :class="station.riskLevel">
        {{ formatNumber(station.currentLevel) }}
      </div>
      <div class="station-unit">เมตร (m)</div>
      <div class="station-trend" :class="station.trendDirection">
        <span class="material-symbols-rounded" style="font-size: 14px">
          {{ station.trendDirection === 'up' ? 'trending_up' : station.trendDirection === 'down' ? 'trending_down' : station.trendDirection === 'unknown' ? 'help' : 'trending_flat' }}
        </span>
        {{ formatTrend(station.trend) }}
      </div>
    </div>
  </button>
</template>

<script setup>
const props = defineProps({
  station: { type: Object, required: true },
  isActive: { type: Boolean, default: false },
})

defineEmits(['select'])

const statusLabel = computed(() => ({
  danger: 'วิกฤต',
  warning: 'เฝ้าระวัง',
  safe: 'ปกติ',
}[props.station?.riskLevel] || 'รอตรวจสอบ'))

function formatNumber(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—'
  return Number(value).toFixed(2)
}

function formatTrend(value) {
  if (value == null || !Number.isFinite(Number(value))) return 'ยังไม่มีค่าก่อนหน้า'
  const trend = Number(value)
  return `${trend > 0 ? '+' : ''}${trend.toFixed(2)}m`
}
</script>
