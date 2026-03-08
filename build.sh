#!/bin/bash

echo "Starting parallel build..."

# Build frontend in background
(
  echo "=> Building frontend..."
  cd frontend
  npm install
  npm run build
  echo "=> Frontend build complete!"
) &

# Build backend in background
(
  echo "=> Building backend..."
  cd backend
  npm install
  # Add actual build command here if backend ever gets one (like tsc)
  # npm run build 
  echo "=> Backend build complete!"
) &

# Wait for both background processes to finish
wait

echo "All builds completed successfully!"
