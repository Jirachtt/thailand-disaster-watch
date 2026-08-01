<template>
  <section class="glass-card water-chart-card" aria-labelledby="water-chart-title">
    <div class="card-header chart-card-header">
      <div>
        <h3 id="water-chart-title" class="card-title">
          <span class="material-symbols-rounded" aria-hidden="true">show_chart</span>
          ระดับน้ำและแนวโน้ม — {{ activeStationName }}
        </h3>
        <p class="card-subtitle">{{ historySubtitle }}</p>
        <div v-if="tsData && !isUnavailable" class="history-provenance" role="status">
          <span class="history-badge" :class="historyBadge.className">{{ historyBadge.label }}</span>
          <span class="history-source">{{ tsData.source }}</span>
        </div>
      </div>
      <div class="chart-actions">
        <div class="chart-tabs" role="group" aria-label="เลือกช่วงเวลาย้อนหลัง">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            class="chart-tab"
            :class="{ active: activeTab === tab.id }"
            :aria-pressed="activeTab === tab.id"
            @click="activeTab = tab.id"
          >{{ tab.label }}</button>
        </div>
        <button type="button" class="icon-action" aria-label="โหลดกราฟใหม่" :disabled="pending" @click="refresh">
          <span class="material-symbols-rounded" :class="{ spinning: pending }" aria-hidden="true">refresh</span>
        </button>
      </div>
    </div>

    <div v-if="pending && !tsData" class="chart-loading" aria-label="กำลังโหลดกราฟระดับน้ำ">
      <div class="skeleton-line wide"></div>
      <div class="skeleton-chart"></div>
    </div>
    <div v-else-if="isUnavailable" class="module-empty compact">
      <span class="material-symbols-rounded" aria-hidden="true">sync_problem</span>
      <p>เชื่อมต่อข้อมูลย้อนหลังของสถานีนี้ไม่ได้</p>
      <button type="button" class="secondary-btn" @click="refresh">ลองอีกครั้ง</button>
    </div>
    <div v-else-if="!hasChartData" class="module-empty compact">
      <span class="material-symbols-rounded" aria-hidden="true">monitoring</span>
      <p>ยังไม่มีข้อมูลย้อนหลังของสถานีนี้</p>
    </div>
    <template v-else>
      <div class="chart-wrapper" :class="{ refreshing: pending }">
        <canvas ref="chartCanvas" role="img" :aria-label="chartSummary">
          {{ chartSummary }}
        </canvas>
        <span v-if="pending" class="inline-refresh-status">กำลังอัปเดต…</span>
      </div>
      <div class="chart-footnote">
        <span><i class="legend-line" :class="{ estimated: isEstimatedHistory }"></i> {{ historyLegendLabel }}</span>
        <span><i class="legend-line forecast"></i> ค่าคาดการณ์</span>
        <span><i class="legend-block rain"></i> {{ rainfallLegendLabel }}</span>
        <span>{{ historyFootnote }}</span>
      </div>
      <details class="forecast-table-details">
        <summary>ดูข้อมูลกราฟแบบตาราง</summary>
        <div class="table-scroll">
          <table>
            <thead><tr><th>เวลา</th><th>ประเภท</th><th>ระดับน้ำ</th><th>ความเชื่อมั่น</th></tr></thead>
            <tbody>
              <tr v-for="row in accessibleRows" :key="`${row.type}-${row.timestamp}`">
                <td>{{ formatDateTime(row.timestamp) }}</td>
                <td>{{ row.type }}</td>
                <td>{{ row.level.toFixed(2) }} ม.</td>
                <td>{{ row.confidence ? `${row.confidence}%` : '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </template>
  </section>
</template>

<script setup>
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

const props = defineProps({
  stationId: { type: String, default: '' },
  stationName: { type: String, default: 'สถานีตรวจวัด' },
})

const activeTab = ref('24h')
const chartCanvas = ref(null)
let chartInstance = null

const tabs = [
  { id: '12h', label: '12 ชม.' },
  { id: '24h', label: '24 ชม.' },
  { id: '72h', label: '72 ชม.' },
]

const activeStationName = computed(() => props.stationName)

const { data: tsData, pending, error, refresh } = useFetch(
  () => `/api/dashboard/timeseries/${encodeURIComponent(props.stationId)}`,
  {
    server: false,
    lazy: true,
    watch: [() => props.stationId],
    timeout: 10000,
  },
)

const isUnavailable = computed(() => Boolean(error.value)
  || ['error', 'fallback'].includes(tsData.value?.status)
  || Boolean(tsData.value?.isFallback)
  || tsData.value?.rainfallSourceStatus === 'fallback')
const hasChartData = computed(() => !isUnavailable.value && Boolean(tsData.value?.waterLevel?.length))
const isEstimatedHistory = computed(() => !isUnavailable.value && Boolean(tsData.value?.estimatedHistory))

const historyBadge = computed(() => {
  if (isUnavailable.value) {
    return { label: 'เชื่อมต่อไม่ได้', className: 'error' }
  }
  if (isEstimatedHistory.value) {
    return { label: 'ค่าประเมินย้อนหลัง', className: 'estimated' }
  }
  if (tsData.value?.status === 'live') {
    return { label: 'ข้อมูลตรวจวัดย้อนหลัง', className: 'live' }
  }
  if (tsData.value?.status === 'stale') {
    return { label: 'ข้อมูลจริงล่าสุดที่บันทึกไว้', className: 'stale' }
  }
  return { label: 'ไม่พบแหล่งข้อมูล', className: 'error' }
})

const historySubtitle = computed(() => {
  if (!tsData.value) return 'กำลังตรวจสอบแหล่งข้อมูลย้อนหลังและแบบจำลองล่วงหน้า 12 ชั่วโมง'
  if (isUnavailable.value) return 'เชื่อมต่อแหล่งข้อมูลย้อนหลังของสถานีนี้ไม่ได้'
  return isEstimatedHistory.value
    ? 'แนวโน้มย้อนหลังจากค่าล่าสุด และแบบจำลองล่วงหน้า 12 ชั่วโมง'
    : 'ข้อมูลตรวจวัดย้อนหลัง และแบบจำลองล่วงหน้า 12 ชั่วโมง'
})

const historyLegendLabel = computed(() => isEstimatedHistory.value ? 'ค่าประเมินย้อนหลัง' : 'ค่าตรวจวัดย้อนหลัง')
const rainfallLegendLabel = computed(() => {
  if (['error', 'fallback'].includes(tsData.value?.rainfallSourceStatus)) return 'ไม่มีข้อมูลฝนจาก API'
  if (tsData.value?.rainfallSourceStatus === 'stale') return 'ฝนจากข้อมูล API ล่าสุดที่บันทึกไว้'
  return 'ฝนเฉลี่ยจากยอดสะสม 24 ชม.'
})

const historyFootnote = computed(() => {
  if (isUnavailable.value) return 'ไม่แสดงข้อมูล เนื่องจากเชื่อมต่อแหล่งข้อมูลไม่ได้'
  if (isEstimatedHistory.value) return 'เส้นย้อนหลังคำนวณจากค่าล่าสุดและแนวโน้ม ไม่ใช่ค่าตรวจวัดรายชั่วโมง'
  return 'ความเชื่อมั่นของค่าคาดการณ์ลดลงตามระยะเวลา'
})

function getFilteredData(hours) {
  if (!tsData.value) return { waterLevel: [], rainfall: [], predictions: [] }
  const cutoff = Date.now() - hours * 3600000
  return {
    waterLevel: (tsData.value.waterLevel || []).filter(item => item.timestamp >= cutoff),
    rainfall: (tsData.value.rainfall || []).filter(item => item.timestamp >= cutoff),
    predictions: tsData.value.predictions || [],
  }
}

function getCurrentRange() {
  const hours = activeTab.value === '12h' ? 12 : activeTab.value === '72h' ? 72 : 24
  return getFilteredData(hours)
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatDateTime(timestamp) {
  return new Date(timestamp).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const accessibleRows = computed(() => {
  const filtered = getCurrentRange()
  const actual = filtered.waterLevel.slice(-12).map(item => ({ timestamp: item.timestamp, type: historyLegendLabel.value, level: item.level, confidence: null }))
  const predictions = filtered.predictions.map(item => ({ timestamp: item.timestamp, type: 'ค่าคาดการณ์', level: item.predictedLevel, confidence: item.confidence }))
  return [...actual, ...predictions]
})

const chartSummary = computed(() => {
  if (!hasChartData.value) return 'ยังไม่มีข้อมูลระดับน้ำ'
  const values = tsData.value.waterLevel
  const latest = values.at(-1)?.level
  const prediction = tsData.value.predictions?.at(-1)?.predictedLevel
  const historyDescription = isEstimatedHistory.value ? 'ชุดข้อมูลย้อนหลังเป็นค่าประเมิน' : 'ชุดข้อมูลย้อนหลังเป็นค่าตรวจวัด'
  return `ระดับน้ำล่าสุด ${Number(latest).toFixed(2)} เมตร ${historyDescription} และคาดการณ์ใน 12 ชั่วโมง ${Number(prediction).toFixed(2)} เมตร`
})

function buildChart() {
  if (!chartCanvas.value || !hasChartData.value) return

  const filtered = getCurrentRange()
  const waterLabels = filtered.waterLevel.map(item => formatTime(item.timestamp))
  const waterValues = filtered.waterLevel.map(item => item.level)
  const rainfallValues = filtered.rainfall.map(item => item.amount)
  const predictionLabels = filtered.predictions.map(item => formatTime(item.timestamp))
  const predictionValues = filtered.predictions.map(item => item.predictedLevel)

  if (!waterValues.length) return
  if (chartInstance) chartInstance.destroy()

  const context = chartCanvas.value.getContext('2d')
  const waterGradient = context.createLinearGradient(0, 0, 0, 280)
  waterGradient.addColorStop(0, 'rgba(3, 105, 161, 0.22)')
  waterGradient.addColorStop(1, 'rgba(3, 105, 161, 0.01)')

  const allLabels = [...waterLabels, ...predictionLabels]
  const actualWithGap = [...waterValues, ...new Array(predictionLabels.length).fill(null)]
  const predictionWithGap = [...new Array(Math.max(0, waterLabels.length - 1)).fill(null), waterValues.at(-1), ...predictionValues]
  const rainWithGap = [...rainfallValues, ...new Array(predictionLabels.length).fill(null)]
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  chartInstance = new Chart(context, {
    type: 'line',
    data: {
      labels: allLabels,
      datasets: [
        {
          label: `${historyLegendLabel.value} (ม.)`, data: actualWithGap, borderColor: '#0369a1', backgroundColor: isEstimatedHistory.value ? 'transparent' : waterGradient,
          borderWidth: 2.5, borderDash: isEstimatedHistory.value ? [4, 4] : [], fill: !isEstimatedHistory.value, tension: .3, pointRadius: 0, pointHoverRadius: 5, spanGaps: false,
        },
        {
          label: 'แนวโน้ม 12 ชม. (ม.)', data: predictionWithGap, borderColor: '#b45309', backgroundColor: 'transparent',
          borderWidth: 2.5, borderDash: [7, 5], fill: false, tension: .3, pointRadius: 0, pointHoverRadius: 5, spanGaps: false,
        },
        {
          label: 'ปริมาณฝน (มม.)', data: rainWithGap, type: 'bar', backgroundColor: 'rgba(37, 99, 235, .18)',
          borderColor: 'rgba(37, 99, 235, .45)', borderWidth: 1, borderRadius: 3, yAxisID: 'y1', barPercentage: .8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: reduceMotion ? false : { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, .96)', titleColor: '#f8fafc', bodyColor: '#e2e8f0',
          borderColor: 'rgba(148, 163, 184, .3)', borderWidth: 1, cornerRadius: 10, padding: 12,
          titleFont: { family: 'Noto Sans Thai', weight: '600' }, bodyFont: { family: 'Noto Sans Thai' },
        },
      },
      scales: {
        x: {
          ticks: { color: '#64748b', font: { family: 'Noto Sans Thai', size: 11 }, maxTicksLimit: 10, maxRotation: 0 },
          grid: { display: false },
        },
        y: {
          position: 'left', title: { display: true, text: 'ระดับน้ำ (ม.)', color: '#64748b' },
          ticks: { color: '#64748b' }, grid: { color: 'rgba(148, 163, 184, .14)' }, suggestedMin: 0,
        },
        y1: {
          position: 'right', title: { display: true, text: 'ฝน (มม.)', color: '#64748b' },
          ticks: { color: '#64748b' }, grid: { display: false }, suggestedMin: 0,
        },
      },
    },
  })
}

watch([tsData, activeTab], () => nextTick(buildChart), { deep: true })

onMounted(() => nextTick(buildChart))
onUnmounted(() => chartInstance?.destroy())
</script>

<style scoped>
.chart-card-header { align-items: flex-start; gap: 1rem; }
.chart-actions { display: flex; align-items: center; gap: .5rem; }
.history-provenance { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .65rem; margin-top: .5rem; }
.history-badge { min-height: 24px; display: inline-flex; align-items: center; border: 1px solid var(--border-subtle); border-radius: 999px; padding: .15rem .55rem; color: var(--text-secondary); background: var(--bg-primary); font-size: .68rem; font-weight: 800; }
.history-badge.live { color: var(--color-safe); background: var(--color-safe-bg); border-color: color-mix(in srgb, var(--color-safe) 25%, transparent); }
.history-badge.estimated, .history-badge.stale { color: var(--color-warning); background: var(--color-warning-bg); border-color: color-mix(in srgb, var(--color-warning) 28%, transparent); }
.history-badge.error { color: var(--color-danger); background: var(--color-danger-bg); }
.history-source { color: var(--text-muted); font-size: .68rem; }
.icon-action { width: 44px; height: 44px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--bg-secondary); color: var(--text-secondary); display: grid; place-items: center; cursor: pointer; }
.icon-action:disabled { cursor: wait; opacity: .65; }
.chart-wrapper { position: relative; min-height: 320px; transition: opacity .2s; }
.chart-wrapper.refreshing { opacity: .72; }
.inline-refresh-status { position: absolute; top: .5rem; right: .5rem; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 20px; padding: .3rem .65rem; color: var(--text-secondary); font-size: .75rem; }
.chart-loading { display: grid; gap: 1rem; }
.skeleton-chart { height: 300px; border-radius: 12px; background: linear-gradient(90deg, var(--bg-primary), var(--bg-secondary), var(--bg-primary)); background-size: 200% 100%; animation: skeleton-shift 1.4s infinite; }
.chart-footnote { display: flex; flex-wrap: wrap; gap: .75rem 1.25rem; align-items: center; color: var(--text-muted); font-size: .75rem; margin-top: .75rem; }
.chart-footnote span { display: inline-flex; align-items: center; gap: .4rem; }
.legend-line { width: 24px; height: 3px; border-radius: 2px; background: #0369a1; }
.legend-line.estimated { background: repeating-linear-gradient(90deg, #0369a1 0 5px, transparent 5px 9px); }
.legend-line.forecast { background: repeating-linear-gradient(90deg, #b45309 0 6px, transparent 6px 10px); }
.legend-block.rain { width: 12px; height: 9px; display: inline-block; border-radius: 2px; background: rgba(37, 99, 235, .28); }
.forecast-table-details { margin-top: .75rem; color: var(--text-secondary); font-size: .8rem; }
.forecast-table-details summary { cursor: pointer; min-height: 44px; display: flex; align-items: center; color: var(--accent); font-weight: 700; }
.table-scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { padding: .55rem; border-bottom: 1px solid var(--border-subtle); text-align: left; white-space: nowrap; }
@media (max-width: 700px) { .chart-card-header { display: grid; } .chart-actions { justify-content: space-between; width: 100%; } .chart-wrapper { min-height: 280px; } }
@media (prefers-reduced-motion: reduce) { .chart-wrapper { transition: none; } }
</style>
