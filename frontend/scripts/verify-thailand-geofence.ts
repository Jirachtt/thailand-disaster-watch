import assert from 'node:assert/strict'
import { isPointInThailand } from '../server/utils/thailandGeofence'

const cases = [
    { name: 'Bangkok, Thailand', latitude: 13.7563, longitude: 100.5018, expected: true },
    { name: 'Chiang Mai, Thailand', latitude: 18.7883, longitude: 98.9853, expected: true },
    { name: 'Phuket, Thailand', latitude: 7.8804, longitude: 98.3923, expected: true },
    { name: 'Kamphaeng Phet FIRMS hotspot retained', latitude: 16.5499, longitude: 99.96954, expected: true },
    { name: 'An Giang, Vietnam (reported FIRMS false positive)', latitude: 10.3654, longitude: 105.2177, expected: false },
    { name: 'Vientiane, Laos', latitude: 17.9757, longitude: 102.6331, expected: false },
    { name: 'Phnom Penh, Cambodia', latitude: 11.5564, longitude: 104.9282, expected: false },
    { name: 'Yangon, Myanmar', latitude: 16.8409, longitude: 96.1735, expected: false },
] as const

for (const testCase of cases) {
    const actual = isPointInThailand(testCase.latitude, testCase.longitude)
    assert.equal(actual, testCase.expected, testCase.name)
    console.log(`${actual === testCase.expected ? 'PASS' : 'FAIL'} ${testCase.name}: ${actual}`)
}

console.log(`Verified ${cases.length} Thailand national-boundary geofence cases.`)
