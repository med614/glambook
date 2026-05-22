# AGENTS.md — Instructions globales Glambook

> Ce fichier est lu par Codex au démarrage de chaque session.
> Ne pas modifier sans passer par l'agent Dev.

---

## Projet

**Glambook** (ex-MedSolutions / TimeFlow) — SaaS multi-tenant de gestion et réservation en ligne pour salons de coiffure/beauté.

- **Salon de test** : "Salon X" — utilisé pour le développement et la validation des features
- **Cible production** : salon **Free Style** (Maroc) — premier déploiement réel, pas encore en prod
- Ne pas confondre les deux : Salon X = bac à sable, Free Style = client réel à venir
- Vision : annuaire public + réservation type Booksy → marché Maghreb
- Fondateur / dev principal : **Mohamed Benmansour** (`med.benmansour@icloud.com`)

---

## Stack

| Couche | Technologie |
|--------|------------|
| Frontend | Vue 3 (Composition API, `<script setup>`), Vite 7, Vue Router |
| Backend | Node.js (ESM) + Express, port 3000 |
| Base de données | Supabase (PostgreSQL), SDK JS v2, service role key |
| WhatsApp | Twilio Sandbox API |
| Tunnel local | ngrok |

---

## 🚀 Démarrage des serveurs

### Backend (port 3000)
```bash
cd /Users/mohamedbenmansour/MedSolutions/backend && node index.js
```

### Frontend (port 5173) — Node 20 obligatoire
nvm ne persiste pas entre les commandes shell. Utiliser le chemin direct :
```bash
cd /Users/mohamedbenmansour/MedSolutions/frontend && PATH=~/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev
```

### En arrière-plan (les deux en une fois)
```bash
pkill -f "node index.js" 2>/dev/null; pkill -f "vite" 2>/dev/null
cd /Users/mohamedbenmansour/MedSolutions/backend && node index.js > /tmp/backend.log 2>&1 &
cd /Users/mohamedbenmansour/MedSolutions/frontend && PATH=~/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev > /tmp/frontend.log 2>&1 &
```

### URLs de test
- App admin : `http://localhost:5173`
- Booking Salon X : `http://localhost:5173/booking/16a7bd9d-643a-4049-8587-087901fc0db2`
- Booking Free Style : `http://localhost:5173/booking/77748ee2-0bba-429b-a696-f710ed523e7e` *(pas de données)*

> **Note** : `frontend/.env.local` pointe sur `VITE_API_URL=http://localhost:3000` pour le dev local.
> Le backend tourne sur Node 18 (avertissement Supabase ignoré) — seul le frontend nécessite Node 20.

---

## ⚠️ Règles critiques — toujours respecter

### 1. SQL avant code
Exécuter et confirmer la migration SQL **avant** de modifier le code qui l'utilise.
Ajouter un champ dans un SELECT avant de créer la colonne en base → erreur silencieuse Supabase qui fait disparaître les données.

### 2. Vérifier les noms de colonnes réels
Avant toute requête sur une table non encore vérifiée dans la session :
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'nom_table' ORDER BY ordinal_position;
```
Pièges fréquents :

| Attendu (faux) | Réel |
|----------------|------|
| `org_id` | `organization_id` (sur services, staff, appointments, clients) |
| `duration` | `duration_minutes` |
| `notes` | `note` |
| `price` | `price_at_booking` (sur appointment_services) |

`staff_absences` n'a **pas** de `organization_id` → filtrer via join sur `staff`.

### 3. SIMULATE_MODE
Ne jamais envoyer de messages Twilio si `process.env.SIMULATE_MODE === '1'`.
Limite sandbox : 50 messages/jour.

### 4. Redémarrer le backend après chaque modification
Node.js ne recharge pas à chaud.
```bash
pkill -f "node index.js" && node index.js
```

### 5. Node 20 obligatoire pour le frontend
Vite 7 requiert Node 20+. Le shell par défaut est Node 18.
```bash
nvm use 20 && npm run dev
```
Si node_modules cassé : supprimer et réinstaller avec Node 20.

### 6. RLS Supabase
RLS activé sur toutes les tables. Le backend utilise la **service role key** pour tout bypasser.
Ne jamais utiliser la clé `anon` côté backend.

---

## Design system

Palette **noir / or** — appliquée à toute l'application.

| Token | Valeur | Rôle |
|-------|--------|------|
| `--primary` | `#D4AF37` | Or classique — actions primaires, accents |
| `--primary-hover` | `#E8CA6E` | Or clair — états hover |
| `--primary-glow` | `rgba(212,175,55,.25)` | Halo boutons primaires |
| `--primary-surface` | `rgba(212,175,55,.08)` | Fond léger sur éléments actifs |
| `--warning` | `#F0C040` | Jaune vif — états "chargé", alertes file longue |
| `--bg` | `#080807` | Fond global |
| `--surface` | `#0E0D0A` / `#151410` | Surfaces cards/modals |

**Règles :**
- Ne jamais hardcoder `#E8845A` (terracotta) — couleur remplacée partout par l'or
- L'or est réservé aux **actions primaires** et **alertes importantes** (≤ 20% de l'écran)
- Le noir doit dominer (≥ 80%) pour ne pas saturer
- Référence visuelle complète : `today-preview.html` à la racine du projet

---

## Docs projet

Consulter ces fichiers quand pertinent (nouvelle feature, question d'archi, priorisation) :

- [`docs/BACKLOG.md`](docs/BACKLOG.md) — features existantes, features manquantes, roadmap, versioning
- [`docs/TECH.md`](docs/TECH.md) — architecture technique, structure des fichiers, schéma DB

---

## Module RDV multi-prestation — pièges connus

Le module gestion des RDV (RdvModal, ServeWalkinModal, Today.vue) a subi un audit QA complet + 16 fixes. Points critiques à retenir :

### Statuts
- `noshow` (sans underscore) — c'est la valeur canonique partout dans le code et en base.
- `no_show` est **incorrect** — ne pas utiliser.

### Supabase — relations retournées en tableau
Les joins Supabase peuvent retourner un objet OU un tableau selon le contexte. Toujours normaliser avec :
```js
const one = v => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
```

### Supabase — syntaxe join avec FK explicite
Pour joindre une table via une FK nommée différemment du nom de table, utiliser `!fk_column` :
```js
// ❌ Retourne null si Supabase ne résout pas automatiquement
.select('service_categories(id, name, color)')

// ✅ Spécifier la FK + aliaser le résultat
.select('category:service_categories!category_id(id, name, color)')
```
Cas concret : `services.category_id → service_categories.id` dans le backend booking.
Fix appliqué et vérifié (curl confirme `category: {id, name, color}` dans la réponse).

### Booking — groupement par catégorie (en cours)
- Backend `GET /booking/:orgId/services` retourne bien `category: {id, name, color}` ✅
- Frontend `servicesByCategory` computed dans BookingCalendar.vue — bug : tout groupe dans "Autres" malgré `svc.category` présent
- À investiguer : timing réactivité Vue (services chargés async dans onMounted, computed peut s'évaluer avant) ou problème de scope `cd` dans le Bash au lancement npm

### external_period — valeurs valides
`'morning'` | `'afternoon'` | `'evening'` | `'allday'`
La contrainte CHECK en base a été migrée pour inclure `'allday'`.

### Algorithme ranking staff
Centralisé dans `frontend/src/composables/useStaffRanking.js`.
Utilisé par RdvModal ET ServeWalkinModal — ne pas dupliquer.
Score : compétence (+10), workload time-aware (5→3→1→0), fatigue journalière (-1/prestation plafonné à -5), indisponible (-1000).
Tie-break à score égal : `_lastWorkTs` — le staff qui a travaillé le moins récemment (ou jamais) passe en premier (rotation équitable).

### Confirmation force staff indisponible
Dans RdvModal : watcher sur `selectedServices.map(s => s.staff_id)`, boucle `for…break` (stoppe au 1er conflit — évite l'écrasement si 2 changements simultanés).
Dans ServeWalkinModal ET AddWalkinModal : même pattern watcher post-sélection, clé stable `lineId`.

### Statuts — valeurs canoniques
`noshow` (sans underscore) partout : en base, dans les filtres Supabase, dans les computed.
`no_show` est **incorrect** — provoque des bugs carry-over silencieux dans Today.vue.
Statuts actifs à inclure dans les fetches de planning : `['scheduled', 'confirmed', 'in_progress']`.
`confirmed` oublié → RDV confirmés invisibles dans la liste ET non détectés dans `checkConflicts`.

### Multi-tenant — isolation obligatoire
Toutes les requêtes Supabase côté frontend doivent filtrer par `organization_id`.
Fonctions concernées (déjà corrigées) : `fetchAllClients`, `findClientByPhone`, `getOrCreateClient`.

### updateAppointment — upsert ciblé (NE PAS revenir au delete+reinsert)
`updateAppointment` utilise un diff existant/payload par `id` :
- Supprime uniquement les lignes retirées (présentes en base, absentes du payload)
- Met à jour les lignes existantes (id présent dans payload + en base)
- Insère les nouvelles lignes (id null dans payload)
L'ancienne approche delete-all + reinsert était non atomique : si l'insert échouait, toutes les prestations étaient perdues définitivement.
`selectedServices` dans RdvModal inclut désormais `id` (depuis `as.id`) et filtre `status === 'cancelled'`.

### Today.vue — Refonte en cours (mai 2026)

**⚠️ Réécriture complète prévue — NE PAS modifier l'ancien Today.vue en attendant**

Structure cible :
- **Topbar fixe** : titre + stats chips + bouton "Sans RDV"
- **Bande staff** (fixe sous topbar) : chips horizontaux scrollables, statut temps réel + barre de progression
- **3 onglets** :
  1. **File + Non affectés** — walkins en attente + RDV sans staff assigné
  2. **Planning du jour** — tous les RDV triés par heure, walkins inclus, actions (Arrivée / Terminer / No-show)
  3. **Staff** — accordéon par collaborateur, détail de leur journée

Décisions techniques :
- Onglet actif mémorisé en `localStorage` (`glambook_today_tab`)
- Barre de progression staff = `(nowMs - start_time) / duration_minutes × 100`
- Les composables `useQueue`, `useUnassigned`, `useStaffColumns` sont réutilisés tels quels
- Les anciens modes "Par staff / Chrono / Réception" sont supprimés

### File d'attente — 1 ligne = 1 prestation (plat, sans regroupement)
La file d'attente affiche **une ligne par `appointment_service`** sans regroupement par client. Si un client a 3 prestations → 3 lignes indépendantes, triées par heure d'arrivée.

**Computed clé :** `walkinRows` dans Today.vue — liste plate, 1 entrée par service non affecté (`status='active'` + pas de `staff_id`). Les walkins sans service génèrent 1 ligne placeholder.

**Chaque ligne contient :** rang · nom client · nom prestation · heure · bouton Servir · bouton Supprimer

**Flux "Servir" une ligne :**
1. Clic "Servir" → `openServeRow(row)`
2. Si `row._placeholder` (walkin sans prestation) → `ServeWalkinModal` (choix multi-service)
3. Sinon → `ServeServiceModal` (mono-service, assigne `staff_id`)
4. Si `appointment.status === 'waiting'` → passe à `'in_progress'`

**NE PAS** regrouper par client dans `walkinRows` — chaque ligne est autonome.
**NE PAS remettre** le filtre `appointments.status === 'waiting'` — un appointment `in_progress` peut encore avoir des services non affectés dans la file.

**Statut initial walkin :**
- Si au moins une prestation a un `staff_id` à la création → `status = 'in_progress'`
- Sinon → `status = 'waiting'` (en attente dans la file)

**start_time cascade :**
- `appointment_services.start_time` calculé à la création : `start_time[n] = start_time[n-1] + duration_minutes[n-1]`
- `AddWalkinModal` calcule la cascade avec `serviceOptions`
- `createAppointment` cascade via `s.duration_minutes` si fourni (sinon = heure du RDV)

### Règle métier — Walkins : suppression uniquement, pas d'annulation
Les sans-RDV (`type = 'walkin'`) **ne peuvent pas être annulés** — uniquement supprimés définitivement.
- Bouton poubelle dans la file (`confirmDeleteQueueRow`) → DELETE `appointment_service` + DELETE `appointment` si c'était la dernière
- `RecapRdvModal` : bouton "Supprimer tout" → DELETE toutes les prestations + appointment
- **Ne jamais** ajouter de bouton "Annuler" sur les walkins — le client est présent, soit on le sert soit on efface la saisie

### AddWalkinModal — source unique de données
`AddWalkinModal` reçoit `services` en prop depuis Today.vue (pas de fetch local).
Utiliser `props.services` pour le ranking, `serviceOptions` (fetch local filtré `is_active`) pour le picker.
Ne pas re-fetcher `fetchStaff()` ni `fetchServices()` localement — double source de vérité.

### Bot WhatsApp — variable d'environnement
L'ID d'organisation du bot est dans `process.env.WHATSAPP_ORG_ID` (backend `.env`).
Ne jamais le hardcoder dans le code source.

---

## Constantes projet

BACKEND_URL (prod)  = https://glambook-backend-4bbl.onrender.com