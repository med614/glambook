# TECH.md — Architecture technique Glambook

---

## Stack

| Couche | Technologie | Version |
|--------|------------|---------|
| Frontend | Vue 3 (Composition API, `<script setup>`) | — |
| Build | Vite 7 — **requiert Node 20+** | 7.x |
| Routing | Vue Router | — |
| Backend | Node.js (ESM) + Express | port 3000 |
| Base de données | Supabase (PostgreSQL) + SDK JS | v2 |
| WhatsApp | Twilio Sandbox API | — |
| Tunnel local | ngrok | — |

---

## Environnement local

### Node version
```bash
# Vite 7 requiert Node 20 — le shell par défaut est Node 18
nvm use 20

# Chemin absolu si nvm non chargé dans le shell
/Users/mohamedbenmansour/.nvm/versions/node/v20.19.6/bin/node
```

### Lancer le projet
```bash
# Backend
cd backend && node index.js

# Frontend (depuis un autre terminal)
cd frontend && nvm use 20 && npm run dev

# Simulateur WhatsApp (tue le backend avant)
pkill -f "node index.js"
cd backend && SIMULATE_MODE=1 node simulate-whatsapp.js
```

### Variables d'environnement (backend)
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=       # jamais la clé anon côté backend
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM=whatsapp:+14155238886
SIMULATE_MODE=                   # 1 = pas d'envoi Twilio réel
```

---

## Architecture

```
Client (navigateur)
    │
    ├── /admin/*        → Vue 3 SPA (auth requise)
    ├── /booking/*      → Vue 3 SPA (public, sans auth)
    └── /login          → Vue 3 SPA
          │
          ▼
    Express backend (port 3000)
          │
          ├── /api/booking/*      → réservation publique
          ├── /api/managers/*     → CRUD gestionnaires
          ├── /api/whatsapp       → webhook Twilio
          └── middleware auth     → injecte req.orgId depuis JWT
                │
                ▼
          Supabase (PostgreSQL)
          RLS activé — backend utilise service role key
```

---

## Base de données — Schéma complet

### ⚠️ Pièges noms de colonnes

| Table | Colonne attendue (faux) | Colonne réelle |
|-------|------------------------|----------------|
| `services` | `org_id` | `organization_id` |
| `services` | `duration` | `duration_minutes` |
| `staff` | `org_id` | `organization_id` |
| `appointments` | `org_id` | `organization_id` |
| `appointments` | `notes` | `note` |
| `clients` | `org_id` | `organization_id` |
| `appointment_services` | `price` | `price_at_booking` |
| `staff_absences` | `org_id` | ❌ inexistant — filtrer via join sur `staff` |

### Tables principales

#### `organizations`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| name | text | |
| logo_url | text | |
| is_active | boolean | |
| supabase_user_id | uuid | lien avec auth.users (admin) |
| admin_name | text | |
| email | text | |

#### `appointments`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK organizations |
| client_id | uuid | FK clients |
| start_time | timestamptz | |
| end_time | timestamptz | |
| status | text | scheduled / in_progress / confirmed / cancelled / no_show |
| source | text | null (salon) / 'phone' / 'whatsapp' / 'online' |
| note | text | |
| reminder_sent | boolean | DEFAULT false |
| is_external | boolean | |
| external_period | text | |

#### `appointment_services`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| appointment_id | uuid | FK appointments |
| service_id | uuid | FK services |
| staff_id | uuid | FK staff |
| status | text | |
| price_at_booking | numeric(10,2) | snapshot prix au moment du RDV |

#### `services`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK organizations |
| name | text | |
| name_ar | text | nom arabe (auto-traduit via MyMemory) |
| price | numeric(10,2) | prix catalogue en DH |
| duration_minutes | integer | |
| is_active | boolean | |
| category_id | uuid | FK service_categories |
| whatsapp_enabled | boolean | DEFAULT false |
| is_heavy | boolean | |

#### `service_categories`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| org_id | uuid | FK organizations |
| name | text | |
| color | text | |

#### `staff`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK organizations |
| name | text | |
| avatar_url | text | |
| join_date | date | |
| is_active | boolean | |

#### `staff_categories`
| Colonne | Type | Notes |
|---------|------|-------|
| staff_id | uuid | FK staff |
| category_id | uuid | FK service_categories |

#### `staff_absences`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| staff_id | uuid | FK staff |
| start_date | date | |
| end_date | date | |

> Pas de `organization_id` — pour filtrer par org : `JOIN staff ON staff.id = staff_absences.staff_id WHERE staff.organization_id = $1`

#### `clients`
| Colonne | Type | Notes |
|---------|------|-------|
| id | uuid | PK |
| organization_id | uuid | FK organizations |
| name | text | prénom |
| last_name | text | |
| phone | text | format marocain `0XXXXXXXXX` |
| created_at | timestamptz | |
| flag_dismissed | boolean | |
| flag_dismissed_count | integer | |

#### `organization_settings`
```sql
CREATE TABLE organization_settings (
  org_id uuid PRIMARY KEY REFERENCES organizations(id),
  opening_hours jsonb,           -- { mon: {active, open, close}, tue: ... }
  noshow_threshold integer DEFAULT 3,
  cancel_threshold integer DEFAULT 5,
  whatsapp_enabled boolean DEFAULT true,
  whatsapp_show_prices boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);
```
Jours dans `opening_hours` : format 3 lettres `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun`.

#### `salon_closures`
```sql
CREATE TABLE salon_closures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id),
  date date NOT NULL,       -- début de la plage
  end_date date NOT NULL,   -- fin de la plage
  label text                -- motif optionnel
);
```

#### `whatsapp_sessions`
```sql
CREATE TABLE whatsapp_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone text NOT NULL,
  org_id uuid,
  step text,
  lang text DEFAULT 'fr',
  service_id uuid,
  service_name text,
  date text,
  time text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### `organization_subscriptions`
| Colonne | Type |
|---------|------|
| id | uuid |
| organization_id | uuid |
| status | text |
| paid_until | date |
| monthly_price | numeric |

---

## Bot WhatsApp

**Fichier :** `backend/routes/whatsapp.js`

### Déclencheur
S'active uniquement si le message contient : `free style`, `freestyle`, `free-style`, `freesyle`, `fresstyle`.
Tout autre message sans session active → ignoré silencieusement.
Reset session : `menu`, `annuler`, `restart`, `0`, `قائمة`, `إلغاء`

### State machine (6 étapes)
```
1. lang          → choix FR 🇫🇷 ou AR 🇲🇦
2. choose_service → liste prestations (whatsapp_enabled = true)
3. choose_date   → prochains jours dispo (horaires + fermetures)
4. choose_time   → créneaux libres toutes les heures
5. ask_name      → uniquement nouveaux clients
6. confirm       → récapitulatif + validation 1/2
```

### Disponibilité créneaux
- `category_id` prestation → `staff_categories` → staff compétents disponibles
- Créneau libre si ≥ 1 staff compétent, non absent, non occupé
- Si pas de catégorie → logique simple (1 RDV par créneau max)

### Rappels automatiques
- `setInterval` 60s — envoie rappel 55-65 min avant RDV
- Uniquement `source = 'whatsapp'` et `reminder_sent = false`
- Désactivé si `SIMULATE_MODE = 1`

### Normalisation téléphone
- Sessions WhatsApp : `'+' + phone.replace(/\D/g,'').replace(/^0+/,'')`
- Clients en base : format marocain `0XXXXXXXXX`

---

## Frontend — Pages et comportements

### Pages admin (auth requise)

| Route | Composant | Notes |
|-------|-----------|-------|
| `/today` | Today.vue | **Refonte en cours** — 3 onglets réceptionniste : File+Non affectés / Planning / Staff. Voir CLAUDE.md § Today.vue |
| `/admin/rdv` | Rdv.vue | Liste + badge source, clic → modal modification |
| `/admin/clients` | Clients.vue | Signalement configurable, filtre signalés |
| `/admin/services` | Services.vue | Toggle statut + WhatsApp, nom AR auto-traduit |
| `/admin/categories` | Categories.vue | |
| `/admin/staff` | Staff.vue | Vue Équipe + Vue Planning (liste + calendrier mensuel) |
| `/admin/dashboard` | Dashboard.vue | `requiresAdmin: true` |
| `/admin/stats` | Stats.vue | `requiresAdmin: true` |
| `/admin/settings` | Settings.vue | Horaires, fermetures, seuils, bot WA — `requiresAdmin: true` |
| `/admin/account` | Account.vue | Logo, email, MDP, abonnement, gestionnaires |

### Pages publiques (sans auth)

| Route | Composant | Notes |
|-------|-----------|-------|
| `/booking` | BookingHome.vue | 1 org → direct infos client / N orgs → liste |
| `/booking/:orgId` | BookingCalendar.vue | Prestation → date → créneau → confirmation |
| `/login` | Login.vue | Lien "Prendre RDV en ligne" → /booking |

### Design system — Palette noir / or

| Token CSS | Valeur | Usage |
|-----------|--------|-------|
| `--primary` | `#D4AF37` | Or — actions primaires, accents |
| `--primary-hover` | `#E8CA6E` | Hover boutons |
| `--warning` | `#F0C040` | Jaune vif — alertes, états "chargé" |
| `--bg` | `#080807` | Fond global |

Défini dans `frontend/src/assets/css/base.css`. Ne pas hardcoder les couleurs primaires dans les composants.
Référence visuelle : `today-preview.html` à la racine du projet.

### Couleurs statuts RDV
| Statut | Couleur |
|--------|---------|
| `scheduled` / `in_progress` | bleu |
| `confirmed` | vert |
| `cancelled` | orange |
| `no_show` | rouge |

### Sources RDV
| Valeur `source` | Badge |
|-----------------|-------|
| `null` | Salon (gris) |
| `'phone'` | Téléphone (bleu) |
| `'whatsapp'` | WhatsApp (vert) |
| `'online'` | En ligne (violet) |

### Services clés frontend
- `auth.service.js` — `isAdmin()`, `isManager()`, `canAccess()`
- `managers.service.js` — CRUD gestionnaires (appel backend)
- `settings.service.js` — horaires, fermetures, paramètres org

---

## Règles Supabase

- RLS activé sur toutes les tables
- Backend utilise toujours la **service role key** (bypass RLS)
- Ne jamais utiliser la clé `anon` côté backend
- Vérifier les noms de colonnes avec `information_schema.columns` avant toute nouvelle requête
- Toujours exécuter le SQL en premier, attendre confirmation, puis modifier le code

---

## Commande diagnostic colonnes
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'nom_table'
ORDER BY ordinal_position;
```