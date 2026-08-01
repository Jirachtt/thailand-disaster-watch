import { THAILAND_ADMIN0_MULTIPOLYGON } from './thailandBoundary'

// Cheap rejection before the more detailed point-in-polygon test. This box is
// deliberately a little wider than the Natural Earth Thailand geometry.
const THAILAND_BOUNDS = {
    minLatitude: 5.5,
    maxLatitude: 20.6,
    minLongitude: 97.2,
    maxLongitude: 105.8,
}

type RingRelation = 'outside' | 'inside' | 'boundary'

function isPointOnSegment(
    x: number,
    y: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): boolean {
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax)
    const scale = Math.max(1, Math.abs(bx - ax), Math.abs(by - ay))
    if (Math.abs(cross) > Number.EPSILON * 64 * scale) return false

    const dot = (x - ax) * (x - bx) + (y - ay) * (y - by)
    return dot <= Number.EPSILON * 64 * scale
}

function relationToRing(longitude: number, latitude: number, ring: number[][]): RingRelation {
    let inside = false

    for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
        const currentPosition = ring[current]
        const previousPosition = ring[previous]
        if (!currentPosition || !previousPosition) continue

        const [currentLongitude, currentLatitude] = currentPosition
        const [previousLongitude, previousLatitude] = previousPosition
        if (![currentLongitude, currentLatitude, previousLongitude, previousLatitude].every(Number.isFinite)) continue

        if (isPointOnSegment(
            longitude,
            latitude,
            previousLongitude!,
            previousLatitude!,
            currentLongitude!,
            currentLatitude!,
        )) return 'boundary'

        const crossesLatitude = (currentLatitude! > latitude) !== (previousLatitude! > latitude)
        if (!crossesLatitude) continue

        const crossingLongitude = previousLongitude!
            + (latitude - previousLatitude!) * (currentLongitude! - previousLongitude!)
            / (currentLatitude! - previousLatitude!)
        if (longitude < crossingLongitude) inside = !inside
    }

    return inside ? 'inside' : 'outside'
}

/**
 * Returns true only when the coordinate is on or inside Thailand's Natural
 * Earth Admin-0 boundary. Arguments use the same latitude/longitude order as
 * a NASA FIRMS record; the bundled GeoJSON itself stores longitude first.
 */
export function isPointInThailand(latitude: number, longitude: number): boolean {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false
    if (latitude < THAILAND_BOUNDS.minLatitude || latitude > THAILAND_BOUNDS.maxLatitude
        || longitude < THAILAND_BOUNDS.minLongitude || longitude > THAILAND_BOUNDS.maxLongitude) {
        return false
    }

    return THAILAND_ADMIN0_MULTIPOLYGON.some((polygon) => {
        const outerRing = polygon[0]
        if (!outerRing) return false

        const outerRelation = relationToRing(longitude, latitude, outerRing)
        if (outerRelation === 'outside') return false
        if (outerRelation === 'boundary') return true

        // GeoJSON rings after the first are holes. Points on a hole boundary
        // still count as boundary; only points strictly inside a hole are out.
        for (const hole of polygon.slice(1)) {
            if (relationToRing(longitude, latitude, hole) === 'inside') return false
        }
        return true
    })
}
