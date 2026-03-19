// ============================================================================
// Job Application Tracking Portal — Infrastructure
// ============================================================================
// Provisions all Azure resources for the Job Application Tracking Portal.
// See CLAUDE.md for full architecture and design decisions.
//
// Resources:
//   - Cosmos DB (free tier) + database + container
//   - Storage Account (LRS) + blob containers + CORS + lifecycle policy
//   - Log Analytics Workspace + Application Insights
//   - Azure Functions (Consumption plan, Linux, Node.js 20)
//   - Azure Static Web Apps (free tier)
//   - Event Grid system topic + subscription (conditional)
// ============================================================================

// ============================================================================
// Parameters
// ============================================================================

@description('Project name used as prefix for all resources')
@minLength(3)
@maxLength(12)
param projectName string

@description('Primary location for all resources')
param location string = resourceGroup().location

@description('Location for Azure Static Web Apps (limited region availability)')
param staticWebAppLocation string

@description('Enable Cosmos DB free tier (only one free tier account allowed per Azure subscription)')
param cosmosFreeTier bool = true

@description('Deploy Event Grid subscription — set to true after processUpload function is deployed')
param deployEventGridSubscription bool = false

// ============================================================================
// Variables
// ============================================================================

var uniqueSuffix = take(uniqueString(resourceGroup().id), 6)

// Resource names
var cosmosAccountName = 'cosmos-${projectName}'
var cosmosDatabaseName = 'jobtracker'
var cosmosContainerName = 'applications'
var storageAccountName = toLower(replace('st${projectName}${uniqueSuffix}', '-', ''))
var functionAppName = 'func-${projectName}'
var appServicePlanName = 'plan-${projectName}'
var appInsightsName = 'appi-${projectName}'
var logAnalyticsName = 'log-${projectName}'
var staticWebAppName = 'swa-${projectName}'
var eventGridTopicName = 'evgt-${projectName}'

// Blob containers: 3 upload + 1 dead-letter
var allContainers = ['resumes', 'coverletters', 'jobdescriptions', 'deadletter']

var tags = {
  project: projectName
}

// ============================================================================
// Cosmos DB
// ============================================================================

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2023-11-15' = {
  name: cosmosAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: cosmosFreeTier
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-11-15' = {
  parent: cosmosAccount
  name: cosmosDatabaseName
  properties: {
    resource: {
      id: cosmosDatabaseName
    }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-11-15' = {
  parent: cosmosDatabase
  name: cosmosContainerName
  properties: {
    resource: {
      id: cosmosContainerName
      partitionKey: {
        paths: ['/id']
        kind: 'Hash'
      }
    }
    options: {
      throughput: 400
    }
  }
}

// ============================================================================
// Storage Account
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: [
            'https://${staticWebApp.properties.defaultHostname}'
          ]
          allowedMethods: ['PUT', 'GET', 'HEAD']
          allowedHeaders: ['*']
          exposedHeaders: ['Content-Type', 'x-ms-blob-type']
          maxAgeInSeconds: 3600
        }
      ]
    }
  }
}

@batchSize(1)
resource blobContainers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = [
  for containerName in allContainers: {
    parent: blobService
    name: containerName
    properties: {
      publicAccess: 'None'
    }
  }
]

// Lifecycle policy: delete blobs not modified in 90 days (safety net for orphaned uploads)
resource lifecyclePolicy 'Microsoft.Storage/storageAccounts/managementPolicies@2023-01-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'delete-old-blobs'
          enabled: true
          type: 'Lifecycle'
          definition: {
            actions: {
              baseBlob: {
                delete: {
                  daysAfterModificationGreaterThan: 90
                }
              }
            }
            filters: {
              blobTypes: ['blockBlob']
              prefixMatch: [
                'resumes/'
                'coverletters/'
                'jobdescriptions/'
                'deadletter/'
              ]
            }
          }
        }
      ]
    }
  }
}

// ============================================================================
// Log Analytics + Application Insights
// ============================================================================

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
  }
}

// ============================================================================
// Azure Functions (Consumption Plan — Linux, Node.js 20)
// ============================================================================

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    name: 'Y1'
    tier: 'Dynamic'
  }
  properties: {
    reserved: true // Required for Linux
  }
}

resource functionApp 'Microsoft.Web/sites@2023-01-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      appSettings: [
        // Functions runtime
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: functionAppName
        }
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        // Monitoring
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        // Cosmos DB
        {
          name: 'COSMOS_ENDPOINT'
          value: cosmosAccount.properties.documentEndpoint
        }
        {
          name: 'COSMOS_KEY'
          value: cosmosAccount.listKeys().primaryMasterKey
        }
        {
          name: 'COSMOS_DATABASE_NAME'
          value: cosmosDatabaseName
        }
        {
          name: 'COSMOS_CONTAINER_NAME'
          value: cosmosContainerName
        }
        // Storage (for SAS token generation and blob operations)
        {
          name: 'STORAGE_ACCOUNT_NAME'
          value: storageAccount.name
        }
        {
          name: 'STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
      ]
    }
  }
}

// ============================================================================
// Azure Static Web Apps (Free Tier)
// ============================================================================

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: staticWebAppLocation
  tags: tags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {}
}

// Link Function App as SWA API backend
resource swaLinkedBackend 'Microsoft.Web/staticSites/linkedBackends@2023-01-01' = {
  parent: staticWebApp
  name: 'backend'
  properties: {
    backendResourceId: functionApp.id
    region: location
  }
}

// ============================================================================
// Event Grid
// ============================================================================

// System topic from Blob Storage — emits BlobCreated events
resource eventGridSystemTopic 'Microsoft.EventGrid/systemTopics@2022-06-15' = {
  name: eventGridTopicName
  location: location
  tags: tags
  properties: {
    source: storageAccount.id
    topicType: 'Microsoft.Storage.StorageAccounts'
  }
}

// Subscription triggers processUpload function on BlobCreated events
// Conditionally deployed — requires processUpload function to exist first
resource eventGridSubscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2022-06-15' = if (deployEventGridSubscription) {
  parent: eventGridSystemTopic
  name: 'process-upload'
  properties: {
    destination: {
      endpointType: 'AzureFunction'
      properties: {
        resourceId: '${functionApp.id}/functions/processUpload'
        maxEventsPerBatch: 1
        preferredBatchSizeInKilobytes: 64
      }
    }
    filter: {
      includedEventTypes: [
        'Microsoft.Storage.BlobCreated'
      ]
      advancedFilters: [
        {
          operatorType: 'StringBeginsWith'
          key: 'subject'
          values: [
            '/blobServices/default/containers/resumes/'
            '/blobServices/default/containers/coverletters/'
            '/blobServices/default/containers/jobdescriptions/'
          ]
        }
      ]
    }
    deadLetterDestination: {
      endpointType: 'StorageBlob'
      properties: {
        resourceId: storageAccount.id
        blobContainerName: 'deadletter'
      }
    }
    retryPolicy: {
      maxDeliveryAttempts: 30
      eventTimeToLiveInMinutes: 1440 // 24 hours
    }
  }
}

// ============================================================================
// Outputs
// ============================================================================

@description('Azure Static Web Apps default hostname')
output swaHostname string = staticWebApp.properties.defaultHostname

@description('Function App name')
output functionAppName string = functionApp.name

@description('Cosmos DB endpoint')
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint

@description('Storage account name')
output storageAccountName string = storageAccount.name

@description('Event Grid system topic name')
output eventGridTopicName string = eventGridSystemTopic.name
