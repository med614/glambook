import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { supabase } from './lib/supabase'

import './assets/css/buttons.css'
import './assets/css/admin.css'

async function bootstrap() {
  // Ensure JWT is fresh (with org_id, role) before mounting
  const { data } = await supabase.auth.getSession()
  if (data?.session) {
    await supabase.auth.refreshSession()
  }

  createApp(App)
    .use(router)
    .mount('#app')
}

bootstrap()
