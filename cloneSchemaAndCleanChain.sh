#!/bin/bash

# ======================================== SUMMARY =================================================
# This script clones a PostgreSQL schema (SOURCE_SCHEMA) into a new schema (TARGET_SCHEMA)
# and deletes data associated with a specified chain ID (CHAIN_ID) from the target schema.
# It handles database connection details and error management.
# =================================================================================================

# ======================================== CONFIG =================================================

# Set the DATABASE_URL
DATABASE_URL="postgres://postgres:postgres@localhost:5432/grants_stack_indexer"

# =================================================================================================

# Extract components from DATABASE_URL using sed
USERNAME=$(echo $DATABASE_URL | sed -n 's#.*//\([^:]*\):.*#\1#p')
PASSWORD=$(echo $DATABASE_URL | sed -n 's#.*//[^:]*:\([^@]*\)@.*#\1#p')
HOST=$(echo $DATABASE_URL | sed -n 's#.*@\(.*\):[0-9]*/.*#\1#p')
PORT=$(echo $DATABASE_URL | sed -n 's#.*:\([0-9]*\)/.*#\1#p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's#.*/\([^/]*\)$#\1#p')

# Set PGPASSWORD environment variable for non-interactive password authentication
export PGPASSWORD=$PASSWORD

# Function to handle errors
handle_error() {
  echo "Error occurred. Exiting."
  unset PGPASSWORD
  exit 1
}

# Trap errors and call handle_error function
trap 'handle_error' ERR

# User inputs
read -p "Enter source schema number (e.g., 83): " SOURCE_NUM
read -p "Enter target schema number (e.g., 84): " TARGET_NUM
read -p "Enter chain ID to delete data for: " CHAIN_ID

# Construct schema names
SOURCE_SCHEMA="chain_data_$SOURCE_NUM"
TARGET_SCHEMA="chain_data_$TARGET_NUM"

# Confirmation prompt
echo "You are about to clone schema '$SOURCE_SCHEMA' to '$TARGET_SCHEMA' and delete data for chain ID: $CHAIN_ID."
read -p "Do you want to continue? (y/n): " -n 1 -r
echo    # Move to a new line
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operation cancelled."
    unset PGPASSWORD
    exit 0
fi

echo "Dropping target schema if it exists..."
psql -U $USERNAME -h $HOST -p $PORT -d $DB_NAME -c "DROP SCHEMA IF EXISTS $TARGET_SCHEMA CASCADE;"

echo "Creating new target schema..."
psql -U $USERNAME -h $HOST -p $PORT -d $DB_NAME -c "CREATE SCHEMA $TARGET_SCHEMA;" 

echo "Cloning schema and data..."
pg_dump -U $USERNAME -h $HOST -p $PORT -d $DB_NAME -n $SOURCE_SCHEMA --no-owner --no-privileges | sed "s/$SOURCE_SCHEMA/$TARGET_SCHEMA/g" | psql -U $USERNAME -h $HOST -p $PORT -d $DB_NAME

# Deleting data for the specified chain ID
echo "Deleting data for chain ID: $CHAIN_ID"
psql -U $USERNAME -h $HOST -p $PORT -d $DB_NAME <<EOF
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
END
\$\$;
EOF

# Unset PGPASSWORD
unset PGPASSWO

echo "Schema $SOURCE_SCHEMA has been successfully cloned to $TARGET_SCHEMA in database $DB_NAME"
echo "Deleted chain data for chain ID: $CHAIN_ID"