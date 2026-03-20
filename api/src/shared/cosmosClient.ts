// ============================================================================
// Cosmos DB Singleton Client
// ============================================================================
// Reuse a single CosmosClient instance across all function invocations.
// See CLAUDE.md: "Cosmos DB client as singleton in api/shared/cosmosClient.ts"

import { CosmosClient, Container, Database } from '@azure/cosmos';

let client: CosmosClient | null = null;
let container: Container | null = null;
let database: Database | null = null;

function getClient(): CosmosClient {
  if (!client) {
    const endpoint = process.env.COSMOS_ENDPOINT;
    const key = process.env.COSMOS_KEY;
    if (!endpoint || !key) {
      throw new Error('COSMOS_ENDPOINT and COSMOS_KEY environment variables are required');
    }
    client = new CosmosClient({ endpoint, key });
  }
  return client;
}

export function getDatabase(): Database {
  if (!database) {
    const dbName = process.env.COSMOS_DATABASE_NAME;
    if (!dbName) {
      throw new Error('COSMOS_DATABASE_NAME environment variable is required');
    }
    database = getClient().database(dbName);
  }
  return database;
}

export function getContainer(): Container {
  if (!container) {
    const containerName = process.env.COSMOS_CONTAINER_NAME;
    if (!containerName) {
      throw new Error('COSMOS_CONTAINER_NAME environment variable is required');
    }
    container = getDatabase().container(containerName);
  }
  return container;
}
