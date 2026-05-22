#!/bin/bash
export PATH="$HOME/.local/share/supabase:$PATH"

echo "🛑 Arrêt de l'environnement local Glambook..."

pkill -f "node index.js" 2>/dev/null && echo "   ✓ Backend arrêté"
pkill -f "vite" 2>/dev/null && echo "   ✓ Frontend arrêté"
supabase stop 2>/dev/null && echo "   ✓ Supabase arrêté"

echo "✅ Tout est arrêté."
