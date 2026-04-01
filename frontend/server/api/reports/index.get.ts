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
        // No database available (e.g. Vercel serverless) — return empty
        return { reports: [], source: 'no-db' }
    }

    try {
        const reports = await db.communityReport.findMany({
            orderBy: { createdAt: 'desc' },
            take: 100
        })
        return { reports }
    } catch (error) {
        console.error('Error fetching reports:', error)
        return { reports: [], source: 'error' }
    }
})
