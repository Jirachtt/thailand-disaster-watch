// Real-time data fetching from NASA FIRMS and ThaiWater APIs

import { predictFireSpread, predictRainDirection, degToCompass } from './fireSpreadModel'
import { isPointInThailand } from './thailandGeofence'

// ============================================
// OpenWeatherMap — Wind/Weather Data
// ============================================

const windCache: Record<string, { data: any, ts: number }> = {}
const WIND_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function toRequiredNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') return Number.NaN
    return Number(value)
}

export async function fetchWindData(lat: number, lng: number) {
    const cacheKey = `${lat.toFixed(1)},${lng.toFixed(1)}`
    const cached = windCache[cacheKey]
    if (cached && Date.now() - cached.ts < WIND_CACHE_TTL) return cached.data

    const config = useRuntimeConfig()
    const apiKey = config.openweatherApiKey

    if (apiKey) {
        try {
            const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`
            const res: any = await $fetch(url, { timeout: 4000, retry: 0 })
            const speed = toRequiredNumber(res.wind?.speed)
            const deg = toRequiredNumber(res.wind?.deg)
            const humidity = toRequiredNumber(res.main?.humidity)
            const temp = toRequiredNumber(res.main?.temp)
            if (![speed, deg, humidity, temp].every(Number.isFinite)) {
                throw new Error('OpenWeather response is missing required weather fields')
            }
            const wind = {
                speed,
                deg,
                humidity,
                temp,
                source: 'OpenWeather',
            }
            windCache[cacheKey] = { data: wind, ts: Date.now() }
            return wind
        } catch {
            // Continue to the keyless Open-Meteo upstream below.
        }
    }

    try {
        const url = 'https://api.open-meteo.com/v1/forecast'
            + `?latitude=${lat}&longitude=${lng}`
            + '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m'
            + '&wind_speed_unit=ms&timezone=Asia%2FBangkok'
        const res: any = await $fetch(url, { timeout: 4000, retry: 0 })
        const current = res?.current || {}
        const speed = toRequiredNumber(current.wind_speed_10m)
        const deg = toRequiredNumber(current.wind_direction_10m)
        const humidity = toRequiredNumber(current.relative_humidity_2m)
        const temp = toRequiredNumber(current.temperature_2m)
        if (![speed, deg, humidity, temp].every(Number.isFinite)) {
            throw new Error('Open-Meteo response is missing required weather fields')
        }
        const wind = {
            speed,
            deg,
            humidity,
            temp,
            source: 'Open-Meteo',
        }
        windCache[cacheKey] = { data: wind, ts: Date.now() }
        return wind
    } catch (error: any) {
        throw new Error(`Weather APIs unavailable: ${error?.message || 'unknown error'}`)
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
const STALE_CACHE_TTL = 60 * 60 * 1000 // never expose arbitrarily old observations
const inFlight = new Map<string, Promise<any>>()

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

function getStaleCached<T>(key: string): T | null {
    const entry = cache[key]
    if (entry && Date.now() - entry.timestamp < STALE_CACHE_TTL) {
        return entry.data as T
    }
    return null
}

async function singleFlight<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key)
    if (existing) return existing as Promise<T>

    const promise = task().finally(() => inFlight.delete(key))
    inFlight.set(key, promise)
    return promise
}

// ============================================
// NASA FIRMS — Fire Hotspot Data
// ============================================

// NASA FIRMS accepts only a rectangular area. Records returned by this broad
// request must still pass the local national-boundary geofence below because
// the rectangle also intersects Myanmar, Laos, Cambodia, Malaysia and Vietnam.
const THAILAND_REQUEST_BBOX = '97.3,5.6,105.7,20.5'

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
                const parsed = Number.parseFloat(v)
                record[h] = Number.isFinite(parsed) ? parsed : null
            } else {
                record[h] = v
            }
        })
        if (!Number.isFinite(record.latitude) || !Number.isFinite(record.longitude)
            || record.latitude < -90 || record.latitude > 90
            || record.longitude < -180 || record.longitude > 180) continue
        const brightness = Number.isFinite(record.bright_ti4) ? record.bright_ti4 : record.brightness
        if (!Number.isFinite(brightness) || !Number.isFinite(record.frp)) continue
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

    const windSpeed = Number(fire.windSpeed)
    const humidity = Number(fire.humidity)
    const windDirectionDeg = Number(fire.windDirectionDeg)
    if (![windSpeed, humidity, windDirectionDeg].every(Number.isFinite)) {
        throw new Error('A real weather observation is required for fire prediction')
    }

    const windFactor = Math.max(0.5, windSpeed / 15)
    const humidityFactor = Math.max(0.3, (100 - humidity) / 70)
    const vegFactor = fire.vegetationFactor || 1.0
    const baseSpreadRate = 0.15 * windFactor * humidityFactor * vegFactor

    const observedArea = Number(fire.areaSqKm)
    if (!Number.isFinite(observedArea) || observedArea <= 0) {
        throw new Error('A FIRMS-derived detection area is required for fire prediction')
    }
    let currentArea = observedArea

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
            spreadDirectionDeg: windDirectionDeg,
            spreadDirection: fire.windDirection || 'N/A',
            confidence: Math.round(confidence * 10) / 10,
        })
    }
    return predictions
}

function getUnavailableFireDashboard(reason: string, allowStale = true) {
    const stale = allowStale ? getStaleCached<any>('fires') : null
    if (stale) {
        return {
            ...stale,
            status: 'stale',
            isFallback: false,
            dataDelay: `${reason} — แสดงข้อมูลจริงล่าสุดที่เคยได้รับจาก NASA FIRMS`,
        }
    }

    return {
        timestamp: new Date().toISOString(),
        source: 'NASA FIRMS (VIIRS SNPP)',
        dataDelay: reason,
        dataRange: 'ย้อนหลัง 24 ชั่วโมง',
        status: 'error',
        isFallback: false,
        activeCount: 0,
        totalCount: 0,
        worldCount: 0,
        overallFireRisk: 'unknown',
        fires: [],
        worldFires: [],
        spreadPredictions: [],
    }
}

async function fetchRealFireDataInternal() {
    const config = useRuntimeConfig()
    const firmsKey = config.firmsMapKey

    if (!firmsKey) {
        console.log('[FIRMS] No API key set. Set FIRMS_MAP_KEY env var.')
        return getUnavailableFireDashboard('ยังไม่ได้ตั้งค่า FIRMS_MAP_KEY', false)
    }

    const cached = getCached<any>('fires')
    if (cached) return cached

    try {
        // Fetch Thailand fires (primary)
        const thaiUrl = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_SNPP_NRT/${THAILAND_REQUEST_BBOX}/1`
        // Thailand is the only dataset in the critical path. A one-day global
        // VIIRS response can contain 100k+ rows and previously made the O(n²)
        // clustering pass freeze the dashboard.
        const thaiResponse = await $fetch<string>(thaiUrl, {
            responseType: 'text',
            timeout: 8000,
            retry: 0,
        })

        const firmsHeader = thaiResponse.split(/\r?\n/, 1)[0]?.toLowerCase() || ''
        if (!firmsHeader.includes('latitude') || !firmsHeader.includes('longitude') || !firmsHeader.includes('acq_date')) {
            throw new Error('NASA FIRMS returned an invalid response')
        }

        const areaRecords = parseFirmsCsv(thaiResponse)
        // Filter every observation before clustering/counting. The FIRMS area
        // endpoint returns the complete rectangle, not the outline of Thailand.
        const thaiRecords = areaRecords.filter((record) => (
            isPointInThailand(record.latitude, record.longitude)
        ))

        console.log(`[FIRMS] Thailand: ${thaiRecords.length}/${areaRecords.length} hotspots inside national boundary`)

        // Process Thailand fires (for alert bar, stats, spread predictions)
        const processRecords = (records: FirmsRecord[]) => {
            if (records.length === 0) return []
            // Cluster nearby hotspots into single fire events (25km radius)
            const clusters = clusterFires(records, 25)
            return clusters.map((cluster, idx) => {
                const lat = cluster.reduce((s, r) => s + r.latitude, 0) / cluster.length
                const lng = cluster.reduce((s, r) => s + r.longitude, 0) / cluster.length
                const maxBrightness = Math.max(...cluster.map(r => r.bright_ti4 || r.brightness))
                const totalFrp = cluster.reduce((s, r) => s + r.frp, 0)
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
                    areaMethod: 'estimated-from-viirs-detection-pixels',
                    windSpeed: null, windDirection: null, windDirectionDeg: null,
                    humidity: null, temperature: null,
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
                return {
                    ...fire,
                    hoursActive,
                    predictions: [],
                    peakEstimate: null,
                    intensityLevel: getIntensityLevel(intensity),
                }
            })
                // Every returned cluster is backed by a FIRMS detection. Risk
                // filtering belongs in the presentation layer, not data loss.
                .sort((a, b) => b.intensityLevel - a.intensityLevel || b.frp - a.frp)
        }

        // Limit to top 50 most intense fires to keep the map readable
        const thaiFires = processRecords(thaiRecords).slice(0, 50)

        // Fetch real wind data for Thai fires and update fire objects + regenerate predictions
        console.log(`[FIRMS] Fetching real wind data for ${Math.min(thaiFires.length, 20)} Thai fires...`)
        const windFetchFires = thaiFires.slice(0, 20)
        await Promise.all(windFetchFires.map(async (fire) => {
            try {
                const wind = await fetchWindData(fire.lat, fire.lng)
                fire.windSpeed = Math.round(wind.speed * 3.6 * 10) / 10
                fire.windDirectionDeg = (wind.deg + 180) % 360
                fire.windDirection = degToCompass(fire.windDirectionDeg)
                fire.humidity = wind.humidity
                fire.temperature = wind.temp
                fire.weatherSource = wind.source
                // Regenerate predictions with real wind data
                fire.predictions = generateFireSpreadPrediction(fire)
                const peakPrediction = fire.predictions[fire.predictions.length - 1]
                fire.peakEstimate = {
                    areaSqKm: peakPrediction.estimatedAreaSqKm,
                    radiusKm: peakPrediction.estimatedRadiusKm,
                    timeHours: peakPrediction.hoursFromNow,
                }
            } catch (e) {
                // Keep the observed FIRMS hotspot, but do not create a forecast
                // without a real weather response.
            }
        }))

        // Spread predictions (CA + Wind model) — use Thai fires with real wind
        const spreadPredictions: any[] = []
        const predictionFires = thaiFires.slice(0, 10)
        console.log(`[FIRMS] Computing spread predictions for ${predictionFires.length} fires (Thai)...`)
        for (const fire of predictionFires) {
            try {
                const wind = await fetchWindData(fire.lat, fire.lng)
                const pred = predictFireSpread(fire, fire.id, wind)
                pred.weatherSource = wind.source
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
            status: 'live',
            isFallback: false,
            activeCount,
            totalCount: thaiRecords.length,
            clusterCount: thaiFires.length,
            worldCount: 0,
            overallFireRisk,
            fires: thaiFires,
            worldFires: [],
            spreadPredictions,
        }

        setCache('fires', result)
        return result
    } catch (error: any) {
        // FIRMS embeds the private MAP_KEY in the request path. ofetch error
        // messages may include that full URL, so log only a numeric status and
        // never the upstream message/request object.
        const status = Number(error?.statusCode ?? error?.status ?? error?.response?.status)
        console.error('[FIRMS] API request failed', Number.isFinite(status) ? `(HTTP ${status})` : '(network error)')
        return getUnavailableFireDashboard('เชื่อมต่อ NASA FIRMS ไม่สำเร็จ')
    }
}

export async function fetchRealFireData() {
    return singleFlight('fires', fetchRealFireDataInternal)
}

// ============================================
// ThaiWater — Rainfall Data
// ============================================

const THAIWATER_RAIN_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h'

function getUnavailableRainDashboard(reason: string) {
    const stale = getStaleCached<any>('rain')
    if (stale) {
        return {
            ...stale,
            status: 'stale',
            isFallback: false,
            dataDelay: `${reason} — แสดงข้อมูลจริงล่าสุดที่เคยได้รับจาก ThaiWater`,
        }
    }

    return {
        timestamp: new Date().toISOString(),
        source: 'ThaiWater API (HII)',
        dataDelay: reason,
        status: 'error',
        isFallback: false,
        totalStations: 0,
        rainStations: [],
    }
}

async function fetchRealRainDataInternal() {
    const cached = getCached<any>('rain')
    if (cached) return cached

    try {
        const response: any = await $fetch(THAIWATER_RAIN_URL, { timeout: 7000, retry: 0 })
        const allStations = response?.data || response?.rain_data?.data || []

        const rainStations = allStations
            .filter((s: any) => {
                const lat = Number.parseFloat(s.station?.tele_station_lat)
                const lng = Number.parseFloat(s.station?.tele_station_long)
                const rain24h = Number.parseFloat(s.rain_24h)
                return Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(rain24h) && rain24h >= 10
            })
            .map((s: any) => {
                const rain1h = Number.parseFloat(s.rain_1h)
                const rainToday = Number.parseFloat(s.rain_today)
                return {
                lat: Number.parseFloat(s.station.tele_station_lat),
                lng: Number.parseFloat(s.station.tele_station_long),
                name: s.station.tele_station_name?.th || 'สถานี',
                province: s.geocode?.province_name?.th || '',
                amphoe: s.geocode?.amphoe_name?.th || '',
                rain24h: Number.parseFloat(s.rain_24h),
                rain1h: Number.isFinite(rain1h) ? rain1h : null,
                rainToday: Number.isFinite(rainToday) ? rainToday : null,
                datetime: s.rainfall_datetime || '',
                intensity: Number.parseFloat(s.rain_24h) >= 90 ? 'extreme'
                    : Number.parseFloat(s.rain_24h) >= 35 ? 'heavy'
                        : Number.parseFloat(s.rain_24h) >= 10 ? 'moderate'
                            : 'light',
                }
            })
            .sort((a: any, b: any) => b.rain24h - a.rain24h)
            .slice(0, 30)

        // Fetch all wind snapshots concurrently. The old sequential loop could
        // hold this request for up to 75 seconds when the weather API was slow.
        console.log(`[Rain] Computing direction predictions for ${Math.min(rainStations.length, 12)} stations...`)
        await Promise.all(rainStations.slice(0, 12).map(async (station: any) => {
            try {
                const wind = await fetchWindData(station.lat, station.lng)
                const pred = predictRainDirection(station.lat, station.lng, station.rain24h, wind)
                station.windSpeed = Math.round(wind.speed * 3.6 * 10) / 10
                station.windDeg = wind.deg
                station.rainDirection = pred.directionLabel
                station.rainDirectionDeg = pred.directionDeg
                station.predictedPath = pred.predictedPath
                station.weatherSource = wind.source
            } catch (e) { /* skip */ }
        }))

        const result = {
            timestamp: new Date().toISOString(),
            source: 'ThaiWater API (HII)',
            dataDelay: 'Real-time — ข้อมูลสดจากสถานีวัดฝนทั่วประเทศ',
            status: 'live',
            isFallback: false,
            totalStations: rainStations.length,
            rainStations,
        }

        setCache('rain', result)
        return result
    } catch (error: any) {
        console.error('[ThaiWater Rain] API error:', error.message)
        return getUnavailableRainDashboard('เชื่อมต่อ ThaiWater ไม่สำเร็จ')
    }
}

export async function fetchRealRainData() {
    return singleFlight('rain', fetchRealRainDataInternal)
}

// ============================================
// ThaiWater — Water Level Data
// ============================================

const THAIWATER_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load'

// ThaiWater scale: 1=น้ำน้อยวิกฤต, 2=น้ำน้อย, 3=ปกติ,
// 4=น้ำมาก, 5=ล้นตลิ่ง. This is not an ordinal risk scale.
function getWaterSituation(level: number) {
    switch (level) {
        case 1: return { riskLevel: 'danger', riskType: 'drought', situationLabel: 'น้ำน้อยวิกฤต', priority: 3 }
        case 2: return { riskLevel: 'warning', riskType: 'drought', situationLabel: 'น้ำน้อย', priority: 2 }
        case 4: return { riskLevel: 'warning', riskType: 'flood', situationLabel: 'น้ำมาก', priority: 4 }
        case 5: return { riskLevel: 'danger', riskType: 'flood', situationLabel: 'ล้นตลิ่ง', priority: 5 }
        default: return { riskLevel: 'safe', riskType: 'normal', situationLabel: 'ปกติ', priority: 1 }
    }
}

function getUnavailableWaterDashboard(reason: string) {
    const stale = getStaleCached<any>('water')
    if (stale) {
        return {
            ...stale,
            status: 'stale',
            isFallback: false,
            dataDelay: `${reason} — แสดงข้อมูลจริงล่าสุดที่เคยได้รับจาก ThaiWater`,
        }
    }

    return {
        timestamp: new Date().toISOString(),
        source: 'ThaiWater API (HII/RID)',
        dataDelay: reason,
        status: 'error',
        isFallback: false,
        overallRisk: 'unknown',
        stations: [],
    }
}

async function fetchRealWaterDataInternal() {
    const cached = getCached<any>('water')
    if (cached) return cached

    try {
        const response: any = await $fetch(THAIWATER_URL, { timeout: 7000, retry: 0 })
        const allStations = response?.waterlevel_data?.data || []

        // Use all stations nationwide and rank by explicit risk priority. The
        // situation code is categorical, so numeric descending order is wrong.
        const sortedStations = allStations
            .filter((s: any) => {
                const lat = Number.parseFloat(s.station?.tele_station_lat)
                const lng = Number.parseFloat(s.station?.tele_station_long)
                const level = Number.parseFloat(s.waterlevel_msl)
                return Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(level)
            })
            .sort((a: any, b: any) => {
                const aPriority = getWaterSituation(Number(a.situation_level) || 3).priority
                const bPriority = getWaterSituation(Number(b.situation_level) || 3).priority
                return bPriority - aPriority
            })

        if (sortedStations.length === 0) {
            console.log('[ThaiWater] No stations found in response.')
            return getUnavailableWaterDashboard('ThaiWater ไม่ส่งข้อมูลสถานีกลับมา')
        }

        // Take top 50 most critical stations
        const topStations = sortedStations.slice(0, 50)

        const stations = topStations.map((s: any, idx: number) => {
            const station = s.station || {}
            const geocode = s.geocode || {}
            const currentLevel = Number.parseFloat(s.waterlevel_msl)
            const parsedPreviousLevel = Number.parseFloat(s.waterlevel_msl_previous)
            const hasPreviousLevel = Number.isFinite(parsedPreviousLevel)
            const trend = hasPreviousLevel
                ? Math.round((currentLevel - parsedPreviousLevel) * 100) / 100
                : null

            // Determine type based on position (upstream/midstream/downstream by latitude)
            const lat = Number.parseFloat(station.tele_station_lat)
            const lng = Number.parseFloat(station.tele_station_long)
            let type = 'midstream'
            let typeLabel = 'กลางน้ำ'
            if (lat > 18.9) { type = 'upstream'; typeLabel = 'ต้นน้ำ' }
            else if (lat < 18.7) { type = 'downstream'; typeLabel = 'ปลายน้ำ' }

            const situationLevel = Number(s.situation_level) || 3
            const situation = getWaterSituation(situationLevel)
            const parsedBank = parseFloat(station.min_bank)
            const minBank = Number.isFinite(parsedBank) ? parsedBank : null

            const flowTimeToDownstream = type === 'upstream' ? 6 : type === 'midstream' ? 3 : 0

            return {
                id: station.id ? `TW-${station.id}` : `TW-${station.tele_station_oldcode || idx + 1}`,
                name: station.tele_station_name?.th || `สถานี ${station.tele_station_oldcode || idx + 1}`,
                nameEn: station.tele_station_name?.en || station.tele_station_oldcode || `Station ${idx + 1}`,
                type,
                typeLabel,
                lat,
                lng,
                elevation: null,
                description: `${geocode.amphoe_name?.th || ''} ${geocode.province_name?.th || ''}`.trim() || 'ไม่ระบุพื้นที่',
                thresholds: minBank
                    ? { warning: minBank * 0.8, critical: minBank * 0.95 }
                    : { warning: null, critical: null },
                currentLevel,
                situationLevel,
                situationLabel: situation.situationLabel,
                trend,
                trendDirection: trend === null ? 'unknown' : trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'stable',
                rainfall: {
                    current: null,
                    accumulated24h: null,
                },
                riskLevel: situation.riskLevel,
                riskType: situation.riskType,
                peakPredicted: trend === null ? null : currentLevel + (trend > 0 ? trend * 6 : 0),
                peakInHours: trend === null ? null : trend > 0 ? 6 : 0,
                forecastConfidence: trend === null ? null : Math.max(65, 92 - Math.abs(trend) * 20),
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
                storagePercent: Number.isFinite(Number.parseFloat(s.storage_percent)) ? Number.parseFloat(s.storage_percent) : null,
            }
        })

        // Overall risk — ใช้เฉพาะ situation_level จาก API เท่านั้น
        const dangerCount = stations.filter((s: any) => s.riskLevel === 'danger').length
        const warningCount = stations.filter((s: any) => s.riskLevel === 'warning').length
        console.log(`[ThaiWater] Risk summary — danger: ${dangerCount}, warning: ${warningCount}, total: ${stations.length}`)

        const overallRisk = dangerCount > 0
            ? 'danger'
            : warningCount > 0
                ? 'warning'
                : 'safe'

        const result = {
            timestamp: new Date().toISOString(),
            source: 'ThaiWater API (HII/RID)',
            dataDelay: 'Real-time — ข้อมูลสดจากเซ็นเซอร์วัดระดับน้ำทั่วประเทศ',
            status: 'live',
            isFallback: false,
            overallRisk,
            stations,
        }

        setCache('water', result)
        return result
    } catch (error: any) {
        console.error('[ThaiWater] API error:', error.message)
        return getUnavailableWaterDashboard('เชื่อมต่อ ThaiWater ไม่สำเร็จ')
    }
}

export async function fetchRealWaterData() {
    return singleFlight('water', fetchRealWaterDataInternal)
}

// ============================================
// ThaiWater — Station Timeseries (measured history or explicit estimate)
// ============================================

const THAIWATER_GRAPH_URL = 'https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_graph'

export async function fetchStationTimeseries(stationId: string) {
    const timeseriesCacheKey = `timeseries:${stationId}`
    const cached = getCached<any>(timeseriesCacheKey)
    if (cached) return cached

    // Get cached water data to find the station info
    const waterData = await fetchRealWaterData()
    const station = waterData.stations?.find((s: any) => s.id === stationId)

    if (!station) {
        return {
            waterLevel: [],
            rainfall: [],
            predictions: [],
            source: 'station-not-found',
            status: 'error',
            estimatedHistory: false,
        }
    }

    const now = Date.now()
    const waterLevel: any[] = []
    const rainfall: any[] = []
    const predictions: any[] = []
    let estimatedHistory = false

    // Try to fetch real historical water level from ThaiWater graph API
    if (station.teleStationId) {
        try {
            const endDate = new Date().toISOString().slice(0, 10)
            const startDate = new Date(now - 72 * 3600000).toISOString().slice(0, 10)
            const graphUrl = `${THAIWATER_GRAPH_URL}?station_type=tele_waterlevel&station_id=${station.teleStationId}&start_date=${startDate}&end_date=${endDate}`

            const response: any = await $fetch(graphUrl, { timeout: 8000, retry: 0 })
            const graphData = response?.data?.graph_data
                || response?.waterlevel_data?.data
                || (Array.isArray(response?.data) ? response.data : [])

            if (Array.isArray(graphData) && graphData.length > 0) {
                const hourlyPoints = new Map<string, any>()
                for (const point of graphData) {
                    const rawDatetime = point.datetime || point.waterlevel_datetime
                    const normalizedDatetime = typeof rawDatetime === 'string' && !/[zZ]|[+-]\d\d:\d\d$/.test(rawDatetime)
                        ? `${rawDatetime.replace(' ', 'T')}+07:00`
                        : rawDatetime
                    const ts = new Date(normalizedDatetime).getTime()
                    const parsedLevel = parseFloat(point.value ?? point.waterlevel_msl)
                    if (!isNaN(ts) && Number.isFinite(parsedLevel)) {
                        const hourKey = new Date(ts).toISOString().slice(0, 13)
                        hourlyPoints.set(hourKey, {
                            timestamp: ts,
                            datetime: new Date(ts).toISOString(),
                            level: parsedLevel,
                        })
                    }
                }
                waterLevel.push(...hourlyPoints.values())
                waterLevel.sort((a, b) => a.timestamp - b.timestamp)
                console.log(`[ThaiWater Graph] Fetched ${waterLevel.length} data points for station ${stationId}`)
            }
        } catch (e: any) {
            console.log(`[ThaiWater Graph] Could not fetch history for ${stationId}: ${e.message}`)
        }
    }

    // If the graph endpoint has no history, expose an explicitly marked model
    // derived from the real current ThaiWater snapshot.
    if (waterLevel.length === 0) {
        estimatedHistory = true
        const currentLevel = Number(station.currentLevel)
        const trend = station.trend == null ? Number.NaN : Number(station.trend)
        if (Number.isFinite(currentLevel) && Number.isFinite(trend)) {
            // Build 72h history from current level + real API trend.
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
    const rain24h = Number(nearestRain?.rain24h)
    const parsedRain1h = nearestRain?.rain1h == null ? Number.NaN : Number(nearestRain.rain1h)
    const rain1h = Number.isFinite(parsedRain1h) ? parsedRain1h : null
    if (nearestRain && Number.isFinite(rain24h)) {
        for (let h = 72; h >= 0; h--) {
            const ts = now - h * 3600000
            // Distribute the real 24-hour accumulation as an explicitly
            // estimated timeline, weighted toward the real latest-hour value.
            let amount = 0
            if (h <= 24 && rain24h > 0) {
                amount = (rain24h / 24) * (h <= 1 ? (rain1h ?? rain24h / 24) : 1)
            }
            rainfall.push({
                timestamp: ts,
                datetime: new Date(ts).toISOString(),
                amount: Math.round(amount * 10) / 10,
                accumulated: h <= 24 ? Math.round(rain24h * (24 - h) / 24 * 10) / 10 : 0,
            })
        }
    }

    // Trend model with decay and a small rain contribution. This is a
    // deterministic short-horizon estimate, not a random "AI" value.
    const currentLevel = Number(station.currentLevel)
    const trend = station.trend == null ? Number.NaN : Number(station.trend)
    if (Number.isFinite(currentLevel) && Number.isFinite(trend)) {
        let level = currentLevel
        for (let h = 1; h <= 12; h++) {
            const trendContribution = (trend / 6) * Math.exp(-h / 10)
            const rainContribution = Number.isFinite(rain24h)
                ? Math.min(0.025, rain24h / 4000) * Math.exp(-h / 8)
                : 0
            level += trendContribution + rainContribution
            level = Math.max(0, level)
            predictions.push({
                timestamp: now + h * 3600000,
                datetime: new Date(now + h * 3600000).toISOString(),
                predictedLevel: Math.round(level * 100) / 100,
                confidence: Math.round((95 - h * 3) * 10) / 10,
            })
        }
    }

    const result = {
        waterLevel,
        rainfall,
        predictions,
        source: estimatedHistory
            ? 'ThaiWater API — ประเมินย้อนหลังจากค่าปัจจุบันและแนวโน้ม'
            : 'ThaiWater API (waterlevel_graph)',
        status: waterLevel.length || predictions.length ? (estimatedHistory ? 'estimated' : 'live') : 'error',
        estimatedHistory,
        // ThaiWater exposes a rain snapshot/accumulation here, not an hourly
        // history. The chart bars are therefore an explicit estimate.
        estimatedRainfallTimeline: true,
        rainfallSourceStatus: rainData?.status || 'error',
        isFallback: false,
        stationName: station.name,
        nearestRainStation: nearestRain?.name || null,
        forecastMethod: 'deterministic-trend-and-rain-model',
        forecastInputs: {
            water: 'ThaiWater current level and trend',
            rainfall: nearestRain ? `ThaiWater station: ${nearestRain.name}` : null,
        },
    }
    setCache(timeseriesCacheKey, result)
    return result
}
