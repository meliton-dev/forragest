#!/usr/bin/env bash
# Restaura un respaldo sobre una base de datos. BORRA y reemplaza las tablas que existan.
#   DATABASE_URL=postgresql://... ./scripts/restaurar.sh respaldos/forragest-20261111-0917.dump[.gpg]
# Para un .gpg se necesita BACKUP_PASSPHRASE.
set -euo pipefail
: "${DATABASE_URL:?Define DATABASE_URL con la base DESTINO}"
src="${1:?Indica el archivo de respaldo}"
if [[ "$src" == *.gpg ]]; then
  : "${BACKUP_PASSPHRASE:?Define BACKUP_PASSPHRASE para descifrar}"
  plain="$(mktemp)"
  trap 'rm -f "$plain"' EXIT
  gpg --batch --yes --decrypt --pinentry-mode loopback --passphrase-fd 3 --output "$plain" "$src" 3<<<"$BACKUP_PASSPHRASE"
  src="$plain"
fi
read -r -p "Esto reemplaza los datos de la base destino. Escribe SI para continuar: " ok
[ "$ok" = "SI" ] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$src"
echo "Restauración terminada."
