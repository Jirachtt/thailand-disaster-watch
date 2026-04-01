/**
 * Fire Spread Prediction Model
 * Uses Cellular Automata (CA) + Wind data to predict fire spread direction
 * 
 * The model creates a probability grid around each fire hotspot,
 * weighting cells in the wind direction higher.
 */

interface WindData {
    speed: number        // m/s
    deg: number          // meteorological degrees (0=N, 90=E, 180=S, 270=W)
    humidity: number     // %
    temp: number         // °C
}

interface FirePoint {
    lat: number
    lng: number
    frp: number          // Fire Radiative Power (MW)
    intensity: string
    intensityLevel: number
}

interface SpreadCell {
    lat: number
    lng: number
    probability: number  // 0-1
    distanceKm: number
    direction: string    // N, NE, E, SE, S, SW, W, NW
}

interface FireSpreadPrediction {
    fireId: string
    center: { lat: number, lng: number }
    windSpeed: number
    windDeg: number
    windDirection: string
    spreadCells: SpreadCell[]
    maxSpreadKm: number
    spreadArrow: { lat: number, lng: number }  // endpoint of wind arrow
}

// Direction offsets for 8 neighbors (row, col) and their angles
const DIRECTIONS = [
    { name: 'N', dr: -1, dc: 0, angle: 0 },
    { name: 'NE', dr: -1, dc: 1, angle: 45 },
    { name: 'E', dr: 0, dc: 1, angle: 90 },
    { name: 'SE', dr: 1, dc: 1, angle: 135 },
    { name: 'S', dr: 1, dc: 0, angle: 180 },
    { name: 'SW', dr: 1, dc: -1, angle: 225 },
    { name: 'W', dr: 0, dc: -1, angle: 270 },
    { name: 'NW', dr: -1, dc: -1, angle: 315 },
]

/**
 * Convert wind degrees to compass direction
 */
export function degToCompass(deg: number): string {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    return dirs[Math.round(deg / 45) % 8] || 'N'
}

/**
 * Calculate angular difference between two angles (0-360)
 */
function angleDiff(a: number, b: number): number {
    let diff = Math.abs(a - b) % 360
    if (diff > 180) diff = 360 - diff
    return diff
}

/**
 * Move a lat/lng by distance in a direction
 */
function moveLatLng(lat: number, lng: number, bearingDeg: number, distanceKm: number) {
    const R = 6371 // Earth radius km
    const d = distanceKm / R
    const brng = (bearingDeg * Math.PI) / 180
    const lat1 = (lat * Math.PI) / 180
    const lng1 = (lng * Math.PI) / 180

    const lat2 = Math.asin(
        Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
    )
    const lng2 = lng1 + Math.atan2(
        Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
        Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    )

    return {
        lat: (lat2 * 180) / Math.PI,
        lng: (lng2 * 180) / Math.PI,
    }
}

/**
 * Main prediction function: CA + Wind model
 * 
 * For each fire, creates spread cells in 8 directions
 * with probability weighted by:
 * - Wind direction alignment (0-1, highest when aligned)
 * - Wind speed (faster = spreads further)  
 * - Humidity (drier = spreads more)
 * - FRP (higher energy = spreads more)
 */
export function predictFireSpread(
    fire: FirePoint,
    fireId: string,
    wind: WindData
): FireSpreadPrediction {
    // Wind blows FROM deg, fire spreads TO (opposite + same direction)
    // Wind deg is where wind comes FROM, so fire spreads in the wind direction
    const spreadDir = wind.deg // fire moves in the direction wind blows TO

    // Base spread distance based on wind speed and fire intensity
    // wind speed m/s → km/h * factor
    const windKmh = wind.speed * 3.6
    const frpFactor = Math.min(fire.frp / 50, 3) // normalize FRP, cap at 3x
    const humidityFactor = Math.max(0.3, 1 - (wind.humidity / 100)) // dry = more spread
    const baseSpreadKm = Math.max(1, (windKmh * 0.3 + frpFactor * 2) * humidityFactor)

    const spreadCells: SpreadCell[] = []

    for (const dir of DIRECTIONS) {
        // How aligned is this direction with wind?
        const diff = angleDiff(dir.angle, spreadDir)
        // Probability: 1.0 if perfectly aligned, 0.1 if opposite
        const alignment = Math.max(0.05, 1 - (diff / 180))
        const probability = Math.min(0.95, alignment * (0.5 + windKmh / 30) * humidityFactor)

        // Distance this cell extends
        const cellDistance = baseSpreadKm * alignment

        const pos = moveLatLng(fire.lat, fire.lng, dir.angle, cellDistance)

        spreadCells.push({
            lat: pos.lat,
            lng: pos.lng,
            probability: Math.round(probability * 100) / 100,
            distanceKm: Math.round(cellDistance * 10) / 10,
            direction: dir.name,
        })
    }

    // Arrow endpoint showing dominant wind spread direction
    const arrowDistance = baseSpreadKm * 1.2
    const spreadArrow = moveLatLng(fire.lat, fire.lng, spreadDir, arrowDistance)

    return {
        fireId,
        center: { lat: fire.lat, lng: fire.lng },
        windSpeed: wind.speed,
        windDeg: wind.deg,
        windDirection: degToCompass(wind.deg),
        spreadCells,
        maxSpreadKm: Math.round(baseSpreadKm * 10) / 10,
        spreadArrow,
    }
}

/**
 * Predict rain movement direction based on wind
 */
export function predictRainDirection(
    lat: number,
    lng: number,
    rain24h: number,
    wind: WindData
): { directionDeg: number, directionLabel: string, predictedPath: Array<{ lat: number, lng: number }> } {
    // Rain clouds move in the wind direction
    const dirDeg = wind.deg
    const dirLabel = degToCompass(dirDeg)

    // Speed of cloud movement ~ wind speed
    const speedKmh = wind.speed * 3.6
    const predictedPath = []

    // Predict position at 1h, 2h, 3h
    for (let h = 1; h <= 3; h++) {
        const distKm = speedKmh * h
        predictedPath.push(moveLatLng(lat, lng, dirDeg, distKm))
    }

    return { directionDeg: dirDeg, directionLabel: dirLabel, predictedPath }
}
