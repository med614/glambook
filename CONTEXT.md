# MedSolutions — Contexte du projet

## Stack technique

| Couche | Technologie | Rôle |
|--------|-------------|------|
| Frontend | Vue 3 + Composition API (`<script setup>`) | Interface utilisateur |
| Routeur | Vue Router 4 | SPA routing avec guards d'auth + abonnement |
| HTTP client | Axios | Appels REST vers le backend |
| Base de données / Auth | Supabase JS SDK v2 | Requêtes directes DB + authentification |
| Build | Vite | Dev server, bundling |
| Backend | Node.js + Express 5 | API REST (couche fine, surtout SaaS admin) |
| DB | Supabase (PostgreSQL) | Multi-tenant avec RLS |
| Stockage | Supabase Storage | Avatars du staff (`staff-avatars`), logos orgs (`org-logos`) |
| Styles | CSS custom | Pas de framework CSS (pas de Tailwind) |

---

## Architecture générale

```
MedSolutions/
├── frontend/          # Vue 3 SPA (port 5173)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin/         # Pages admin (Today, Rdv, Staff, Clients…)
│   │   │   ├── saas/          # Pages super-admin (Organizations, SaasAccount)
│   │   │   ├── subscription/  # Pages gestion abonnement (Suspended)
│   │   │   └── auth/          # SetPassword
│   │   ├── components/        # Composants réutilisables
│   │   ├── services/          # Logique métier + appels Supabase/API
│   │   ├── composables/       # Hooks Vue réutilisables (useOrgId, useSubscription)
│   │   ├── router/            # Routes + guards auth + guard abonnement
│   │   ├── lib/               # Clients Supabase & Axios configurés
│   │   ├── utils/             # Helpers (phone, dates…)
│   │   └── assets/css/        # Feuilles de style globales
├── backend/           # Express (port 3000)
│   ├── controllers/
│   ├── routes/
│   ├── middleware/    # Auth JWT, org isolation
│   └── lib/supabase.js  # Client service_role (bypass RLS)
├── database/          # (vide — pas de migrations versionnées)
├── CONTEXT.md         # Ce fichier
└── start.sh           # Lance les deux serveurs
```

Le backend est une **couche fine** : la majorité des opérations CRUD se fait directement depuis le frontend via le SDK Supabase. Le backend n'est utilisé que pour :
- Les opérations nécessitant la clé `service_role` (gestion utilisateurs Auth)
- Les endpoints SaaS admin (`/saas/*` — création d'orgs, invitations, reset password)

---

## Authentification & multi-tenancy

- **Supabase Auth** avec JWT
- Les métadonnées utilisateur (`user_metadata`) portent : `org_id`, `role` (`admin` | `superadmin`), `admin_name`
- À la connexion, `useOrgId` composable cache l'`org_id` pour toutes les requêtes
- Les requêtes filtrent explicitement par `organization_id` (+ RLS côté DB)
- Guards dans le routeur :
  - Route non publique sans session → `/login`
  - `/saas/*` → requiert `role === 'superadmin'`
  - Routes admin → vérifie statut abonnement → `/subscription/suspended` si bloqué
- Flux d'invitation : SaaS admin crée une org → backend appelle `supabase.auth.admin.inviteUserByEmail()` → lien envoyé vers `/auth/set-password`

---

## Schéma de base de données

### Tables métier

| Table | Description | Colonnes clés |
|-------|-------------|---------------|
| `organizations` | Tenants | id, name, type, phone, admin_name, is_active, supabase_user_id, logo_url |
| `appointments` | RDV planifiés + walk-ins | id, org_id, client_id, staff_id (legacy), type (`appointment`\|`walkin`), status, start_time, end_time |
| `appointment_services` | Liaison RDV ↔ service + staff assigné | id, appointment_id, service_id, staff_id, status (`active`\|`completed`\|`cancelled`) |
| `clients` | Répertoire clients | id, org_id, name, last_name, phone, flag_dismissed_count |
| `services` | Prestations | id, org_id, name, duration_minutes, is_heavy, is_active, category_id |
| `service_categories` | Groupes de prestations | id, org_id, name, color |
| `staff` | Personnel | id, org_id, name, is_active, avatar_url |
| `staff_categories` | Compétences staff (many-to-many) | staff_id, category_id |
| `staff_absences` | Congés / absences | id, staff_id, start_date, end_date |
| `walkin_daily_log` | Log de clôture de journée | date, unserved_count, org_id |

### Tables SaaS / abonnement

| Table | Description | Colonnes clés |
|-------|-------------|---------------|
| `organization_subscriptions` | Abonnement par org (1 ligne par org) | id, organization_id (UNIQUE), status (`trial`\|`active`\|`suspended`\|`cancelled`), paid_until (date), monthly_price, notes |
| `subscription_payments` | Historique des paiements (saisi manuellement par super admin) | id, organization_id, paid_at (date), amount, note |
| `saas_settings` | Paramètres globaux SaaS (1 seule ligne, id=1) | id, whatsapp_number, contact_email |

### Statuts des appointments

```
scheduled → in_progress → completed
                        → cancelled
                        → no_show
waiting   (walk-ins en attente)
```

### Statuts des appointment_services

```
active → completed
       → cancelled
```

**Règle de calcul du statut appointment depuis les services :**
- Tous `cancelled` → `cancelled`
- Tous `completed` ou `cancelled` (au moins 1 `completed`) → `completed`
- Sinon → `in_progress`

### Statuts abonnement

```
trial     → essai (bandeau orange affiché)
active    → accès normal
suspended → accès bloqué → page /subscription/suspended
cancelled → accès bloqué → page /subscription/suspended
```

---

## Pages et routes

| Route | Page | Accès |
|-------|------|-------|
| `/login` | Login.vue | Public |
| `/auth/set-password` | SetPassword.vue | Public |
| `/subscription/suspended` | Suspended.vue | Authentifié (skipSubCheck) |
| `/today` | Today.vue | Admin |
| `/admin/rdv` | Rdv.vue | Admin |
| `/admin/staff` | Staff.vue | Admin |
| `/admin/services` | Services.vue | Admin |
| `/admin/clients` | Clients.vue | Admin |
| `/admin/categories` | Categories.vue | Admin |
| `/admin/dashboard` | Dashboard.vue | Admin |
| `/admin/account` | Account.vue | Admin |
| `/saas/organizations` | Organizations.vue | Superadmin |
| `/saas/account` | SaasAccount.vue | Superadmin |

---

## Logique métier clé

### Carry-over (Today.vue)

Les appointments peuvent s'étaler sur plusieurs jours. Règle d'affichage :

1. `start_date === today` → toujours affiché
2. `start_date < today` ET non terminal → affiché (carry-over)
3. `start_date < today` ET terminal ET `end_date === today` → affiché (terminé aujourd'hui)

Implémentation : une seule requête sur 60 jours, filtrage client-side.

**Important** : `end_time` est mis à `localNowIso()` (heure locale machine, pas UTC) quand un appointment devient terminal. Cela ancre l'affichage au bon jour.

### Heure locale machine

**Toutes les dates/heures stockées en DB utilisent l'heure locale machine**, jamais `new Date().toISOString()` (UTC). Helper utilisé partout :

```js
function localNowIso() {
  const now = new Date()
  return now.toLocaleDateString('en-CA') + 'T' + now.toTimeString().substring(0, 8)
}
// → "2025-05-14T16:30:45" (heure locale, pas UTC)
```

Pour les dates seules : `new Date().toLocaleDateString('en-CA')` (pas `.toISOString().slice(0,10)`).

### Filtrage par staff (Today.vue)

```js
(as.staff?.id ?? as.staff_id) === staffMember.id
```

Fallback sur `staff_id` brut car la jointure Supabase peut être null si le staff n'est plus actif.

### Statut couleur staff

Un staff avec uniquement des lignes `cancelled` ou `past` est affiché **Disponible** (vert). Seules les lignes actives (`status !== 'past' && status !== 'cancelled'`) comptent dans `staffColor()`.

### Signalement clients (flag)

- `count(cancelled + no_show) >= 2` ET `count > flag_dismissed_count` → `is_flagged = true`
- Dismissal : incrémente `flag_dismissed_count`

### Calcul statut appointment (DB-first)

`refreshApptStatus()` et `deleteLine()` relisent les `appointment_services` depuis la DB avant de calculer le nouveau statut. Jamais depuis l'état local Vue.

### Guard abonnement (router)

À chaque navigation admin (non-superadmin) :
1. Charge subscription via `useSubscription.loadSubscription(orgId)` (cache 5 min)
2. Si `status = suspended | cancelled` → redirect `/subscription/suspended`
3. Si `status = trial` → bandeau orange affiché dans App.vue (via `isTrial` du composable)

---

## Services frontend

| Fichier | Responsabilité |
|---------|----------------|
| `auth.service.js` | État réactif auth, login/logout |
| `appointments.service.js` | CRUD RDV planifiés |
| `today.service.js` | Walk-ins, clôture de journée, `localNowIso()` helper |
| `staff.service.js` | CRUD staff, avatars, absences |
| `clients.service.js` | CRUD clients, signalement |
| `services.service.js` | CRUD prestations et catégories |
| `staffAbsence.service.js` | Gestion des absences |
| `organizations.service.js` | SaaS admin — orgs, invitations. Inclut jointure `organization_subscriptions` avec fallback si table absente |
| `subscriptions.service.js` | CRUD abonnements et paiements (super admin) |
| `saasConfig.service.js` | Lecture/écriture `saas_settings` (WhatsApp, email contact) |
| `api.js` | Instance Axios configurée |

## Composables frontend

| Fichier | Responsabilité |
|---------|----------------|
| `useOrgId.js` | Cache réactif de l'org_id de la session |
| `useSubscription.js` | Cache subscription (5 min TTL), expose `subscription`, `isBlocked`, `isTrial`, `daysLeft`, `loadSubscription()`, `clearSubscriptionCache()` |

---

## Composants clés

### Today.vue

- `EditAppointmentModal.vue` — édition RDV (ajout/suppression/statut services)
- `AddWalkinModal.vue` — création walk-in (client + service + staff)
- `ServeWalkinModal.vue` — prise en charge d'un walk-in en attente

### SaaS (super admin)

- `Organizations.vue` — liste orgs avec KPI (total / actives / suspendues / **expirées**)
- `OrgDrawer.vue` — fiche org avec 3 onglets : Informations / Compte / **Abonnement**
- `SaasAccount.vue` — profil super-admin + **coordonnées de contact** (WhatsApp, email)

### Abonnement (côté client)

- `Suspended.vue` — page bloquante si abonnement suspendu/annulé, boutons WhatsApp + Email
- `Account.vue` — onglet **Mon abonnement** : statut, date expiration, tarif, historique paiements (readonly)
- Bandeau essai dans `App.vue` — orange, visible sur toutes les pages admin si `status = trial`

---

## Variables d'environnement

### Frontend (`frontend/.env`)
```
VITE_SUPABASE_URL=https://gndaerikosoyewryuoxr.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
VITE_API_URL=http://localhost:3000
```

### Backend (`backend/.env`)
```
SUPABASE_URL=https://gndaerikosoyewryuoxr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service role key>
PORT=3000
FRONTEND_URL=http://localhost:5173
```

---

## Décisions techniques importantes

### 1. Pas de store global (pas de Pinia/Vuex)
État local par page/composant via `ref`. Exceptions : `auth.service.js` (session réactive) et `useSubscription.js` (cache module-level avec TTL 5 min).

### 2. Requête large + filtrage client-side pour Today
Fenêtre de 60 jours, filtrage JS — plus fiable que les filtres `.not()` Supabase qui avaient des bugs silencieux.

### 3. Pattern DB-first pour les mutations critiques
`refreshApptStatus()` et `deleteLine()` relisent la DB après mutation avant de recalculer l'état.

### 4. `end_time` comme ancre temporelle
Pour les appointments terminaux, `end_time = localNowIso()` permet à la logique carry-over de distinguer "terminé aujourd'hui" vs "terminé un autre jour".

### 5. Heure locale machine partout
Remplacement systématique de `new Date().toISOString()` (UTC) par `localNowIso()` pour éviter le décalage d'1h en UTC+1.

### 6. Guard abonnement avec cache
La vérification se fait à chaque navigation (pas seulement au login) mais avec un cache 5 min pour éviter une requête DB à chaque clic. Cache invalidé à la déconnexion.

### 7. Jointure subscription dans fetchOrganizations avec fallback
`organizations.service.js` tente la jointure `organization_subscriptions`. Si la table n'existe pas encore, fallback sur une requête sans jointure pour ne pas casser l'affichage.

### 8. Backend = couche SaaS uniquement
Les opérations admin standard passent directement par le SDK Supabase (clé anon + RLS). Le backend Express n'est nécessaire que pour la clé `service_role`.

### 9. Pas de migrations versionnées
Le schéma DB n'est pas versionné dans le repo. SQL des nouvelles tables fourni dans le code source (commentaires dans `Suspended.vue`) et dans CONTEXT.md.

---

## SQL des tables récentes (à exécuter dans Supabase si pas encore fait)

```sql
-- Abonnements par organisation
CREATE TABLE organization_subscriptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'trial'
                   CHECK (status IN ('trial','active','suspended','cancelled')),
  paid_until       date,
  monthly_price    numeric(10,2),
  notes            text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE (organization_id)
);

-- Historique des paiements
CREATE TABLE subscription_payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  paid_at          date NOT NULL DEFAULT CURRENT_DATE,
  amount           numeric(10,2),
  note             text,
  created_at       timestamptz DEFAULT now()
);

-- Paramètres SaaS globaux (1 seule ligne)
CREATE TABLE saas_settings (
  id              int PRIMARY KEY DEFAULT 1,
  whatsapp_number text,
  contact_email   text,
  updated_at      timestamptz DEFAULT now()
);
INSERT INTO saas_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas_settings              ENABLE ROW LEVEL SECURITY;

CREATE POLICY "full access" ON organization_subscriptions USING (true) WITH CHECK (true);
CREATE POLICY "full access" ON subscription_payments      USING (true) WITH CHECK (true);
CREATE POLICY "authenticated read" ON saas_settings FOR SELECT USING (true);
CREATE POLICY "superadmin write"   ON saas_settings FOR ALL
  USING (auth.jwt()->>'role' = 'superadmin');
```

---

## Démarrage

```bash
./start.sh
# Frontend : http://localhost:5173
# Backend  : http://localhost:3000
```
