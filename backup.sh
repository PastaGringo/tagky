#!/bin/bash

# Script Header
echo '*** backup.sh ***'
echo '-------------------'
echo

# Get project name from current directory name
PROJECT_NAME=$(basename "$(pwd)")

# Prompt for backup description
echo "Please enter a description for this backup:"
read PROJECT_DESC

# Sanitize project name and description for filename
PROJECT_NAME=$(echo "$PROJECT_NAME" | tr -cd '[:alnum:]-')
PROJECT_DESC=$(echo "$PROJECT_DESC" | tr ' ' '-' | tr -cd '[:alnum:]-')

BACKUP_DIR="../BACKUPS/$PROJECT_NAME"

# Check if backup directory exists
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Backup directory for $PROJECT_NAME does not exist."
    read -p "Would you like to create it? (y/n): " CREATE_DIR
    if [[ $CREATE_DIR =~ ^[Yy]$ ]]; then
        mkdir -p "$BACKUP_DIR"
        echo "Created directory: $BACKUP_DIR"
    else
        echo "Backup cancelled."
        exit 1
    fi
fi

# Generate timestamp for the backup file name
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
OUTPUT_FILE="$BACKUP_DIR/$PROJECT_NAME-$PROJECT_DESC-$TIMESTAMP.7z"

# Display files being backed up
echo "Preparing to backup the following files and directories:"
find . -type f \
    ! -path "*/node_modules/*" \
    ! -path "*/up/*" \
    ! -path "*/.git/*" \
    ! -name ".DS_Store" \
    ! -path "*/dist/*" \
    ! -path "*/build/*" \
    ! -path "*/.cache/*" \
    ! -path "*/coverage/*" \
    ! -name ".env*" \
    ! -name "npm-debug.log*" \
    ! -name "yarn-debug.log*" \
    ! -name "yarn-error.log*" \
    -print

echo "Starting backup with zero compression for maximum speed..."

# Create 7z archive with no compression (-mx=0)
7z a -mx=0 "$OUTPUT_FILE" . \
  -xr!node_modules \
  -xr!up \
  -xr!.git \
  -xr!.DS_Store \
  -xr!dist \
  -xr!build \
  -xr!.cache \
  -xr!coverage \
  -xr!.env* \
  -xr!npm-debug.log* \
  -xr!yarn-debug.log* \
  -xr!yarn-error.log*

# Calculate and display archive size
SIZE=$(stat -f %z "$OUTPUT_FILE")

# Print success message
echo "✅ Backup created successfully: $OUTPUT_FILE"
echo "📦 Total bytes: $SIZE"