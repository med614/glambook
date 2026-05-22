#!/bin/bash
echo "Arrêt des serveurs..."
lsof -ti:3000 | xargs kill -9 2>/dev/null && echo "Backend arrêté" || echo "Backend déjà arrêté"
lsof -ti:5173 | xargs kill -9 2>/dev/null && echo "Frontend arrêté" || echo "Frontend déjà arrêté"
