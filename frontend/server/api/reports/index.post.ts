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

export default defineEventHandler(async (event) => {
    const body = await readBody(event)

    if (!body.type || typeof body.lat !== 'number' || typeof body.lng !== 'number' || !body.description) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request: Missing required fields' })
    }

    const db = await getPrisma()
    if (!db) {
        // No database — accept but don't persist (demo mode)
        return {
            success: true,
            report: {
                id: crypto.randomUUID(),
                type: body.type,
                lat: body.lat,
                lng: body.lng,
                description: body.description,
                imageUrl: body.imageUrl || null,
                status: 'pending',
                createdAt: new Date().toISOString(),
            },
            source: 'no-db'
        }
    }

    try {
        const report = await db.communityReport.create({
            data: {
                type: body.type,
                lat: body.lat,
                lng: body.lng,
                description: body.description,
                imageUrl: body.imageUrl || null,
                status: 'pending'
            }
        })
        return { success: true, report }
    } catch (error) {
        console.error('Error creating report:', error)
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
})
