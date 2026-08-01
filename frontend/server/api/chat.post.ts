import { fetchAirQualityData } from '../utils/airQuality'
import { fetchRealFireData, fetchRealRainData, fetchRealWaterData } from '../utils/realTimeData'

type DataKey = 'fire' | 'water' | 'rain' | 'air'
type ChatIntent = DataKey | 'evacuation' | 'summary' | 'safety' | 'help'

const DATA_TIMEOUT_MS = 7500

const fetchers: Record<DataKey, () => Promise<any>> = {
    fire: fetchRealFireData,
    water: fetchRealWaterData,
    rain: fetchRealRainData,
    air: fetchAirQualityData,
}

const defaultSourceNames: Record<DataKey, string> = {
    fire: 'NASA FIRMS',
    water: 'ThaiWater',
    rain: 'ThaiWater',
    air: 'AQICN (สถานีตรวจวัด) + Open-Meteo CAMS (พยากรณ์)',
}

function detectIntent(message: string): ChatIntent {
    if (message.includes('อพยพ') || message.includes('หนี') || message.includes('evacuat')) return 'evacuation'
    if (message.includes('ปลอดภัย') || message.includes('safe')) return 'safety'
    if (message.includes('ไฟ') || message.includes('fire') || message.includes('hotspot') || message.includes('จุดความร้อน')) return 'fire'
    if (message.includes('aqi') || message.includes('pm2.5') || message.includes('pm25') || message.includes('ฝุ่น') || message.includes('อากาศ') || message.includes('ควัน') || message.includes('หมอก')) return 'air'
    if (message.includes('น้ำ') || message.includes('ท่วม') || message.includes('flood') || message.includes('water')) return 'water'
    if (message.includes('ฝน') || message.includes('rain')) return 'rain'
    if (message.includes('สรุป') || message.includes('ตอนนี้') || message.includes('สถานการณ์') || message.includes('summary') || message.includes('เป็นยังไง')) return 'summary'
    return 'help'
}

function requestedSources(intent: ChatIntent): DataKey[] {
    if (['fire', 'water', 'rain', 'air'].includes(intent)) return [intent as DataKey]
    if (intent === 'summary' || intent === 'safety') return ['fire', 'water', 'rain', 'air']
    return []
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Data source timed out')), timeoutMs)
    })

    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer)
    })
}

async function fetchRequestedData(keys: DataKey[]) {
    const datasets: Partial<Record<DataKey, any>> = {}
    const settled = await Promise.allSettled(keys.map(async (key) => ({
        key,
        data: await withTimeout(fetchers[key](), DATA_TIMEOUT_MS),
    })))

    for (const result of settled) {
        if (result.status === 'fulfilled') datasets[result.value.key] = result.value.data
    }

    return datasets
}

function dataStatus(data: any): 'live' | 'stale' | 'error' {
    if (!data) return 'error'
    if (data.status === 'error' || data.status === 'fallback' || data.isFallback) return 'error'
    if (data.status === 'stale') return 'stale'
    return 'live'
}

function statusLabel(data: any): string {
    return {
        live: 'เชื่อมต่อข้อมูลแล้ว',
        stale: 'ข้อมูลล่าสุดที่บันทึกไว้',
        error: 'เชื่อมต่อไม่ได้ชั่วคราว',
    }[dataStatus(data)]
}

function sourceNote(key: DataKey, data: any): string {
    if (!data) return `แหล่งข้อมูล: ${defaultSourceNames[key]} — สถานะ: ${statusLabel(data)}`
    const delay = data.dataDelay ? `\nหมายเหตุ: ${data.dataDelay}` : ''
    return `แหล่งข้อมูล: ${data.source || defaultSourceNames[key]} — สถานะ: ${statusLabel(data)}${delay}`
}

function formatNumber(value: unknown, digits = 1): string {
    if (value === null || value === undefined || value === '') return 'ไม่มีข้อมูล'
    const number = Number(value)
    return Number.isFinite(number) ? number.toFixed(digits) : 'ไม่มีข้อมูล'
}

function fireRiskLabel(risk: string): string {
    return {
        extreme: 'รุนแรงมาก',
        high: 'รุนแรง',
        medium: 'ปานกลาง',
        low: 'ต่ำ',
    }[risk] || 'รอตรวจสอบ'
}

function waterRiskLabel(risk: string): string {
    return {
        danger: 'วิกฤต',
        warning: 'เฝ้าระวัง',
        safe: 'ปกติ',
    }[risk] || 'รอตรวจสอบ'
}

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const userMessage = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!userMessage) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Message is required',
        })
    }

    const intent = detectIntent(userMessage.toLowerCase())

    if (intent === 'evacuation') {
        return {
            response: [
                'คำแนะนำการอพยพ',
                '',
                'ระบบนี้ยังไม่มีข้อมูลศูนย์พักพิงที่ผ่านการยืนยันแบบเรียลไทม์ จึงไม่ควรระบุจุดหมายให้เดินทางไปเอง',
                'หากอยู่ในอันตราย ให้เคลื่อนออกจากแนวไฟ พื้นที่น้ำไหลแรง หรืออาคารที่ไม่มั่นคงตามคำสั่งของเจ้าหน้าที่',
                'ติดตามประกาศจาก ปภ. จังหวัด เทศบาล หรือหน่วยกู้ภัยในพื้นที่ และใช้หมายเลขฉุกเฉินของพื้นที่เมื่อจำเป็น',
                'เตรียมยา เอกสารสำคัญ โทรศัพท์ น้ำดื่ม และแจ้งคนใกล้ชิดก่อนเคลื่อนย้าย',
            ].join('\n'),
        }
    }

    if (intent === 'help') {
        return {
            response: [
                'ผมช่วยสรุปข้อมูลบนแดชบอร์ดนี้ได้ในหัวข้อต่อไปนี้',
                '',
                '• จุดความร้อนและแนวโน้มไฟป่าในประเทศไทย',
                '• ระดับน้ำและสถานการณ์จากสถานี ThaiWater',
                '• ปริมาณฝนและแนวเคลื่อนตัวโดยประมาณ',
                '• AQI และ PM2.5 พร้อมพยากรณ์',
                '• สรุปสถานะของทุกแหล่งข้อมูล',
                '',
                'ลองถาม เช่น “สรุปสถานการณ์” หรือ “AQI ตอนนี้เป็นอย่างไร”',
            ].join('\n'),
        }
    }

    const datasets = await fetchRequestedData(requestedSources(intent))
    const fireData = datasets.fire
    const waterData = datasets.water
    const rainData = datasets.rain
    const aqiData = datasets.air

    if (intent === 'fire') {
        if (!fireData || dataStatus(fireData) === 'error') {
            return { response: `ยังดึงข้อมูลจุดความร้อนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n\n${sourceNote('fire', fireData)}` }
        }

        const thaiFires = fireData.fires || []
        const thaiFireCount = Number(fireData.activeCount) || 0
        const topFires = thaiFires.slice(0, 5)
        const fireList = topFires.map((fire: any, index: number) =>
            `${index + 1}. ${fire.name} — ระดับ ${fireRiskLabel(fire.intensity)}, FRP ${formatNumber(fire.frp)} MW, พื้นที่ประมาณการ ${formatNumber(fire.areaSqKm, 2)} ตร.กม.`
        ).join('\n')
        const qualifier = statusLabel(fireData)

        let response = `สถานการณ์จุดความร้อนในประเทศไทย (${qualifier})\n\n`
        response += thaiFireCount > 0
            ? `พบ ${thaiFireCount} กลุ่มจากจุดตรวจจับ FIRMS ล่าสุด\nระดับความเสี่ยงรวม: ${fireRiskLabel(fireData.overallFireRisk)}\n\nจุดสำคัญ:\n${fireList}`
            : 'ไม่พบจุดความร้อนในชุดข้อมูล FIRMS สำหรับประเทศไทยล่าสุด'

        const peak = topFires[0]?.peakEstimate
        if (peak) response += `\n\nแนวโน้ม 12 ชม.: พื้นที่ประมาณการ ${formatNumber(peak.areaSqKm, 2)} ตร.กม. รัศมี ${formatNumber(peak.radiusKm, 2)} กม.`
        response += `\n\n${sourceNote('fire', fireData)}`
        return { response }
    }

    if (intent === 'water') {
        if (!waterData || dataStatus(waterData) === 'error') {
            return { response: `ยังดึงข้อมูลระดับน้ำไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n\n${sourceNote('water', waterData)}` }
        }

        const stations = waterData.stations || []
        const criticalStations = stations.filter((station: any) => station.riskLevel === 'danger')
        const warningStations = stations.filter((station: any) => station.riskLevel === 'warning')
        const notableStations = [...criticalStations, ...warningStations].slice(0, 6)
        const stationList = notableStations.map((station: any, index: number) =>
            `${index + 1}. ${station.name} — ${station.situationLabel || waterRiskLabel(station.riskLevel)}, ระดับ ${formatNumber(station.currentLevel, 2)} ม.`
        ).join('\n')
        const qualifier = statusLabel(waterData)

        let response = `สถานการณ์ระดับน้ำ (${qualifier})\n\n`
        response += `สถานีในชุดข้อมูล: ${stations.length} แห่ง\nระดับความเสี่ยงรวม: ${waterRiskLabel(waterData.overallRisk)}\nสถานีวิกฤต: ${criticalStations.length} แห่ง\nสถานีเฝ้าระวัง: ${warningStations.length} แห่ง`
        if (stationList) response += `\n\nสถานีที่ควรติดตาม:\n${stationList}`
        response += `\n\n${sourceNote('water', waterData)}`
        return { response }
    }

    if (intent === 'rain') {
        if (!rainData || dataStatus(rainData) === 'error') {
            return { response: `ยังดึงข้อมูลฝนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n\n${sourceNote('rain', rainData)}` }
        }

        const rainStations = rainData.rainStations || []
        const heavyStations = rainStations.filter((station: any) => ['extreme', 'heavy'].includes(station.intensity))
        const rainList = rainStations.slice(0, 5).map((station: any, index: number) =>
            `${index + 1}. ${station.name}${station.province ? ` (${station.province})` : ''} — ${formatNumber(station.rain24h)} มม. ใน 24 ชม.`
        ).join('\n')
        const qualifier = statusLabel(rainData)

        let response = `สถานการณ์ฝน (${qualifier})\n\nสถานีที่ผ่านเกณฑ์ฝน: ${rainStations.length} แห่ง\nฝนหนักถึงหนักมาก: ${heavyStations.length} แห่ง`
        if (rainList) response += `\n\nสถานีฝนสะสมสูงสุด:\n${rainList}`
        response += `\n\n${sourceNote('rain', rainData)}`
        return { response }
    }

    if (intent === 'air') {
        if (!aqiData || dataStatus(aqiData) === 'error') {
            return { response: `ยังดึงข้อมูลคุณภาพอากาศไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n\n${sourceNote('air', aqiData)}` }
        }

        const stations = aqiData.stations || []
        const sortedStations = [...stations].sort((a: any, b: any) => Number(b.aqi) - Number(a.aqi))
        const worstAqi = sortedStations[0]
        const aqiList = sortedStations.slice(0, 8).map((station: any, index: number) =>
            `${index + 1}. ${station.name} — AQI ${formatNumber(station.aqi, 0)} (${station.label}), PM2.5 AQI ${formatNumber(station.pm25Aqi, 0)} · สถานี ${station.stationName || 'AQICN'}`
        ).join('\n')
        const qualifier = statusLabel(aqiData)

        let response = `คุณภาพอากาศจากสถานีตรวจวัด AQICN (${qualifier})\n\nพื้นที่ในชุดข้อมูล: ${stations.length} แห่ง`
        if (worstAqi) response += `\nค่าสูงสุด: ${worstAqi.name} — AQI ${formatNumber(worstAqi.aqi, 0)} (${worstAqi.label})`
        if (aqiList) response += `\n\nข้อมูลรายพื้นที่:\n${aqiList}\n\nพยากรณ์ 24 ชั่วโมงใช้แบบจำลอง Open-Meteo CAMS แยกจากค่าตรวจวัดปัจจุบัน`
        response += `\n\n${sourceNote('air', aqiData)}`
        return { response }
    }

    const summaryLines: string[] = ['สรุปสถานะจากแหล่งข้อมูลที่เชื่อมต่อได้', '']

    if (fireData && dataStatus(fireData) !== 'error') {
        summaryLines.push(`• จุดความร้อนในไทย: ${Number(fireData.activeCount) || 0} กลุ่ม — ${statusLabel(fireData)}`)
    } else {
        summaryLines.push('• จุดความร้อน: เชื่อมต่อไม่ได้ชั่วคราว')
    }

    if (waterData && dataStatus(waterData) !== 'error') {
        const stations = waterData.stations || []
        summaryLines.push(`• ระดับน้ำ: ${waterRiskLabel(waterData.overallRisk)} (${stations.length} สถานี) — ${statusLabel(waterData)}`)
    } else {
        summaryLines.push('• ระดับน้ำ: เชื่อมต่อไม่ได้ชั่วคราว')
    }

    if (rainData && dataStatus(rainData) !== 'error') {
        const stations = rainData.rainStations || []
        const heavyCount = stations.filter((station: any) => ['extreme', 'heavy'].includes(station.intensity)).length
        summaryLines.push(`• ฝน: ${stations.length} สถานีผ่านเกณฑ์ (หนัก ${heavyCount}) — ${statusLabel(rainData)}`)
    } else {
        summaryLines.push('• ฝน: เชื่อมต่อไม่ได้ชั่วคราว')
    }

    if (aqiData && dataStatus(aqiData) !== 'error') {
        const stations = aqiData.stations || []
        const worstAqi = stations.length
            ? stations.reduce((worst: any, station: any) => Number(station.aqi) > Number(worst.aqi) ? station : worst, stations[0])
            : null
        summaryLines.push(`• คุณภาพอากาศ: ${worstAqi ? `${worstAqi.name} AQI ${formatNumber(worstAqi.aqi, 0)}` : 'ไม่มีข้อมูลรายพื้นที่'} — ${statusLabel(aqiData)}`)
    } else {
        summaryLines.push('• คุณภาพอากาศ: เชื่อมต่อไม่ได้ชั่วคราว')
    }

    if (intent === 'safety') {
        summaryLines.unshift('ระบบนี้ไม่สามารถยืนยันว่าแต่ละพิกัด “ปลอดภัย” ได้ โปรดตรวจประกาศจากหน่วยงานท้องถิ่นก่อนตัดสินใจเดินทาง', '')
    }

    summaryLines.push('', 'ระบบแสดงเฉพาะข้อมูลจาก API ที่เชื่อมต่อได้โดยไม่สร้างเหตุการณ์ทดแทน และผลพยากรณ์ไม่ใช่คำสั่งอพยพ')
    return { response: summaryLines.join('\n') }
})
