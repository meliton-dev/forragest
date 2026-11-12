#!/usr/bin/env bash
# Respaldo de la base de datos de Forragest.
#   DATABASE_URL=postgresql://... ./scripts/respaldo.sh [carpeta]
# Si BACKUP_PASSPHRASE está definida, el archivo sale cifrado (.dump.gpg).
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL con la conexión a la base}"
out_dir="${1:-respaldos}"
mkdir -p "$out_dir"
file="$out_dir/forragest-$(date -u +%Y%m%d-%H%M).dump"

# formato "custom": comprimido y restaurable tabla por tabla con pg_restore
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$file"

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 --pinentry-mode loopback --passphrase-fd 3 --output "$file.gpg" "$file" 3<<<"$BACKUP_PASSPHRASE"
  rm "$file"
  file="$file.gpg"
fi
echo "Respaldo listo: $file ($(du -h "$file" | cut -f1))"
