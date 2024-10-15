#!/bin/bash

# ======================================== CONFIG =================================================

# Define source and target schemas and chain ID to delete data for
read -p "Enter source schema number: " SOURCE_SCHEMA_NUM
read -p "Enter target schema number: " TARGET_SCHEMA_NUM
read -p "Enter chain ID to delete data for: " CHAIN_ID

SOURCE_SCHEMA="chain_data_${SOURCE_SCHEMA_NUM}"
TARGET_SCHEMA="chain_data_${TARGET_SCHEMA_NUM}"

# Read the DATABASE_URL from the .env
# Example: DATABASE_URL=postgres://user:password@localhost:5432/grants_stack_indexer?sslmode=no-verify
source .env
DATABASE_URL=${DATABASE_URL:-}

if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL is not set in the environment."
  exit 1
fi

# Path to SSL certificates
SSL_DIR="./ssl"  # Suggest to place certificates in ./ssl directory
SSL_ROOT_CERT="$SSL_DIR/ca-certificate.crt"
SSL_CERT="$SSL_DIR/client-cert.pem"
SSL_KEY="$SSL_DIR/client-key.pem"

# =================================================================================================

# Extract components from DATABASE_URL using sed
USERNAME=$(echo $DATABASE_URL | sed -n 's#.*//\([^:]*\):.*#\1#p')
PASSWORD=$(echo $DATABASE_URL | sed -n 's#.*//[^:]*:\([^@]*\)@.*#\1#p')
HOST=$(echo $DATABASE_URL | sed -n 's#.*@\(.*\):[0-9]*/.*#\1#p')
PORT=$(echo $DATABASE_URL | sed -n 's#.*:\([0-9]*\)/.*#\1#p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's#.*/\([^?]*\).*#\1#p')
SSL_MODE=$(echo $DATABASE_URL | sed -n 's#.*sslmode=\([^&]*\).*#\1#p')

# Set PGPASSWORD environment variable for non-interactive password authentication
export PGPASSWORD=$PASSWORD

# Confirm action
echo "You are about to clone schema '$SOURCE_SCHEMA' to '$TARGET_SCHEMA' and delete data for chain ID: $CHAIN_ID."
read -p "Do you want to continue? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Operation cancelled."
  exit 1
fi

# Function to handle errors
handle_error() {
  echo "Error occurred. Exiting."
  unset PGPASSWORD
  exit 1
}

# Trap errors and call handle_error function
trap 'handle_error' ERR

# Check SSL certificates if SSL mode is required
if [ "$SSL_MODE" == "require" ]; then
  echo "SSL mode is enabled. Checking for SSL certificates in $SSL_DIR..."
  if [ ! -f "$SSL_ROOT_CERT" ]; then
    echo "Missing $SSL_ROOT_CERT. Please place the CA certificate in the $SSL_DIR directory."
    exit 1
  fi
  if [ ! -f "$SSL_CERT" ]; then
    echo "Missing $SSL_CERT. Please place the client certificate in the $SSL_DIR directory."
    exit 1
  fi
  if [ ! -f "$SSL_KEY" ]; then
    echo "Missing $SSL_KEY. Please place the client key in the $SSL_DIR directory."
    exit 1
  fi
fi

# Connection string with SSL options if required
if [ "$SSL_MODE" == "require" ]; then
  CONNECTION_STRING="sslmode=$SSL_MODE sslrootcert=$SSL_ROOT_CERT sslcert=$SSL_CERT sslkey=$SSL_KEY host=$HOST port=$PORT dbname=$DB_NAME user=$USERNAME password=$PASSWORD"
else
  CONNECTION_STRING="host=$HOST port=$PORT dbname=$DB_NAME user=$USERNAME password=$PASSWORD"
fi

# Check if target schema exists
SCHEMA_EXISTS=$(psql "$CONNECTION_STRING" -tAc "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$TARGET_SCHEMA';")

if [ "$SCHEMA_EXISTS" == "1" ]; then
  echo "Error: Target schema '$TARGET_SCHEMA' already exists. Exiting."
  unset PGPASSWORD
  exit 1
fi

echo "Creating new target schema..."
psql "$CONNECTION_STRING" -c "CREATE SCHEMA $TARGET_SCHEMA;"

echo "Cloning schema and data..."
pg_dump "$CONNECTION_STRING" -n $SOURCE_SCHEMA | sed "s/$SOURCE_SCHEMA/$TARGET_SCHEMA/g" | psql "$CONNECTION_STRING"

# Deleting data for the specified chain ID
echo "Deleting data for chain ID: $CHAIN_ID"
psql "$CONNECTION_STRING" <<EOF
DO \$\$
BEGIN
    -- Delete from pending_round_roles
    DELETE FROM $TARGET_SCHEMA.pending_round_roles WHERE chain_id = $CHAIN_ID;

    -- Delete from round_roles
    DELETE FROM $TARGET_SCHEMA.round_roles WHERE chain_id = $CHAIN_ID;

    -- Delete from pending_project_roles
    DELETE FROM $TARGET_SCHEMA.pending_project_roles WHERE chain_id = $CHAIN_ID;

    -- Delete from project_roles
    DELETE FROM $TARGET_SCHEMA.project_roles WHERE chain_id = $CHAIN_ID;

    -- Delete from applications
    DELETE FROM $TARGET_SCHEMA.applications WHERE chain_id = $CHAIN_ID;

    -- Delete from donations
    DELETE FROM $TARGET_SCHEMA.donations WHERE chain_id = $CHAIN_ID;

    -- Delete from rounds
    DELETE FROM $TARGET_SCHEMA.rounds WHERE chain_id = $CHAIN_ID;

    -- Delete from projects
    DELETE FROM $TARGET_SCHEMA.projects WHERE chain_id = $CHAIN_ID;

    -- Update subscriptions
    UPDATE $TARGET_SCHEMA.subscriptions SET indexed_to_block = 0::bigint WHERE chain_id = $CHAIN_ID;
END
\$\$;
EOF

# Unset PGPASSWORD
unset PGPASSWORD

echo "Schema $SOURCE_SCHEMA has been successfully cloned to $TARGET_SCHEMA in database $DB_NAME"
echo "Deleted chain data for chain ID: $CHAIN_ID"
