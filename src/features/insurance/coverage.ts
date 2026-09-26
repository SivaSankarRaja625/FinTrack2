import type { InsurancePolicy } from '../../domain/types'

export function coverageFor(
  policy: InsurancePolicy | null,
): NonNullable<InsurancePolicy['coverage']> {
  return (
    policy?.coverage ?? {
      source: 'personal',
      insuredPeople: [],
      layer: 'base',
      deductiblePaise: 0,
      coPayPercent: null,
      restrictions: '',
      claimContact: '',
      premiumPaidForDate: null,
      renewalConfirmedForDate: null,
      reminderDays: [30, 7, 1, 0],
      lastConfirmedAt: null,
    }
  )
}
