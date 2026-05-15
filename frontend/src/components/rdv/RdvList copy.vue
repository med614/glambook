<script setup>

const props = defineProps({
    rdvs: {
        type: Array,
        default: () => []
    }
})


const emit = defineEmits(['edit', 'action'])

function formatHour(ts) {
    return ts?.slice(11, 16)
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


function servicesLabel(rdv) {
    return rdv.appointment_services?.length
        ? rdv.appointment_services.map(a => a.service.name).join(', ')
        : '—'
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
                    <th>Staff</th>
                    <th></th>
                </tr>
            </thead>

            <tbody>
            
  <tr
    v-for="r in rdvs"
    :key="r.id"
    class="rdv-row"
    @click="emit('edit', r)"
  >


                    <!-- Jour -->
                    <td class="time-slot">
  {{ formatDay(r.start_time) }}

  <span
    v-if="r.is_external"
    class="badge-external"
  >
    Externe
  </span>
</td>

                    <!-- Heure -->
                    <td class="time-slot">
                        {{ formatHour(r.start_time) }}
                    </td>

                    <!-- Client -->
                    <td class="client">
                        {{ fullName(r.client) }}
                    </td>

                    <!-- Prestations -->
                    <td class="service">
                        {{ servicesLabel(r) }}
                    </td>

                    <!-- Staff -->
                    <td>
                        <span v-if="r.staff">
                            👤 {{ r.staff.name }}
                        </span>
                        <span v-else class="badge-unassigned">
                            Non affecté
                        </span>
                    </td>

                    <!-- Actions -->
                    <td class="actions">
                    

                        <button class="delete-btn" @click.stop="emit('action', { type: 'open', rdv: r })">
                            Annuler
                        </button>
                    </td>
                </tr>

                <tr v-if="!rdvs.length">
                    <td colspan="6" class="muted center">
                        Aucun RDV
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>

<style scoped>
/* ✅ Pastille non affecté — conforme design system */
.badge-unassigned {
    display: inline-flex;
    align-items: center;
    font-size: 11.5px;
    font-weight: 500;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 95, 95, 0.15);
    color: #ff5f5f;
    white-space: nowrap;
}

.delete-btn {
  background: transparent;
  border: 1px solid rgba(255, 95, 95, 0.4);
  color: #ff5f5f;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  margin-left: 6px;
}

.delete-btn:hover {
  background: rgba(255, 95, 95, 0.12);
}

/* Ligne RDV cliquable */
.rdv-row {
  cursor: pointer;
  transition: background 0.15s ease;
}

/* Hover desktop */
.rdv-row:hover {
  background: rgba(255, 255, 255, 0.03);
}

/* Tap mobile */
.rdv-row:active {
  background: rgba(255, 255, 255, 0.06);
}

.badge-external {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 999px;

  background: rgba(59, 130, 246, 0.12); /* bleu doux */
  color: #3b82f6; /* bleu info */

  white-space: nowrap;
}
</style>