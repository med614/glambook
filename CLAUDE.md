# CLAUDE.md — Instructions globales Glambook

> Ce fichier est lu par Claude Code au démarrage de chaque session.
> Ne pas modifier sans passer par l'agent Dev.

---

## Projet

**Glambook** (ex-MedSolutions / TimeFlow) — SaaS multi-tenant de gestion et réservation en ligne pour salons de coiffure/beauté.

- Client actuel : salon **Free Style** (Maroc)
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

## Constantes projet

BACKEND_URL (prod)  = https://glambook-backend-4bbl.onrender.com