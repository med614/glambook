import express from 'express'
import twilio from 'twilio'
import { supabase } from '../lib/supabase.js'

const router = express.Router()

const TWILIO_SID   = process.env.TWILIO_ACCOUNT_SID
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN
const FROM         = process.env.TWILIO_WHATSAPP_FROM
const SALON_PHONE  = process.env.SALON_PHONE
const ORG_ID       = '77748ee2-0bba-429b-a696-f710ed523e7e'

const client_twilio = twilio(TWILIO_SID, TWILIO_TOKEN)

/* ── Helpers ─────────────────────────────────────────────── */

async function send(to, body) {
  if (process.env.SIMULATE_MODE === '1') {
    console.log(`\n🤖 Bot :\n${body}\n`)
    return
  }
  await client_twilio.messages.create({ from: FROM, to: `whatsapp:${to}`, body })
}

function localDate(d) {
  return d.toLocaleDateString('en-CA')
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

async function getOrgSettings() {
  const { data } = await supabase
    .from('organization_settings')
    .select('opening_hours, whatsapp_enabled, whatsapp_show_prices')
    .eq('org_id', ORG_ID)
    .maybeSingle()
  return data || null
}

async function getClosedDates() {
  const today = localDate(new Date())
  const { data } = await supabase
    .from('salon_closures')
    .select('date, end_date, label')
    .eq('org_id', ORG_ID)
    .gte('end_date', today)
  // Expand ranges into individual dates
  const closed = new Set()
  for (const c of data || []) {
    const start = new Date(c.date + 'T12:00:00')
    const end   = new Date((c.end_date || c.date) + 'T12:00:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      closed.add(localDate(new Date(d)))
    }
  }
  return closed
}

async function getActiveClosure(date) {
  const { data } = await supabase
    .from('salon_closures')
    .select('date, end_date, label')
    .eq('org_id', ORG_ID)
    .lte('date', date)
    .gte('end_date', date)
    .maybeSingle()
  return data || null
}

async function nextDays(n = 5) {
  const [settings, closedDates] = await Promise.all([getOrgSettings(), getClosedDates()])
  const days = []
  const d = new Date()

  for (let i = 0; days.length < n && i < 30; i++) {
    const next = new Date(d)
    next.setDate(d.getDate() + i)
    const dayKey = DAY_KEYS[next.getDay()]
    const dateStr = localDate(next)

    // Vérifier si le salon est ouvert ce jour
    if (settings?.opening_hours) {
      const dayConfig = settings.opening_hours[dayKey]
      if (!dayConfig?.active) continue
    } else {
      if (next.getDay() === 0) continue // dimanche par défaut
    }

    // Vérifier fermetures exceptionnelles
    if (closedDates.has(dateStr)) continue

    days.push(next)
  }
  return days
}

function dayLabel(d, lang = 'fr') {
  const locale = lang === 'ar' ? 'ar-MA' : 'fr-FR'
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
}

function buildTimeSlots(openTime = '09:00', closeTime = '18:00') {
  const slots = []
  const [openH] = openTime.split(':').map(Number)
  const [closeH] = closeTime.split(':').map(Number)
  for (let h = openH; h < closeH; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`)
  }
  return slots
}

async function getFreeSlots(date, serviceId) {
  // Horaires du jour
  const settings = await getOrgSettings()
  const dayKey = DAY_KEYS[new Date(date + 'T12:00:00').getDay()]
  const dayConfig = settings?.opening_hours?.[dayKey]
  const TIME_SLOTS = buildTimeSlots(dayConfig?.open || '09:00', dayConfig?.close || '18:00')
  // 1. Récupérer la catégorie de la prestation choisie
  const { data: service } = await supabase
    .from('services')
    .select('category_id')
    .eq('id', serviceId)
    .single()

  const categoryId = service?.category_id

  // 2. Récupérer les staff compétents (actifs + bonne catégorie)
  let competentStaffIds = []
  if (categoryId) {
    const { data: staffLinks } = await supabase
      .from('staff_categories')
      .select('staff_id, staff(id, is_active)')
      .eq('category_id', categoryId)
    competentStaffIds = (staffLinks || [])
      .filter(l => l.staff?.is_active)
      .map(l => l.staff_id)
  }

  // Si pas de catégorie ou aucun staff compétent → 1 seul RDV par créneau (logique simple)
  if (!competentStaffIds.length) {
    const { data: taken } = await supabase
      .from('appointments')
      .select('start_time, appointment_services(service:service_id(duration_minutes))')
      .eq('organization_id', ORG_ID)
      .gte('start_time', date + 'T00:00:00')
      .lte('start_time', date + 'T23:59:59')
      .in('status', ['scheduled', 'in_progress', 'confirmed'])

    const takenMinutes = new Set()
    for (const appt of taken || []) {
      const start = parseInt(appt.start_time.substring(11, 13)) * 60 + parseInt(appt.start_time.substring(14, 16))
      const dur = appt.appointment_services?.reduce((sum, as) => sum + (as.service?.duration_minutes || 60), 0) || 60
      for (let m = start; m < start + dur; m += 60) takenMinutes.add(m)
    }
    return TIME_SLOTS.filter(t => {
      const [h, min] = t.split(':').map(Number)
      return !takenMinutes.has(h * 60 + min)
    })
  }

  const totalCompetent = competentStaffIds.length

  // 3. Récupérer les RDV du jour avec le staff affecté et la durée
  const { data: taken } = await supabase
    .from('appointments')
    .select('start_time, appointment_services(staff_id, service:service_id(duration_minutes))')
    .eq('organization_id', ORG_ID)
    .gte('start_time', date + 'T00:00:00')
    .lte('start_time', date + 'T23:59:59')
    .in('status', ['scheduled', 'in_progress', 'confirmed'])

  // 4. Pour chaque créneau, compter combien de staff compétents sont occupés
  return TIME_SLOTS.filter(slot => {
    const [h, min] = slot.split(':').map(Number)
    const slotMinutes = h * 60 + min

    let busyCount = 0
    for (const appt of taken || []) {
      const apptStart = parseInt(appt.start_time.substring(11, 13)) * 60 + parseInt(appt.start_time.substring(14, 16))
      for (const as of appt.appointment_services || []) {
        if (!as.staff_id || !competentStaffIds.includes(as.staff_id)) continue
        const dur = as.service?.duration_minutes || 60
        const apptEnd = apptStart + dur
        if (slotMinutes >= apptStart && slotMinutes < apptEnd) {
          busyCount++
        }
      }
    }

    return busyCount < totalCompetent
  })
}

/* ── Traductions ─────────────────────────────────────────── */

const T = {
  fr: {
    langPrompt: `Bonjour ! 👋 Bienvenue chez *Free Style*.\n\nChoisissez votre langue :\n\n*1*. 🇫🇷 Français\n*2*. 🇲🇦 العربية`,
    greetNew: `Bonjour ! 👋 Bienvenue chez *Free Style*.\n\nQue souhaitez-vous réserver ?\n\n`,
    greetKnown: (name) => `Bonjour *${name}* ! 👋 Heureux de vous revoir chez *Free Style*.\n\nQue souhaitez-vous réserver ?\n\n`,
    noService: (phone) => `Bonjour ! 👋 Aucune prestation disponible pour le moment. Appelez-nous au *${phone}*`,
    callOption: (n) => `\n📞 *${n}*. Appeler le salon directement\n`,
    footer: `\n_Répondez avec le numéro de votre choix_`,
    serviceSelected: (name) => `✂️ *${name}* sélectionné.\n\nChoisissez un jour :\n\n`,
    menuHint: `\n_Tapez "menu" pour recommencer_`,
    invalidChoice: (n) => `Choix invalide. Répondez avec un numéro entre 1 et ${n}.`,
    noSlots: (day) => `😔 Aucun créneau disponible le ${day}.\n\nChoisissez un autre jour ou tapez "menu" pour recommencer.`,
    slotsHeader: (day) => `📅 *${day}*\n\nCréneaux disponibles :\n\n`,
    askName: `Pour finaliser votre réservation, quel est votre nom complet ? 😊`,
    nameTooShort: `Merci d'entrer votre nom complet (au moins 2 lettres).`,
    recap: (name, service, day, time) =>
      `✅ Voici votre récapitulatif :\n\n👤 *${name}*\n✂️ *${service}*\n📅 *${day}*\n🕐 *${time}*\n\nConfirmez-vous ce rendez-vous ?\n\n*1*. ✅ Confirmer\n*2*. ❌ Annuler`,
    cancelled: (phone) => `❌ Réservation annulée.\n\nTapez *menu* pour recommencer ou appelez-nous au *${phone}*.`,
    confirmPrompt: `Répondez *1* pour confirmer ou *2* pour annuler.`,
    confirmed: (service, day, time, phone) =>
      `🎉 *Rendez-vous confirmé !*\n\n✂️ ${service}\n📅 ${day}\n🕐 ${time}\n\nMerci et à bientôt chez *Free Style* ! 💇‍♀️\n\n_Pour annuler, appelez le ${phone}_`,
    error: (phone) => `❌ Une erreur est survenue. Veuillez appeler le salon : *${phone}*`,
    callDirect: (phone) => `📞 Pour prendre rendez-vous par téléphone :\n\n*${phone}*\n\nÀ bientôt ! 😊`,
    retry: `Je n'ai pas compris. Répondez avec un numéro :\n\n`,
    callSuffix: (n) => `*${n}*. 📞 Appeler le salon`,
    chooseDay: `Choisissez un jour :\n\n`,
  },
  ar: {
    langPrompt: `Bonjour ! 👋 Bienvenue chez *Free Style*.\n\nChoisissez votre langue :\n\n*1*. 🇫🇷 Français\n*2*. 🇲🇦 العربية`,
    greetNew: `أهلاً وسهلاً ! 👋 مرحباً بك في *Free Style*.\n\nماذا تريد أن تحجز ؟\n\n`,
    greetKnown: (name) => `أهلاً *${name}* ! 👋 يسعدنا عودتك إلى *Free Style*.\n\nماذا تريد أن تحجز ؟\n\n`,
    noService: (phone) => `أهلاً ! 👋 لا توجد خدمات متاحة حالياً. اتصل بنا على *${phone}*`,
    callOption: (n) => `\n📞 *${n}*. الاتصال بالصالون مباشرة\n`,
    footer: `\n_أجب برقم اختيارك_`,
    serviceSelected: (name) => `✂️ تم اختيار *${name}*.\n\naختر يوماً :\n\n`,
    menuHint: `\n_اكتب "قائمة" للبدء من جديد_`,
    invalidChoice: (n) => `اختيار غير صحيح. أجب برقم بين 1 و ${n}.`,
    noSlots: (day) => `😔 لا توجد مواعيد متاحة يوم ${day}.\n\nاختر يوماً آخر أو اكتب "قائمة" للبدء من جديد.`,
    slotsHeader: (day) => `📅 *${day}*\n\nالمواعيد المتاحة :\n\n`,
    askName: `لإتمام الحجز، ما هو اسمك الكامل ؟ 😊`,
    nameTooShort: `من فضلك أدخل اسمك الكامل (حرفان على الأقل).`,
    recap: (name, service, day, time) =>
      `✅ ملخص حجزك :\n\n👤 *${name}*\n✂️ *${service}*\n📅 *${day}*\n🕐 *${time}*\n\nهل تؤكد الموعد ؟\n\n*1*. ✅ تأكيد\n*2*. ❌ إلغاء`,
    cancelled: (phone) => `❌ تم إلغاء الحجز.\n\nاكتب *قائمة* للبدء من جديد أو اتصل بنا على *${phone}*.`,
    confirmPrompt: `أجب *1* للتأكيد أو *2* للإلغاء.`,
    confirmed: (service, day, time, phone) =>
      `🎉 *تم تأكيد موعدك !*\n\n✂️ ${service}\n📅 ${day}\n🕐 ${time}\n\nشكراً لك وإلى اللقاء في *Free Style* ! 💇‍♀️\n\n_للإلغاء، اتصل على ${phone}_`,
    error: (phone) => `❌ حدث خطأ. من فضلك اتصل بالصالون : *${phone}*`,
    callDirect: (phone) => `📞 للحجز عبر الهاتف :\n\n*${phone}*\n\nإلى اللقاء ! 😊`,
    retry: `لم أفهم. أجب برقم :\n\n`,
    callSuffix: (n) => `*${n}*. 📞 الاتصال بالصالون`,
    chooseDay: `اختر يوماً :\n\n`,
  }
}

/* ── Session Supabase ────────────────────────────────────── */

function normalizePhone(phone) {
  return '+' + phone.replace(/\D/g, '').replace(/^0+/, '')
}

async function getSession(phone) {
  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('*')
    .eq('phone', phone)
    .maybeSingle()
  return data
}

async function setSession(phone, updates) {
  const existing = await getSession(phone)
  if (existing) {
    await supabase.from('whatsapp_sessions')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('phone', phone)
  } else {
    await supabase.from('whatsapp_sessions')
      .insert({ phone, org_id: ORG_ID, ...updates })
  }
}

async function clearSession(phone) {
  await supabase.from('whatsapp_sessions').delete().eq('phone', phone)
}

/* ── Machine à états ─────────────────────────────────────── */

async function handleMessage(rawPhone, text) {
  const phone = normalizePhone(rawPhone)
  const msg = text.trim().toLowerCase()
  const session = await getSession(phone)
  const step = session?.step || 'lang'
  const lang = session?.lang || 'fr'
  const t = T[lang]

  // Déclencheur : nom du salon (obligatoire pour tout)
  const salonTriggers = ['free style', 'freestyle', 'free-style', 'freesyle', 'fresstyle']
  const isTrigger = salonTriggers.some(tr => msg.includes(tr))

  // Vérifier si le bot est en pause
  const orgSettings = await getOrgSettings()
  if (orgSettings && orgSettings.whatsapp_enabled === false) {
    if (!isTrigger) return
    await clearSession(phone)
    await send(phone,
      `⏸️ Le service de réservation en ligne est temporairement indisponible.\n\nPour prendre rendez-vous, appelez-nous au *${SALON_PHONE}*.\n\nMerci de votre compréhension 🙏\n\n---\n\nخدمة الحجز عبر الإنترنت غير متاحة مؤقتاً.\n\nللحجز، اتصل بنا على *${SALON_PHONE}*`
    )
    return
  }

  // Vérifier fermeture exceptionnelle aujourd'hui
  const todayStr = localDate(new Date())
  const closure = await getActiveClosure(todayStr)
  if (closure) {
    if (!isTrigger) return
    await clearSession(phone)
    const endLabel = closure.end_date && closure.end_date !== closure.date
      ? ` au *${new Date(closure.end_date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}*`
      : ''
    const startLabel = new Date(closure.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    const reason = closure.label ? ` (${closure.label})` : ''
    await send(phone,
      `🔒 Le salon *Free Style* est fermé du *${startLabel}*${endLabel}${reason}.\n\nPour toute information, appelez le *${SALON_PHONE}*. À bientôt ! 🙏\n\n---\n\n🔒 صالون *Free Style* مغلق من *${startLabel}*${endLabel}${reason}.\n\nللاستفسار اتصل على *${SALON_PHONE}*`
    )
    return
  }

  if (isTrigger) {
    await clearSession(phone)
    return sendLangChoice(phone)
  }

  // Pas de session → ignorer silencieusement
  if (!session) return

  // Reset universel
  const resetWords = ['menu', 'annuler', 'restart', '0', 'قائمة', 'إلغاء']
  if (resetWords.includes(msg)) {
    await clearSession(phone)
    return sendLangChoice(phone)
  }

  switch (step) {
    case 'lang':         return handleLangChoice(phone, msg)
    case 'choose_service': return handleChooseService(phone, msg, session)
    case 'choose_date':  return handleChooseDate(phone, msg, session)
    case 'choose_time':  return handleChooseTime(phone, msg, session)
    case 'ask_name':     return handleAskName(phone, msg, session)
    case 'confirm':      return handleConfirm(phone, msg, session)
    default:             return sendLangChoice(phone)
  }
}

/* ── Choix de langue ── */
async function sendLangChoice(phone) {
  await setSession(phone, { step: 'lang', lang: 'fr', service_id: null, date: null, time: null })
  await send(phone, `Bonjour ! 👋 Bienvenue chez *Free Style*.\nأهلاً وسهلاً ! 👋 مرحباً بك في *Free Style*.\n\n🇫🇷 *1*. Français\n🇲🇦 *2*. العربية`)
}

async function handleLangChoice(phone, msg) {
  if (msg === '1' || msg.includes('français') || msg.includes('francais') || msg.includes('fr')) {
    await setSession(phone, { lang: 'fr', step: 'choose_service' })
    return sendWelcome(phone, 'fr')
  }
  if (msg === '2' || msg.includes('عرب') || msg.includes('arabic') || msg.includes('ar')) {
    await setSession(phone, { lang: 'ar', step: 'choose_service' })
    return sendWelcome(phone, 'ar')
  }
  await send(phone, `🇫🇷 *1*. Français\n🇲🇦 *2*. العربية`)
}

/* ── Accueil + liste prestations ── */
async function sendWelcome(phone, lang) {
  const t = T[lang]
  const phoneClean = '0' + phone.replace(/\D/g, '').slice(-9)

  const [{ data: existingClient }, { data: services }, waSettings] = await Promise.all([
    supabase.from('clients').select('name').eq('organization_id', ORG_ID).eq('phone', phoneClean).maybeSingle(),
    supabase.from('services').select('id, name, name_ar, price, duration_minutes')
      .eq('organization_id', ORG_ID).eq('whatsapp_enabled', true).eq('is_active', true).order('name'),
    getOrgSettings()
  ])

  const showPrices = waSettings?.whatsapp_show_prices !== false

  const greeting = existingClient?.name ? t.greetKnown(existingClient.name) : t.greetNew

  if (!services?.length) {
    await send(phone, t.noService(SALON_PHONE))
    return
  }

  let msg = greeting
  services.forEach((s, i) => {
    const displayName = (lang === 'ar' && s.name_ar) ? s.name_ar : s.name
    const prix = (showPrices && s.price) ? ` — ${s.price} DH` : ''
    const dur  = s.duration_minutes ? ` (${s.duration_minutes}min)` : ''
    msg += `*${i + 1}*. ${displayName}${dur}${prix}\n`
  })
  msg += t.callOption(services.length + 1)
  msg += t.footer

  await send(phone, msg)
}

/* ── Choix de la prestation ── */
async function handleChooseService(phone, msg, session) {
  const lang = session.lang || 'fr'
  const t = T[lang]

  const [{ data: services }, waSettings] = await Promise.all([
    supabase.from('services').select('id, name, name_ar, price, duration_minutes')
      .eq('organization_id', ORG_ID).eq('whatsapp_enabled', true).eq('is_active', true).order('name'),
    getOrgSettings()
  ])

  const showPrices = waSettings?.whatsapp_show_prices !== false

  const idx = parseInt(msg) - 1
  if (isNaN(idx) || idx < 0 || idx > services.length) {
    let retry = t.retry
    services.forEach((s, i) => {
      const displayName = (lang === 'ar' && s.name_ar) ? s.name_ar : s.name
      const prix = (showPrices && s.price) ? ` — ${s.price} DH` : ''
      const dur  = s.duration_minutes ? ` (${s.duration_minutes}min)` : ''
      retry += `*${i + 1}*. ${displayName}${dur}${prix}\n`
    })
    retry += t.callSuffix(services.length + 1)
    await send(phone, retry)
    return
  }

  if (idx === services.length) {
    await clearSession(phone)
    await send(phone, t.callDirect(SALON_PHONE))
    return
  }

  const service = services[idx]
  const displayName = (lang === 'ar' && service.name_ar) ? service.name_ar : service.name
  const days = await nextDays(6)

  let msg2 = t.serviceSelected(displayName) + t.chooseDay
  days.forEach((d, i) => { msg2 += `*${i + 1}*. ${dayLabel(d, lang)}\n` })
  msg2 += t.menuHint

  await setSession(phone, { step: 'choose_date', service_id: service.id, service_name: displayName })
  await send(phone, msg2)
}

/* ── Choix du jour ── */
async function handleChooseDate(phone, msg, session) {
  const lang = session.lang || 'fr'
  const t = T[lang]
  const days = await nextDays(6)
  const idx = parseInt(msg) - 1

  if (isNaN(idx) || idx < 0 || idx >= days.length) {
    await send(phone, t.invalidChoice(days.length))
    return
  }

  const chosen = days[idx]
  const dateStr = localDate(chosen)
  const freeSlots = await getFreeSlots(dateStr, session.service_id)

  if (!freeSlots.length) {
    await send(phone, t.noSlots(dayLabel(chosen, lang)))
    return
  }

  let msg2 = t.slotsHeader(dayLabel(chosen, lang))
  freeSlots.forEach((sl, i) => { msg2 += `*${i + 1}*. ${sl}\n` })
  msg2 += t.menuHint

  await setSession(phone, { step: 'choose_time', date: dateStr })
  await send(phone, msg2)
}

/* ── Choix du créneau ── */
async function handleChooseTime(phone, msg, session) {
  const lang = session.lang || 'fr'
  const t = T[lang]
  const freeSlots = await getFreeSlots(session.date, session.service_id)
  const idx = parseInt(msg) - 1

  if (isNaN(idx) || idx < 0 || idx >= freeSlots.length) {
    await send(phone, t.invalidChoice(freeSlots.length))
    return
  }

  const time = freeSlots[idx]
  await setSession(phone, { time })

  const phoneClean = '0' + phone.replace(/\D/g, '').slice(-9)
  const { data: existing } = await supabase
    .from('clients').select('id, name, last_name')
    .eq('organization_id', ORG_ID).eq('phone', phoneClean).maybeSingle()

  if (existing) {
    const dateObj = new Date(session.date + 'T12:00:00')
    const fullname = `${existing.name}${existing.last_name ? ' ' + existing.last_name : ''}`
    await setSession(phone, { step: 'confirm' })
    await send(phone, t.recap(fullname, session.service_name, dayLabel(dateObj, lang), time))
  } else {
    await setSession(phone, { step: 'ask_name' })
    await send(phone, t.askName)
  }
}

/* ── Saisie du prénom ── */
async function handleAskName(phone, msg, session) {
  const lang = session.lang || 'fr'
  const t = T[lang]
  const name = msg.trim().charAt(0).toUpperCase() + msg.trim().slice(1)

  if (!name || name.length < 2) {
    await send(phone, t.nameTooShort)
    return
  }

  const dateObj = new Date(session.date + 'T12:00:00')
  await setSession(phone, { step: 'confirm', service_name: session.service_name + '|name:' + name })
  await send(phone, t.recap(name, session.service_name, dayLabel(dateObj, lang), session.time))
}

/* ── Confirmation ── */
async function handleConfirm(phone, msg, session) {
  const lang = session.lang || 'fr'
  const t = T[lang]

  if (msg === '2' || msg.includes('annul') || msg.includes('إلغاء') || msg.includes('لا')) {
    await clearSession(phone)
    await send(phone, t.cancelled(SALON_PHONE))
    return
  }

  if (msg !== '1' && !msg.includes('confirm') && !msg.includes('oui') && !msg.includes('نعم') && !msg.includes('تأكيد')) {
    await send(phone, t.confirmPrompt)
    return
  }

  let clientName = 'Client'
  let realServiceName = session.service_name
  if (session.service_name?.includes('|name:')) {
    const parts = session.service_name.split('|name:')
    realServiceName = parts[0]
    clientName = parts[1] || 'Client'
  }

  const phoneClean = '0' + phone.replace(/\D/g, '').slice(-9)

  let { data: existingClient } = await supabase
    .from('clients').select('id, name')
    .eq('organization_id', ORG_ID).eq('phone', phoneClean).maybeSingle()

  let clientId = existingClient?.id
  if (!clientId) {
    const { data: newClient } = await supabase
      .from('clients')
      .insert({ organization_id: ORG_ID, name: clientName, phone: phoneClean })
      .select('id').single()
    clientId = newClient?.id
  }

  const startTime = `${session.date}T${session.time}:00`
  const { data: appt, error } = await supabase
    .from('appointments')
    .insert({
      organization_id: ORG_ID,
      client_id: clientId,
      start_time: startTime,
      status: 'scheduled',
      type: 'appointment',
      source: 'whatsapp'
    })
    .select('id').single()

  if (error || !appt) {
    await send(phone, t.error(SALON_PHONE))
    return
  }

  const { data: svc } = await supabase.from('services').select('price').eq('id', session.service_id).single()
  await supabase.from('appointment_services').insert({
    appointment_id: appt.id,
    service_id: session.service_id,
    staff_id: null,
    price_at_booking: svc?.price ?? null
  })

  const dateObj = new Date(session.date + 'T12:00:00')
  await clearSession(phone)
  await send(phone, t.confirmed(realServiceName, dayLabel(dateObj, lang), session.time, SALON_PHONE))
}

/* ── Rappels automatiques ────────────────────────────────── */

async function sendReminders() {
  if (process.env.SIMULATE_MODE === '1') return

  const now = new Date()
  const from = new Date(now.getTime() + 55 * 60 * 1000).toISOString()
  const to   = new Date(now.getTime() + 65 * 60 * 1000).toISOString()

  const { data: appts } = await supabase
    .from('appointments')
    .select(`
      id, start_time,
      client:clients(name, last_name, phone),
      appointment_services(service:service_id(name))
    `)
    .eq('organization_id', ORG_ID)
    .in('status', ['scheduled', 'confirmed'])
    .eq('reminder_sent', false)
    .eq('source', 'whatsapp')
    .gte('start_time', from)
    .lte('start_time', to)

  for (const appt of appts || []) {
    const client = Array.isArray(appt.client) ? appt.client[0] : appt.client
    if (!client?.phone) continue

    const phone = '+' + client.phone.replace(/\D/g, '').replace(/^0/, '212')
    const name = `${client.name || ''}${client.last_name ? ' ' + client.last_name : ''}`.trim()
    const service = appt.appointment_services?.[0]?.service?.name || ''
    const time = appt.start_time.substring(11, 16)

    const msgFr = `⏰ *Rappel de votre rendez-vous*\n\nBonjour *${name}* !\n\nVotre rendez-vous chez *Free Style* est dans *1 heure* :\n\n✂️ ${service}\n🕐 ${time}\n\nÀ tout à l'heure ! 💇‍♀️`

    try {
      await client_twilio.messages.create({ from: FROM, to: `whatsapp:${phone}`, body: msgFr })
      await supabase.from('appointments').update({ reminder_sent: true }).eq('id', appt.id)
      console.log(`[Reminder] sent to ${phone}`)
    } catch (e) {
      console.error(`[Reminder] error for ${phone}:`, e.message)
    }
  }
}

setInterval(sendReminders, 60 * 1000)

/* ── Route Twilio webhook ────────────────────────────────── */

router.post('/webhook', express.urlencoded({ extended: false }), async (req, res) => {
  res.status(200).send('<Response></Response>')

  const body  = req.body?.Body || ''
  const from  = req.body?.From?.replace('whatsapp:', '') || ''

  console.log('[WA] from:', JSON.stringify(from), 'body:', JSON.stringify(body))

  if (!from) return

  try {
    await handleMessage(from, body)
    console.log('[WA] handleMessage done')
  } catch (e) {
    console.error('[WhatsApp webhook error]', e)
  }
})

export default router
