import { fetchStationTimeseries } from '../../../utils/realTimeData'

export default defineEventHandler(async (event) => {
    const stationId = getRouterParam(event, 'id')
    if (!stationId) {
        throw createError({ statusCode: 400, message: 'Station ID required' })
    }
    return await fetchStationTimeseries(stationId)
})
