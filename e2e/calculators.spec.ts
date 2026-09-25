import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function openCalculators(page: Page) {
  await page.goto('/')
  await page.getByLabel('Name').fill('Ananya')
  await page.getByLabel('Monthly take-home income').fill('120000')
  await page.getByLabel('Essential monthly expenses').fill('45000')
  await page.getByLabel('App PIN or passphrase').fill('FinTrack2026')
  await page.getByLabel('Confirm PIN').fill('FinTrack2026')
  await page.getByLabel(/I understand there is no remote PIN reset/u).check()
  await page.getByRole('button', { name: 'Create encrypted workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Financial overview' })).toBeVisible()
  await page.getByRole('button', { name: /More sections/u }).click()
  await page
    .getByRole('dialog', { name: 'All sections' })
    .getByRole('link', { name: 'Calculators' })
    .click()
  await expect(page.getByRole('heading', { name: 'Calculators' })).toBeFocused()
}

const choices = {
  fd: ['Bank deposits', 'Fixed deposit'],
  rd: ['Bank deposits', 'Recurring deposit'],
  sip: ['Contribution and withdrawal plans', 'SIP'],
  'step-up-sip': ['Contribution and withdrawal plans', 'Step-up SIP'],
  'goal-sip': ['Contribution and withdrawal plans', 'Goal SIP'],
  stp: ['Contribution and withdrawal plans', 'Systematic transfer'],
  swp: ['Contribution and withdrawal plans', 'Systematic withdrawal'],
  'lump-sum': ['Goals and purchasing power', 'Lump-sum growth'],
  multiple: ['Goals and purchasing power', 'Wealth multiple'],
  inflation: ['Goals and purchasing power', 'Future cost of inflation'],
  delay: ['Goals and purchasing power', 'Cost of delay'],
  retirement: ['Goals and purchasing power', 'Retirement drawdown'],
} as const

async function selectCalculator(page: Page, kind: keyof typeof choices) {
  const [category, calculator] = choices[kind]
  await page
    .getByRole('group', { name: 'Calculator categories' })
    .getByRole('button', { name: category, exact: true })
    .click()
  await page
    .getByRole('group', { name: 'Available calculators' })
    .getByRole('button', { name: calculator, exact: true })
    .click()
}

test('category and calculator buttons reveal only the selected form', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await openCalculators(page)

  const categories = page.getByRole('group', { name: 'Calculator categories' })
  const calculators = page.getByRole('group', { name: 'Available calculators' })
  await expect(categories.getByRole('button')).toHaveCount(3)
  await expect(calculators).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Edit assumptions' })).toHaveCount(0)

  await categories.getByRole('button', { name: 'Bank deposits' }).click()
  await expect(categories.getByRole('button', { name: 'Bank deposits' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(calculators.getByRole('button')).toHaveCount(2)
  await expect(calculators.getByRole('button', { name: 'Fixed deposit' })).toBeVisible()
  await expect(calculators.getByRole('button', { name: 'SIP', exact: true })).toHaveCount(
    0,
  )
  await expect(page.getByRole('heading', { name: 'Edit assumptions' })).toHaveCount(0)

  await calculators.getByRole('button', { name: 'Recurring deposit' }).click()
  await expect(
    calculators.getByRole('button', { name: 'Recurring deposit' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Actual instalment dates')).toBeVisible()
  await expect(page.getByLabel('Initial deposit')).toHaveCount(0)

  await categories
    .getByRole('button', { name: 'Contribution and withdrawal plans' })
    .click()
  await expect(calculators.getByRole('button')).toHaveCount(5)
  await expect(page.getByLabel('Actual instalment dates')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Edit assumptions' })).toHaveCount(0)
  await calculators.getByRole('button', { name: 'SIP', exact: true }).press('Enter')
  await expect(page.getByLabel('Monthly contribution')).toBeVisible()
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
})

test('navigation and deposit illustration use explicit bank terms', async ({ page }) => {
  await openCalculators(page)
  await selectCalculator(page, 'fd')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Initial deposit').fill('10000')
  await page.getByLabel('Bank annual nominal rate').fill('0')
  await page.getByLabel('Bank interest rest').selectOption('quarterly-anniversary')
  await page.getByLabel('Bank day count').selectOption('actual-365')
  await page.getByLabel('Interest payout').selectOption('cumulative')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹10,000', { exact: false }).first()).toBeVisible()
})

test('zero-return SIP shows contributions and changing inputs invalidates results', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('No return is assumed')).toBeVisible()
  await expect(page.getByText('₹12,000', { exact: false }).first()).toBeVisible()
  await page.getByLabel('Monthly contribution').fill('2000')
  await expect(page.getByText('Outdated')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compare scenarios' })).toBeDisabled()
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    audit.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
})

test('quarterly SIP labels a payment per quarter and compares it to a three-month budget', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('3')
  await page.getByLabel('Quarterly contribution').fill('2000')
  await page.getByLabel('Monthly affordability budget (optional)').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹8,000', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Comparable three-month budget')).toBeVisible()
  await expect(page.getByText(/No displayed instalment exceeds/i)).toBeVisible()
})

test('instruments expose their own inputs instead of reusing a generic return form', async ({
  page,
}) => {
  await openCalculators(page)
  for (const [kind, field] of [
    ['rd', 'Actual instalment dates'],
    ['step-up-sip', 'Increase every'],
    ['goal-sip', 'Target amount'],
    ['stp', 'Source fund house'],
    ['swp', 'Withdrawal amount'],
    ['lump-sum', 'Initial amount'],
    ['multiple', '2x or 3x'],
    ['inflation', 'Inflation rate'],
    ['delay', 'Delay (months)'],
    ['retirement', 'Monthly withdrawal'],
  ] as const) {
    await selectCalculator(page, kind)
    await expect(page.getByLabel(field, { exact: true })).toBeVisible()
  }
})

test('invalid bank terms never produce a successful-looking illustration', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'fd')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Initial deposit').fill('10000')
  await page.getByLabel('Bank annual nominal rate').fill('7')
  await page.getByLabel('Interest payout').selectOption('cumulative')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText(/Bank interest rest.*required/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Illustration' })).toHaveCount(0)
})

test('early withdrawal identifies a percentage-point rate penalty, not any bank charge', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'fd')
  await page.getByRole('checkbox', { name: /Illustrate early closure/u }).check()
  await expect(
    page.getByLabel('Penalty (percentage points deducted from holding-period bank rate)'),
  ).toBeVisible()
  await expect(page.getByText(/flat charge.*cannot be reproduced/iu)).toBeVisible()
})

test('dated RD schedule identifies instalments and never invents missed payments', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'rd')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2026-04-01')
  await page.getByLabel('Monthly instalment').fill('1000')
  await page.getByLabel('Number of instalments').fill('3')
  await page.getByLabel('Bank annual nominal rate').fill('0')
  await page.getByLabel('Bank interest rest').selectOption('quarterly-anniversary')
  await page.getByLabel('Bank day count').selectOption('actual-365')
  await page
    .getByLabel('Actual instalment dates')
    .fill('2026-01-01\n2026-02-01\n2026-03-01')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹3,000', { exact: false }).first()).toBeVisible()
  await page.getByText('Calculation schedule').click()
  await expect(
    page.getByRole('table', { name: 'Dated cash flows and illustrative changes' }),
  ).toBeVisible()
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
  await expect(page.getByRole('cell', { name: '2026-02-01' }).first()).toBeVisible()
  await expect(page.getByText(/bank rounding.*differ/i)).toBeVisible()
})

test('zero-return STP keeps transfers internal and shows both fund balances', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'stp')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2026-04-01')
  await page.getByLabel('Transfer frequency').selectOption('1')
  await page.getByLabel('Source fund house').fill('Example AMC')
  await page.getByLabel('Target fund house').fill('Example AMC')
  await page.getByLabel('Source initial amount').fill('12000')
  await page.getByLabel('Transfer type').selectOption('amount')
  await page.getByLabel('Transfer amount').fill('1000')
  await page.getByLabel('When source is insufficient').selectOption('stop')
  await page.getByLabel('Source assumed annual return').fill('0')
  await page.getByLabel('Target assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹9,000', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('₹3,000', { exact: false }).first()).toBeVisible()
  await expect(
    page.getByText(/source redemption and a target subscription/i),
  ).toBeVisible()
  await page.getByText('Calculation schedule').click()
  await expect(
    page.getByRole('table', { name: 'Dated cash flows and illustrative changes' }),
  ).toBeVisible()
})

test('zero-return SWP separates cash received from corpus in its dated schedule', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'swp')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2026-04-01')
  await page.getByLabel('Withdrawal frequency').selectOption('1')
  await page.getByLabel('Starting capital').fill('1000')
  await page.getByLabel('Withdrawal type').selectOption('amount')
  await page.getByLabel('Withdrawal amount').fill('300')
  await page.getByLabel('Annual withdrawal increase').fill('0')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹900', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('₹100', { exact: false }).first()).toBeVisible()
  await expect(page.getByText(/not guaranteed income or profit/i)).toBeVisible()
  await page.getByText('Calculation schedule').click()
  await expect(
    page.getByRole('table', { name: 'Dated cash flows and illustrative changes' }),
  ).toBeVisible()
})

test('unit-based STP and SWP demand matching starting units and NAV before calculating', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'stp')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2026-03-01')
  await page.getByLabel('Transfer frequency').selectOption('1')
  await page.getByLabel('Source fund house').fill('Example AMC')
  await page.getByLabel('Target fund house').fill('Example AMC')
  await page.getByLabel('Source initial amount').fill('1000')
  await page.getByLabel('Transfer type').selectOption('units')
  await page.getByLabel('Starting source units').fill('10')
  await page.getByLabel('Transfer units').fill('2.5')
  await page.getByLabel('Source starting NAV').fill('100')
  await page.getByLabel('Target starting NAV').fill('50')
  await page.getByLabel('When source is insufficient').selectOption('stop')
  await page.getByLabel('Source assumed annual return').fill('0')
  await page.getByLabel('Target assumed annual return').fill('0')
  await page.getByLabel('Source starting NAV').fill('90')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByRole('alert')).toContainText('starting value')
  await expect(page.getByRole('heading', { name: 'Illustration' })).toHaveCount(0)
  await page.getByLabel('Source starting NAV').fill('100')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('source balance')).toBeVisible()
  await expect(page.getByText('target balance')).toBeVisible()
  await selectCalculator(page, 'swp')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2026-04-01')
  await page.getByLabel('Withdrawal frequency').selectOption('1')
  await page.getByLabel('Starting capital').fill('1000')
  await page.getByLabel('Withdrawal type').selectOption('units')
  await page.getByLabel('Starting units').fill('10')
  await page.getByLabel('Starting NAV').fill('100')
  await page.getByLabel('Withdrawal units').fill('2.5')
  await page.getByLabel('Annual withdrawal increase').fill('0')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹750', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('₹250', { exact: false }).first()).toBeVisible()
})

test('missing dated market returns show an error instead of filling the omitted month', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2026-03-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Return path format').selectOption('monthly')
  await page.getByLabel('Assumed annual return by month').fill('2026-01,0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByRole('alert')).toContainText('2026-02')
  await expect(page.getByRole('heading', { name: 'Illustration' })).toHaveCount(0)
})

test('goal SIP solves a manually entered inflation-adjusted target without inventing a rate', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'goal-sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Target amount').fill('12000')
  await page.getByLabel('Goal inflation rate').fill('0')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByRole('heading', { name: 'Illustration' })).toBeVisible()
  await expect(page.getByText('Required contribution per payment')).toBeVisible()
  await expect(page.getByText('₹1,000', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('₹12,000', { exact: false }).first()).toBeVisible()
})

test('step-up SIP displays first and final instalments and flags the entered budget threshold', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'step-up-sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-02-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Increase every').selectOption('6')
  await page.getByLabel('Increase type').selectOption('percent')
  await page.getByLabel('Increase percentage').fill('10')
  await page.getByLabel('Monthly affordability budget (optional)').fill('1050')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('First instalment')).toBeVisible()
  await expect(page.getByText('Final instalment')).toBeVisible()
  await expect(page.getByText('₹1,210', { exact: false }).first()).toBeVisible()
  await expect(page.getByText(/exceeds entered budget.*2026-07-01/i)).toBeVisible()
})

test('inflation and multiple calculators show scalar outcomes without pretending there is a cash-flow schedule', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'multiple')
  await page.getByLabel('Initial amount').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByLabel('2x or 3x').selectOption('2')
  await page.getByLabel('Horizon (years)').fill('10')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('Not reached')).toBeVisible()
  await expect(page.getByText('Calculation schedule')).toHaveCount(0)
  await selectCalculator(page, 'inflation')
  await page.getByLabel('Current cost').fill('1000')
  await page.getByLabel('Inflation rate', { exact: true }).fill('0')
  await page.getByLabel('Years').fill('10')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText('₹1,000', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Calculation schedule')).toHaveCount(0)
})

test('lump-sum illustration retains the exact entered rate next to its dated result', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'lump-sum')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Initial amount').fill('10000')
  await page.getByLabel('Assumed annual return').fill('7')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByRole('region', { name: 'Calculation result' })).toContainText(
    'Illustrative effective annual return: 7%',
  )
  await expect(page.getByText('Money multiple (not an annualized return)')).toBeVisible()
})

test('retirement drawdown and delay both keep contributions separate from withdrawals', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'retirement')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Monthly withdrawal').fill('1000')
  await page.getByLabel('Withdrawal months').fill('3')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByLabel('Monthly affordability budget (optional)').fill('500')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText(/exceeds entered budget on 2026-01-01/i)).toBeVisible()
  await expect(page.getByText('₹12,000', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('₹3,000', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('₹9,000', { exact: false }).first()).toBeVisible()
  await selectCalculator(page, 'delay')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Delay (months)').fill('6')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByLabel('Monthly affordability budget (optional)').fill('500')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(page.getByText(/exceeds entered budget on 2026-01-01/i)).toBeVisible()
  await expect(page.getByRole('region', { name: 'Starting now scenario' })).toContainText(
    '₹12,000',
  )
  await expect(page.getByRole('region', { name: 'After delay scenario' })).toContainText(
    '₹6,000',
  )
})

test('poor early SWP return paths change the ending corpus without promising withdrawals', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'swp')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2026-04-01')
  await page.getByLabel('Withdrawal frequency').selectOption('1')
  await page.getByLabel('Starting capital').fill('10000')
  await page.getByLabel('Withdrawal type').selectOption('amount')
  await page.getByLabel('Withdrawal amount').fill('6000')
  await page.getByLabel('Annual withdrawal increase').fill('0')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByLabel('Compare a poor-early-returns path entered by me').check()
  await page
    .getByLabel('Poor-early monthly returns')
    .fill('2026-01,-50\n2026-02,0\n2026-03,0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await expect(
    page.getByRole('region', { name: 'Base return path scenario' }),
  ).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Poor-early return path scenario' }),
  ).toBeVisible()
  await expect(page.getByText(/₹4,000/u).first()).toBeVisible()
  await expect(page.getByText(/₹2,000/u).first()).toBeVisible()
  await expect(
    page.getByText(/withdrawal unavailable on 2026-02-01/u).first(),
  ).toBeVisible()
})

test('comparison flags different cash flows without ranking scenarios', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await page.getByLabel('Monthly contribution').fill('2000')
  await expect(page.getByText('Outdated')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Compare scenarios' })).toBeDisabled()
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await page.getByLabel('Comparison inflation rate').fill('0')
  await page.getByRole('button', { name: 'Compare scenarios' }).click()
  await expect(page.getByText('Different cash flows')).toBeVisible()
  await expect(page.getByText(/₹24,000/u).first()).toBeVisible()
  await expect(page.getByText(/Best investment|winner/iu)).toHaveCount(0)
  await page.getByLabel('Monthly contribution').fill('3000')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await expect(page.getByRole('button', { name: 'Add scenario' })).toBeDisabled()
  await page.getByRole('button', { name: 'Compare scenarios' }).click()
  await expect(page.getByRole('article')).toHaveCount(3)
})

test('leaving the route discards unsaved scenarios and previous form values', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('button', { name: /More sections/u }).click()
  await page
    .getByRole('dialog', { name: 'All sections' })
    .getByRole('link', { name: 'Calculators' })
    .click()
  await expect(page.getByRole('group', { name: 'Calculator categories' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Available calculators' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Illustration' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Compare scenarios' })).toHaveCount(0)
})

test('cross-kind comparison rejects mismatched horizons and compares matching ones', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await selectCalculator(page, 'lump-sum')
  await expect(page.getByRole('heading', { name: 'Illustration' })).toHaveCount(0)
  await expect(page.locator('.calculator-saved')).toContainText('SIP')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2028-01-01')
  await page.getByLabel('Initial amount').fill('12000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await page.getByLabel('Comparison inflation rate').fill('0')
  await page.getByRole('button', { name: 'Compare scenarios' }).click()
  await expect(page.getByText(/different evaluation dates|same end date/i)).toBeVisible()
  await expect(page.getByText('Inflation-adjusted end value')).toHaveCount(0)

  await page.getByRole('button', { name: /Remove Lump-sum growth/u }).click()
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await page.getByRole('button', { name: 'Compare scenarios' }).click()
  const compared = page.locator('.calculator-comparison-card')
  await expect(compared).toHaveCount(2)
  await expect(compared.nth(0)).toContainText('SIP')
  await expect(compared.nth(0).locator('dd').nth(2)).toHaveText('₹12,000')
  await expect(compared.nth(1)).toContainText('Lump-sum growth')
  await expect(compared.nth(1).locator('dd').nth(2)).toHaveText('₹12,000')
  await expect(page.getByText('Different cash flows')).toBeVisible()
})

test('lock clears in-memory calculations even after unlocking the same workspace', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'sip')
  await page.getByLabel('Start date').fill('2026-01-01')
  await page.getByLabel('End date').fill('2027-01-01')
  await page.getByLabel('Contribution frequency').selectOption('1')
  await page.getByLabel('Monthly contribution').fill('1000')
  await page.getByLabel('Assumed annual return').fill('0')
  await page.getByRole('button', { name: 'Calculate' }).click()
  await page.getByRole('button', { name: 'Add scenario' }).click()
  await page.getByRole('button', { name: 'Lock application' }).click()
  await page.getByLabel('App PIN', { exact: true }).fill('FinTrack2026')
  await page.getByRole('button', { name: /Unlock/ }).click()
  await page.getByRole('button', { name: /More sections/u }).click()
  await page
    .getByRole('dialog', { name: 'All sections' })
    .getByRole('link', { name: 'Calculators' })
    .click()
  await expect(page.getByText('₹12,000', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Compare scenarios' })).toHaveCount(0)
})

test('accessibility remains usable for calculator controls at 320px', async ({
  page,
}) => {
  await openCalculators(page)
  await selectCalculator(page, 'stp')
  await page.setViewportSize({ width: 320, height: 720 })
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320)
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    audit.violations.filter(
      ({ impact }) => impact === 'critical' || impact === 'serious',
    ),
  ).toEqual([])
})

test('offline reload keeps the private workspace usable without a calculator cache', async ({
  page,
}) => {
  await openCalculators(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.context().setOffline(true)
  await page.reload()
  await page.getByLabel('App PIN', { exact: true }).fill('FinTrack2026')
  await page.getByRole('button', { name: /Unlock/ }).click()
  await page.getByRole('button', { name: /More sections/u }).click()
  await page
    .getByRole('dialog', { name: 'All sections' })
    .getByRole('link', { name: 'Calculators' })
    .click()
  await expect(page.getByRole('heading', { name: 'Calculators' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Illustration' })).toHaveCount(0)
})
