#!/bin/bash
# Démarre le backend et le frontend de MedSolutions

PROJECT="/Users/mohamedbenmansour/MedSolutions"
NODE="$HOME/.nvm/versions/node/v20.20.2/bin/node"

# Tuer les anciens processus sur les ports 3000 et 5173
echo "🔄 Arrêt des anciens serveurs..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null
sleep 1

# Backend
echo "🚀 Démarrage du backend (port 3000)..."
cd "$PROJECT/backend"
"$NODE" node_modules/.bin/nodemon index.js > /tmp/medsolutions-backend.log 2>&1 &
BACKEND_PID=$!

# Frontend
echo "🎨 Démarrage du frontend (port 5173)..."
cd "$PROJECT/frontend"
"$NODE" node_modules/.bin/vite --port 5173 > /tmp/medsolutions-frontend.log 2>&1 &
FRONTEND_PID=$!

sleep 3

# Vérification
if lsof -ti:3000 > /dev/null 2>&1; then
  echo "✅ Backend    → http://localhost:3000"
else
  echo "❌ Backend KO — voir /tmp/medsolutions-backend.log"
fi

if lsof -ti:5173 > /dev/null 2>&1; then
  echo "✅ Frontend   → http://localhost:5173"
else
  echo "❌ Frontend KO — voir /tmp/medsolutions-frontend.log"
fi

echo ""
echo "📋 Logs : tail -f /tmp/medsolutions-backend.log"
echo "📋 Logs : tail -f /tmp/medsolutions-frontend.log"
