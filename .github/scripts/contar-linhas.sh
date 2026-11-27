#!/bin/sh
# Escreve "tabela<TAB>linhas" para cada tabela do schema public (ordenadas), incluindo a
# __EFMigrationsHistory. Serve para o manifesto do backup e para o teste de restauro.
# Uso: DB_URL=postgresql://... sh contar-linhas.sh
set -eu
: "${DB_URL:?Falta DB_URL}"

tabelas=$(psql "$DB_URL" -X -A -t -c "select tablename from pg_tables where schemaname = 'public' order by tablename")
for tabela in $tabelas; do
  linhas=$(psql "$DB_URL" -X -A -t -c "select count(*) from public.\"$tabela\"")
  printf '%s\t%s\n' "$tabela" "$linhas"
done
