// Mock data for 3 monitoring stations along Ping River
// Station coordinates and metadata

export const stations = [
    {
        id: 'S001',
        name: 'สถานีแม่แตง',
        nameEn: 'Mae Taeng Station',
        type: 'upstream',
        typeLabel: 'ต้นน้ำ',
        lat: 19.1175,
        lng: 98.9331,
        elevation: 340,
        description: 'พื้นที่รับฝนและมวลน้ำจากภูเขา อ.แม่แตง',
        thresholds: { warning: 3.0, critical: 4.0 },
    },
    {
        id: 'S002',
        name: 'สถานี P.1 สะพานนวรัฐ',
        nameEn: 'P.1 Nawarat Bridge',
        type: 'midstream',
        typeLabel: 'จุดวิกฤตกลางเมือง',
        lat: 18.7883,
        lng: 98.9933,
        elevation: 310,
        description: 'สถานีวัดระดับน้ำ P.1 สะพานนวรัฐ อ.เมืองเชียงใหม่',
        thresholds: { warning: 3.2, critical: 3.7 },
    },
    {
        id: 'S003',
        name: 'สถานีสารภี',
        nameEn: 'Saraphi Station',
        type: 'downstream',
        typeLabel: 'ปลายน้ำ',
        lat: 18.6822,
        lng: 99.0214,
        elevation: 295,
        description: 'พื้นที่ลุ่มต่ำท้ายเมือง อ.สารภี',
        thresholds: { warning: 2.8, critical: 3.5 },
    },
]

// Generate realistic time-series water level data
function generateWaterLevelData(stationId: string, hours = 72) {
    const now = Date.now()
    const data = []

    // Base levels and patterns per station
    const config = {
        S001: { base: 2.1, amplitude: 0.8, noiseScale: 0.15, riseHour: 30 },
        S002: { base: 2.4, amplitude: 1.0, noiseScale: 0.12, riseHour: 36 },
        S003: { base: 1.8, amplitude: 0.7, noiseScale: 0.1, riseHour: 42 },
    }

    const conf = config[stationId as keyof typeof config] || config.S002

    for (let h = hours; h >= 0; h--) {
        const timestamp = now - h * 3600000
        // Simulate a flood event rising pattern peaking ~18 hours ago
        const floodProgress = Math.max(0, 1 - Math.abs(h - conf.riseHour) / 20)
        const floodContribution = floodProgress * conf.amplitude
        // Daily cycle (slight increase in afternoon)
        const dailyCycle = 0.1 * Math.sin(((h % 24) / 24) * Math.PI * 2 - Math.PI / 2)
        // Random noise
        const noise = (Math.random() - 0.5) * conf.noiseScale
        const level = Math.max(0.5, conf.base + floodContribution + dailyCycle + noise)

        data.push({
            timestamp,
            datetime: new Date(timestamp).toISOString(),
            level: Math.round(level * 100) / 100,
        })
    }

    return data
}

// Generate rainfall data
function generateRainfallData(stationId: string, hours = 72) {
    const now = Date.now()
    const data = []

    const rainConfigs = {
        S001: { peakHour: 40, maxRain: 45, duration: 16 },
        S002: { peakHour: 35, maxRain: 30, duration: 12 },
        S003: { peakHour: 30, maxRain: 20, duration: 10 },
    }

    const conf = rainConfigs[stationId as keyof typeof rainConfigs] || rainConfigs.S002
    let accumulated = 0

    for (let h = hours; h >= 0; h--) {
        const timestamp = now - h * 3600000
        const distFromPeak = Math.abs(h - conf.peakHour)
        let rainAmount = 0

        if (distFromPeak < conf.duration) {
            const intensity = Math.max(0, 1 - distFromPeak / conf.duration)
            rainAmount = conf.maxRain * intensity * intensity + Math.random() * 5
            rainAmount = Math.round(rainAmount * 10) / 10
        } else {
            rainAmount = Math.random() < 0.2 ? Math.round(Math.random() * 3 * 10) / 10 : 0
        }

        accumulated += rainAmount

        data.push({
            timestamp,
            datetime: new Date(timestamp).toISOString(),
            amount: rainAmount,
            accumulated: Math.round(accumulated * 10) / 10,
        })
    }

    return data
}

// Generate prediction data (future 12 hours)
function generatePredictionData(stationId: string) {
    const now = Date.now()
    const currentWaterData = generateWaterLevelData(stationId, 6)
    const currentLevel = currentWaterData[currentWaterData.length - 1]!.level
    const predictions = []

    const trendConfig = {
        S001: { trend: -0.03, noise: 0.08 },
        S002: { trend: 0.06, noise: 0.1 },
        S003: { trend: 0.04, noise: 0.07 },
    }

    const conf = trendConfig[stationId as keyof typeof trendConfig] || trendConfig.S002
    let level = currentLevel

    for (let h = 1; h <= 12; h++) {
        level += conf.trend + (Math.random() - 0.5) * conf.noise
        level = Math.max(0.5, level)
        predictions.push({
            timestamp: now + h * 3600000,
            datetime: new Date(now + h * 3600000).toISOString(),
            predictedLevel: Math.round(level * 100) / 100,
            confidence: Math.round((95 - h * 2.5) * 10) / 10,
        })
    }

    return predictions
}

// Get current status for all stations
export function getDashboardSummary() {
    const summaries = stations.map((station) => {
        const waterData = generateWaterLevelData(station.id, 6)
        const rainfallData = generateRainfallData(station.id, 6)
        const predictions = generatePredictionData(station.id)

        const currentLevel = waterData[waterData.length - 1]!.level
        const prevLevel = waterData[waterData.length - 3]?.level || currentLevel
        const trend = currentLevel - prevLevel
        const peakPredicted = Math.max(...predictions.map((p) => p.predictedLevel))

        let riskLevel = 'safe'
        if (currentLevel >= station.thresholds.critical || peakPredicted >= station.thresholds.critical) {
            riskLevel = 'danger'
        } else if (currentLevel >= station.thresholds.warning || peakPredicted >= station.thresholds.warning) {
            riskLevel = 'warning'
        }

        // Estimated time for water to reach downstream (hours)
        const flowTimeToDownstream = station.type === 'upstream' ? 6 : station.type === 'midstream' ? 3 : 0

        return {
            ...station,
            currentLevel,
            trend: Math.round(trend * 100) / 100,
            trendDirection: trend > 0.05 ? 'up' : trend < -0.05 ? 'down' : 'stable',
            rainfall: {
                current: rainfallData[rainfallData.length - 1]!.amount,
                accumulated24h: rainfallData.slice(-24).reduce((sum, d) => sum + d.amount, 0),
            },
            riskLevel,
            peakPredicted: Math.round(peakPredicted * 100) / 100,
            flowTimeToDownstream,
        }
    })

    // Overall risk
    const overallRisk = summaries.some((s) => s.riskLevel === 'danger')
        ? 'danger'
        : summaries.some((s) => s.riskLevel === 'warning')
            ? 'warning'
            : 'safe'

    return {
        timestamp: new Date().toISOString(),
        overallRisk,
        stations: summaries,
    }
}

export function getStationTimeseries(stationId: string) {
    return {
        waterLevel: generateWaterLevelData(stationId, 72),
        rainfall: generateRainfallData(stationId, 72),
        predictions: generatePredictionData(stationId),
    }
}

// ============================================
// Fire Hotspot Data
// ============================================

export const fireHotspots = [
    {
        id: 'F001',
        name: 'ไฟป่าดอยสุเทพ',
        nameEn: 'Doi Suthep Wildfire',
        lat: 18.8048,
        lng: 98.9218,
        detectedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
        intensity: 'high' as const,
        areaSqKm: 2.4,
        windSpeed: 18, // km/h
        windDirection: 'ตะวันตกเฉียงใต้',
        windDirectionDeg: 225,
        humidity: 28,
        temperature: 38,
        vegetationType: 'ป่าเบญจพรรณ',
        vegetationFactor: 1.2, // spread multiplier
        status: 'active' as const,
    },
    {
        id: 'F002',
        name: 'ไฟป่าแม่ริม',
        nameEn: 'Mae Rim Forest Fire',
        lat: 18.9153,
        lng: 98.9547,
        detectedAt: new Date(Date.now() - 7 * 3600000).toISOString(),
        intensity: 'extreme' as const,
        areaSqKm: 5.1,
        windSpeed: 24,
        windDirection: 'ตะวันตก',
        windDirectionDeg: 270,
        humidity: 22,
        temperature: 41,
        vegetationType: 'ป่าเต็งรัง',
        vegetationFactor: 1.5,
        status: 'active' as const,
    },
    {
        id: 'F003',
        name: 'ไฟไหม้พื้นที่เกษตรหางดง',
        nameEn: 'Hang Dong Agricultural Fire',
        lat: 18.6934,
        lng: 98.9411,
        detectedAt: new Date(Date.now() - 1.5 * 3600000).toISOString(),
        intensity: 'medium' as const,
        areaSqKm: 0.8,
        windSpeed: 12,
        windDirection: 'เหนือ',
        windDirectionDeg: 0,
        humidity: 35,
        temperature: 35,
        vegetationType: 'พื้นที่เกษตร',
        vegetationFactor: 0.8,
        status: 'active' as const,
    },
    {
        id: 'F004',
        name: 'ไฟป่าสันกำแพง',
        nameEn: 'San Kamphaeng Fire',
        lat: 18.7464,
        lng: 99.1281,
        detectedAt: new Date(Date.now() - 12 * 3600000).toISOString(),
        intensity: 'low' as const,
        areaSqKm: 0.3,
        windSpeed: 8,
        windDirection: 'ตะวันออก',
        windDirectionDeg: 90,
        humidity: 45,
        temperature: 33,
        vegetationType: 'ป่าเบญจพรรณ',
        vegetationFactor: 1.2,
        status: 'contained' as const,
    },
]

// Fire spread prediction model
function generateFireSpreadPrediction(fire: typeof fireHotspots[0]) {
    const predictions = []
    const hoursToPredict = [1, 2, 3, 6, 9, 12]

    // Base spread rate (sq km per hour) influenced by factors
    const windFactor = Math.max(0.5, fire.windSpeed / 15) // higher wind = faster spread
    const humidityFactor = Math.max(0.3, (100 - fire.humidity) / 70) // lower humidity = faster
    const baseSpreadRate = 0.15 * windFactor * humidityFactor * fire.vegetationFactor

    let currentArea = fire.areaSqKm

    for (const h of hoursToPredict) {
        // Spread decelerates over time (resources deployed, natural barriers)
        const decayFactor = Math.exp(-0.05 * h)
        const spreadRate = baseSpreadRate * decayFactor
        currentArea += spreadRate * (h === hoursToPredict[0] ? h : h - (hoursToPredict[hoursToPredict.indexOf(h) - 1] || 0))

        // Add slight randomness
        currentArea += (Math.random() - 0.3) * 0.1

        const radiusKm = Math.sqrt(currentArea / Math.PI)
        const confidence = Math.max(40, 95 - h * 4.5 + (fire.humidity > 40 ? 5 : 0))

        // Calculate spread direction offset based on wind
        const spreadDirectionDeg = fire.windDirectionDeg + (Math.random() - 0.5) * 30

        predictions.push({
            hoursFromNow: h,
            estimatedAreaSqKm: Math.round(currentArea * 100) / 100,
            estimatedRadiusKm: Math.round(radiusKm * 100) / 100,
            spreadRate: Math.round(spreadRate * 100) / 100,
            spreadDirectionDeg: Math.round(spreadDirectionDeg),
            spreadDirection: fire.windDirection,
            confidence: Math.round(confidence * 10) / 10,
        })
    }

    return predictions
}

// Intensity level helpers
function getIntensityLevel(intensity: string) {
    switch (intensity) {
        case 'extreme': return 4
        case 'high': return 3
        case 'medium': return 2
        case 'low': return 1
        default: return 0
    }
}

export function getFireSummary() {
    const fires = fireHotspots.map((fire) => {
        const predictions = generateFireSpreadPrediction(fire)
        const peakPrediction = predictions[predictions.length - 1]!
        const hoursActive = Math.round((Date.now() - new Date(fire.detectedAt).getTime()) / 3600000 * 10) / 10

        return {
            ...fire,
            hoursActive,
            predictions,
            peakEstimate: {
                areaSqKm: peakPrediction.estimatedAreaSqKm,
                radiusKm: peakPrediction.estimatedRadiusKm,
                timeHours: peakPrediction.hoursFromNow,
            },
            intensityLevel: getIntensityLevel(fire.intensity),
        }
    })

    // Overall fire risk
    const activeCount = fires.filter((f) => f.status === 'active').length
    const maxIntensity = Math.max(...fires.map((f) => f.intensityLevel))
    const overallFireRisk = maxIntensity >= 4 ? 'extreme' : maxIntensity >= 3 ? 'high' : maxIntensity >= 2 ? 'medium' : 'low'

    return {
        timestamp: new Date().toISOString(),
        activeCount,
        totalCount: fires.length,
        overallFireRisk,
        fires,
    }
}
