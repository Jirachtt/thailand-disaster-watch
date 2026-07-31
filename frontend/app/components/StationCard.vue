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
        {{ Number(station.currentLevel || 0).toFixed(2) }}
      </div>
      <div class="station-unit">เมตร (m)</div>
      <div class="station-trend" :class="station.trendDirection">
        <span class="material-symbols-rounded" style="font-size: 14px">
          {{ station.trendDirection === 'up' ? 'trending_up' : station.trendDirection === 'down' ? 'trending_down' : 'trending_flat' }}
        </span>
        {{ station.trend > 0 ? '+' : '' }}{{ Number(station.trend || 0).toFixed(2) }}m
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
</script>
