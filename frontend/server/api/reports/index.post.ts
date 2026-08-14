import { isPointInThailand } from '../../utils/thailandGeofence'

let prisma: any = null
const ALLOWED_REPORT_TYPES = new Set(['flood', 'fire'])
const MAX_DESCRIPTION_LENGTH = 2000

async function getPrisma() {
    if (prisma) return prisma
    try {
        const { PrismaClient } = await import('@prisma/client')
        prisma = new PrismaClient()
        return prisma
    } catch {
        return null
    }
}

export default defineEventHandler(async (event) => {
    const body = await readBody(event)
    const type = typeof body?.type === 'string' ? body.type.trim().toLowerCase() : ''
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const lat = body?.lat
    const lng = body?.lng

    if (!ALLOWED_REPORT_TYPES.has(type)) {
        throw createError({ statusCode: 400, statusMessage: 'Report type must be flood or fire' })
    }
    if (typeof lat !== 'number' || typeof lng !== 'number'
        || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw createError({ statusCode: 400, statusMessage: 'Coordinates must be finite numbers' })
    }
    if (!isPointInThailand(lat, lng)) {
        throw createError({ statusCode: 400, statusMessage: 'Coordinates must be inside Thailand' })
    }
    if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
        throw createError({ statusCode: 400, statusMessage: `Description must be 1-${MAX_DESCRIPTION_LENGTH} characters` })
    }

    const db = await getPrisma()
    if (!db) throw createError({ statusCode: 503, statusMessage: 'Report storage is unavailable' })

    try {
        const report = await db.communityReport.create({
            data: {
                type,
                lat,
                lng,
                description,
                imageUrl: typeof body.imageUrl === 'string' && body.imageUrl.trim()
                    ? body.imageUrl.trim()
                    : null,
                status: 'pending'
            }
        })
        return { success: true, report }
    } catch {
        console.error('[Reports] Persistence failed')
        throw createError({ statusCode: 503, statusMessage: 'Report storage is unavailable' })
    }
})
