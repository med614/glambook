<script setup>
import DropdownActions from '@/components/common/DropdownActions.vue'

    const props = defineProps({
        rdvs: { type: Array, default: () => [] },
        staff: { type: Array, default: () => [] }
    })
    
    
    const emit = defineEmits(['open', 'edit', 'cancel', 'noshow', 'delete'])

    const PERIOD_LABELS = { morning: 'Matin', afternoon: 'Après-midi', evening: 'Soir', allday: 'Journée' }

    function formatHour(ts) {
        if (!ts) return '—'
        const d = new Date(ts)
        return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
    }

    function externalLabel(r) {
      if (!r.is_external) return null
      const period = r.external_period ? PERIOD_LABELS[r.external_period] : null
      return period ? `RDV externe – ${period}` : 'RDV externe'
    }
    
    
    
    function svcPrice(as) {
      if (as.price_at_booking != null) return as.price_at_booking
      if (as.service?.price != null) return as.service.price
      return null
    }
    
    function formatDay(ts) {
        if (!ts) return '—'
        const d = new Date(ts)
        return d.toLocaleDateString('fr-FR', {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        })
    }
    
    /* ✅ Nom + prénom robuste */
    function fullName(client) {
        if (!client) return '—'
    
        // 🔑 Cas Supabase : relation retournée sous forme de tableau
        const c = Array.isArray(client) ? client[0] : client
        if (!c) return '—'
    
        const first = c.name || ''
        const last = c.last_name || ''
    
        return `${first} ${last}`.trim()
    }
    
    
    function isStaffAbsent(staffId, date) {
        if (!staffId || !date) return false
        const s = props.staff.find(s => s.id === staffId)
        if (!s?.absences?.length) return false
        const d = date.slice(0, 10)
        return s.absences.some(a => a.start_date <= d && a.end_date >= d)
    }

    function rdvHasAbsentStaff(rdv) {
        const date = rdv.start_time
        return rdv.appointment_services?.some(as => isStaffAbsent(as.staff?.id, date))
    }

    function servicesLabel(rdv) {
        return rdv.appointment_services?.length
            ? rdv.appointment_services.map(a => a.service?.name).filter(Boolean).join(', ')
            : '—'
    }

    function totalPrice(rdv) {
        const items = rdv.appointment_services || []
        const prices = items.map(a => a.price_at_booking ?? a.service?.price ?? null)
        if (prices.every(p => p === null)) return null
        return prices.reduce((sum, p) => sum + (p ?? 0), 0)
    }
    </script>
    
    <template>
        <div class="card">
            <table class="table">
                <thead>
                    <tr>
                        <th>Jour</th>
                        <th>Heure</th>
                        <th>Client</th>
                        <th>Prestations</th>
                        <th>Prix</th>
                        <th>Origine</th>
                        <th style="text-align: right">Actions</th>
                    </tr>
                </thead>
    
                <tbody>

      <tr
        v-for="row in rdvs" :key="row.id"
        class="rdv-row"
        :class="{ 'row-absent': rdvHasAbsentStaff(row) }"
        @click="emit('open', row)"
      >
        <!-- Jour -->
        <td class="time-slot">{{ formatDay(row.start_time) }}</td>

        <!-- Heure -->
        <td class="time-slot">{{ formatHour(row.start_time) }}</td>

        <!-- Client -->
        <td class="client">
          <div style="display:flex;align-items:center;gap:8px;">
            {{ fullName(row.client) }}
            <span v-if="row.is_external" class="badge-external">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              {{ externalLabel(row) }}
            </span>
          </div>
        </td>

        <!-- Prestations : une ligne par service -->
        <td class="service">
          <div v-if="(row.appointment_services || []).length" class="svcs-stack">
            <div v-for="as in row.appointment_services" :key="as.id" class="service-line">
              <span class="service-names">
                {{ as.service?.name || '—' }}
                <span v-if="as.service?.duration_minutes" class="svc-dur">&nbsp;· {{ as.service.duration_minutes }}min</span>
              </span>
              <span v-if="as.staff?.name" class="service-staff">
                – {{ as.staff.name }}
                <span v-if="isStaffAbsent(as.staff?.id, row.start_time)" class="status-badge status-badge--absent">En congé</span>
              </span>
              <span v-else class="badge-unassigned">Non affecté</span>
            </div>
          </div>
          <span v-else class="muted">—</span>
        </td>

        <!-- Prix : total -->
        <td class="price-col">
          <span v-if="totalPrice(row) !== null" class="price-tag">{{ totalPrice(row) }} DH</span>
          <span v-else class="price-tag price-tag--empty">—</span>
        </td>

        <!-- Origine -->
        <td>
          <span v-if="row.source === 'whatsapp'" class="badge-source badge-source--whatsapp">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
            WhatsApp
          </span>
          <span v-else-if="row.source === 'phone'" class="badge-source badge-source--phone">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/></svg>
            Téléphone
          </span>
          <span v-else-if="row.source === 'online'" class="badge-source badge-source--online">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            En ligne
          </span>
          <span v-else class="badge-source badge-source--salon">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>
            Salon
          </span>
        </td>

        <!-- Actions -->
        <td class="actions" style="text-align:right" @click.stop>
          <DropdownActions
            :actions="[
              { label: 'Modifier',  icon: 'edit',     onClick: () => emit('edit', row) },
              { label: 'Annuler',   icon: 'x-circle', onClick: () => emit('cancel', row) },
              { label: 'Absence',   icon: 'user-x',   onClick: () => emit('noshow', row) },
              { label: 'Supprimer', icon: 'trash',     onClick: () => emit('delete', row), class: 'danger' }
            ]"
          />
        </td>
      </tr>

                    <tr v-if="!rdvs.length">
                        <td colspan="7" class="muted center">
                            Aucun RDV
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </template>
    
    <style scoped>
    /* =========================================================
       CARD & TABLE OVERRIDES
    ========================================================= */
    .card {
      background: transparent;
      border: 0;
      box-shadow: none;
      overflow-x: auto;
    }

    .table {
      border: none;
      border-collapse: separate;
      border-spacing: 0 5px;
      min-width: 720px;
    }

    .table thead th {
      background: var(--bg-main);
      color: var(--text-muted);
      border-bottom: 0;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    
    .table tbody tr {
      border-bottom: 0;
      transition: background 0.16s ease, border-color 0.16s ease;
    }

    .table tbody td {
      background: var(--bg-card);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .table tbody td:first-child {
      border-left: 1px solid var(--border);
      border-radius: 12px 0 0 12px;
    }

    .table tbody td:last-child {
      border-right: 1px solid var(--border);
      border-radius: 0 12px 12px 0;
    }

    .table tbody tr:hover {
      background: transparent;
    }

    .table tbody tr:hover td {
      border-color: var(--border-strong);
      background: var(--bg-soft);
    }

    /* =========================================================
       BADGES
    ========================================================= */
    /* ✅ Pastille non affecté */
    .badge-unassigned {
        display: inline-flex;
        align-items: center;
        font-size: 11.5px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--red-soft);
        color: var(--red);
        border: 1px solid rgba(220,38,38,.18);
    }
    
    .row-absent td {
      background: var(--red-soft) !important;
      border-color: rgba(220,38,38,.18) !important;
    }
    .row-absent:hover td {
      background: rgba(220,38,38,.12) !important;
    }

    .status-badge--absent { margin-left: 4px; }

    .badge-external {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10.5px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 999px;
      background: var(--orange-soft);
      color: var(--orange);
      border: 1px solid rgba(217,119,6,.25);
      white-space: nowrap;
    }
    
    /* =========================================================
       TYPOGRAPHY & UTILS
    ========================================================= */
    .time-slot {
      font-weight: 600;
      color: var(--text-main);
    }

    .client {
      font-weight: 600;
      color: var(--text-main);
      font-size: 13.5px;
    }

    .service-line {
      line-height: 1.4;
      font-size: 12.5px;
    }
    
    .service-staff {
      color: var(--text-muted);
      font-weight: 500;
      font-size: 11.5px;
    }

    .svc-dur {
      font-size: 11px;
      color: var(--text-light);
      font-weight: 500;
    }

    .badge-source {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10.5px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .badge-source--whatsapp {
      background: var(--green-soft);
      color: var(--green);
      border: 1px solid rgba(21,128,61,.2);
    }
    .badge-source--phone {
      background: var(--blue-soft);
      color: var(--blue);
      border: 1px solid rgba(29,78,216,.2);
    }
    .badge-source--salon {
      background: var(--bg-soft);
      color: var(--text-muted);
      border: 1px solid var(--border);
    }
    .badge-source--online {
      background: var(--primary-surface);
      color: var(--primary);
      border: 1px solid rgba(168,129,10,.22);
    }

    .price-col { white-space: nowrap; }
    .price-tag {
      font-size: 13px; font-weight: 700; color: var(--text-main);
    }
    .price-tag--empty { color: var(--text-muted); font-weight: 400; }

    .svcs-stack { display: flex; flex-direction: column; gap: 5px; }
    .muted { color: var(--text-muted); }

    @media (max-width: 768px) {
      .table {
        min-width: 720px;
      }
    }
    </style>
