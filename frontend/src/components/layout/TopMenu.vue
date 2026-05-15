<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authService } from '../../services/auth.service'
import AppIcon from '../common/AppIcon.vue'

const router = useRouter()
const isMenuOpen = ref(false)

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

function closeMenu() {
  isMenuOpen.value = false
}

function handleLogout() {
  authService.logout()
  router.push('/login')
  closeMenu()
}
</script>
  
<template>
  <div class="top-menu" :class="{ open: isMenuOpen }">
    <!-- LOGO -->
    <div class="logo">
      <img
        src="@/assets/logoGlambook.png"
        alt="Glambook Solutions"
      />
    </div>

    <!-- MENU -->
    <nav class="menu">
      <router-link
        to="/today"
        class="menu-item"
        active-class="active"
        @click="closeMenu"
      >
        <AppIcon name="calendar" :size="18" />
        Aujourd’hui
      </router-link>

      <router-link
        to="/admin/rdv"
        class="menu-item"
        active-class="active"
        @click="closeMenu"
      >
        <AppIcon name="clock" :size="18" />
        RDV
      </router-link>

      <div class="menu-divider">
        <span>Administration</span>
      </div>

      <router-link
        to="/admin/clients"
        class="menu-item"
        active-class="active"
        @click="closeMenu"
      >
        <AppIcon name="users" :size="18" />
        Clients
      </router-link>

      <router-link
        to="/admin/staff"
        class="menu-item"
        active-class="active"
        @click="closeMenu"
      >
        <AppIcon name="users" :size="18" />
        Staff
      </router-link>

      <router-link
        to="/admin/services"
        class="menu-item"
        active-class="active"
        @click="closeMenu"
      >
        <AppIcon name="settings" :size="18" />
        Catalogue
      </router-link>

      <div class="spacer"></div>

      <button class="menu-item logout-btn" @click="handleLogout">
        <AppIcon name="x-circle" :size="18" />
        Déconnexion
      </button>
    </nav>

    <!-- MOBILE TOGGLE -->
    <button
      class="menu-toggle"
      @click="toggleMenu"
      aria-label="Ouvrir le menu"
    >
      ☰
    </button>
  </div>
</template>

<style scoped>

/* MENU ITEMS */
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  transition: all 0.2s ease;
  border: none;
  background: transparent;
  cursor: pointer;
}

.menu-item:hover {
  background: var(--bg-card-soft);
  color: var(--text-main);
}

.menu-item.active {
  background: var(--bg-teal-soft);
  color: var(--accent-teal);
  font-weight: 700;
}

/* ADMIN DIVIDER */
.menu-divider {
  margin: 16px 8px 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-soft);
}

.menu-divider span {
  font-size: 10px;
  font-weight: 800;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.spacer {
  flex: 1;
}

.logout-btn {
  color: #ef4444;
  margin-left: auto;
}

.logout-btn:hover {
  background: #fee2e2;
  color: #dc2626;
}

/* =========================================================
   MOBILE — TOP MENU (TOGGLE STYLE)
========================================================= */
@media (max-width: 768px) {

.logout-btn {
  margin-left: 0;
  margin-top: 8px;
  border-top: 1px solid var(--border-soft);
  padding-top: 12px;
  width: 100%;
}

/* ... existing mobile styles ... */

/* Top bar */
.top-menu {
  position: relative;
  padding: 0 16px;
}

/* Burger button */
.menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 38px;
  height: 38px;

  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: var(--bg-card-soft);

  font-size: 18px;
  color: var(--text-main);

  cursor: pointer;
}

.menu-toggle:active {
  transform: scale(0.94);
  opacity: 0.8;
}

/* Hide menu by default */
.top-menu .menu {
  display: none;
}

/* Open state */
.top-menu.open .menu {
  display: flex;
  flex-direction: column;

  position: absolute;
  top: 56px;
  right: 16px;

  width: min(220px, calc(100vw - 32px));

  background: var(--bg-card);
  border: 1px solid var(--border-soft);
  border-radius: 14px;

  padding: 8px;
  gap: 4px;

  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.25);

  z-index: 1000;
}

/* Menu items */
.top-menu.open .menu-item {
  display: flex;
  align-items: center;

  padding: 10px 12px;
  border-radius: 10px;

  font-size: 13px;
  color: var(--text-main);

  text-decoration: none;
}

/* Active route */
.top-menu.open .menu-item.active {
  background: var(--bg-teal-soft); /* Matching screenshot */
  color: var(--accent-teal);
  font-weight: 600;
}

/* Tap feedback */
.top-menu.open .menu-item:active {
  background: rgba(255, 255, 255, 0.06);
}
}


</style>
