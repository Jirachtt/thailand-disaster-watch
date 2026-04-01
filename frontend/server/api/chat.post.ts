import { fetchRealFireData, fetchRealWaterData, fetchRealRainData } from '../utils/realTimeData'
import { fetchAirQualityData } from '../utils/airQuality'

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const userMessage = body?.message

    if (!userMessage) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Message is required',
        })
    }

    // Fetch all real-time data from cached sources (fast — 5-min TTL cache)
    const [fireData, waterData, rainData, aqiData] = await Promise.all([
        fetchRealFireData().catch(() => null),
        fetchRealWaterData().catch(() => null),
        fetchRealRainData().catch(() => null),
        fetchAirQualityData().catch(() => null),
    ])

    // Extract real-time stats
    const thaiFires = fireData?.fires || []
    const worldFires = fireData?.worldFires || []
    const thaiFireCount = fireData?.activeCount || 0
    const worldFireCount = fireData?.worldCount || 0
    const overallFireRisk = fireData?.overallFireRisk || 'low'

    const waterStations = waterData?.stations || []
    const overallWaterRisk = waterData?.overallRisk || 'safe'
    const dangerStations = waterStations.filter((s: any) => s.riskLevel === 'danger')
    const warningStations = waterStations.filter((s: any) => s.riskLevel === 'warning' || s.riskLevel === 'critical')

    const rainStations = rainData?.rainStations || []
    const totalRainStations = rainData?.totalStations || 0
    const heavyRainStations = rainStations.filter((s: any) => s.intensity === 'extreme' || s.intensity === 'heavy')

    const aqiStations = aqiData?.stations || []
    const worstAqi = aqiStations.length > 0
        ? aqiStations.reduce((w: any, s: any) => (s.aqi > w.aqi ? s : w), aqiStations[0])
        : null

    const msgLower = userMessage.toLowerCase()

    let response = ''

    // === Fire-related questions ===
    if (msgLower.includes('ไฟ') || msgLower.includes('fire') || msgLower.includes('hotspot') || msgLower.includes('จุดความร้อน')) {
        const topFires = thaiFires.slice(0, 5)
        const fireList = topFires.map((f: any, i: number) =>
            `${i + 1}. ${f.name} — ความรุนแรง: ${f.intensity === 'extreme' ? 'รุนแรงมาก' : f.intensity === 'high' ? 'รุนแรง' : f.intensity === 'medium' ? 'ปานกลาง' : 'เบา'}, FRP: ${f.frp} MW, พื้นที่: ${f.areaSqKm} ตร.กม.`
        ).join('\n')

        const spreadInfo = topFires.length > 0 && topFires[0].peakEstimate
            ? `\n\n📊 คาดการณ์ลุกลาม 12 ชม.: จุดไฟรุนแรงสุดอาจขยายเป็น ${topFires[0].peakEstimate.areaSqKm} ตร.กม. (รัศมี ${topFires[0].peakEstimate.radiusKm} กม.)`
            : ''

        if (thaiFireCount === 0) {
            response = `🔥 **สถานการณ์ไฟป่าในประเทศไทย (Real-time):**\n\nขณะนี้ไม่พบจุดความร้อนในประเทศไทยจากดาวเทียม NASA FIRMS\n\n🌍 ทั่วโลก: ตรวจพบ ${worldFireCount} กลุ่มจุดไฟ\n\nแหล่งข้อมูล: ${fireData?.source || 'NASA FIRMS'}`
        } else {
            response = `🔥 **สถานการณ์ไฟป่าในประเทศไทย (Real-time):**\n\n• จุดไฟในไทย: **${thaiFireCount} จุด**\n• ทั่วโลก: **${worldFireCount} กลุ่ม**\n• ระดับความเสี่ยง: **${overallFireRisk === 'extreme' ? '🔴 รุนแรงมาก' : overallFireRisk === 'high' ? '🟠 รุนแรง' : overallFireRisk === 'medium' ? '🟡 ปานกลาง' : '🟢 ปกติ'}**\n\n📍 จุดไฟที่รุนแรงที่สุด:\n${fireList || 'ไม่มีข้อมูล'}${spreadInfo}\n\nแหล่งข้อมูล: ${fireData?.source || 'NASA FIRMS'} (${fireData?.dataDelay || 'NRT'})`
        }

        // === Water level / flood questions ===
    } else if (msgLower.includes('น้ำ') || msgLower.includes('ท่วม') || msgLower.includes('flood') || msgLower.includes('water') || msgLower.includes('ระดับ')) {
        const topDanger = dangerStations.slice(0, 3).map((s: any, i: number) =>
            `${i + 1}. ${s.name} — ระดับ: ${s.currentLevel.toFixed(2)} m (${s.description})`
        ).join('\n')

        const topWarning = warningStations.slice(0, 3).map((s: any, i: number) =>
            `${i + 1}. ${s.name} — ระดับ: ${s.currentLevel.toFixed(2)} m`
        ).join('\n')

        const riskLabel = overallWaterRisk === 'danger' ? '🔴 วิกฤต' : overallWaterRisk === 'warning' ? '🟡 เฝ้าระวัง' : '🟢 ปกติ'

        response = `💧 **สถานการณ์ระดับน้ำ (Real-time):**\n\n• สถานีทั้งหมด: **${waterStations.length} แห่ง**\n• ระดับความเสี่ยงรวม: **${riskLabel}**\n• วิกฤต (ล้นตลิ่ง): ${dangerStations.length} แห่ง\n• เฝ้าระวัง: ${warningStations.length} แห่ง`

        if (topDanger.length > 0) {
            response += `\n\n🚨 สถานีวิกฤต:\n${topDanger}`
        }
        if (topWarning.length > 0) {
            response += `\n\n⚠️ สถานีเฝ้าระวัง:\n${topWarning}`
        }

        response += `\n\nแหล่งข้อมูล: ${waterData?.source || 'ThaiWater API'}`

        // === Rain questions ===
    } else if (msgLower.includes('ฝน') || msgLower.includes('rain') || msgLower.includes('ฝนตก')) {
        const topRain = rainStations.slice(0, 5).map((s: any, i: number) =>
            `${i + 1}. ${s.name} (${s.province}) — ${s.rain24h} mm (${s.intensity === 'extreme' ? 'หนักมาก' : s.intensity === 'heavy' ? 'หนัก' : s.intensity === 'moderate' ? 'ปานกลาง' : 'เบา'})`
        ).join('\n')

        response = `🌧️ **สถานการณ์ฝนตก (Real-time):**\n\n• สถานีที่มีฝนตก: **${totalRainStations} แห่ง**\n• ฝนหนัก-หนักมาก: **${heavyRainStations.length} แห่ง**\n\n📍 สถานีฝนตกหนักสุด:\n${topRain || 'ไม่มีฝนตก'}\n\nแหล่งข้อมูล: ${rainData?.source || 'ThaiWater API'}`

        // === AQI / PM2.5 / Air quality ===
    } else if (msgLower.includes('aqi') || msgLower.includes('pm2.5') || msgLower.includes('pm25') || msgLower.includes('ฝุ่น') || msgLower.includes('อากาศ') || msgLower.includes('ควัน') || msgLower.includes('หมอก')) {
        const aqiList = aqiStations.slice(0, 8).map((s: any, i: number) =>
            `${i + 1}. ${s.name} — AQI: ${s.aqi} (${s.label}), PM2.5: ${s.pm25 || 'N/A'} µg/m³`
        ).join('\n')

        response = `😷 **คุณภาพอากาศ (Real-time):**\n\n• จำนวนสถานี: **${aqiStations.length} แห่ง**`

        if (worstAqi) {
            response += `\n• แย่ที่สุด: **${worstAqi.name} — AQI ${worstAqi.aqi} (${worstAqi.label})**`
        }

        response += `\n\n📍 ข้อมูลรายเมือง:\n${aqiList || 'ไม่มีข้อมูล'}\n\nแหล่งข้อมูล: ${aqiData?.source || 'AQICN'}`

        // === Evacuation ===
    } else if (msgLower.includes('อพยพ') || msgLower.includes('หนี') || msgLower.includes('evacuat')) {
        response = `⚠️ **ข้อแนะนำการอพยพ:**\n\nศูนย์พักพิงใกล้เคียง:\n1. โรงเรียนสนามกีฬาเทศบาลนครเชียงใหม่\n2. ศูนย์ประชุมและแสดงสินค้านานาชาติฯ\n\n📌 สถานการณ์ปัจจุบัน:\n• น้ำ: ${overallWaterRisk === 'danger' ? '🔴 วิกฤต — ควรเตรียมอพยพ' : overallWaterRisk === 'warning' ? '🟡 เฝ้าระวัง' : '🟢 ปกติ'}\n• ไฟป่า: ${thaiFireCount} จุด (${overallFireRisk})\n\n*เตรียมเอกสารสำคัญและยารักษาโรคให้พร้อมครับ*`

        // === General / สรุป / summary ===
    } else if (msgLower.includes('สรุป') || msgLower.includes('ตอนนี้') || msgLower.includes('สถานการณ์') || msgLower.includes('summary') || msgLower.includes('เป็นยังไง')) {
        response = `📊 **สรุปสถานการณ์ภัยพิบัติ (Real-time):**\n\n🔥 ไฟป่าในไทย: **${thaiFireCount} จุด** (ความเสี่ยง: ${overallFireRisk === 'extreme' ? 'รุนแรงมาก' : overallFireRisk === 'high' ? 'รุนแรง' : overallFireRisk === 'medium' ? 'ปานกลาง' : 'ปกติ'})\n💧 ระดับน้ำ: **${overallWaterRisk === 'danger' ? '🔴 วิกฤต' : overallWaterRisk === 'warning' ? '🟡 เฝ้าระวัง' : '🟢 ปกติ'}** (${waterStations.length} สถานี)\n🌧️ ฝนตก: **${totalRainStations} สถานี** (หนัก ${heavyRainStations.length} แห่ง)\n😷 AQI แย่สุด: **${worstAqi ? `${worstAqi.name} AQI ${worstAqi.aqi}` : 'ไม่มีข้อมูล'}**\n🌍 ไฟทั่วโลก: ${worldFireCount} กลุ่ม\n\nข้อมูลจาก: NASA FIRMS, ThaiWater, AQICN (อัปเดตทุก 5 นาที)`

        // === Safety questions (specific area) ===
    } else if (msgLower.includes('ปลอดภัย') || msgLower.includes('safe') || msgLower.includes('เชียงใหม่')) {
        response = `📍 **วิเคราะห์สถานการณ์ปัจจุบัน (Real-time):**\n\n• ไฟป่า: ${thaiFireCount > 0 ? `ตรวจพบ **${thaiFireCount} จุด** ในไทย` : 'ไม่พบจุดความร้อน ✅'}\n• ระดับน้ำ: ${overallWaterRisk === 'danger' ? '🔴 มีสถานีวิกฤต ' + dangerStations.length + ' แห่ง' : overallWaterRisk === 'warning' ? '🟡 เฝ้าระวัง ' + warningStations.length + ' แห่ง' : '🟢 ปกติ'}\n• ฝนตก: ${totalRainStations > 0 ? `${totalRainStations} สถานี (หนัก ${heavyRainStations.length})` : 'ไม่มีฝนตก'}\n• อากาศ: ${worstAqi ? `AQI สูงสุด ${worstAqi.aqi} (${worstAqi.label}) — ${worstAqi.name}` : 'ไม่มีข้อมูล'}${worstAqi && worstAqi.aqi > 100 ? '\n\n⚠️ แนะนำสวมหน้ากาก N95 เมื่ออยู่กลางแจ้ง' : ''}`

        // === Default fallback with data summary ===
    } else {
        response = `เข้าใจแล้วครับ 😊 ผมตอบได้เกี่ยวกับ:\n\n• **ไฟป่า** — จุดความร้อน, ทิศทางลามไฟ (ตอนนี้ ${thaiFireCount} จุดในไทย)\n• **ระดับน้ำ** — สถานีวัดระดับน้ำ, ความเสี่ยงน้ำท่วม\n• **ฝนตก** — สถานีฝน, ปริมาณสะสม\n• **คุณภาพอากาศ** — AQI, PM2.5\n• **สรุปสถานการณ์** — ภาพรวมทั้งหมด\n• **อพยพ** — ศูนย์พักพิง, คำแนะนำ\n\nลองถามเช่น "ไฟป่าตอนนี้กี่จุด?" หรือ "สรุปสถานการณ์" ครับ`
    }

    return {
        response
    }
})
