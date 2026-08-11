export const CURRENCY_SYMBOLS = {
  USD: '$',
  CAD: 'CA$',
  GBP: '£',
  EUR: '€',
  AUD: 'A$',
  MXN: 'MX$',
  JPY: '¥',
  INR: '₹',
}

export function formatMoneyForCurrency(value, currency = 'USD') {
  const currencyCode = CURRENCY_SYMBOLS[currency] ? currency : 'USD'
  const symbol = CURRENCY_SYMBOLS[currencyCode]
  const numericValue = Number(value)
  const amount = Number.isFinite(numericValue) ? numericValue : 0
  const decimals = currencyCode === 'JPY' ? 0 : 2
  const sign = amount < 0 ? '-' : ''
  const formattedAmount = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${sign}${symbol}${formattedAmount}`
}
