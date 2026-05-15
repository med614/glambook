/**
 * Format a phone number for display: "0612345678" → "06 12 34 56 78"
 * Pass display=true to return '—' when empty (for read-only display).
 */
export function formatPhone(value, display = false) {
  if (!value) return display ? '—' : ''
  const digits = value.replace(/\D/g, '').slice(0, 10)
  const formatted = digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  return formatted || (display ? '—' : '')
}

/**
 * Validate Moroccan phone number: 0[5-7]XXXXXXXX (10 digits)
 */
export function isValidPhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  return /^0[5-7]\d{8}$/.test(digits)
}

/**
 * Strip spaces for storage
 */
export function cleanPhone(phone) {
  return phone ? phone.replace(/\s/g, '') : null
}
