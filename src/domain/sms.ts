import type { Account, Category, ISODate, Paise, Transaction } from './types'

export interface RawSmsMessage {
  id: string
  address: string
  body: string
  dateMs: number
}

export interface ParsedSmsTransaction {
  smsId: string
  date: ISODate
  amountPaise: Paise
  kind: 'expense' | 'income'
  merchant: string
  rawAccountDigits: string | null
  reference: string | null
}

export interface SmsCandidatePreview extends ParsedSmsTransaction {
  matchedAccountId: string | null
  suggestedCategoryId: string | null
  duplicate: boolean
  matchedTransactionId: string | null
}

function formatDate(dateMs: number): ISODate {
  const d = new Date(dateMs)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseFinancialSms(sms: RawSmsMessage): ParsedSmsTransaction | null {
  const body = sms.body
  if (!body) return null

  // Guard against OTP / authentication messages
  if (
    /\b(?:otp|one\s*time\s*password|verification\s*code|security\s*code|secret\s*code)\b/i.test(
      body,
    )
  ) {
    return null
  }

  // Guard against promotional text / loan solicitations without debit/credit words
  if (
    /\b(?:apply\s+now|claim\s+now|pre-approved|eligible\s+for|click\s+here|congratulations)\b/i.test(
      body,
    ) &&
    !/\b(?:debited|spent|paid|withdrawn|credited|refund)\b/i.test(body)
  ) {
    return null
  }

  // Match currency and amount (e.g. INR 450.00, Rs. 150.00, Rs 2,500.00, ₹500)
  const amountMatch =
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(body) ??
    /([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)/i.exec(body)

  if (!amountMatch) return null

  const rawAmount = amountMatch[1]?.replace(/,/g, '')
  if (!rawAmount) return null
  const numericAmount = Number.parseFloat(rawAmount)
  if (Number.isNaN(numericAmount) || numericAmount <= 0) return null
  const amountPaise = Math.round(numericAmount * 100)

  // Determine transaction kind
  let kind: 'expense' | 'income'
  if (
    /\b(?:credited|refund|received)\b/i.test(body) &&
    !/\b(?:debited|spent|paid)\b/i.test(body)
  ) {
    kind = 'income'
  } else if (/\b(?:debited|spent|paid|sent|txn\s+of|withdrawn)\b/i.test(body)) {
    kind = 'expense'
  } else {
    // Unclear transactional context
    return null
  }

  // Extract account or card last-4 digits
  let rawAccountDigits: string | null = null
  const accountMatch =
    /(?:a\/c|acct|account|card|ending)\s*(?:no\.?)?\s*(?:[*xX]+|\.{2,})?(\d{4})\b/i.exec(
      body,
    ) ??
    /[*xX]{2,}(\d{4})\b/i.exec(body) ??
    /\.{2,}(\d{4})\b/i.exec(body)

  if (accountMatch?.[1]) {
    rawAccountDigits = accountMatch[1]
  }

  // Extract merchant / payee name
  let merchant = 'Unknown'
  const upiMerchantMatch = /UPI\/[A-Za-z0-9]+\/([A-Za-z0-9\s._\-@]+?)(?=\s+(?:on|avail|bal|ref|via|\.|$))/i.exec(body)
  const generalMerchantMatch = /(?:at|to|info:?|from)\s+([A-Za-z0-9\s._\-@]+?)(?=\s+(?:on|avail|bal|ref|upi|via|\.|$))/i.exec(body)

  if (upiMerchantMatch?.[1]) {
    merchant = upiMerchantMatch[1].trim()
  } else if (generalMerchantMatch?.[1]) {
    merchant = generalMerchantMatch[1].trim()
  } else if (sms.address) {
    merchant = sms.address
  }

  // Extract reference number / UTR
  let reference: string | null = null
  const refMatch = /(?:ref|rrn|utr|txn\s*(?:id|ref)?)\s*(?:no\.?)?[:\s]*([A-Za-z0-9]+)/i.exec(body)
  if (refMatch?.[1]) {
    reference = refMatch[1].trim()
  }

  const date = formatDate(sms.dateMs)

  return {
    smsId: sms.id,
    date,
    amountPaise,
    kind,
    merchant,
    rawAccountDigits,
    reference,
  }
}

function suggestCategory(merchant: string, categories: Category[]): string | null {
  const lower = merchant.toLowerCase()

  const foodKeywords = ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'eats', 'mcdonald', 'starbucks', 'blinkit', 'zepto', 'instamart', 'dining']
  const shoppingKeywords = ['amazon', 'flipkart', 'myntra', 'retail', 'mart', 'store', 'shop']
  const transportKeywords = ['uber', 'ola', 'irctc', 'metro', 'petrol', 'fuel', 'rail']
  const utilityKeywords = ['bescom', 'airtel', 'jio', 'electricity', 'water', 'gas', 'bill', 'broadband']

  let targetType: string | null = null
  if (foodKeywords.some((k) => lower.includes(k))) targetType = 'food'
  else if (shoppingKeywords.some((k) => lower.includes(k))) targetType = 'shopping'
  else if (transportKeywords.some((k) => lower.includes(k))) targetType = 'transport'
  else if (utilityKeywords.some((k) => lower.includes(k))) targetType = 'utility'

  if (!targetType) return null

  const match = categories.find(
    (c) =>
      c.kind === 'expense' &&
      !c.archived &&
      (c.name.toLowerCase().includes(targetType!) ||
        (targetType === 'food' && (c.name.toLowerCase().includes('dining') || c.name.toLowerCase().includes('grocer')))),
  )

  return match ? match.id : null
}

export function previewSmsTransactions(options: {
  messages: RawSmsMessage[]
  accounts: Account[]
  categories: Category[]
  existingTransactions: Transaction[]
  importBatchId?: string
}): SmsCandidatePreview[] {
  const { messages, accounts, categories, existingTransactions } = options
  const previews: SmsCandidatePreview[] = []

  for (const message of messages) {
    const parsed = parseFinancialSms(message)
    if (!parsed) continue

    // Match account
    let matchedAccountId: string | null = null
    if (parsed.rawAccountDigits) {
      const digits = parsed.rawAccountDigits
      const match = accounts.find(
        (a) =>
          !a.archived &&
          (a.creditCardDetails?.lastFour === digits || a.name.includes(digits)),
      )
      if (match) matchedAccountId = match.id
    }

    if (!matchedAccountId) {
      const defaultAccount = accounts.find((a) => !a.archived)
      if (defaultAccount) matchedAccountId = defaultAccount.id
    }

    // Suggest category
    const suggestedCategoryId = suggestCategory(parsed.merchant, categories)

    // Check duplicate
    let duplicate = false
    let matchedTransactionId: string | null = null

    if (matchedAccountId) {
      const existingMatch = existingTransactions.find(
        (t) =>
          t.accountId === matchedAccountId &&
          t.date === parsed.date &&
          t.amountPaise === parsed.amountPaise,
      )
      if (existingMatch) {
        duplicate = true
        matchedTransactionId = existingMatch.id
      }
    }

    previews.push({
      ...parsed,
      matchedAccountId,
      suggestedCategoryId,
      duplicate,
      matchedTransactionId,
    })
  }

  return previews
}
