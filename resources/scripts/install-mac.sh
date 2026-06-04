#!/bin/bash
# NPD Planner — Mac Installer Helper
# Copies the app to /Applications and removes the macOS quarantine attribute
# that causes the "damaged and can't be opened" error on unsigned apps.
#
# Usage:
#   1. Open the .dmg file
#   2. Drag "NPD Planner" to Applications (or let this script do it)
#   3. Double-click this script, or run it in Terminal:
#        bash install-mac.sh

APP_NAME="NPD Planner.app"
APPLICATIONS="/Applications"
DEST="$APPLICATIONS/$APP_NAME"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NPD Planner — Mac Installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Step 1: find the app ──────────────────────────────────────────────────────
# Look for the app next to this script (inside the mounted DMG) first,
# then fall back to /Applications if it was already dragged there.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_IN_DMG="$SCRIPT_DIR/$APP_NAME"

if [ -d "$APP_IN_DMG" ]; then
  SOURCE="$APP_IN_DMG"
elif [ -d "$DEST" ]; then
  SOURCE="$DEST"
else
  echo "  ✗  Could not find \"$APP_NAME\"."
  echo "     Make sure you opened the .dmg file before running this script."
  echo ""
  read -r -p "  Press Enter to close..."
  exit 1
fi

# ── Step 2: copy to /Applications (if not already there) ─────────────────────
if [ "$SOURCE" != "$DEST" ]; then
  echo "  → Copying to $APPLICATIONS ..."
  # Remove old version if present
  if [ -d "$DEST" ]; then
    rm -rf "$DEST"
  fi
  cp -R "$SOURCE" "$APPLICATIONS/"
  if [ $? -ne 0 ]; then
    echo "  ✗  Copy failed. Try dragging the app manually and re-running this script."
    echo ""
    read -r -p "  Press Enter to close..."
    exit 1
  fi
  echo "  ✓  Copied to $APPLICATIONS"
fi

# ── Step 3: remove quarantine attribute ──────────────────────────────────────
echo "  → Removing macOS quarantine flag..."
xattr -rd com.apple.quarantine "$DEST" 2>/dev/null
# Also clear all extended attributes that Gatekeeper checks
xattr -cr "$DEST" 2>/dev/null

echo "  ✓  Quarantine removed"

# ── Step 4: verify ────────────────────────────────────────────────────────────
if [ -d "$DEST" ]; then
  echo ""
  echo "  ✓  NPD Planner is ready to use."
  echo "     Open it from Finder → Applications → NPD Planner"
  echo ""
  # Optionally open the app immediately
  read -r -p "  Open NPD Planner now? [Y/n]: " OPEN_NOW
  OPEN_NOW="${OPEN_NOW:-Y}"
  if [[ "$OPEN_NOW" =~ ^[Yy]$ ]]; then
    open "$DEST"
  fi
else
  echo "  ✗  Something went wrong. Please contact your IT administrator."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
