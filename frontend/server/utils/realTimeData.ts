// Real-time data fetching from NASA FIRMS and ThaiWater APIs

import { predictFireSpread, predictRainDirection, degToCompass } from './fireSpreadModel'

// ============================================
// OpenWeatherMap — Wind/Weather Data
// ============================================

const windCache: Record<string, { data: any, ts: number }> = {}
const WIND_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

export async function fetchWindData(lat: number, lng: number) {
    const cacheKey = `${lat.toFixed(1)},${lng.toFixed(1)}`
    const cached = windCache[cacheKey]
    if (cached && Date.now() - cached.ts < WIND_CACHE_TTL) return cached.data

    const config = useRuntimeConfig()
    const apiKey = config.openweatherApiKey
    if (!apiKey) return { speed: 5, deg: 90, humidity: 60, temp: 30 } // defaults

    try {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`
        const res: any = await $fetch(url, { timeout: 5000 })
        const wind = {
            speed: res.wind?.speed || 0,
            deg: res.wind?.deg || 0,
            humidity: res.main?.humidity || 50,
            temp: res.main?.temp || 25,
        }
        windCache[cacheKey] = { data: wind, ts: Date.now() }
        return wind
    } catch {
        return { speed: 5, deg: 90, humidity: 60, temp: 30 }
    }
}

// ============================================
// Cache layer (15 min TTL)
// ============================================
interface CacheEntry<T> {
    data: T
    timestamp: number
}

const cache: Record<string, CacheEntry<any>> = {}
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes (more real-time)

function getCached<T>(key: string): T | null {
    const entry = cache[key]
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
        return entry.data as T
    }
    return null
}

function setCache<T>(key: string, data: T): void {
    cache[key] = { data, timestamp: Date.now() }
}

// ============================================
// NASA FIRMS — Fire Hotspot Data
// ============================================

// Thailand bounding box (entire country)
const CM_BBOX = '97.3,5.6,105.7,20.5'

interface FirmsRecord {
    latitude: number
    longitude: number
    brightness: number
    scan: number
    track: number
    acq_date: string
    acq_time: string
    satellite: string
    confidence: string
    version: string
    bright_ti4: number
    bright_ti5: number
    frp: number
    daynight: string
}

function parseFirmsCsv(csv: string): FirmsRecord[] {
    const lines = csv.trim().split('\n')
    if (lines.length < 2) return []

    const headerLine = lines[0]!
    const headers = headerLine.split(',').map((h) => h.trim())
    const records: FirmsRecord[] = []

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!
        const values = line.split(',').map((v) => v.trim())
        if (values.length < headers.length) continue

        const record: any = {}
        headers.forEach((h, idx) => {
            const v = values[idx] || ''
            if (['latitude', 'longitude', 'brightness', 'scan', 'track', 'bright_ti4', 'bright_ti5', 'frp'].includes(h)) {
                record[h] = parseFloat(v) || 0
            } else {
                record[h] = v
            }
        })
        records.push(record as FirmsRecord)
    }

    return records
}

function brightnessToIntensity(brightness: number): 'low' | 'medium' | 'high' | 'extreme' {
    if (brightness >= 400) return 'extreme'
    if (brightness >= 350) return 'high'
    if (brightness >= 310) return 'medium'
    return 'low'
}

function getIntensityLevel(intensity: string) {
    switch (intensity) {
        case 'extreme': return 4
        case 'high': return 3
        case 'medium': return 2
        case 'low': return 1
        default: return 0
    }
}

// Group nearby fire points into clusters
function clusterFires(records: FirmsRecord[], thresholdKm: number = 2): FirmsRecord[][] {
    const used = new Set<number>()
    const clusters: FirmsRecord[][] = []

    for (let i = 0; i < records.length; i++) {
        if (used.has(i)) continue
        const ri = records[i]!
        const cluster: FirmsRecord[] = [ri]
        used.add(i)

        for (let j = i + 1; j < records.length; j++) {
            if (used.has(j)) continue
            const rj = records[j]!
            const dist = haversineKm(ri.latitude, ri.longitude, rj.latitude, rj.longitude)
            if (dist <= thresholdKm) {
                cluster.push(rj)
                used.add(j)
            }
        }
        clusters.push(cluster)
    }
    return clusters
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Generate fire spread prediction (uses same model as before but with real data)
function generateFireSpreadPrediction(fire: any) {
    const predictions: any[] = []
    const hoursToPredict = [1, 2, 3, 6, 9, 12]

    const windFactor = Math.max(0.5, (fire.windSpeed || 15) / 15)
    const humidityFactor = Math.max(0.3, (100 - (fire.humidity || 30)) / 70)
    const vegFactor = fire.vegetationFactor || 1.0
    const baseSpreadRate = 0.15 * windFactor * humidityFactor * vegFactor

    let currentArea = fire.areaSqKm || 0.5

    for (const h of hoursToPredict) {
        const decayFactor = Math.exp(-0.05 * h)
        const spreadRate = baseSpreadRate * decayFactor
        const prevIdx = hoursToPredict.indexOf(h)
        const prevH = prevIdx > 0 ? (hoursToPredict[prevIdx - 1] ?? 0) : 0
        currentArea += spreadRate * (h - prevH)

        const radiusKm = Math.sqrt(Math.max(0.01, currentArea) / Math.PI)
        const confidence = Math.max(40, 95 - h * 4.5)

        predictions.push({
            hoursFromNow: h,
            estimatedAreaSqKm: Math.round(currentArea * 100) / 100,
            estimatedRadiusKm: Math.round(radiusKm * 100) / 100,
            spreadRate: Math.round(spreadRate * 100) / 100,
            spreadDirectionDeg: fire.windDirectionDeg || 0,
            spreadDirection: fire.windDirection || 'N/A',
            confidence: Math.round(confidence * 10) / 10,
        })
    }
    return predictions
}

export async function fetchRealFireData() {
    const cached = getCached<any>('fires')
    if (cached) return cached

    const config = useRuntimeConfig()
    const firmsKey = config.firmsMapKey

    if (!firmsKey) {
        console.log('[FIRMS] No API key set. Set FIRMS_MAP_KEY env var.')
        return {
            timestamp: new Date().toISOString(),
            source: 'NASA FIRMS',
            dataDelay: 'NRT',
            dataRange: '24h',
            activeCount: 0,
            totalCount: 0,
            worldCount: 0,
            overallFireRisk: 'low',
            fires: [],
            worldFires: [],
            spreadPredictions: []
        }
    }

    try {
        // Fetch Thailand fires (primary)
        const thaiUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${CM_BBOX}/1`
        const worldUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/world/1`

        // Fetch concurrently, but allow world to fail gracefully without breaking Thai data
        const [thaiResponse, worldResponse] = await Promise.all([
            $fetch<string>(thaiUrl, { responseType: 'text', timeout: 15000 }).catch(() => ''),
            $fetch<string>(worldUrl, { responseType: 'text', timeout: 30000 }).catch(() => ''),
        ])

        const thaiRecords = parseFirmsCsv(thaiResponse)
        const worldRecords = parseFirmsCsv(worldResponse)

        console.log(`[FIRMS] Thailand: ${thaiRecords.length} hotspots, World: ${worldRecords.length} hotspots`)

        // Process Thailand fires (for alert bar, stats, spread predictions)
        const processRecords = (records: FirmsRecord[]) => {
            if (records.length === 0) return []
            // Cluster nearby hotspots into single fire events (25km radius)
            const clusters = clusterFires(records, 25)
            return clusters.map((cluster, idx) => {
                const lat = cluster.reduce((s, r) => s + r.latitude, 0) / cluster.length
                const lng = cluster.reduce((s, r) => s + r.longitude, 0) / cluster.length
                const maxBrightness = Math.max(...cluster.map(r => r.bright_ti4 || r.brightness))
                const totalFrp = cluster.reduce((s, r) => s + (r.frp || 0), 0)
                const areaSqKm = Math.round(cluster.length * 0.14 * 100) / 100
                const detTimes = cluster.map((r) => {
                    const timeStr = r.acq_time.padStart(4, '0')
                    return `${r.acq_date}T${timeStr.slice(0, 2)}:${timeStr.slice(2)}:00Z`
                })
                const earliest = detTimes.sort()[0] || new Date().toISOString()
                const intensity = brightnessToIntensity(maxBrightness)

                const fire: any = {
                    id: `F${(idx + 1).toString().padStart(3, '0')}`,
                    name: `จุดไฟ #${idx + 1} (${lat.toFixed(2)}°N, ${lng.toFixed(2)}°E)`,
                    nameEn: `Fire Cluster #${idx + 1}`,
                    lat, lng,
                    detectedAt: earliest,
                    intensity, areaSqKm,
                    windSpeed: 15, windDirection: 'ไม่ทราบ', windDirectionDeg: 0,
                    humidity: 30, temperature: 35,
                    vegetationType: 'ไม่ระบุ', vegetationFactor: 1.0,
                    status: 'active' as const,
                    brightness: maxBrightness,
                    frp: Math.round(totalFrp * 10) / 10,
                    pixelCount: cluster.length,
                    confidence: cluster[0]?.confidence || 'nominal',
                    satellite: cluster[0]?.satellite || 'VIIRS SNPP',
                    source: 'NASA FIRMS',
                }

                const hoursActive = Math.round((Date.now() - new Date(earliest).getTime()) / 3600000 * 10) / 10
                const predictions = generateFireSpreadPrediction(fire)
                const peakPrediction = predictions[predictions.length - 1]

                return {
                    ...fire,
                    hoursActive,
                    predictions,
                    peakEstimate: {
                        areaSqKm: peakPrediction.estimatedAreaSqKm,
                        radiusKm: peakPrediction.estimatedRadiusKm,
                        timeHours: peakPrediction.hoursFromNow,
                    },
                    intensityLevel: getIntensityLevel(intensity),
                }
            })
                // Only show significant fires (high/extreme intensity OR strong FRP)
                .filter(f => f.intensityLevel >= 3 || f.frp >= 50.0)
                .sort((a, b) => b.intensityLevel - a.intensityLevel)
        }

        // Limit to top 50 most intense fires to keep the map readable
        const thaiFires = processRecords(thaiRecords).slice(0, 50)

        // Fetch real wind data for Thai fires and update fire objects + regenerate predictions
        console.log(`[FIRMS] Fetching real wind data for ${Math.min(thaiFires.length, 20)} Thai fires...`)
        const windFetchFires = thaiFires.slice(0, 20)
        await Promise.all(windFetchFires.map(async (fire) => {
            try {
                const wind = await fetchWindData(fire.lat, fire.lng)
                fire.windSpeed = wind.speed
                fire.windDirection = degToCompass(wind.deg)
                fire.windDirectionDeg = wind.deg
                fire.humidity = wind.humidity
                fire.temperature = wind.temp
                // Regenerate predictions with real wind data
                fire.predictions = generateFireSpreadPrediction(fire)
                const peakPrediction = fire.predictions[fire.predictions.length - 1]
                fire.peakEstimate = {
                    areaSqKm: peakPrediction.estimatedAreaSqKm,
                    radiusKm: peakPrediction.estimatedRadiusKm,
                    timeHours: peakPrediction.hoursFromNow,
                }
            } catch (e) { /* keep defaults */ }
        }))

        // Process World fires, but ONLY keep the top 20 most intense to avoid frontend lag
        // Also exclude fires that are already inside the Thai bounding box to avoid duplicates
        const worldFiresAll = processRecords(worldRecords)
        const thaiBbox = { minLat: 5.6, maxLat: 20.5, minLng: 97.3, maxLng: 105.7 }

        const topWorldFires = worldFiresAll
            .filter(f => !(f.lat >= thaiBbox.minLat && f.lat <= thaiBbox.maxLat && f.lng >= thaiBbox.minLng && f.lng <= thaiBbox.maxLng))
            .slice(0, 20)

        console.log(`[FIRMS] Filtered World fires to top ${topWorldFires.length} extreme clusters`)

        // Spread predictions (CA + Wind model) — use Thai fires with real wind
        const spreadPredictions: any[] = []
        const predictionFires = thaiFires.slice(0, 10)
        console.log(`[FIRMS] Computing spread predictions for ${predictionFires.length} fires (Thai)...`)
        for (const fire of predictionFires) {
            try {
                const wind = await fetchWindData(fire.lat, fire.lng)
                const pred = predictFireSpread(fire, fire.id, wind)
                spreadPredictions.push(pred)
            } catch (e) { /* skip */ }
        }
        console.log(`[FIRMS] Spread predictions computed: ${spreadPredictions.length}`)

        const activeCount = thaiFires.length
        const maxIntensity = Math.max(...thaiFires.map((f) => f.intensityLevel), 0)
        const overallFireRisk = maxIntensity >= 4 ? 'extreme' : maxIntensity >= 3 ? 'high' : maxIntensity >= 2 ? 'medium' : 'low'

        const result = {
            timestamp: new Date().toISOString(),
            source: 'NASA FIRMS (VIIRS SNPP)',
            dataDelay: 'Near Real-Time (NRT) — ข้อมูลจากดาวเทียม ล่าช้าประมาณ 2–3 ชั่วโมง',
            dataRange: 'ย้อนหลัง 24 ชั่วโมง',
            activeCount,
            totalCount: thaiFires.length,
            worldCount: worldFiresAll.length,
            overallFireRisk,
            fires: thaiFires,
            worldFires: topWorldFires,
            spreadPredictions,
        }

        setCache('fires', result)
        return result
    } catch (error: any) {
        console.error('[FIRMS] API error:', error.message)
        return {
            timestamp: new Date().toISOString(),
            source: 'NASA FIRMS (Error)',
            dataDelay: 'API Unavailable',
            dataRange: 'N/A',
            activeCount: 0,
            totalCount: 0,
            worldCount: 0,
            overallFireRisk: 'low',
            fires: [],
            worldFires: [],
            spreadPredictions: []
        }
    }
}

// ============================================
// ThaiWater — Rainfall Data
// ============================================

const THAIWATER_RAIN_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'

export async function fetchRealRainData() {
    const cached = getCached<any>('rain')
    if (cached) return cached

    try {
        const response: any = await $fetch(THAIWATER_RAIN_URL, { timeout: 15000 })
        const allStations = response?.data || response?.rain_data?.data || []

        const rainStations = allStations
            .filter((s: any) => s.station?.tele_station_lat && s.rain_24h != null && parseFloat(s.rain_24h) >= 10)
            .map((s: any) => ({
                lat: s.station.tele_station_lat,
                lng: s.station.tele_station_long,
                name: s.station.tele_station_name?.th || 'สถานี',
                province: s.geocode?.province_name?.th || '',
                amphoe: s.geocode?.amphoe_name?.th || '',
                rain24h: parseFloat(s.rain_24h) || 0,
                rain1h: parseFloat(s.rain_1h) || 0,
                rainToday: parseFloat(s.rain_today) || 0,
                datetime: s.rainfall_datetime || '',
                intensity: parseFloat(s.rain_24h) >= 90 ? 'extreme'
                    : parseFloat(s.rain_24h) >= 35 ? 'heavy'
                        : parseFloat(s.rain_24h) >= 10 ? 'moderate'
                            : 'light',
            }))
            .sort((a: any, b: any) => b.rain24h - a.rain24h)
            .slice(0, 30)

        // Compute rain direction predictions for top rain stations
        console.log(`[Rain] Computing direction predictions for ${Math.min(rainStations.length, 15)} stations...`)
        for (const station of rainStations.slice(0, 15)) {
            try {
                const wind = await fetchWindData(station.lat, station.lng)
                const pred = predictRainDirection(station.lat, station.lng, station.rain24h, wind)
                station.windSpeed = wind.speed
                station.windDeg = wind.deg
                station.rainDirection = pred.directionLabel
                station.rainDirectionDeg = pred.directionDeg
                station.predictedPath = pred.predictedPath
            } catch (e) { /* skip */ }
        }

        const result = {
            timestamp: new Date().toISOString(),
            source: 'ThaiWater API (HII)',
            dataDelay: 'Real-time — ข้อมูลสดจากสถานีวัดฝนทั่วประเทศ',
            totalStations: rainStations.length,
            rainStations,
        }

        setCache('rain', result)
        return result
    } catch (error: any) {
        console.error('[ThaiWater Rain] API error:', error.message)
        return { timestamp: new Date().toISOString(), source: 'unavailable', totalStations: 0, rainStations: [] }
    }
}

// ============================================
// ThaiWater — Water Level Data
// ============================================

const THAIWATER_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load'

// ThaiWater situation_level mapping
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function mapSituationLevel(level: number): string {
    // 1=ปกติ, 2=เฝ้าระวัง, 3=วิกฤต, 4=ปลอดภัย(others), 5=ล้นตลิ่ง
    if (level >= 5) return 'danger'
    if (level >= 3) return 'warning'
    return 'safe'
}

export async function fetchRealWaterData() {
    const cached = getCached<any>('water')
    if (cached) return cached

    try {
        const response: any = await $fetch(THAIWATER_URL, { timeout: 15000 })
        const allStations = response?.waterlevel_data?.data || []

        // Use all stations nationwide — take the most critical ones
        // Sort by situation level (most critical first)
        const sortedStations = allStations
            .filter((s: any) => s.station?.tele_station_lat && s.waterlevel_msl)
            .sort((a: any, b: any) => (b.situation_level || 0) - (a.situation_level || 0))

        if (sortedStations.length === 0) {
            console.log('[ThaiWater] No stations found in response.')
            return {
                timestamp: new Date().toISOString(),
                source: 'ThaiWater API (No Data)',
                dataDelay: 'API Unavailable',
                overallRisk: 'safe',
                stations: []
            }
        }

        // Take top 50 most critical stations
        const topStations = sortedStations.slice(0, 50)

        const stations = topStations.map((s: any, idx: number) => {
            const station = s.station || {}
            const geocode = s.geocode || {}
            const currentLevel = parseFloat(s.waterlevel_msl) || 0
            const prevLevel = parseFloat(s.waterlevel_msl_previous) || currentLevel
            const trend = Math.round((currentLevel - prevLevel) * 100) / 100

            // Determine type based on position (upstream/midstream/downstream by latitude)
            const lat = station.tele_station_lat || 18.78
            let type = 'midstream'
            let typeLabel = 'กลางน้ำ'
            if (lat > 18.9) { type = 'upstream'; typeLabel = 'ต้นน้ำ' }
            else if (lat < 18.7) { type = 'downstream'; typeLabel = 'ปลายน้ำ' }

            // ใช้ situation_level จาก ThaiWater API โดยตรง (Real-time เท่านั้น)
            // 1=ปกติ, 2=เฝ้าระวัง, 3=วิกฤต, 4=ปลอดภัย(others), 5=ล้นตลิ่ง
            const situationLevel = s.situation_level || 0

            const minBank = station.min_bank || 999

            let riskLevel = 'safe'
            if (situationLevel >= 5) riskLevel = 'danger'       // ล้นตลิ่ง — วิกฤตจริง
            else if (situationLevel >= 3) riskLevel = 'critical' // วิกฤต — เฝ้าระวังสูง
            else if (situationLevel >= 2) riskLevel = 'warning'  // เฝ้าระวัง
            // ไม่ใช้ threshold ที่ประมาณเอง — ใช้เฉพาะข้อมูล real-time จาก API

            const flowTimeToDownstream = type === 'upstream' ? 6 : type === 'midstream' ? 3 : 0

            return {
                id: `S${(idx + 1).toString().padStart(3, '0')}`,
                name: station.tele_station_name?.th || `สถานี ${station.tele_station_oldcode || idx + 1}`,
                nameEn: station.tele_station_name?.en || station.tele_station_oldcode || `Station ${idx + 1}`,
                type,
                typeLabel,
                lat: station.tele_station_lat || 18.78,
                lng: station.tele_station_long || 98.99,
                elevation: 0,
                description: `${geocode.amphoe_name?.th || ''} ${geocode.province_name?.th || 'เชียงใหม่'}`,
                thresholds: { warning: minBank * 0.8, critical: minBank * 0.95 },
                currentLevel,
                situationLevel,
                trend,
                trendDirection: trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'stable',
                rainfall: {
                    current: 0,
                    accumulated24h: 0,
                },
                riskLevel,
                peakPredicted: currentLevel + (trend > 0 ? trend * 6 : 0),
                flowTimeToDownstream,
                source: 'ThaiWater API',
                teleStationId: station.id || '',
                stationCode: station.tele_station_oldcode || '',
                agencyName: s.agency?.agency_shortname?.th || '',
                riverName: s.river_name || '',
                lastUpdate: s.waterlevel_datetime || '',
                bankLevel: minBank,
                diffFromBank: s.diff_wl_bank || '',
                diffText: s.diff_wl_bank_text || '',
                storagePercent: parseFloat(s.storage_percent) || 0,
            }
        })

        // Overall risk — ใช้เฉพาะ situation_level จาก API เท่านั้น
        const dangerCount = stations.filter((s: any) => s.riskLevel === 'danger').length
        const criticalCount = stations.filter((s: any) => s.riskLevel === 'critical').length
        const warningCount = stations.filter((s: any) => s.riskLevel === 'warning').length
        console.log(`[ThaiWater] Risk summary — danger(ล้นตลิ่ง): ${dangerCount}, critical(วิกฤต): ${criticalCount}, warning(เฝ้าระวัง): ${warningCount}, total: ${stations.length}`)

        // วิกฤตจริง = มีสถานีที่ situation_level >= 5 (ล้นตลิ่ง) เท่านั้น
        const overallRisk = dangerCount > 0
            ? 'danger'
            : (criticalCount > 0 || warningCount > 0)
                ? 'warning'
                : 'safe'

        const result = {
            timestamp: new Date().toISOString(),
            source: 'ThaiWater API (HII/RID)',
            dataDelay: 'Real-time — ข้อมูลสดจากเซ็นเซอร์วัดระดับน้ำทั่วประเทศ',
            overallRisk,
            stations,
        }

        setCache('water', result)
        return result
    } catch (error: any) {
        console.error('[ThaiWater] API error:', error.message)
        return {
            timestamp: new Date().toISOString(),
            source: 'ThaiWater API (Error)',
            dataDelay: 'API Unavailable',
            overallRisk: 'safe',
            stations: []
        }
    }
}

// ============================================
// ThaiWater — Station Timeseries (Real Data)
// ============================================

const THAIWATER_GRAPH_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_graph'

export async function fetchStationTimeseries(stationId: string) {
    // Get cached water data to find the station info
    const waterData = await fetchRealWaterData()
    const station = waterData.stations?.find((s: any) => s.id === stationId)

    if (!station) {
        return { waterLevel: [], rainfall: [], predictions: [], source: 'station-not-found' }
    }

    const now = Date.now()
    const waterLevel: any[] = []
    const rainfall: any[] = []
    const predictions: any[] = []

    // Try to fetch real historical water level from ThaiWater graph API
    if (station.teleStationId) {
        try {
            const endDate = new Date().toISOString().slice(0, 10)
            const startDate = new Date(now - 72 * 3600000).toISOString().slice(0, 10)
            const graphUrl = `${THAIWATER_GRAPH_URL}?station_type=tele_waterlevel&station_id=${station.teleStationId}&start_date=${startDate}&end_date=${endDate}`

            const response: any = await $fetch(graphUrl, { timeout: 15000 })
            const graphData = response?.data || response?.waterlevel_data?.data || response || []

            if (Array.isArray(graphData) && graphData.length > 0) {
                for (const point of graphData) {
                    const ts = new Date(point.datetime || point.waterlevel_datetime).getTime()
                    if (!isNaN(ts)) {
                        waterLevel.push({
                            timestamp: ts,
                            datetime: new Date(ts).toISOString(),
                            level: parseFloat(point.value || point.waterlevel_msl) || 0,
                        })
                    }
                }
                waterLevel.sort((a, b) => a.timestamp - b.timestamp)
                console.log(`[ThaiWater Graph] Fetched ${waterLevel.length} data points for station ${stationId}`)
            }
        } catch (e: any) {
            console.log(`[ThaiWater Graph] Could not fetch history for ${stationId}: ${e.message}`)
        }
    }

    // Fallback: if no historical data, build from current snapshot
    if (waterLevel.length === 0) {
        const currentLevel = station.currentLevel || 0
        const trend = station.trend || 0
        // Build 72h history from current level + trend extrapolation backwards
        for (let h = 72; h >= 0; h--) {
            const ts = now - h * 3600000
            const estimatedLevel = currentLevel - (trend * h / 6)
            waterLevel.push({
                timestamp: ts,
                datetime: new Date(ts).toISOString(),
                level: Math.max(0, Math.round(estimatedLevel * 100) / 100),
            })
        }
        console.log(`[ThaiWater] Using trend-extrapolated data for station ${stationId}`)
    }

    // Get real rain data for nearest station
    const rainData = await fetchRealRainData()
    const rainStations = rainData?.rainStations || []

    // Find nearest rain station by distance
    let nearestRain: any = null
    let minDist = Infinity
    for (const rs of rainStations) {
        const dist = Math.sqrt(Math.pow(rs.lat - station.lat, 2) + Math.pow(rs.lng - station.lng, 2))
        if (dist < minDist) {
            minDist = dist
            nearestRain = rs
        }
    }

    // Build rainfall timeline from real data
    const rain24h = nearestRain?.rain24h || 0
    const rain1h = nearestRain?.rain1h || 0
    for (let h = 72; h >= 0; h--) {
        const ts = now - h * 3600000
        // Distribute real rainfall across recent hours (weighted toward recent)
        let amount = 0
        if (h <= 24 && rain24h > 0) {
            amount = (rain24h / 24) * (h <= 1 ? (rain1h || rain24h / 24) : 1)
        }
        rainfall.push({
            timestamp: ts,
            datetime: new Date(ts).toISOString(),
            amount: Math.round(amount * 10) / 10,
            accumulated: h <= 24 ? Math.round(rain24h * (24 - h) / 24 * 10) / 10 : 0,
        })
    }

    // Predictions: simple linear extrapolation from real trend
    const currentLevel = station.currentLevel || 0
    const trend = station.trend || 0
    let level = currentLevel
    for (let h = 1; h <= 12; h++) {
        level += trend / 6 // trend is per ~6 hours from ThaiWater
        level = Math.max(0, level)
        predictions.push({
            timestamp: now + h * 3600000,
            datetime: new Date(now + h * 3600000).toISOString(),
            predictedLevel: Math.round(level * 100) / 100,
            confidence: Math.round((95 - h * 3) * 10) / 10,
        })
    }

    return {
        waterLevel,
        rainfall,
        predictions,
        source: 'ThaiWater API',
        stationName: station.name,
        nearestRainStation: nearestRain?.name || null,
    }
}
