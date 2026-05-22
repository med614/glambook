// Normalise any input to 10 local digits (06XXXXXXXX)
function toLocalDigits(value) {
  if (!value) return ''
  let d = value.replace(/\D/g, '')
  // +212XXXXXXXXX or 212XXXXXXXXX → 0XXXXXXXXX
  if (d.startsWith('212') && d.length === 12) d = '0' + d.slice(3)
  return d.slice(0, 10)
}

// "0612345678" → "06 12 34 56 78"
export function formatPhone(value, display = false) {
  if (!value) return display ? '—' : ''
  const digits = toLocalDigits(value)
  const formatted = digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim()
  return formatted || (display ? '—' : '')
}

// 10 chiffres commençant par 06 ou 07 (05 accepté aussi)
export function isValidPhone(phone) {
  const digits = toLocalDigits(phone || '')
  return /^0[5-7]\d{8}$/.test(digits)
}

// Retourne les 10 chiffres bruts sans espaces
export function cleanPhone(phone) {
  return phone ? toLocalDigits(phone) : null
}
