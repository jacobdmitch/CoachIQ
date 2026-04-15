#!/bin/bash
set -e
echo "Starting CoachIQ database migrations..."
if [ -f .env ]; then export $(cat .env | grep -v '#' | xargs); fi
node run-all-migrations.js
echo "All migrations completed successfully!"
