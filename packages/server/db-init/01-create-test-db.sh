#!/bin/sh
# Bootstrap a second database used by integration tests so dev and tests
# never share a schema. Runs once when the volume is empty.
set -e

if [ "$(id -u)" = "0" ]; then
  su -s /bin/sh postgres -c "$0" "$@"
  exit $?
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
  CREATE DATABASE farm_game_test OWNER $POSTGRES_USER;
EOSQL