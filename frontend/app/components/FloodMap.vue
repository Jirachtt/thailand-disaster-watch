<template>
  <div class="glass-card" style="padding: 0; overflow: hidden; position: relative;">
    <!-- Map Search Bar -->
    <div class="map-search-bar">
      <span class="material-symbols-rounded" style="font-size: 18px; color: var(--text-muted)">search</span>
      <input 
        v-model="searchQuery" 
        type="text" 
        class="map-search-input" 
        placeholder="ค้นหาจังหวัด / ประเทศ / สถานที่..." 
        @keydown.enter="searchLocation"
      />
      <button v-if="searchQuery" class="map-search-clear" @click="searchQuery = ''; searchResults = []">
        <span class="material-symbols-rounded" style="font-size: 16px">×</span>
      </button>
    </div>
    <!-- Search Results Dropdown -->
    <div v-if="searchResults.length" class="map-search-results">
      <div 
        v-for="(result, idx) in searchResults" 
        :key="idx" 
        class="map-search-result-item"
        @click="flyToResult(result)"
      >
        <span class="material-symbols-rounded" style="font-size: 16px; color: var(--accent)">place</span>
        <span>{{ result.display_name }}</span>
      </div>
    </div>
    <div class="map-container">
      <ClientOnly>
        <LMap
          ref="map"
          :zoom="6"
          :center="[13.5, 100.5]"
          :use-global-leaflet="false"
          :options="mapOptions"
        >
          <LTileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
            :options="{ maxZoom: 18 }"
          />

          <!-- Station Markers (toggleable) -->
          <template v-if="showWater">
            <LMarker
              v-for="station in stations"
              :key="station.id"
              :lat-lng="[station.lat, station.lng]"
              @click="$emit('selectStation', station.id)"
            >
              <LIcon
                :icon-size="[32, 32]"
                :icon-anchor="[16, 16]"
                :popup-anchor="[0, -18]"
                class-name="station-icon-transparent"
              >
                <div class="station-pin" :class="station.riskLevel">
                  <span class="material-symbols-rounded station-pin-icon">
                    {{ station.type === 'upstream' ? 'terrain' : station.type === 'midstream' ? 'location_city' : 'water' }}
                  </span>
                </div>
              </LIcon>
              <LPopup :options="{ closeButton: true, className: 'dark-popup' }">
                <div class="popup-content">
                  <div class="popup-name">{{ station.name }}</div>
                  <div class="popup-type">{{ station.typeLabel }} • {{ station.nameEn }}</div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">ระดับน้ำ</span>
                    <span class="popup-stat-value" :style="{ color: getLevelColor(station) }">
                      {{ station.currentLevel.toFixed(2) }} m
                    </span>
                  </div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">แนวโน้ม</span>
                    <span class="popup-stat-value">
                      {{ station.trend > 0 ? '↑' : station.trend < 0 ? '↓' : '→' }}
                      {{ Math.abs(station.trend).toFixed(2) }} m
                    </span>
                  </div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">ระดับความเสี่ยง</span>
                    <span class="popup-stat-value" :style="{ color: getLevelColor(station) }">
                      {{ station.riskLevel === 'danger' ? 'วิกฤต' : station.riskLevel === 'warning' ? 'เฝ้าระวัง' : 'ปกติ' }}
                    </span>
                  </div>
                </div>
              </LPopup>
            </LMarker>
          </template>

          <!-- Fire Spread Prediction (Rings) -->
          <template v-if="showPredictions">
            <template v-for="fire in displayedFires" :key="'pred-' + fire.id">
              <LCircle
                v-for="(ring, ri) in getFireSpreadRings(fire.id)"
                :key="'ring-' + fire.id + '-' + ri"
                :lat-lng="[fire.lat, fire.lng]"
                :radius="ring.radiusMeters"
                :options="ring.options"
              >
                <LPopup :options="{ className: 'dark-popup' }">
                  <div class="popup-content">
                    <div class="popup-name" style="color: #f97316">คาดการณ์ลุกลามไฟ</div>
                    <div class="popup-type">{{ fire.name }}</div>
                    <div class="popup-stat">
                      <span class="popup-stat-label">ระยะเวลา</span>
                      <span class="popup-stat-value" style="color: #f97316">+{{ ring.hours }} ชม.</span>
                    </div>
                    <div class="popup-stat">
                      <span class="popup-stat-label">รัศมีคาดการณ์</span>
                      <span class="popup-stat-value">{{ (ring.radiusMeters / 1000).toFixed(2) }} km</span>
                    </div>
                  </div>
                </LPopup>
              </LCircle>
            </template>
          </template>

          <!-- Fire Spread Timeline Path (dotted lines showing spread over time) -->
          <template v-if="showPredictions">
            <template v-for="pred in spreadPredictions" :key="'spread-' + pred.fireId">
              <!-- Timeline path segments: fire center → 1h → 3h → 6h → 12h -->
              <template v-if="pred.timelinePath && pred.timelinePath.length">
                <LPolyline
                  v-for="(seg, si) in getFireTimelineSegments(pred)"
                  :key="'fire-path-' + pred.fireId + '-' + si"
                  :lat-lngs="seg.latlngs"
                  :options="seg.options"
                />
                <!-- Time + distance badges at each timeline point -->
                <LMarker
                  v-for="(point, pi) in pred.timelinePath"
                  :key="'fire-tp-' + pred.fireId + '-' + pi"
                  :lat-lng="[point.lat, point.lng]"
                >
                  <LIcon :icon-size="[56, 24]" :icon-anchor="[28, 12]" class-name="station-icon-transparent">
                    <div class="fire-timeline-badge" :class="'hour-' + point.hours">
                      +{{ point.hours }}ชม. · {{ point.distanceKm }}km
                    </div>
                  </LIcon>
                  <LPopup :options="{ className: 'dark-popup' }">
                    <div class="popup-content">
                      <div class="popup-name" style="color: #ff4500">🔥 คาดการณ์ลุกลาม +{{ point.hours }} ชม.</div>
                      <div class="popup-stat">
                        <span class="popup-stat-label">ทิศทาง</span>
                        <span class="popup-stat-value" style="color: #ff4500">{{ pred.windDirection }} ({{ pred.windDeg }}°)</span>
                      </div>
                      <div class="popup-stat">
                        <span class="popup-stat-label">ระยะจากจุดไฟ</span>
                        <span class="popup-stat-value">{{ point.distanceKm }} km</span>
                      </div>
                      <div class="popup-stat">
                        <span class="popup-stat-label">พื้นที่คาดการณ์</span>
                        <span class="popup-stat-value" style="color: #dc2626">{{ point.estimatedAreaSqKm }} ตร.กม.</span>
                      </div>
                      <div class="popup-stat">
                        <span class="popup-stat-label">ลม</span>
                        <span class="popup-stat-value">{{ pred.windSpeed?.toFixed(1) }} m/s</span>
                      </div>
                    </div>
                  </LPopup>
                </LMarker>
              </template>
              <!-- Spread probability cells (8-direction grid) -->
              <LCircle
                v-for="(cell, ci) in (pred.spreadCells || []).filter(c => c.probability >= 0.3)"
                :key="'cell-' + pred.fireId + '-' + ci"
                :lat-lng="[cell.lat, cell.lng]"
                :radius="cell.distanceKm * 300"
                :options="{ color: getSpreadCellColor(cell.probability), fillColor: getSpreadCellColor(cell.probability), fillOpacity: cell.probability * 0.4, weight: 1, opacity: 0.6 }"
              >
                <LPopup :options="{ className: 'dark-popup' }">
                  <div class="popup-content">
                    <div class="popup-name" style="color: #ff4500">ทิศ {{ cell.direction }}</div>
                    <div class="popup-stat">
                      <span class="popup-stat-label">โอกาสลุกลาม</span>
                      <span class="popup-stat-value" style="color: #f97316">{{ (cell.probability * 100).toFixed(0) }}%</span>
                    </div>
                    <div class="popup-stat">
                      <span class="popup-stat-label">ระยะทาง</span>
                      <span class="popup-stat-value">{{ cell.distanceKm }} km</span>
                    </div>
                  </div>
                </LPopup>
              </LCircle>
            </template>
          </template>

          <!-- Fire Hotspot Markers (limited by default) -->
          <template v-if="showFires">
            <LMarker
              v-for="fire in displayedFires"
              :key="'fire-' + fire.id"
              :lat-lng="[fire.lat, fire.lng]"
              @click="$emit('selectFire', fire.id)"
            >
              <LIcon
                :icon-size="[32, 32]"
                :icon-anchor="[16, 16]"
                :popup-anchor="[0, -18]"
                class-name="station-icon-transparent"
              >
                <div class="fire-marker" :class="fire.intensity">
                  <span class="fire-marker-icon">🔥</span>
                </div>
              </LIcon>
              <LPopup :options="{ closeButton: true, className: 'dark-popup' }">
                <div class="popup-content">
                  <div class="popup-name" style="color: #f97316;">{{ fire.name }}</div>
                  <div class="popup-type">{{ fire.nameEn || '' }} • {{ fire.satellite || '' }}</div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">ระดับความรุนแรง</span>
                    <span class="popup-stat-value" :style="{ color: getFireColor(fire.intensity) }">
                      {{ getIntensityLabel(fire.intensity) }}
                    </span>
                  </div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">พื้นที่ไหม้</span>
                    <span class="popup-stat-value" style="color: #f97316">{{ fire.areaSqKm }} ตร.กม.</span>
                  </div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">FRP</span>
                    <span class="popup-stat-value">{{ fire.frp || 'N/A' }} MW</span>
                  </div>
                  <div v-if="fire.peakEstimate" class="popup-stat">
                    <span class="popup-stat-label">คาดการณ์ 12 ชม.</span>
                    <span class="popup-stat-value" style="color: #dc2626">{{ fire.peakEstimate.areaSqKm }} ตร.กม.</span>
                  </div>
                </div>
              </LPopup>
            </LMarker>
          </template>

          <!-- Evacuation Route -->
          <template v-if="showEvacuation">
            <LMarker :lat-lng="evacuationTarget">
              <LIcon :icon-size="[36, 36]" :icon-anchor="[18, 18]">
                <div class="custom-marker safe">
                  <span class="custom-marker-icon">🏥</span>
                  <div class="report-pulse safe" style="animation-duration: 2s; opacity: 0.6"></div>
                </div>
              </LIcon>
              <LPopup :options="{ closeButton: false }">
                <div class="popup-content">
                  <div class="popup-name" style="color: var(--color-safe)">ศูนย์พักพิงปลอดภัย</div>
                  <div class="popup-stat">ศูนย์ประชุมและแสดงสินค้านานาชาติฯ</div>
                </div>
              </LPopup>
            </LMarker>

            <LPolyline
              :lat-lngs="evacuationRoute"
              :color="'#10b981'"
              :weight="4"
              :dashArray="'10, 10'"
            />
          </template>

          <!-- Community Report Markers -->
          <template v-if="showReports">
            <LMarker
              v-for="report in reports"
              :key="report.id"
              :lat-lng="[report.lat, report.lng]"
            >
              <LIcon
                :icon-size="[32, 32]"
                :icon-anchor="[16, 16]"
                :popup-anchor="[0, -16]"
              >
                <div class="custom-marker" :class="report.type === 'fire' ? 'danger' : 'warning'">
                  <span class="custom-marker-icon">
                    {{ report.type === 'fire' ? '🔥' : '💧' }}
                  </span>
                  <div class="report-pulse"></div>
                </div>
              </LIcon>
              <LPopup :options="{ closeButton: true, className: 'dark-popup' }">
                <div class="popup-content">
                  <div class="popup-name">รายงานจากชุมชน</div>
                  <div class="popup-type">
                    {{ report.type === 'fire' ? 'ไฟป่า' : 'น้ำท่วม' }} • 
                    {{ new Date(report.createdAt).toLocaleTimeString('th-TH') }}
                  </div>
                  <div class="popup-stat" style="margin-top: 8px">
                    <p style="white-space: pre-wrap; font-size: 0.85rem; margin: 0; color: var(--text-primary)">
                      {{ report.description }}
                    </p>
                  </div>
                  <div class="popup-stat" style="margin-top: 8px">
                    <span class="popup-stat-label">สถานะ</span>
                    <span class="popup-stat-value" style="color: var(--color-warning)">รอตรวจสอบ</span>
                  </div>
                </div>
              </LPopup>
            </LMarker>
          </template>

          <!-- Rain Overlay -->
          <template v-if="showRain">
            <LCircle
              v-for="(rain, idx) in rainStations"
              :key="'rain-' + idx"
              :lat-lng="[rain.lat, rain.lng]"
              :radius="getRainRadius(rain.intensity)"
              :options="getRainCircleOptions(rain.intensity)"
            />
            <LMarker
              v-for="(rain, idx) in rainStations"
              :key="'rain-icon-' + idx"
              :lat-lng="[rain.lat, rain.lng]"
            >
              <LIcon
                :icon-size="[28, 28]"
                :icon-anchor="[14, 14]"
                class-name="rain-icon-transparent"
              >
                <div class="rain-emoji">🌧️</div>
              </LIcon>
              <LPopup :options="{ closeButton: true, className: 'dark-popup' }">
                <div class="popup-content">
                  <div class="popup-name" style="color: #3b82f6">🌧️ {{ rain.name }}</div>
                  <div class="popup-type">{{ rain.amphoe }} {{ rain.province }}</div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">ฝนสะสม 24 ชม.</span>
                    <span class="popup-stat-value" :style="{ color: getRainColor(rain.intensity) }">
                      {{ rain.rain24h }} mm
                    </span>
                  </div>
                  <div class="popup-stat" v-if="rain.rainToday > 0">
                    <span class="popup-stat-label">ฝนวันนี้</span>
                    <span class="popup-stat-value" style="color: #60a5fa">
                      {{ rain.rainToday }} mm
                    </span>
                  </div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">ระดับ</span>
                    <span class="popup-stat-value" :style="{ color: getRainColor(rain.intensity) }">
                      {{ getRainIntensityLabel(rain.intensity) }}
                    </span>
                  </div>
                  <div class="popup-stat" v-if="rain.rainDirection">
                    <span class="popup-stat-label">ทิศทางฝน</span>
                    <span class="popup-stat-value" style="color: #2563eb">
                      → {{ rain.rainDirection }} ({{ rain.windSpeed?.toFixed(1) }} m/s)
                    </span>
                  </div>
                </div>
              </LPopup>
            </LMarker>
          </template>

          <!-- Rain Direction Prediction (dotted timeline paths) -->
          <template v-if="showRainDirection">
            <template v-for="(rain, idx) in rainStations" :key="'rain-dir-' + idx">
              <template v-if="rain.predictedPath && rain.predictedPath.length">
                <!-- Path line segments with dotted lines -->
                <LPolyline
                  v-for="(seg, si) in getRainPathSegments(rain)"
                  :key="'rain-seg-' + idx + '-' + si"
                  :lat-lngs="seg.latlngs"
                  :options="seg.options"
                />

                <!-- Time + distance markers at each predicted position -->
                <LMarker
                  v-for="(point, pi) in rain.predictedPath"
                  :key="'rain-pt-' + idx + '-' + pi"
                  :lat-lng="[point.lat, point.lng]"
                >
                  <LIcon
                    :icon-size="[56, 24]"
                    :icon-anchor="[28, 12]"
                    class-name="rain-icon-transparent"
                  >
                    <div class="rain-time-badge" :class="'hour-' + (point.hours || pi + 1)">
                      +{{ point.hours || pi + 1 }}ชม. · {{ point.distanceKm ? point.distanceKm + 'km' : '' }}
                    </div>
                  </LIcon>
                  <LPopup :options="{ closeButton: true, className: 'dark-popup' }">
                    <div class="popup-content">
                      <div class="popup-name" style="color: #2563eb">🌧️ พยากรณ์ {{ rain.name }}</div>
                      <div class="popup-type">ทิศทาง {{ rain.rainDirection }} • ลม {{ rain.windSpeed?.toFixed(1) }} m/s</div>
                      <div class="popup-stat">
                        <span class="popup-stat-label">คาดว่าฝนจะเคลื่อนมาถึง</span>
                        <span class="popup-stat-value" style="color: #2563eb">
                          อีก {{ point.hours || pi + 1 }} ชั่วโมง
                        </span>
                      </div>
                      <div class="popup-stat">
                        <span class="popup-stat-label">ระยะจากจุดฝน</span>
                        <span class="popup-stat-value">{{ point.distanceKm || '-' }} km</span>
                      </div>
                      <div class="popup-stat">
                        <span class="popup-stat-label">ปริมาณฝนสะสม</span>
                        <span class="popup-stat-value" :style="{ color: getRainColor(rain.intensity) }">
                          {{ rain.rain24h }} mm ({{ getRainIntensityLabel(rain.intensity) }})
                        </span>
                      </div>
                    </div>
                  </LPopup>
                </LMarker>
              </template>
            </template>
          </template>

          <!-- AQI Markers -->
          <template v-if="showAqi">
            <LCircle
              v-for="(aqi, idx) in aqiStations"
              :key="'aqi-' + idx"
              :lat-lng="[aqi.lat, aqi.lng]"
              :radius="20000"
              :options="{ color: aqi.color, fillColor: aqi.color, fillOpacity: 0.2, weight: 2, opacity: 0.5 }"
            />
            <LMarker
              v-for="(aqi, idx) in aqiStations"
              :key="'aqi-label-' + idx"
              :lat-lng="[aqi.lat, aqi.lng]"
            >
              <LIcon :icon-size="[36, 20]" :icon-anchor="[18, 10]" class-name="station-icon-transparent">
                <div class="aqi-badge" :style="{ background: aqi.color }">{{ aqi.aqi }}</div>
              </LIcon>
              <LPopup :options="{ closeButton: true, className: 'dark-popup' }">
                <div class="popup-content">
                  <div class="popup-name" :style="{ color: aqi.color }">{{ aqi.name }}</div>
                  <div class="popup-type">{{ aqi.nameEn }} • AQI</div>
                  <div class="popup-stat">
                    <span class="popup-stat-label">AQI</span>
                    <span class="popup-stat-value" :style="{ color: aqi.color }">{{ aqi.aqi }} ({{ aqi.label }})</span>
                  </div>
                  <div class="popup-stat" v-if="aqi.pm25">
                    <span class="popup-stat-label">PM2.5</span>
                    <span class="popup-stat-value">{{ aqi.pm25 }} µg/m³</span>
                  </div>
                  <div class="popup-stat" v-if="aqi.temp">
                    <span class="popup-stat-label">อุณหภูมิ</span>
                    <span class="popup-stat-value">{{ aqi.temp }}°C</span>
                  </div>
                </div>
              </LPopup>
            </LMarker>
          </template>
        </LMap>
      </ClientOnly>

      <!-- Map Controls (top-right) -->
      <div class="map-controls">
        <button
          class="map-control-btn evac-btn"
          :class="{ active: showEvacuation }"
          @click="toggleEvacuation"
          title="ค้นหาเส้นทางอพยพ"
        >
          <span class="material-symbols-rounded">route</span>
          <span class="control-label">อพยพ</span>
        </button>
        <button
          class="map-control-btn report-btn"
          @click="$emit('add-report')"
          title="แจ้งเหตุภัยพิบัติ"
        >
          <span class="material-symbols-rounded">add_alert</span>
          <span class="control-label">แจ้งเหตุ</span>
        </button>
        <button
          class="map-control-btn"
          :class="{ active: showFires, 'show-all': showAllFires }"
          @click="toggleFires"
          :title="showAllFires ? 'แสดงเฉพาะ 20 อันดับ' : showFires ? 'แสดงจุดไฟทั้งหมด' : 'แสดงจุดไฟ'"
        >
          <span class="material-symbols-rounded">local_fire_department</span>
          <span class="control-label">{{ fireButtonLabel }}</span>
        </button>
        <button
          class="map-control-btn"
          :class="{ active: showPredictions }"
          @click="showPredictions = !showPredictions"
          title="แสดงทิศทางลามไฟ (CA + Wind)"
        >
          <span class="material-symbols-rounded">air</span>
          <span class="control-label">ทิศลามไฟ</span>
        </button>
        <button
          class="map-control-btn aqi-btn"
          :class="{ active: showAqi }"
          @click="showAqi = !showAqi"
          title="แสดง/ซ่อนคุณภาพอากาศ"
        >
          <span class="material-symbols-rounded">masks</span>
          <span class="control-label">AQI {{ aqiStations.length }}</span>
        </button>
        <button
          class="map-control-btn"
          :class="{ active: showWater }"
          @click="showWater = !showWater"
          title="แสดง/ซ่อนสถานีน้ำ"
        >
          <span class="material-symbols-rounded">water_drop</span>
          <span class="control-label">น้ำ {{ stations.length }}</span>
        </button>
        <button
          class="map-control-btn rain-btn"
          :class="{ active: showRain }"
          @click="showRain = !showRain"
          title="แสดง/ซ่อนพื้นที่ฝนตก"
        >
          <span class="material-symbols-rounded">rainy</span>
          <span class="control-label">ฝน {{ rainStations.length }}</span>
        </button>
        <button
          class="map-control-btn rain-dir-btn"
          :class="{ active: showRainDirection }"
          @click="showRainDirection = !showRainDirection"
          title="พยากรณ์ทิศทางฝน 1-3 ชม."
        >
          <span class="material-symbols-rounded">storm</span>
          <span class="control-label">พยากรณ์ฝน</span>
        </button>
      </div>

      <!-- Map Legend Overlay -->
      <div class="map-overlay">
        <div class="map-overlay-title">สัญลักษณ์</div>
        <div class="legend-item">
          <div class="legend-dot" style="background: #22c55e"></div>
          <span>ปกติ (Safe)</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background: #f59e0b"></div>
          <span>เฝ้าระวัง (Warning)</span>
        </div>
        <div class="legend-item">
          <div class="legend-dot" style="background: #ef4444"></div>
          <span>วิกฤต (Critical)</span>
        </div>
        <div class="legend-divider"></div>
        <div class="legend-item">
          <span style="font-size: 12px; flex-shrink: 0;">🔥</span>
          <span>จุดไฟไหม้</span>
        </div>
        <div class="legend-item">
          <div class="legend-ring"></div>
          <span>รัศมีลุกลาม (คาดการณ์)</span>
        </div>
        <div class="legend-divider" v-if="reports.length > 0"></div>
        <div class="legend-item" v-if="reports.length > 0">
          <span style="font-size: 12px; flex-shrink: 0;">📢</span>
          <span>แจ้งเหตุจากชุมชน</span>
        </div>
        <div class="legend-divider"></div>
        <div class="legend-item">
          <span style="font-size: 12px; flex-shrink: 0;">🌧️</span>
          <span>ฝนตก (Real-time)</span>
        </div>
        <div class="legend-item" v-if="showRainDirection">
          <span style="font-size: 10px; flex-shrink: 0; color: #3b82f6;">➜ ┈</span>
          <span>พยากรณ์ทิศทางฝน (1-3 ชม.)</span>
        </div>
      </div>

      <!-- Animated flow indicator -->
      <div class="flow-direction-label" v-if="hasFloodRisk && showWater">
        <span class="material-symbols-rounded" style="font-size: 16px; color: var(--color-warning)">waves</span>
        <span style="font-size: 0.72rem; color: var(--color-warning); font-weight: 600;">
          สถานีเฝ้าระวัง {{ warningCount }} แห่ง
        </span>
      </div>

      <!-- Fire count indicator -->
      <div class="fire-alert-label" v-if="fires.length > 0 && showFires">
        <span class="material-symbols-rounded" style="font-size: 16px; color: #f97316">local_fire_department</span>
        <span style="font-size: 0.72rem; color: #f97316; font-weight: 600;">
          แสดง {{ displayedFires.length }}/{{ showAllFires ? worldFires.length : fires.length }} จุด
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  stations: { type: Array, default: () => [] },
  fires: { type: Array, default: () => [] },
  reports: { type: Array, default: () => [] },
  rainStations: { type: Array, default: () => [] },
  spreadPredictions: { type: Array, default: () => [] },
  aqiStations: { type: Array, default: () => [] },
  worldFires: { type: Array, default: () => [] },
  selectedFireId: { type: String, default: null },
  focusFire: { type: Object, default: null },
  focusStation: { type: Object, default: null },
})

defineEmits(['selectStation', 'selectFire', 'add-report'])

const map = ref(null)
const searchQuery = ref('')
const searchResults = ref([])

async function searchLocation() {
  if (!searchQuery.value.trim()) return
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery.value)}&limit=5&accept-language=th`
    const results = await $fetch(url, { timeout: 5000 })
    searchResults.value = results || []
  } catch (e) {
    searchResults.value = []
  }
}

function flyToResult(result) {
  searchResults.value = []
  searchQuery.value = result.display_name.split(',')[0]
  if (map.value) {
    const leafletMap = map.value.leafletObject
    if (leafletMap) {
      const zoom = result.type === 'country' ? 6 : result.type === 'administrative' ? 9 : 12
      leafletMap.flyTo([parseFloat(result.lat), parseFloat(result.lon)], zoom, { duration: 1 })
    }
  }
}

const mapOptions = {
  zoomControl: true,
  scrollWheelZoom: true,
  attributionControl: false,
}

// Watch for focusFire changes and pan map
watch(() => props.focusFire, (newVal) => {
  if (newVal && map.value) {
    const leafletMap = map.value.leafletObject
    if (leafletMap) {
      leafletMap.flyTo([newVal.lat, newVal.lng], 10, {
        duration: 0.8,
      })
    }
  }
})

// Watch for focusStation changes and pan map
watch(() => props.focusStation, (newVal) => {
  if (newVal && map.value) {
    const leafletMap = map.value.leafletObject
    if (leafletMap) {
      leafletMap.flyTo([newVal.lat, newVal.lng], 10, {
        duration: 0.8,
      })
      // Ensure the water station layer is visible
      if (!showWater.value) {
        showWater.value = true
      }
    }
  }
})

// === Layer toggles ===
const showFires = ref(true)
const showAllFires = ref(true)
const showPredictions = ref(true)
const showWater = ref(false)
const showReports = ref(true)
const showEvacuation = ref(false)
const showRain = ref(true)
const showRainDirection = ref(true)
const showAqi = ref(true)

const userLocation = ref([18.7883, 98.9853]) // Default to Tha Phae Gate
const evacuationTarget = ref([18.8266, 98.9602]) // Chiang Mai International Exhibition and Convention Centre
const evacuationRoute = ref([])

function toggleEvacuation() {
  showEvacuation.value = !showEvacuation.value
  if (showEvacuation.value) {
    calculateEvacuationRoute()
  }
}

function calculateEvacuationRoute() {
  // Try to get user's real location if possible
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLocation.value = [pos.coords.latitude, pos.coords.longitude]
        drawRoute()
      },
      () => drawRoute() // fallback
    )
  } else {
    drawRoute()
  }
}

function drawRoute() {
  // Simple straight line with a curve to simulate a path
  // In a real app, integrate Leaflet Routing Machine or OSRM
  const start = userLocation.value
  const end = evacuationTarget.value
  const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 + 0.01] // add curve
  
  evacuationRoute.value = [start, mid, end]
  
  if (map.value && map.value.leafletObject) {
    map.value.leafletObject.flyToBounds(evacuationRoute.value, { padding: [50, 50], duration: 1.5 })
  }
}

function toggleFires() {
  if (showFires.value && showAllFires.value) {
    // Thai+World → OFF
    showFires.value = false
    showAllFires.value = false
    showPredictions.value = false
  } else if (!showFires.value) {
    // OFF → Thai only
    showFires.value = true
    showAllFires.value = false
    showPredictions.value = true
  } else {
    // Thai only → Thai+World
    showAllFires.value = true
    showPredictions.value = true
  }
}

const fireButtonLabel = computed(() => {
  if (!showFires.value) return 'ไฟ ปิด'
  if (showAllFires.value) return `ไฟ ทั่วโลก`
  return `ไฟ (ไทย)`
})

// === Computed data ===
const displayedFires = computed(() => {
  if (!showFires.value) return []
  if (showAllFires.value) {
    // Merge Thai and World fires
    const thaiIds = new Set(props.fires.map((f) => f.id))
    const merged = [...props.fires, ...props.worldFires.filter((f) => !thaiIds.has(f.id))]
    return merged
  }
  // Default: Only Thai fires
  return props.fires
})

const hasFloodRisk = computed(() => {
  return props.stations.some((s) => s.riskLevel === 'warning' || s.riskLevel === 'danger')
})

const warningCount = computed(() => {
  return props.stations.filter((s) => s.riskLevel === 'warning' || s.riskLevel === 'danger').length
})

function getFireSpreadRings(fireId) {
  const fire = props.fires.find((f) => f.id === fireId) || props.worldFires.find((f) => f.id === fireId)
  if (!fire || !fire.predictions) return []

  const ringHours = [1, 3, 6, 12]
  const rings = []

  for (const h of ringHours) {
    const pred = fire.predictions.find((p) => p.hoursFromNow === h)
    if (!pred) continue

    const radiusMeters = pred.estimatedRadiusKm * 1000
    const opacity = 0.35 - (h / 12) * 0.2

    const color = h <= 1 ? '#dc2626' : h <= 3 ? '#f97316' : h <= 6 ? '#f59e0b' : '#eab308'

    rings.push({
      hours: h,
      radiusMeters,
      options: {
        color: color,
        fillColor: color,
        fillOpacity: opacity,
        weight: h === 1 ? 2 : 1,
        dashArray: h > 1 ? '6, 4' : '',
        opacity: 0.7 - (h / 12) * 0.3,
      },
    })
  }

  return rings.reverse()
}

function getSpreadCellColor(probability) {
  if (probability >= 0.8) return '#dc2626'
  if (probability >= 0.5) return '#f97316'
  if (probability >= 0.3) return '#f59e0b'
  return '#eab308'
}

// === Fire timeline path segments (dotted lines) ===
function getFireTimelineSegments(pred) {
  if (!pred.timelinePath || !pred.timelinePath.length) return []

  const segments = []
  const points = [
    [pred.center.lat, pred.center.lng],
    ...pred.timelinePath.map(p => [p.lat, p.lng])
  ]

  const colors = ['#dc2626', '#f97316', '#f59e0b', '#eab308']
  const weights = [4, 3, 3, 2]
  const opacities = [0.9, 0.8, 0.6, 0.4]

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      latlngs: [points[i], points[i + 1]],
      options: {
        color: colors[i] || '#eab308',
        weight: weights[i] || 2,
        opacity: opacities[i] || 0.4,
        dashArray: '10, 8',
      }
    })
  }

  return segments
}



function getLevelColor(station) {
  if (station.riskLevel === 'danger') return 'var(--color-danger)'
  if (station.riskLevel === 'warning') return 'var(--color-warning)'
  return 'var(--color-safe)'
}

function getFireColor(intensity) {
  switch (intensity) {
    case 'extreme': return '#dc2626'
    case 'high': return '#f97316'
    case 'medium': return '#f59e0b'
    default: return '#22c55e'
  }
}

function getIntensityLabel(intensity) {
  switch (intensity) {
    case 'extreme': return 'รุนแรงมาก'
    case 'high': return 'รุนแรง'
    case 'medium': return 'ปานกลาง'
    default: return 'เบา'
  }
}

// === Rain direction prediction helper ===
function getRainPathSegments(rain) {
  if (!rain.predictedPath || !rain.predictedPath.length) return []

  const segments = []
  const points = [
    [rain.lat, rain.lng],
    ...rain.predictedPath.map(p => [p.lat, p.lng])
  ]

  const colors = ['#3b82f6', '#2563eb', '#1d4ed8', '#1e3a8a']
  const weights = [4, 3, 3, 2]
  const opacities = [0.9, 0.7, 0.5, 0.35]

  for (let i = 0; i < points.length - 1; i++) {
    segments.push({
      latlngs: [points[i], points[i + 1]],
      options: {
        color: colors[i] || '#1e3a8a',
        weight: weights[i] || 2,
        opacity: opacities[i] || 0.35,
        dashArray: '10, 8',
      }
    })
  }

  return segments
}

// === Rain helper functions ===
function getRainRadius(intensity) {
  switch (intensity) {
    case 'extreme': return 30000
    case 'heavy': return 25000
    case 'moderate': return 18000
    default: return 12000
  }
}

function getRainCircleOptions(intensity) {
  const color = getRainColor(intensity)
  return {
    color: color,
    fillColor: color,
    fillOpacity: intensity === 'extreme' ? 0.35 : intensity === 'heavy' ? 0.28 : 0.2,
    weight: 2,
    opacity: 0.6,
  }
}

function getRainColor(intensity) {
  switch (intensity) {
    case 'extreme': return '#1d4ed8'
    case 'heavy': return '#2563eb'
    case 'moderate': return '#3b82f6'
    default: return '#60a5fa'
  }
}

function getRainIntensityLabel(intensity) {
  switch (intensity) {
    case 'extreme': return 'ฝนหนักมาก (>90mm)'
    case 'heavy': return 'ฝนหนัก (35-90mm)'
    case 'moderate': return 'ฝนปานกลาง (10-35mm)'
    default: return 'ฝนเล็กน้อย (<10mm)'
  }
}
</script>

<style scoped>
/* Station pin markers */
.station-pin {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  border: 2.5px solid rgba(21, 128, 61, 0.5);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s, box-shadow 0.2s;
}

.station-pin:hover {
  transform: scale(1.15);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.station-pin.safe {
  border-color: rgba(34, 197, 94, 0.7);
}

.station-pin.warning {
  border-color: rgba(245, 158, 11, 0.8);
  animation: pin-glow-warning 2s ease-in-out infinite;
}

.station-pin.danger {
  border-color: rgba(239, 68, 68, 0.9);
  animation: pin-glow-danger 1.5s ease-in-out infinite;
}

.station-pin-icon {
  font-size: 16px;
  color: #334155;
}

.station-pin.safe .station-pin-icon { color: #15803d; }
.station-pin.warning .station-pin-icon { color: #d97706; }
.station-pin.danger .station-pin-icon { color: #dc2626; }

@keyframes pin-glow-warning {
  0%, 100% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.3); }
  50% { box-shadow: 0 0 12px rgba(245, 158, 11, 0.6); }
}

@keyframes pin-glow-danger {
  0%, 100% { box-shadow: 0 0 4px rgba(239, 68, 68, 0.4); }
  50% { box-shadow: 0 0 16px rgba(239, 68, 68, 0.7); }
}

/* Remove Leaflet default icon border/background */
:deep(.station-icon-transparent),
:deep(.rain-icon-transparent) {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.rain-emoji {
  font-size: 18px;
  text-align: center;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  pointer-events: none;
}

/* Rain direction prediction time badges */
.rain-time-badge {
  font-size: 10px;
  font-weight: 700;
  color: #ffffff;
  background: #3b82f6;
  border-radius: 10px;
  padding: 2px 8px;
  text-align: center;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(37, 99, 235, 0.5);
  border: 1.5px solid rgba(255, 255, 255, 0.6);
  font-family: 'Inter', sans-serif;
}

.rain-time-badge.hour-1 {
  background: #3b82f6;
}

.rain-time-badge.hour-2 {
  background: #2563eb;
}

.rain-time-badge.hour-3 {
  background: #1e40af;
}

.rain-time-badge.hour-6 {
  background: #1e3a8a;
}

/* Fire timeline badges */
.fire-timeline-badge {
  font-size: 9px;
  font-weight: 700;
  color: #ffffff;
  background: #dc2626;
  border-radius: 10px;
  padding: 2px 6px;
  text-align: center;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(220, 38, 38, 0.5);
  border: 1.5px solid rgba(255, 255, 255, 0.6);
}

.fire-timeline-badge.hour-1 {
  background: #dc2626;
}

.fire-timeline-badge.hour-3 {
  background: #f97316;
}

.fire-timeline-badge.hour-6 {
  background: #f59e0b;
  color: #1a1a1a;
}

.fire-timeline-badge.hour-12 {
  background: #eab308;
  color: #1a1a1a;
}

.custom-marker-pulse.safe {
  background: rgba(34, 197, 94, 0.2);
  border: 2px solid rgba(34, 197, 94, 0.5);
}

.custom-marker-pulse.warning {
  background: rgba(245, 158, 11, 0.2);
  border: 2px solid rgba(245, 158, 11, 0.5);
  animation: marker-pulse 2s ease-in-out infinite;
}

.custom-marker-pulse.danger {
  background: rgba(239, 68, 68, 0.25);
  border: 2px solid rgba(239, 68, 68, 0.6);
  animation: marker-pulse-danger 1.5s ease-in-out infinite;
}

@keyframes marker-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.3); opacity: 0.7; }
}

@keyframes marker-pulse-danger {
  0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
  50% { transform: translate(-50%, -50%) scale(1.5); opacity: 0.5; }
}

/* Fire Markers — compact, no pulse animation for performance */
.fire-marker {
  position: relative;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.fire-marker-icon {
  position: relative;
  z-index: 2;
  font-size: 20px;
  filter: drop-shadow(0 1px 3px rgba(249, 115, 22, 0.5));
}

/* Map Controls */
.map-controls {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.map-control-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid rgba(100, 116, 139, 0.25);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.95);
  color: #334155;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  font-family: inherit;
  transition: all 0.2s;
  white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.map-control-btn .material-symbols-rounded {
  font-size: 16px;
}

.map-control-btn:hover {
  background: #f1f5f9;
  border-color: rgba(29, 78, 216, 0.3);
  color: #1d4ed8;
}

.map-control-btn.active {
  background: #1d4ed8;
  border-color: #1d4ed8;
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(29, 78, 216, 0.3);
}

.map-control-btn.active .material-symbols-rounded {
  color: #ffffff;
}

.map-control-btn.active.show-all {
  background: #ea580c;
  border-color: #ea580c;
  color: #ffffff;
}

.map-control-btn.active.show-all .material-symbols-rounded {
  color: #ffffff;
}

.map-control-btn.rain-dir-btn.active {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  border-color: #4f46e5;
  color: #ffffff;
  box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4);
}

.map-control-btn.rain-dir-btn.active .material-symbols-rounded {
  color: #ffffff;
}

.control-label {
  font-size: 0.68rem;
  letter-spacing: 0.02em;
}

/* Legend additions */
.legend-divider {
  height: 1px;
  background: rgba(100, 116, 139, 0.15);
  margin: 6px 0;
}

.legend-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px dashed rgba(249, 115, 22, 0.6);
  background: rgba(249, 115, 22, 0.1);
  flex-shrink: 0;
}

/* Flow & Fire labels */
.flow-direction-label {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(217, 119, 6, 0.3);
  border-radius: 20px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  animation: slide-in-up 0.5s ease;
}

.fire-alert-label {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(234, 88, 12, 0.3);
  border-radius: 20px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
  animation: slide-in-up 0.5s ease 0.2s both;
}

/* Evacuation and Report overrides */
.evac-btn {
  background: rgba(21, 128, 61, 0.1);
  color: #15803d;
  border: 1px solid rgba(21, 128, 61, 0.3);
}

.evac-btn.active {
  background: #15803d;
  color: white;
}

.report-pulse.safe {
  color: var(--color-safe);
}

/* Rain markers */
.rain-marker {
  position: relative;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.1);
  border: 1.5px solid rgba(59, 130, 246, 0.3);
  animation: rain-pulse 2.5s ease-in-out infinite;
}

.rain-marker.heavy, .rain-marker.extreme {
  background: rgba(37, 99, 235, 0.15);
  border-color: rgba(37, 99, 235, 0.5);
  animation-duration: 1.5s;
}

.rain-icon {
  font-size: 15px;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}

@keyframes rain-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.15); opacity: 0.8; }
}

.rain-btn {
  background: rgba(59, 130, 246, 0.08);
  color: #2563eb;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.rain-btn.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #ffffff;
}

/* AQI badges */
.aqi-badge {
  font-size: 11px;
  font-weight: 700;
  color: white;
  padding: 2px 8px;
  border-radius: 10px;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
}

.aqi-btn {
  background: rgba(147, 51, 234, 0.08);
  color: #7c3aed;
  border: 1px solid rgba(147, 51, 234, 0.3);
}

.aqi-btn.active {
  background: #7c3aed;
  border-color: #7c3aed;
  color: #ffffff;
}

/* Map Search Bar */
.map-search-bar {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 1001;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 6px 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-width: 320px;
  width: 100%;
}

.map-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 0.82rem;
  font-family: inherit;
  color: var(--text-primary);
  min-width: 0;
}

.map-search-input::placeholder {
  color: var(--text-muted);
}

.map-search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 2px;
  display: flex;
  font-size: 16px;
  line-height: 1;
}

.map-search-results {
  position: absolute;
  top: 44px;
  left: 12px;
  z-index: 1002;
  background: white;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  max-width: 320px;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
}

.map-search-result-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  cursor: pointer;
  font-size: 0.78rem;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.15s;
}

.map-search-result-item:last-child {
  border-bottom: none;
}

.map-search-result-item:hover {
  background: #f1f5f9;
}

/* Dark mode overrides for map search */
[data-theme="dark"] .map-search-bar {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(71, 85, 105, 0.4);
}

[data-theme="dark"] .map-search-results {
  background: #1e293b;
  border-color: rgba(71, 85, 105, 0.4);
}

[data-theme="dark"] .map-search-result-item:hover {
  background: rgba(51, 65, 85, 0.5);
}

/* Dark mode for map controls */
[data-theme="dark"] .map-control-btn {
  background: rgba(30, 41, 59, 0.95);
  color: #e2e8f0;
  border-color: rgba(71, 85, 105, 0.4);
}

[data-theme="dark"] .map-control-btn:hover {
  background: #334155;
  color: #93c5fd;
}

[data-theme="dark"] .map-overlay {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(71, 85, 105, 0.4);
}

[data-theme="dark"] .station-pin {
  background: #1e293b;
}
</style>

