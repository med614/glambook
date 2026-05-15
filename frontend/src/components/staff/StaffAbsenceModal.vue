<script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/modal/BaseModal.vue'
import { supabase } from '@/lib/supabase'
import {
    fetchStaffAbsences,
    createStaffAbsence,
    deleteStaffAbsence
} from '@/services/staffAbsence.service'

const props = defineProps({
    open: Boolean,
    staff: Object
})

const emit = defineEmits(['close', 'updated'])

const absences = ref([])
const startDate = ref('')
const endDate = ref('')
const isAdding = ref(false)

// Conflit RDV
const conflictingRdvs = ref([])
const showConflictWarning = ref(false)

const today = new Date().toLocaleDateString('en-CA')

const upcomingAbsences = computed(() =>
    absences.value
        .filter(a => a.end_date >= today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date))
)

async function load() {
    if (!props.staff) return
    absences.value = await fetchStaffAbsences(props.staff.id)
}

watch(() => props.open, val => {
    if (val) {
        load()
        conflictingRdvs.value = []
        showConflictWarning.value = false
    }
})

async function checkConflicts() {
    if (!startDate.value || !endDate.value) return
    const startTs = `${startDate.value}T00:00:00`
    const endTs = `${endDate.value}T23:59:59`

    // RDV affectés à ce staff sur la période (via appointment_services ou staff_id direct)
    const { data } = await supabase
        .from('appointments')
        .select(`
            id,
            start_time,
            status,
            clients ( name, last_name ),
            appointment_services ( staff_id )
        `)
        .gte('start_time', startTs)
        .lte('start_time', endTs)
        .not('status', 'in', '("completed","cancelled","no_show")')

    if (!data) return []

    return data.filter(a =>
        a.appointment_services?.some(s => s.staff_id === props.staff.id)
    ).map(a => ({
        id: a.id,
        date: new Date(a.start_time).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
        client: a.clients ? `${a.clients.name} ${a.clients.last_name || ''}`.trim() : 'Client inconnu'
    }))
}

async function addAbsence() {
    if (!startDate.value || !endDate.value) return

    // Vérifier les conflits sauf si déjà confirmé
    if (!showConflictWarning.value) {
        const conflicts = await checkConflicts()
        if (conflicts.length > 0) {
            conflictingRdvs.value = conflicts
            showConflictWarning.value = true
            return
        }
    }

    isAdding.value = true
    try {
        await createStaffAbsence({
            staff_id: props.staff.id,
            start_date: startDate.value,
            end_date: endDate.value
        })
        startDate.value = ''
        endDate.value = ''
        conflictingRdvs.value = []
        showConflictWarning.value = false
        await load()
        emit('updated')
    } finally {
        isAdding.value = false
    }
}

function cancelConflict() {
    showConflictWarning.value = false
    conflictingRdvs.value = []
}

async function removeAbsence(id) {
    if (!confirm('Supprimer cette absence ?')) return
    await deleteStaffAbsence(id)
    await load()
    emit('updated')
}

function formatDate(d) {
    return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function getStatusLabel(a) {
    if (a.start_date <= today && a.end_date >= today) return 'En cours'
    return 'À venir'
}
</script>

<template>
    <BaseModal v-if="open" @close="$emit('close')">
        <header class="modal-title">Absences — {{ staff?.name }}</header>

        <div class="modal-body" style="display:flex;flex-direction:column;gap:16px;">

            <!-- Alerte conflits -->
            <div v-if="showConflictWarning" class="conflict-warning">
                <div class="conflict-header">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#d97706;flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    <strong>{{ conflictingRdvs.length }} RDV prévu{{ conflictingRdvs.length > 1 ? 's' : '' }} sur cette période</strong>
                </div>
                <p style="font-size:12.5px;color:#92400e;margin:6px 0 10px;">
                    {{ staff?.name }} est affecté à ces rendez-vous. Veuillez les réaffecter à un autre collaborateur avant de poser ce congé.
                </p>
                <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
                    <div
                        v-for="rdv in conflictingRdvs"
                        :key="rdv.id"
                        style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#fff8eb;border:1px solid #fde68a;border-radius:6px;font-size:12.5px;"
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <span style="font-weight:700;color:#1e293b;">{{ rdv.client }}</span>
                        <span style="color:#92400e;">— {{ rdv.date }}</span>
                    </div>
                </div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary" style="flex:1;" @click="cancelConflict">Annuler</button>
                    <button class="btn" style="flex:1;background:#d97706;color:#fff;" @click="addAbsence" :disabled="isAdding">
                        Poser quand même
                    </button>
                </div>
            </div>

            <!-- Formulaire (masqué pendant le warning) -->
            <template v-if="!showConflictWarning">
                <!-- Dates -->
                <div style="display:flex;gap:12px;">
                    <div class="form-group" style="flex:1">
                        <label>Date de début</label>
                        <input type="date" v-model="startDate" class="form-input" />
                    </div>
                    <div class="form-group" style="flex:1">
                        <label>Date de fin</label>
                        <input type="date" v-model="endDate" class="form-input" />
                    </div>
                </div>

                <!-- Bouton ajouter -->
                <button
                    class="btn btn-primary"
                    style="width:100%;justify-content:center;"
                    @click="addAbsence"
                    :disabled="!startDate || !endDate || isAdding"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                    {{ isAdding ? 'Ajout…' : "Ajouter l'indisponibilité" }}
                </button>
            </template>

            <!-- Liste absences -->
            <div style="border-top:1px solid var(--border);padding-top:16px;">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:10px;">Prochaines absences</div>

                <div v-if="upcomingAbsences.length" style="display:flex;flex-direction:column;gap:8px;">
                    <div
                        v-for="a in upcomingAbsences"
                        :key="a.id"
                        style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#fff;border:1px solid var(--border);border-radius:8px;"
                    >
                        <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:#ef4444;"></span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-size:13px;font-weight:600;color:var(--text-main);">
                                {{ formatDate(a.start_date) }} → {{ formatDate(a.end_date) }}
                            </div>
                        </div>
                        <span
                            style="font-size:10px;font-weight:700;text-transform:uppercase;padding:3px 8px;border-radius:6px;"
                            :style="getStatusLabel(a) === 'En cours'
                                ? 'background:#dcfce7;color:#166534'
                                : 'background:#f1f5f9;color:#64748b'"
                        >{{ getStatusLabel(a) }}</span>
                        <button
                            style="width:30px;height:30px;border:none;background:transparent;color:#94a3b8;cursor:pointer;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
                            @click="removeAbsence(a.id)"
                            title="Supprimer"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                    </div>
                </div>

                <div v-else style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px;">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:var(--text-light);margin-bottom:6px;"><polyline points="20 6 9 17 4 12"/></svg>
                    <p style="margin:0;font-weight:600;">Aucune absence prévue</p>
                </div>
            </div>
        </div>

        <div class="modal-actions" v-if="!showConflictWarning">
            <button class="btn btn-secondary" @click="$emit('close')">Fermer</button>
        </div>
    </BaseModal>
</template>

<style scoped>
.form-input {
    width: 100%;
    padding: 9px 12px;
    background: var(--bg-main);
    border: 1px solid var(--border);
    border-radius: 8px;
    font-size: 13.5px;
    color: var(--text-main);
    box-sizing: border-box;
}
.form-input:focus {
    outline: none;
    border-color: var(--primary);
}
.form-group { display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }

.conflict-warning {
    background: #fffbeb;
    border: 1.5px solid #fde68a;
    border-radius: 10px;
    padding: 14px 16px;
}
.conflict-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: #92400e;
    margin-bottom: 4px;
}
</style>
