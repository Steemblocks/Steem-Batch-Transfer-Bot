#!/bin/bash

# Change to the directory where this script is located
cd "$(dirname "$0")"

# Run the bot silently
node --disable-warning=DEP0040 transfer.js

# Pause before closing (so the user can read the output)
echo ""
echo "Press any key to exit..."
read -n 1 -s
