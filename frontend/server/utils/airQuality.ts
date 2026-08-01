/**
 * Thailand air-quality measurements and forecast.
 *
 * Current AQI values come from real AQICN monitoring stations. The 24-hour
 * forecast comes from the Open-Meteo Air Quality API (CAMS). AQICN responses
 * are deliberately not persisted or served from a stale cache. CAMS model
 * output may use a short-lived/stale in-memory cache and is labelled as model
 * data throughout the response.
 */

type City = {
    id: string
    name: string
    nameEn: string
    lat: number
    lng: number
}

type ForecastPoint = {
    time: string
    aqi: number
    pm25: number
    pm10: number
    level: string
    label: string
    labelEn: string
    color: string
}

type CamsForecastResult = {
    status: 'live' | 'stale' | 'error'
    forecasts: Record<string, ForecastPoint[]>
    timestamp: string
}

const CAMS_CACHE: Record<string, { data: CamsForecastResult, ts: number }> = {}
const CAMS_CACHE_TTL = 10 * 60 * 1000
const CAMS_STALE_CACHE_TTL = 6 * 60 * 60 * 1000
const AQICN_MAX_STATION_DISTANCE_KM = 75
const AQICN_MAX_MEASUREMENT_AGE_MS = 6 * 60 * 60 * 1000
let aqicnRequestInFlight: Promise<any[]> | null = null
let camsRequestInFlight: Promise<CamsForecastResult> | null = null

const THAI_AQI_CITIES: City[] = [
    { id: 'aqi-chiang-mai', name: 'เชียงใหม่', nameEn: 'Chiang Mai', lat: 18.7883, lng: 98.9853 },
    { id: 'aqi-chiang-rai', name: 'เชียงราย', nameEn: 'Chiang Rai', lat: 19.9105, lng: 99.8406 },
    { id: 'aqi-lampang', name: 'ลำปาง', nameEn: 'Lampang', lat: 18.2888, lng: 99.4909 },
    { id: 'aqi-mae-hong-son', name: 'แม่ฮ่องสอน', nameEn: 'Mae Hong Son', lat: 19.3020, lng: 97.9654 },
    { id: 'aqi-bangkok', name: 'กรุงเทพฯ', nameEn: 'Bangkok', lat: 13.7563, lng: 100.5018 },
    { id: 'aqi-khon-kaen', name: 'ขอนแก่น', nameEn: 'Khon Kaen', lat: 16.4419, lng: 102.8359 },
    { id: 'aqi-korat', name: 'นครราชสีมา', nameEn: 'Nakhon Ratchasima', lat: 14.9799, lng: 102.0978 },
    { id: 'aqi-phuket', name: 'ภูเก็ต', nameEn: 'Phuket', lat: 7.8804, lng: 98.3923 },
]

function round(value: number, digits = 1): number {
    const multiplier = 10 ** digits
    return Math.round(value * multiplier) / multiplier
}

function toFiniteNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function getAqiLevel(aqi: number) {
    if (aqi <= 50) return { level: 'good', label: 'ดี', labelEn: 'Good', color: '#16a34a' }
    if (aqi <= 100) return { level: 'moderate', label: 'ปานกลาง', labelEn: 'Moderate', color: '#ca8a04' }
    if (aqi <= 150) return { level: 'unhealthy-sensitive', label: 'กระทบกลุ่มเสี่ยง', labelEn: 'Unhealthy for sensitive groups', color: '#ea580c' }
    if (aqi <= 200) return { level: 'unhealthy', label: 'กระทบสุขภาพ', labelEn: 'Unhealthy', color: '#dc2626' }
    if (aqi <= 300) return { level: 'very-unhealthy', label: 'อันตราย', labelEn: 'Very unhealthy', color: '#9333ea' }
    return { level: 'hazardous', label: 'อันตรายมาก', labelEn: 'Hazardous', color: '#7f1d1d' }
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const radians = Math.PI / 180
    const deltaLat = (lat2 - lat1) * radians
    const deltaLng = (lng2 - lng1) * radians
    const a = Math.sin(deltaLat / 2) ** 2
        + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(deltaLng / 2) ** 2
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalizeBangkokTime(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null
    const time = value.trim()
    if (/Z$|[+-]\d{2}:?\d{2}$/.test(time)) return time
    return `${time}+07:00`
}

function isRecentMeasurement(time: string): boolean {
    const timestamp = new Date(time).getTime()
    if (!Number.isFinite(timestamp)) return false
    const age = Date.now() - timestamp
    return age >= -2 * 60 * 60 * 1000 && age <= AQICN_MAX_MEASUREMENT_AGE_MS
}

async function requestAqicnStation(city: City, token: string) {
    try {
        const response: any = await $fetch(
            `https://api.waqi.info/feed/geo:${city.lat};${city.lng}/`,
            {
                query: { token },
                timeout: 5000,
                retry: 0,
            },
        )

        if (response?.status !== 'ok' || !response?.data) return null

        const data = response.data
        const aqi = toFiniteNumber(data.aqi)
        const stationLat = toFiniteNumber(data.city?.geo?.[0])
        const stationLng = toFiniteNumber(data.city?.geo?.[1])
        const time = normalizeBangkokTime(data.time?.iso || data.time?.s)
        if (aqi === null || stationLat === null || stationLng === null || !time || !isRecentMeasurement(time)) return null

        const stationDistanceKm = distanceKm(city.lat, city.lng, stationLat, stationLng)
        if (stationDistanceKm > AQICN_MAX_STATION_DISTANCE_KM) return null

        const pm25Aqi = toFiniteNumber(data.iaqi?.pm25?.v)
        const pm10Aqi = toFiniteNumber(data.iaqi?.pm10?.v)
        const stationName = typeof data.city?.name === 'string' && data.city.name.trim()
            ? data.city.name.trim()
            : city.nameEn
        const sourceUrl = typeof data.city?.url === 'string' && data.city.url.startsWith('http')
            ? data.city.url
            : 'https://aqicn.org/'
        const attributions = Array.isArray(data.attributions)
            ? data.attributions.flatMap((item: any) => {
                if (!item || typeof item.name !== 'string') return []
                return [{
                    name: item.name,
                    url: typeof item.url === 'string' && item.url.startsWith('http') ? item.url : null,
                }]
            })
            : []

        return {
            ...city,
            lat: round(stationLat, 5),
            lng: round(stationLng, 5),
            stationId: toFiniteNumber(data.idx),
            stationName,
            stationDistanceKm: round(stationDistanceKm),
            aqi: round(aqi, 0),
            pm25Aqi: pm25Aqi === null ? null : round(pm25Aqi, 0),
            pm10Aqi: pm10Aqi === null ? null : round(pm10Aqi, 0),
            dominantPol: typeof data.dominentpol === 'string' ? data.dominentpol : null,
            time,
            measurementSource: 'AQICN',
            measurementType: 'station',
            sourceUrl,
            attributions,
            ...getAqiLevel(round(aqi, 0)),
        }
    } catch {
        // Never log an error object here: request errors can include the token URL.
        console.warn(`[Air quality] AQICN station unavailable: ${city.nameEn}`)
        return null
    }
}

async function fetchAqicnStations(token: string) {
    if (aqicnRequestInFlight) return aqicnRequestInFlight

    const request = Promise.all(THAI_AQI_CITIES.map(city => requestAqicnStation(city, token)))
        .then(stations => stations.filter(Boolean))
    aqicnRequestInFlight = request

    try {
        return await request
    } finally {
        if (aqicnRequestInFlight === request) aqicnRequestInFlight = null
    }
}

async function requestCamsForecast(): Promise<CamsForecastResult> {
    const cacheKey = 'cams-thailand-24h'
    const cached = CAMS_CACHE[cacheKey]
    if (cached && Date.now() - cached.ts < CAMS_CACHE_TTL) return cached.data

    const latitudes = THAI_AQI_CITIES.map(city => city.lat).join(',')
    const longitudes = THAI_AQI_CITIES.map(city => city.lng).join(',')
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
        + `?latitude=${latitudes}&longitude=${longitudes}`
        + '&hourly=pm2_5,pm10,us_aqi'
        + '&forecast_hours=24&timezone=Asia%2FBangkok'

    try {
        const response: any = await $fetch(url, { timeout: 6000, retry: 0 })
        const locations = Array.isArray(response) ? response : [response]
        const forecasts: Record<string, ForecastPoint[]> = {}

        THAI_AQI_CITIES.forEach((city, index) => {
            const location = locations[index]
            const times: string[] = location?.hourly?.time || []
            forecasts[city.id] = times.flatMap((rawTime, forecastIndex) => {
                if (forecastIndex % 3 !== 0) return []
                const rawAqi = toFiniteNumber(location.hourly?.us_aqi?.[forecastIndex])
                const rawPm25 = toFiniteNumber(location.hourly?.pm2_5?.[forecastIndex])
                const rawPm10 = toFiniteNumber(location.hourly?.pm10?.[forecastIndex])
                const time = normalizeBangkokTime(rawTime)
                if (rawAqi === null || rawPm25 === null || rawPm10 === null || !time) return []
                const aqi = round(rawAqi, 0)
                return [{
                    time,
                    aqi,
                    pm25: round(rawPm25),
                    pm10: round(rawPm10),
                    ...getAqiLevel(aqi),
                }]
            })
        })

        if (!Object.values(forecasts).some(points => points.length)) {
            throw new Error('CAMS response did not contain a forecast')
        }

        const result: CamsForecastResult = {
            status: 'live',
            forecasts,
            timestamp: new Date().toISOString(),
        }
        CAMS_CACHE[cacheKey] = { data: result, ts: Date.now() }
        return result
    } catch {
        console.warn('[Air quality] Open-Meteo CAMS forecast unavailable')
        if (cached?.data && Date.now() - cached.ts < CAMS_STALE_CACHE_TTL) {
            return { ...cached.data, status: 'stale' }
        }
        return { status: 'error', forecasts: {}, timestamp: new Date().toISOString() }
    }
}

async function fetchCamsForecast() {
    if (camsRequestInFlight) return camsRequestInFlight
    const request = requestCamsForecast()
    camsRequestInFlight = request
    try {
        return await request
    } finally {
        if (camsRequestInFlight === request) camsRequestInFlight = null
    }
}

function unavailableResult(message: string, forecastStatus: CamsForecastResult['status'] = 'error') {
    return {
        timestamp: new Date().toISOString(),
        source: 'AQICN (สถานีตรวจวัด) + Open-Meteo CAMS (พยากรณ์)',
        sourceUrl: 'https://aqicn.org/api/',
        measurementSource: 'AQICN',
        measurementSourceUrl: 'https://aqicn.org/api/',
        forecastSource: 'Open-Meteo Air Quality (CAMS)',
        forecastSourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
        measurementStatus: 'error',
        forecastStatus,
        dataDelay: message,
        status: 'error',
        isFallback: false,
        totalStations: 0,
        stations: [],
    }
}

export async function fetchAirQualityData() {
    const config = useRuntimeConfig()
    const token = typeof config.aqicnApiToken === 'string' ? config.aqicnApiToken.trim() : ''
    if (!token) return unavailableResult('ยังไม่ได้ตั้งค่า AQICN_API_TOKEN บนเซิร์ฟเวอร์ จึงไม่สร้างข้อมูลทดแทน')

    const [stationsResult, camsResult] = await Promise.allSettled([
        fetchAqicnStations(token),
        fetchCamsForecast(),
    ])

    const measuredStations = stationsResult.status === 'fulfilled' ? stationsResult.value : []
    const cams = camsResult.status === 'fulfilled'
        ? camsResult.value
        : { status: 'error' as const, forecasts: {}, timestamp: new Date().toISOString() }

    if (!measuredStations.length) {
        return unavailableResult('เชื่อมต่อสถานีตรวจวัด AQICN ไม่สำเร็จ ระบบไม่ใช้ค่าจำลองแทนค่าตรวจวัด', cams.status)
    }

    const stations = measuredStations.map(station => ({
        ...station,
        forecast: cams.forecasts[station.id] || [],
        forecastSource: 'Open-Meteo Air Quality (CAMS)',
        forecastType: 'model',
    }))
    const measuredCount = stations.length
    const coverageMessage = measuredCount === THAI_AQI_CITIES.length
        ? `ตรวจวัดจริง ${measuredCount} สถานีจาก AQICN`
        : `ตรวจวัดจริง ${measuredCount}/${THAI_AQI_CITIES.length} สถานีจาก AQICN`
    const forecastMessage = cams.status === 'live'
        ? 'พยากรณ์ 24 ชม. จากแบบจำลอง CAMS'
        : cams.status === 'stale'
            ? 'พยากรณ์ CAMS ล่าสุดที่บันทึกไว้'
            : 'พยากรณ์ CAMS ใช้งานไม่ได้ชั่วคราว'

    return {
        timestamp: new Date().toISOString(),
        source: 'AQICN ตรวจวัดจริง · Open-Meteo CAMS พยากรณ์',
        sourceUrl: 'https://aqicn.org/api/',
        measurementSource: 'AQICN',
        measurementSourceUrl: 'https://aqicn.org/api/',
        forecastSource: 'Open-Meteo Air Quality (CAMS)',
        forecastSourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
        measurementStatus: measuredCount === THAI_AQI_CITIES.length ? 'live' : 'partial',
        forecastStatus: cams.status,
        dataDelay: `${coverageMessage} · ${forecastMessage}`,
        status: 'live',
        isFallback: false,
        totalStations: measuredCount,
        stations,
    }
}
