#!/bin/bash
export PATH="$HOME/.local/share/supabase:$PATH"

echo "🚀 Démarrage de l'environnement local Glambook..."

# Supabase local
echo "📦 Démarrage Supabase local..."
supabase start 2>/dev/null &
sleep 3

# Backend
echo "🔧 Démarrage backend (DB locale)..."
pkill -f "node index.js" 2>/dev/null
sleep 1
cd "$(dirname "$0")/backend"
DOTENV_PATH=.env.local node index.js > /tmp/backend-local.log 2>&1 &
echo "   Logs backend : tail -f /tmp/backend-local.log"

# Frontend
echo "🎨 Démarrage frontend..."
pkill -f "vite" 2>/dev/null
sleep 1
cd "$(dirname "$0")/frontend"
PATH=~/.nvm/versions/node/v20.20.2/bin:$PATH npm run dev > /tmp/frontend-local.log 2>&1 &
echo "   Logs frontend : tail -f /tmp/frontend-local.log"

sleep 3
echo ""
echo "✅ Environnement local prêt !"
echo ""
echo "   App        → http://localhost:5173"
echo "   Studio DB  → http://127.0.0.1:54323"
echo "   Backend    → http://localhost:3000"
echo ""
echo "   Login : med.benmansour@icloud.com / admin123456"
