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
- [x] Vue "Aujourd'hui" — prestations non affectées à un staff, dropdown actions (no-show, annuler, supprimer)
- [x] Liste RDV avec source (Salon / Téléphone / WhatsApp / En ligne)
- [x] Modal modification RDV
- [x] Statuts : scheduled, in_progress, confirmed, cancelled, no_show
- [x] Création RDV avec `source: 'online'` via booking public

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

## Versioning

| Version | Statut | Contenu |
|---------|--------|---------|
| v0.1 | ✅ Livré | Agenda, clients, catalogue, staff |
| v0.2 | ✅ Livré | Réservation en ligne publique |
| v0.3 | ✅ Livré | Bot WhatsApp FR/AR + rappels |
| v0.4 | ✅ Livré | Gestionnaires, paramètres, fermetures |
| v0.5 | 🚧 En cours | Restructuration, stabilisation, docs |
| v1.0 | 📋 Planifié | Onboarding self-service, WhatsApp Business |
| v2.0 | 📋 Planifié | Multi-salons, abonnements, paiement |
| v3.0 | 💡 Vision | Annuaire public, SEO, avis clients |