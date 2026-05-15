# BUSINESS.md — Vision business Glambook

---

## Positionnement

**Glambook** est un SaaS de gestion et réservation en ligne pour salons de coiffure et beauté au Maghreb.

Problème résolu : les salons gèrent encore leurs RDV par téléphone ou WhatsApp manuel, sans outil adapté à leur marché (langue arabe, paiement local, WhatsApp comme canal principal).

Différenciation vs concurrents (Booksy, Fresha) :
- Interface et bot **bilingue FR/AR**
- **WhatsApp-first** — canal dominant au Maghreb
- Prix adapté au marché local (DH)
- Proximité et support terrain (Maroc)

---

## Marché cible

**Phase 1 — Maroc**
- Salons de coiffure hommes et femmes
- Instituts de beauté
- Barbershops
- Estimation : 50 000+ salons au Maroc

**Phase 2 — Maghreb**
- Algérie, Tunisie
- Même stack culturelle et linguistique

**Client idéal (ICP)**
- Salon 2-10 collaborateurs
- Propriétaire actif dans la gestion quotidienne
- Déjà sur WhatsApp avec ses clients
- Veut se digitaliser sans complexité

---

## Modèle économique

### Abonnements SaaS (cible v1.0)

| Plan | Prix / mois | Pour qui | Inclus |
|------|-------------|----------|--------|
| **Starter** | 99 DH | 1 salon, 1 admin | Agenda, clients, catalogue, réservation en ligne |
| **Pro** | 199 DH | 1 salon, jusqu'à 3 managers | Tout Starter + Bot WhatsApp + Stats |
| **Business** | 349 DH | 1 salon, managers illimités | Tout Pro + Support prioritaire + Exports |

> Pricing à valider avec le marché. Free Style paie actuellement : **0 DH** (client pilote).

### Revenus additionnels (v2+)
- Commission sur paiements en ligne (acomptes RDV)
- Plan annuaire — mise en avant sur la plateforme publique
- Frais d'onboarding pour les grands comptes

---

## Traction actuelle

| Indicateur | Valeur |
|------------|--------|
| Salons actifs | 1 (Free Style, Maroc) |
| MRR | 0 DH (phase pilote) |
| RDV gérés via plateforme | En cours de mesure |
| Bot WhatsApp actif | Oui (sandbox Twilio) |

---

## Objectifs

### 6 mois
- [ ] Déploiement en production stable (backend + frontend hébergés)
- [ ] Passer WhatsApp Sandbox → WhatsApp Business réel
- [ ] Onboarding self-service opérationnel
- [ ] 5 salons payants actifs
- [ ] MRR : 1 000 DH

### 12 mois
- [ ] 30 salons actifs au Maroc
- [ ] MRR : 6 000 DH
- [ ] 1 gestionnaire terrain (sales / support)
- [ ] Lancement Algérie ou Tunisie

### 24 mois
- [ ] 150 salons actifs
- [ ] MRR : 30 000 DH
- [ ] Annuaire public lancé
- [ ] Levée de fonds ou autofinancement stable

---

## Go-to-market

### Phase 1 — Bouche à oreille (maintenant)
- Free Style comme vitrine et référence
- Démo terrain dans les salons proches
- Offre de lancement : 3 mois gratuits pour les 10 premiers salons

### Phase 2 — Digital (v1.0)
- Page landing Glambook avec démo en ligne
- WhatsApp Business pour les salons prospects
- Groupes Facebook/Instagram salons Maroc

### Phase 3 — Partenariats (v2.0)
- Distributeurs de produits coiffure (accès direct aux salons)
- Associations professionnelles coiffure
- Influenceurs beauté Maghreb

---

## Risques et mitigation

| Risque | Probabilité | Mitigation |
|--------|-------------|------------|
| Salons réticents à la digitalisation | Élevée | Onboarding simple, support WhatsApp, démo terrain |
| Concurrent international (Fresha) s'attaque au Maghreb | Moyenne | Avance locale, FR/AR natif, prix DH |
| WhatsApp Business API coûts élevés | Moyenne | Négocier tarif volume, intégrer dans le pricing |
| Dépendance Twilio / Supabase | Faible | Abstraire les intégrations, avoir un plan B |
| Free Style arrête (seul client) | Faible | Accélérer acquisition nouveaux salons |

---

## KPIs à suivre

| KPI | Fréquence | Cible 6 mois |
|-----|-----------|--------------|
| Salons actifs | Mensuel | 5 |
| MRR | Mensuel | 1 000 DH |
| Taux churn | Mensuel | < 5% |
| RDV créés via plateforme | Hebdo | 200 / semaine |
| Taux conversion réservation en ligne | Hebdo | > 60% |
| Messages WhatsApp bot | Hebdo | En croissance |

---

## Prochaines décisions business

- [ ] Fixer le pricing définitif et le valider avec Free Style
- [ ] Définir l'offre de lancement (durée gratuite, conditions)
- [ ] Choisir le canal d'acquisition principal (terrain vs digital)
- [ ] Ouvrir le compte WhatsApp Business officiel Glambook
- [ ] Créer la page landing glambook.ma (ou .com)