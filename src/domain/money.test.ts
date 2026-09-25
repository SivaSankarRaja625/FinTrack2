import { describe, expect, it } from 'vitest'

import { formatMoney, multiplyMoney, paiseToRupees, rupeesToPaise } from './money'

describe('money', () => {
  it('parses Indian formatted rupees without floating point drift', () => {
    expect(rupeesToPaise('₹1,23,456.78')).toBe(12_345_678)
    expect(rupeesToPaise('(1,200.50)')).toBe(-120_050)
    expect(paiseToRupees(12_345_678)).toBe('123456.78')
  })

  it('rounds fractional holdings to the nearest paise', () => {
    expect(multiplyMoney(12_345, '2.75')).toBe(33_949)
  })

  it('formats money using the Indian locale', () => {
    expect(formatMoney(12_345_678)).toContain('1,23,456.78')
  })
})
