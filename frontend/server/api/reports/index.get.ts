let prisma: any = null

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

export default defineEventHandler(async () => {
    const db = await getPrisma()
    if (!db) {
        throw createError({ statusCode: 503, statusMessage: 'Report storage is unavailable' })
    }

    try {
        const reports = await db.communityReport.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        })
        return { reports }
    } catch {
        console.error('[Reports] Read failed')
        throw createError({ statusCode: 503, statusMessage: 'Report storage is unavailable' })
    }
})
