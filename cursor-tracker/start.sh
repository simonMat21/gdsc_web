#!/bin/bash

# Development startup script for Cursor Tracker
# Starts both server and frontend in separate terminals

echo "🚀 Starting Cursor Tracker..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Kill any existing processes on ports 4000 and 3000
echo "🧹 Cleaning up existing processes..."
lsof -ti:4000 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Start backend in background
echo "📡 Starting backend server..."
cd server
npm install > /dev/null 2>&1
npm run dev &
BACKEND_PID=$!
echo "✓ Backend started (PID: $BACKEND_PID)"

# Wait for backend to start
sleep 2

# Start frontend
echo "🎨 Starting frontend app..."
cd ../frontend
npm install > /dev/null 2>&1
npm run dev &
FRONTEND_PID=$!
echo "✓ Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║  ✓ Cursor Tracker is running!             ║"
echo "║                                            ║"
echo "║  📡 Backend:  http://localhost:4000        ║"
echo "║  🎨 Frontend: http://localhost:3000        ║"
echo "║                                            ║"
echo "║  Open http://localhost:3000 in your        ║"
echo "║  browser and invite a friend!              ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# Keep script running
wait
