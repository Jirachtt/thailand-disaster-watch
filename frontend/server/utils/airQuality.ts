/**
 * Air quality data and 24-hour forecast for Thailand.
 *
 * Open-Meteo's Air Quality API is used as the primary source because it does
 * not require a browser-side API key and returns current PM2.5/PM10 together
 * with a CAMS forecast. Only upstream observations (or a stale response that
 * was previously obtained from upstream) are ever returned.
 */

const AQI_CACHE: Record<string, { data: any, ts: number }> = {}
const AQI_CACHE_TTL = 10 * 60 * 1000
const AQI_STALE_CACHE_TTL = 6 * 60 * 60 * 1000

const THAI_AQI_CITIES = [
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

export async function fetchAirQualityData() {
    const cacheKey = 'aqi-thailand'
    const cached = AQI_CACHE[cacheKey]
    if (cached && Date.now() - cached.ts < AQI_CACHE_TTL) return cached.data

    const latitudes = THAI_AQI_CITIES.map(city => city.lat).join(',')
    const longitudes = THAI_AQI_CITIES.map(city => city.lng).join(',')
    const url = 'https://air-quality-api.open-meteo.com/v1/air-quality'
        + `?latitude=${latitudes}&longitude=${longitudes}`
        + '&current=pm2_5,pm10,us_aqi'
        + '&hourly=pm2_5,pm10,us_aqi'
        + '&forecast_hours=24&timezone=Asia%2FBangkok'

    try {
        const response: any = await $fetch(url, { timeout: 6000, retry: 0 })
        const locations = Array.isArray(response) ? response : [response]

        const stations = THAI_AQI_CITIES.map((city, index) => {
            const location = locations[index]
            if (!location?.current) return null

            const times: string[] = location.hourly?.time || []
            const forecast = times.flatMap((time, forecastIndex) => {
                    if (forecastIndex % 3 !== 0) return []
                    const rawAqi = toFiniteNumber(location.hourly?.us_aqi?.[forecastIndex])
                    const rawPm25 = toFiniteNumber(location.hourly?.pm2_5?.[forecastIndex])
                    const rawPm10 = toFiniteNumber(location.hourly?.pm10?.[forecastIndex])
                    if (rawAqi === null || rawPm25 === null || rawPm10 === null) return []
                    const aqi = round(rawAqi, 0)
                    return [{
                        time,
                        aqi,
                        pm25: round(rawPm25),
                        pm10: round(rawPm10),
                        ...getAqiLevel(aqi),
                    }]
                })

            const rawAqi = toFiniteNumber(location.current.us_aqi)
            const rawPm25 = toFiniteNumber(location.current.pm2_5)
            const rawPm10 = toFiniteNumber(location.current.pm10)
            if (rawAqi === null || rawPm25 === null || rawPm10 === null) return null

            const responseLat = toFiniteNumber(location.latitude)
            const responseLng = toFiniteNumber(location.longitude)
            const aqi = round(rawAqi, 0)
            return {
                ...city,
                lat: responseLat === null ? city.lat : round(responseLat, 4),
                lng: responseLng === null ? city.lng : round(responseLng, 4),
                aqi,
                pm25: round(rawPm25),
                pm10: round(rawPm10),
                dominantPol: 'pm2_5',
                time: location.current.time,
                forecast,
                ...getAqiLevel(aqi),
            }
        }).filter(Boolean)

        if (!stations.length) throw new Error('Air quality response did not contain any stations')

        const result = {
            timestamp: new Date().toISOString(),
            source: 'Open-Meteo Air Quality (CAMS)',
            sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
            dataDelay: 'แบบจำลองคุณภาพอากาศ อัปเดตวันละ 2 ครั้ง',
            status: 'live',
            isFallback: false,
            totalStations: stations.length,
            stations,
        }

        AQI_CACHE[cacheKey] = { data: result, ts: Date.now() }
        return result
    } catch (error: any) {
        console.error('[Air quality] API error:', error?.message || error)

        if (cached?.data && Date.now() - cached.ts < AQI_STALE_CACHE_TTL) {
            return {
                ...cached.data,
                status: 'stale',
                isFallback: false,
                dataDelay: 'ใช้ข้อมูลล่าสุดที่บันทึกไว้ เนื่องจากแหล่งข้อมูลตอบสนองช้า',
            }
        }

        return {
            timestamp: new Date().toISOString(),
            source: 'Open-Meteo Air Quality (CAMS)',
            sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
            dataDelay: 'เชื่อมต่อ Open-Meteo Air Quality ไม่สำเร็จ',
            status: 'error',
            isFallback: false,
            totalStations: 0,
            stations: [],
        }
    }
}
