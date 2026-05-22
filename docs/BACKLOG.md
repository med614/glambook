# PRODUCT.md — Produit Glambook

---

## Vision produit

**Court terme (v1 — en cours)**
SaaS de gestion complète pour salons de coiffure/beauté : agenda, clients, staff, réservation en ligne, bot WhatsApp.
Client pilote : **Free Style** (Maroc).

**Moyen terme (v2)**
Ouvrir le SaaS à d'autres salons au Maghreb. Onboarding self-service, abonnements, tableau de bord superadmin.

**Long terme (v3)**
Annuaire public de salons + réservation directe type Booksy. Glambook devient la plateforme de référence Maghreb.

---

## Utilisateurs et rôles

| Rôle | Qui | Ce qu'il fait |
|------|-----|---------------|
| `superadmin` | Mohamed (fondateur) | Gère tous les salons, accès /saas |
| `admin` | Propriétaire du salon | Gestion complète de son salon |
| `manager` | Responsable / caissier | Gestion opérationnelle quotidienne (sans stats ni paramètres) |
| `client` | Client du salon | Réserve en ligne ou via WhatsApp |

---

## Features existantes (v1)

### Gestion des rendez-vous
- [x] Vue "Aujourd'hui" — prestations non affectées à un staff ; boutons inline planning (Arrivée / Terminer / No-show / Annuler) ; staff strip avec hover animé
- [x] Liste RDV avec source (Salon / Téléphone / WhatsApp / En ligne)
- [x] Modal modification RDV
- [x] Statuts : scheduled, in_progress, confirmed, cancelled, noshow
- [x] Création RDV avec `source: 'online'` via booking public
- [x] **RDV multi-prestation** — une ligne par prestation, prix individuel, staff par prestation
- [x] **RDV externes** — toggle externe + période (Matin / Après-midi / Soir / Journée entière)
- [x] **Alertes conflits planning** — détection chevauchement + déplacement externe par période
- [x] **Ranking collaborateur intelligent** — algorithme centralisé (`useStaffRanking.js`) : compétence, workload time-aware, fatigue journalière, absences, conflits externes ; tie-break par date du dernier RDV (rotation équitable) ; badge "Recommandé" sur le meilleur candidat
- [x] **Force staff indisponible** — affichage rouge + confirmation obligatoire si staff en congé ou externe
- [x] **Liste clients avec scroll** — tous les clients chargés avec ascenseur dans le modal RDV
- [x] **Audit QA complet** — 6 audits, 51 bugs/améliorations corrigés (voir section QA ci-dessous)
- [x] **Uniformisation dropdown collaborateur** — ServeWalkinModal (Servir sans RDV + Servir sans collab) utilise désormais CustomSelect avec le même rendu que RdvModal : badge Recommandé, rouge indisponible, confirmation force-staff via watcher
- [x] **Validation prestation-staff** — impossible de soumettre un walkin/RDV avec un collaborateur affecté sans prestation associée (ServeWalkinModal + AddWalkinModal)
- [x] **Services inactifs exclus du picker** — RdvModal ne propose plus les services désactivés
- [x] **Workload mode édition** — le RDV en cours de modification est exclu de son propre calcul de workload staff
- [x] **Suppression de prestation robuste** — `updateAppointment` utilise un upsert ciblé (diff par id) ; `EditAppointmentModal` protège contre la suppression en cascade en cas d'erreur de lecture DB
- [x] **File d'attente 1 ligne = 1 prestation** — liste plate sans regroupement : `walkinRows` computed, bouton "Servir" par ligne (ServeServiceModal), cascade `start_time`, walkins supprimables uniquement (pas d'annulation), statut `in_progress` si staff assigné à la création
- [x] **Cascade start_time temps réel** — `shiftCascadeFrom()` recalcule les `start_time` des prestations suivantes au "Terminer" ; décalage manuel de l'heure via clic inline sur l'heure dans les colonnes staff ; badge orange `+Xmin` si la prestation dépasse sa durée théorique (`nowMin` réactif, update toutes les 30s)
- [x] **Toasts feedback** — notification bas-droite après chaque action (Terminer / Servir / Supprimer / No-show / Annuler / Changer staff) + toast rouge en cas d'erreur réseau (`useToast.js` + `ToastContainer.vue`)
- [x] **Confirmation "Terminer"** — double-clic requis : 1er clic → bouton orange "Confirmer ?" (3s auto-annulation), 2e clic → action. Colonnes staff + RecapRdvModal
- [x] **Prix total RDV** — affiché dans RecapRdvModal (bandeau vert) et RdvActionModal ; RecapRdvModal branché sur Today.vue (clic walkin colonne staff)
- [x] **Changement staff en cours** — bouton dans RecapRdvModal pour réassigner un collaborateur sur une prestation déjà lancée
- [x] **Fix cohérence stat "En cours"** — compteur exclut les appointments `in_progress` sans staff assigné sur les services
- [x] **Statut `confirmed` retiré** — supprimé des filtres fetch (jamais assigné par l'UI)
- [x] **Check-in client** — bouton "Arrivée" (vert) sur les cartes RDV planifiés (`status=scheduled`) dans les colonnes staff → passe à `in_progress` + toast
- [x] **Barre "Maintenant"** — ligne rouge horizontale avec heure temps réel, insérée automatiquement entre les prestations actives et terminées dans chaque colonne staff (réactif toutes les 30s)
- [x] **Section "sans collaborateur" collapsable** — header cliquable avec chevron, état persisté dans localStorage
- [x] **Vue client unifiée** — clic sur n'importe quelle carte (walkin ou RDV planifié) ouvre RecapRdvModal avec toutes les prestations ; "Terminer" délégué à Today.vue pour la cascade start_time
- [x] **Prestations parallèles** — migration SQL `is_parallel BOOLEAN DEFAULT false` sur `appointment_services` ; checkbox ⟺ par ligne dans AddWalkinModal et RdvModal ; exclus de la cascade start_time ; badge indigo ⟺ sur les cartes et dans RecapRdvModal
- [x] **Design system unifié — thème crème/ambre** — tokens CSS centralisés dans `base.css` ; système modal harmonisé (golden dot dans BaseModal, footer blanc, boutons 11px radius, Sora font) ; suppression `lux-modal.css` ; extraction patterns partagés vers `modal.css` (price-wrap, warn-box, service-item, staff-pill) ; tous les modals sur fond clair uniforme (prop `dark` supprimée)
- [x] **RdvModal redesigné** — titre via prop `title` de BaseModal (dot doré + close button) ; sections plates avec `form-divider` au lieu des `form-box` ; sous-modals de confirmation harmonisés
- [x] **RecapRdvModal redesigné** — carte service en 2 lignes (nom+badge+prix / méta+actions) ; total fond neutre ambre ; bouton "Fermer" → btn-primary

### Gestion des clients
- [x] Liste clients avec signalement configurable
- [x] Seuils no-show et annulation configurables (Settings)
- [x] Filtre clients signalés
- [x] Upsert client par numéro de téléphone (booking + WhatsApp)

### Catalogue services
- [x] Toggle actif/inactif par service
- [x] Toggle WhatsApp activé par service
- [x] Nom FR + Nom AR (auto-traduit via MyMemory)
- [x] Prix en DH + durée en minutes
- [x] Catégories de services avec couleur

### Gestion du staff
- [x] Vue Équipe (liste des collaborateurs)
- [x] Vue Planning — sous-toggle Liste / Calendrier mensuel
- [x] Calendrier absences avec barres colorées par staff
- [x] Ajout absence avec détection conflits RDV
- [x] Avertissement conflits avec liste des RDV affectés
- [x] Compétences staff par catégorie de service

### Réservation en ligne (publique)
- [x] BookingHome — liste des salons ou accès direct si un seul
- [x] BookingCalendar — choix prestation → staff (optionnel) → date → créneau → confirmation
- [x] Calendrier mensuel avec jours disponibles colorés
- [x] Respect horaires d'ouverture + fermetures exceptionnelles
- [x] Page de succès avec détails RDV
- [x] **Choix prestation par catégorie** — accordion par catégorie (couleur, compteur, chevron) dans BookingCalendar.vue. Backend join corrigé (`category:service_categories!category_id`). `.env.local` avec `VITE_API_URL=http://localhost:3000` pour dev local.

### Bot WhatsApp
- [x] State machine 6 étapes
- [x] Bilingue FR 🇫🇷 / AR 🇲🇦
- [x] Déclencheur par mot-clé salon
- [x] Disponibilité créneaux selon staff et compétences
- [x] Fermetures exceptionnelles gérées
- [x] Rappels automatiques 1h avant (source WhatsApp)
- [x] Mode simulation (SIMULATE_MODE)

### Paramètres salon
- [x] Horaires d'ouverture par jour
- [x] Fermetures exceptionnelles par plage de dates
- [x] Seuils signalement clients
- [x] Pause/reprise bot WhatsApp
- [x] Afficher/masquer prix dans le bot

### Gestion des gestionnaires
- [x] Invitation par email
- [x] Liste gestionnaires avec statut (Actif / En attente)
- [x] Suppression gestionnaire
- [x] Accès restreint (sans Stats, Activité, Paramètres)

### Compte salon
- [x] Upload logo
- [x] Modification email et mot de passe
- [x] Affichage statut abonnement

### Dashboard & Stats
- [x] KPIs activité récente
- [x] CA, top prestations, top staff
- [x] Réservé aux admins

---

## Features manquantes — priorités

---

### 🔴 Priorité immédiate — Multi-prestation (audit expert mai 2026)

#### Prix total du RDV visible
- [x] Afficher le sous-total du RDV dans RecapRdvModal (bandeau vert en bas) et dans RdvActionModal (ligne Total sous les infos)
- [x] RecapRdvModal branché sur Today.vue — clic walkin colonne staff → récap complet avec total
- [x] RdvList déjà OK (prix par prestation + total)
- [ ] Mettre à jour le total en temps réel si une prestation est ajoutée ou modifiée

---

### 🟠 Priorité forte — Multi-prestation (audit expert mai 2026)

#### Prestations parallèles vs séquentielles
- [x] Ajouter un flag `is_parallel` sur `appointment_services` pour indiquer que la prestation se fait en même temps qu'une autre (ex : couleur + soin visage simultanés)
- [x] Ne pas inclure les prestations parallèles dans le calcul de la cascade `start_time`
- [x] Afficher visuellement la distinction parallèle / séquentielle dans les colonnes staff

#### File d'attente — réservation staff dans X minutes
- [ ] Permettre d'assigner un walkin à un staff qui sera disponible dans moins de 30 min (mode "en attente de Fatima")
- [ ] Afficher un timer d'attente estimé basé sur les prestations en cours du staff ciblé

#### Cohérence après réassignation staff
- [ ] Recalculer la cascade `start_time` si le staff d'une prestation change après la création
- [ ] Avertir la caissière si la réassignation crée un chevauchement dans le planning du nouveau staff

---

### 🟡 Améliorations — Multi-prestation (audit expert mai 2026)

- [ ] Durée réelle constatée par prestation (champ `actual_duration_minutes` sur `appointment_services`) — permet d'affiner les durées catalogue sur la durée
- [ ] Distinction visuelle RDV "solo multi-prestation" (même staff, prestations enchaînées) vs RDV "multi-staff" (plusieurs coiffeurs impliqués) dans les colonnes staff de Today.vue
- [ ] Bloquer la création d'un RDV si le staff sélectionné a déjà un chevauchement connu à cette heure (avertissement fort, pas seulement badge)

---

### 🔴 Priorité immédiate — Refonte Today.vue + Design system (mai 2026)

#### Thème global crème / ambre
- [x] Tokens CSS centralisés dans `base.css` — palette ambre (`--primary: #A8810A`, fond crème `--bg-main: #F5F2EA`)
- [x] Toutes les pages et modals migrés vers le thème crème/ambre
- [x] `CLAUDE.md` mis à jour avec le design system complet

#### Refonte Today.vue — structure onglets réceptionniste
- [x] Réécriture complète du template et du CSS
- [x] Topbar fixe + bande staff temps réel (statut + barre de progression)
- [x] Onglet 1 : File d'attente + Non affectés (fusionnés)
- [x] Onglet 2 : Planning du jour (RDV + walkins, triés par heure)
- [x] Onglet 3 : Staff (accordéon par collaborateur)
- [x] Tab actif persisté en localStorage (`glambook_today_tab`)
- [x] Barre de progression staff calculée en temps réel
- [ ] Page Login redesignée en B2B split-screen (avantages produit à gauche, formulaire à droite)

---

### 🔴 Priorité immédiate — Page Aujourd'hui / UX caissière (audit mai 2026)

#### Check-in client (arrivée RDV planifié)
- [x] Bouton "Arrivée" (vert) sur les cartes RDV planifiés → `scheduled` → `in_progress` + toast
- [ ] Recherche rapide client par nom ou téléphone directement sur la page

#### Confirmation avant "Terminer"
- [x] Double-clic sur "Terminer" : 1er clic → bouton vire en orange "Confirmer ?" (3s auto-annulation), 2e clic → action déclenchée. Implémenté dans colonnes staff (Today.vue) et RecapRdvModal.

#### Feedback visuel après chaque action
- [x] Toast de confirmation après Terminer / Servir / Supprimer / No-show
- [x] Toast d'erreur si l'action échoue (réseau, etc.)

---

### 🟠 Priorité forte — Page Aujourd'hui / UX caissière (audit mai 2026)

#### Repositionnement "Prestations sans collaborateur"
- [x] Collapsable par défaut — header cliquable + état persisté localStorage
- [ ] Intégrer les alertes directement dans la colonne staff concernée avec badge orange

#### Barre "Maintenant" dans les colonnes staff
- [x] Ligne rouge horizontale avec heure temps réel entre prestations actives et terminées

#### Stats actionnables en remplacement des KPIs froids
- [ ] Remplacer ou compléter les 4 chiffres (En attente / En cours / Terminés / Total) par :
  - Prochain RDV à venir : nom client + heure
  - Staff le plus disponible en ce moment
  - Nombre de personnes dans la file

---

### 🟡 Améliorations UX caissière — Page Aujourd'hui (audit mai 2026)

- [ ] Afficher l'heure d'arrivée réelle du client dans la file (≠ heure de la prestation calculée)
- [ ] Renommer "Servir →" en "Assigner" dans la file d'attente (plus clair pour la caissière)
- [ ] Barre de recherche client sur la page Aujourd'hui (retrouver un RDV du jour en 2 sec)

---

### 🔴 Priorité immédiate (audit expert métier — mai 2026)

#### Caisse & encaissement
- [x] Statut paiement par appointment : `payé` / `en attente` — colonne `payment_status` en base
- [x] Mode de paiement : espèces / carte (virement retiré — non utilisé)
- [x] Journal journalier : total CA, répartition par mode, liste payés / à encaisser — `CaisseDrawer`
- [x] Accès caisse journalière depuis la page Aujourd'hui — bouton "Caisse" dans la topbar
- [x] Badge "💰 À encaisser" sur les lignes planning après "Terminer sans payer"
- [x] `EncaisserModal` — prix éditables par prestation, total calculé, mode de paiement
- [x] Split "Encaisser / Plus tard" au moment de terminer une prestation (planning + staff)
- [x] Clic sur ligne "À encaisser" → ouvre directement `EncaisserModal`
- [x] Bouton crayon sur toutes les lignes → `EditApptModal` (statut, staff, prix, ajout prestation)
- [x] **Unification point d'encaissement** — un seul flux : tous les chemins (CaisseDrawer, RecapRdvModal, EditApptModal) redirigent vers `EncaisserModal`
- [ ] CA affiché dans la topbar = seulement les appointments `paid` (actuellement inclut `completed` non payés)
- [ ] Ventilation CA par collaborateur dans la CaisseDrawer
- [ ] Export / impression Z de caisse (PDF ou CSV)
- [ ] Traçabilité des modifications de prix (prix original vs prix encaissé)
- [ ] Gestion des remises / offerts (champ motif + impact CA)

#### Fiche client enrichie
- [ ] Historique RDV complet sur la fiche client (date, prestations, montant, staff)
- [ ] Total dépensé par client (lifetime value)
- [ ] Notes internes libres sur la fiche client (allergies, préférences, habitudes)

#### Annulation en ligne par le client
- [ ] Lien d'annulation dans l'email/SMS de confirmation de RDV
- [ ] Page publique d'annulation avec confirmation (sans compte requis)
- [ ] Délai minimum d'annulation configurable par le salon (ex : pas d'annulation < 2h)

---

### 🟠 Priorité forte (audit expert métier — mai 2026)

#### Rappels multi-canaux
- [ ] Rappel SMS 24h avant pour les RDV source `online` et `phone` (pas seulement WhatsApp)
- [ ] Confirmation email au client après réservation en ligne (avec lien d'annulation)

#### Réservation multi-prestations en ligne
- [x] Booking public : sélection de plusieurs prestations en une seule réservation
- [x] Calcul automatique de la durée totale et du créneau combiné
- [x] Affichage du prix total avant confirmation

#### Vue planning hebdomadaire
- [ ] Calendrier semaine en vue "colonnes staff × jours" (type Google Calendar)
- [ ] Visualisation des trous de planning et heures creuses
- [ ] Navigation semaine précédente / suivante

---

### 🟡 Améliorations UX (audit expert métier — mai 2026)

#### File d'attente — temps d'attente estimé
- [ ] Afficher le temps d'attente estimé par ligne (somme des durées des prestations devant)
- [ ] Afficher l'heure de passage estimée au client

#### Collaborateurs — avatar
- [ ] Exploiter le champ `avatar_url` existant en base dans l'UI (page Aujourd'hui, planning)
- [ ] Upload photo collaborateur depuis la page Staff

#### Notes RDV visibles sans ouvrir le modal
- [ ] Afficher la note (`note`) du RDV directement sur la carte dans Today.vue (tronquée si longue)
- [ ] Infobulle au survol pour afficher la note complète

---

### Onboarding
- [ ] Inscription self-service d'un nouveau salon
- [ ] Wizard de configuration initiale (horaires, services, staff)
- [ ] Email de bienvenue automatique

### Notifications
- [ ] Rappel RDV pour tous les canaux (pas seulement WhatsApp)
- [ ] Notification admin quand RDV en ligne reçu
- [ ] Confirmation email au client après réservation en ligne

### Réservation en ligne
- [ ] Annulation RDV par le client (lien dans confirmation)
- [ ] Modification RDV par le client
- [ ] Créneaux multi-services (réserver plusieurs prestations d'un coup)

### Bot WhatsApp
- [ ] Passer de Twilio Sandbox à un numéro WhatsApp Business réel
- [ ] Annulation RDV via bot
- [ ] Confirmation de rappel par le client (répondre "1" pour confirmer)

### Paiement & abonnement
- [ ] Intégration CMI ou Stripe pour paiement en ligne
- [ ] Gestion abonnements SaaS (Free / Pro / Business)
- [ ] Facturation automatique mensuelle

### Annuaire public (v3)
- [ ] Page publique par salon (slug, infos, services, avis)
- [ ] Recherche salons par ville / type
- [ ] Système d'avis clients
- [ ] SEO par page salon

### Analytics avancées
- [ ] Taux de no-show par période
- [ ] Revenus par collaborateur
- [ ] Heures creuses vs heures pleines
- [ ] Taux de conversion réservation en ligne

### Superadmin
- [ ] Dashboard global tous salons
- [ ] Gestion abonnements depuis /saas
- [ ] Métriques plateforme (MRR, salons actifs, RDV total)

---

## User stories par rôle

### Admin salon
- En tant qu'admin, je veux voir tous les RDV du jour avec leur source pour savoir d'où viennent mes clients.
- En tant qu'admin, je veux configurer les horaires d'ouverture pour que le bot et la réservation en ligne soient toujours à jour.
- En tant qu'admin, je veux voir les stats de CA et de mes meilleurs collaborateurs pour piloter mon salon.
- En tant qu'admin, je veux inviter un manager pour déléguer la gestion quotidienne sans lui donner accès aux finances.

### Manager
- En tant que manager, je veux voir et modifier les RDV du jour pour gérer l'accueil clients.
- En tant que manager, je veux ajouter une absence staff pour bloquer les créneaux automatiquement.
- En tant que manager, je veux signaler un client no-show pour alimenter l'historique.

### Client
- En tant que client, je veux réserver en ligne en 3 clics sans créer de compte.
- En tant que client, je veux réserver via WhatsApp dans ma langue (FR ou AR).
- En tant que client, je veux recevoir un rappel avant mon RDV pour ne pas l'oublier.
- En tant que client, je veux pouvoir annuler mon RDV sans appeler le salon.

---

## Définition of done

Une feature est "done" quand :
1. Fonctionnelle en local (frontend + backend + DB)
2. Testée manuellement sur le salon Free Style
3. Aucune régression sur les features existantes
4. Documentée dans CHANGELOG.md
5. Backlog mis à jour (BACKLOG.md)

---

---

## QA — Bugs corrigés (session mai 2026)

### Audit 1 — Module RDV multi-prestation (16 bugs)

| ID | Fichier | Bug | Fix |
|----|---------|-----|-----|
| m13 | appointments.service.js | `status: 'no_show'` → valeur incorrecte | → `'noshow'` |
| C1 | RdvModal.vue | `one(v)` retourne `undefined` pour tableau vide `[]` | `v[0] ?? null` |
| C2 | ServeWalkinModal.vue | `firstLine.staffId` peut être null en `doServe()` | Premier staffId non-null parmi toutes les lignes |
| C3 | Today.vue | Race condition si `fetchData` appelé deux fois rapidement | Epoch guard — résultats obsolètes ignorés |
| M1 | RdvModal.vue | `getHeavyWarning` silencieux pour prestation complexe sans staff (1 seule prestation) | Alerte dans tous les cas |
| M2 | RdvModal.vue | Watcher `clientPhone` reset `name/lastName` même si `forceEditClient` actif | Early-return si `forceEditClient` |
| M3 | RdvModal.vue | `forceStaffConfirm` utilise l'index tableau (instable après `splice`) | Clé `service_id` stable |
| M5 | ServeWalkinModal.vue | `getExternalConflict()` retourne seulement le 1er conflit | Collecte tous les conflits |
| M6 | RdvActionModal.vue | `filter(Boolean)` ne filtre pas les strings vides `''` dans `clientName()` | `filter(x => x?.trim())` |
| M7 | Today.vue | `rowsOverlap()` retourne `false` si durée = 0 | Fallback 30min |
| M8 | appointments.service.js | Pas d'alerte si `createAppointment` appelé sans services | `console.warn` ajouté |
| m2 | RdvModal.vue | `removeService()` ne reset pas `selectedServiceId` | Reset si service retiré = service sélectionné dans le picker |
| m4 | RdvList.vue | `a.service.name` sans optional chaining dans `servicesLabel` | `a.service?.name` |
| m5 | Today.vue | `overlappingSvcIds()` insère `null` dans le Set si `svcId` est null | Filtre `!= null` |
| m9 | useStaffRanking.js | Walkins en cours non comptés dans le workload | Walkins `status=waiting` exclus (pas encore servis), actifs inclus |
| m12 | RdvModal.vue | Ref `staffId` déclarée mais jamais envoyée dans le payload (dead code) | Supprimée |

### Audit 6 — QA suppression prestation (9 bugs corrigés)

| ID | Sévérité | Fichier | Bug | Fix |
|----|----------|---------|-----|-----|
| R1 | 🔴 Critique | appointments.service.js | `updateAppointment` : delete-all + reinsert non atomique → si insert échoue toutes les prestations sont perdues | Remplacé par upsert ciblé (diff existant/payload par id) |
| R2 | 🔴 Critique | RdvModal.vue | `selectedServices` initialisé sans filtre `cancelled` + `service_id: null` possible si service supprimé du catalogue | Filtre `status !== 'cancelled'`, guard `if (!svc?.id)`, champ `id` conservé pour upsert |
| R3 | 🔴 Critique | appointments.service.js | `fetchPlannedAppointments` ne fetche pas `appointment_services.status` → prestations annulées invisibles dans RdvModal | Ajout `status` dans le select |
| R4 | 🟠 Majeur | EditAppointmentModal.vue | `deleteLine` : si query `remaining` retourne null/erreur → tout l'appointment supprimé | `if (remErr) throw remErr` avant de tester remaining.length |
| R5 | 🟠 Majeur | EditAppointmentModal.vue | `deleteLine` : pas de `finally` → `_saving` bloqué indéfiniment en cas d'erreur | Ajout `finally { line._saving = false }` |
| R7 | 🟠 Majeur | EditAppointmentModal.vue | `handleSave` : boucle non atomique, met à jour les lignes `cancelled` | Skip `status === 'cancelled'`, guard `serviceId` requis pour insert |
| R9 | 🟡 Mineur | EditAppointmentModal.vue | `confirm()` natif bloquant au lieu de `BaseModal` pour deleteLine et handleCancelAll | Remplacé par `askConfirm()` async + `pendingConfirm` + BaseModal inline |
| R10 | 🟡 Mineur | EditAppointmentModal.vue | `computeApptStatus([])` retournait `'in_progress'` → RDV fantôme sans prestation | Retourne `'cancelled'` pour tableau vide |
| R11 | 🟡 Mineur | EditAppointmentModal.vue | `handleSave` insère une ligne `_new` même si `staffId` sans `serviceId` | Guard `if (line.serviceId)` avant insert |

### Audit 5 — QA multi-prestation (13 bugs corrigés)

| ID | Sévérité | Fichier | Bug | Fix |
|----|----------|---------|-----|-----|
| Q1 | 🔴 Critique | Today.vue | `loadFlaggedClients` filtre `no_show` → clients no-show jamais signalés | → `'noshow'` |
| Q2 | 🔴 Critique | Today.vue | `noShow()` écrit `status: 'no_show'` en base → carry-over infini | → `'noshow'` |
| Q3 | 🔴 Critique | Today.vue | `staffExternalConflict` filtre `no_show` → faux conflits externes persistants | → `'noshow'` |
| Q4 | 🔴 Critique | Today.vue | `fetchData` terminal avec `no_show` → RDV noshow traités comme carry-over | → `'noshow'` |
| Q5 | 🟠 Majeur | appointments.service.js | `confirmed` absent du filtre statut → RDV confirmés invisibles dans la liste | Ajout `'confirmed'` |
| Q6 | 🟠 Majeur | ServeWalkinModal.vue | `canSubmit` valide si ≥1 ligne complète, ignore lignes staff-sans-service | Bloqué si `missingService` |
| Q7 | 🟠 Majeur | RdvModal.vue | `checkConflicts` ignore statut `confirmed` → chevauchement non détecté | Ajout `'confirmed'` |
| Q8 | 🟠 Majeur | AddWalkinModal.vue | Services locaux fetchés en double → ranking avec données ≠ Today.vue | Prop `services` depuis Today.vue |
| Q9 | 🟠 Majeur | ServeWalkinModal.vue | `staff_id` legacy sur appointment = premier staff arbitraire (legacy) | Non critique — champ legacy |
| Q10 | 🟡 Mineur | RdvModal.vue | Services inactifs non filtrés dans le picker de prestation | Ajout filtre `is_active !== false` |
| Q11 | 🟡 Mineur | RdvModal.vue | RDV en cours d'édition compté dans son propre workload (mode édition) | Exclusion par id dans `fetchDayAppointments` |
| Q12 | 🟡 Mineur | AddWalkinModal.vue | Staff sélectionné sans prestation → ligne silencieusement ignorée | `missingService` bloque submit + message d'erreur |
| Q13 | 🟡 Mineur | RdvModal.vue | Watcher force-staff : `forEach` écrase le 1er conflit si 2 changements simultanés | `for…break` — stoppe au 1er indisponible |

### Refonte 7 — File d'attente 1 ligne = 1 prestation (mai 2026)

**Principe :** chaque `appointment_service` est une unité autonome dans la file. Un client avec N prestations génère N lignes indépendantes, sans regroupement.

**Composants créés :**
- `ServeServiceModal.vue` — modale mono-service (banner client, carte prestation, picker staff rankée, sauvegarde `staff_id`)
- `RecapRdvModal.vue` — modale de récap accessible ailleurs (toutes les prestations avec statuts et actions Servir / Terminer / Supprimer)

**Règles métier :**
- Walkins : suppression uniquement, pas d'annulation
- Walkin créé avec staff → `status = 'in_progress'` immédiatement (sinon `waiting`)
- La file affiche uniquement les services `active` sans `staff_id` (+ placeholder si aucun service)
- Prestation complexe (`is_heavy`) : warning uniquement si staff assigné sans compétence — pas de warning si pas de staff (staff optionnel à l'ajout)

**Fichiers modifiés :**
- `appointment_services` — migration SQL : ajout colonne `start_time timestamptz`
- `AddWalkinModal.vue` — cascade `start_time`, statut initial dynamique, warning `is_heavy` allégé
- `appointments.service.js` — `createAppointment` persiste `start_time` par service
- `Today.vue` — computed `walkinRows` (liste plate), `openServeRow()`, `confirmDeleteQueueRow()`, suppression `walkinGroups` / `openRecap` / `RecapRdvModal`
- `RdvList.vue` — `expandedRows()` : 1 `<tr>` par `appointment_service`

### Audit 4 — Tie-breaker ranking staff (1 amélioration)

| ID | Sévérité | Fichier | Problème | Fix |
|----|----------|---------|----------|-----|
| E1 | 🟡 Amélioration | useStaffRanking.js | À score égal, ordre déterminé par l'ordre du fetch Supabase (alphabétique) — pas de logique métier | Tie-break par `_lastWorkTs` : le staff qui a travaillé le moins récemment passe en premier (rotation équitable) |

### Audit 3 — QA algorithme ranking staff (4 bugs corrigés)

| ID | Sévérité | Fichier | Bug | Fix |
|----|----------|---------|-----|-----|
| B5 | 🔴 Critique | staff.service.js | `fetchStaff()` sans filtre `organization_id` → staff de toutes les orgs | Ajout `.eq('organization_id', orgId)` |
| B3 | 🟠 Majeur | RdvModal.vue | Statut `confirmed` exclu du fetch `dayAppointments` → staff avec RDV confirmé apparaît disponible | Ajout `'confirmed'` dans `.in('status', [...])` |
| B1 | 🟡 Mineur | AddWalkinModal.vue | Staff fetché indépendamment au lieu de recevoir prop de Today.vue → double source de vérité | Suppression `fetchStaff()` local, ajout prop `staff` passée depuis Today.vue |
| B6 | 🔴 Critique | useStaffRanking.js | Walkin `in_progress` : `start_time` = heure d'entrée en file → overlap toujours faux → staff occupé compte workload 0 | Bypass overlap pour walkin `in_progress` : si staff matche → toujours compté |

### Audit 2 — QA global codebase (7 bugs corrigés)

| ID | Sévérité | Fichier | Bug | Fix |
|----|----------|---------|-----|-----|
| B1 | 🔴 Critique | useStaffRanking.js | `'no_show'` utilisé dans les filtres de statut → ne matche jamais la valeur en base | → `'noshow'` (canonique) |
| B2 | 🔴 Critique | clients.service.js | `fetchAllClients()` sans filtre `organization_id` → retourne les clients de tous les salons | Ajout `.eq('organization_id', orgId)` + filtre `badAppts` |
| B3 | 🔴 Critique | appointments.controller.js | `.single()` sans capture d'erreur → crash silencieux si 0 résultat | Remplacé par `.maybeSingle()` avec `if (findError) throw findError` |
| B4 | 🔴 Critique | RdvModal.vue | `confirmForceStaff()` réinitialise avec `serviceIndex: null` au lieu de `serviceId: null` → état corrompu | Typo corrigée |
| B12 | 🟠 Majeur | clients.service.js | `findClientByPhone()` et `getOrCreateClient()` sans filtre `organization_id` → peut retourner client d'une autre org | Ajout `.eq('organization_id', orgId)` |
| B14 | 🟠 Majeur | backend/routes/whatsapp.js | `ORG_ID` hardcodé en dur dans le code source | Déplacé dans `.env` (`WHATSAPP_ORG_ID`) |
| B15 | 🟡 Mineur | ServeWalkinModal.vue | Condition `if (line.serviceId \|\| line.staffId)` permettait d'insérer une ligne avec uniquement un staff | → `if (line.serviceId)` (service requis) |
| B17 | 🟡 Mineur | AddWalkinModal.vue, ServeWalkinModal.vue | Dropdown collaborateur actif même sans prestation → ranking sans filtre compétence | Prop `:disabled="!line.serviceId"` ajouté |

---

## Versioning

| Version | Statut | Contenu |
|---------|--------|---------|
| v0.1 | ✅ Livré | Agenda, clients, catalogue, staff |
| v0.2 | ✅ Livré | Réservation en ligne publique |
| v0.3 | ✅ Livré | Bot WhatsApp FR/AR + rappels |
| v0.4 | ✅ Livré | Gestionnaires, paramètres, fermetures |
| v0.5 | ✅ Livré | Restructuration, stabilisation, 6 audits QA (51 bugs), ranking staff intelligent, multi-prestation robuste, file d'attente 1 prestation = 1 ligne |
| v0.6 | ✅ Livré | Refonte UX caissière : check-in client, barre Maintenant, section collapsable, vue unifiée RecapRdvModal, prestations parallèles (SQL + cascade + UI) |
| v0.7 | ✅ Livré | Caisse & encaissement complet : EncaisserModal (prix éditables multi-prestation), CaisseDrawer (journal journalier), badge À encaisser, split Encaisser/Plus tard, EditApptModal (statut + staff + ajout prestation), unification point de paiement, thème crème/ambre finalisé, Login B2B split-screen |
| v1.0 | 📋 Planifié | Onboarding self-service, WhatsApp Business |
| v2.0 | 📋 Planifié | Multi-salons, abonnements, paiement |
| v3.0 | 💡 Vision | Annuaire public, SEO, avis clients |