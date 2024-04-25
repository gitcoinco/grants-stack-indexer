The application is deployed as **indexer-v2** on Fly under the [Gitcoin organization](https://fly.io/dashboard/gtc). If you do not have access to this dashboard, please request permission.

# Fly CLI Installation

Before deploying or managing the application, ensure you have the Fly CLI installed. Follow these steps to install the Fly CLI:

1. Download the Fly CLI from [Fly's official documentation](https://fly.io/docs/getting-started/installing-flyctl/).
2. Install the CLI following the instructions for your operating system.
3. Once installed, run `flyctl auth login` to authenticate with your Fly account.

# Fly CLI Usage

⚠️ Always run Fly commands with an explicit config option, for example:

```
fly -c fly.production.toml status
```

# Components and Architecture

The [application](../fly.production.toml) contains two main components organized into separate process groups:

- **web**: Handles client requests and must scale horizontally to manage varying loads effectively.
- **indexer**: Responsible for updating and maintaining the database. Only one active instance runs due to its role as the sole writer to prevent data conflicts.

Run `fly -c fly.production.toml status` too see an overview of the deployment.

# Deployment Process

Check the [Github Workflow](../.github/workflows/deploy-branch.yml) to understand how the deployment works.

### General Recommendation

- Always deploy through the GitHub workflow to ensure all changes are tracked and reversible.
- Avoid deploying directly from the CLI as it will deploy your working directory and changes might be deployed accidentally.

### Deployment Checks

- Use `fly status` to check the status of the instances.
- Although two Indexer instances are running, only one actively indexes due to a locking mechanism.

## Lock Mechanism and High Availability

- A write lock ensures that while multiple indexer instances may be present for failover readiness, only one actively indexes at any time.
- This is especially crucial during updates:
  - If updating from v50 to v51, two v50 instances may run; one indexes while the other remains idle.
  - Deploying v51 will stop an instance of v50 and start v51, maintaining continuous indexing and high availability.

# Operational Tasks

## Logs

Logs are shipped to [Datadog](https://app.datadoghq.eu/logs).

You can also check the latest logs with the [Fly logs](https://fly.io/docs/flyctl/logs/) command.

## Scaling

### Fly Web Auto-Scaling

There are a couple of web instances provisioned, the stopped ones are on stand-by. Fly automatically starts and stops machines based on load.

### Horizontal Scaling

Use the `scale` command to scale up and down the number of machines:


```
flyctl -c fly.production.toml scale web=5
```

### Vertical Scaling

Show the current CPU and RAM configuration of the machines:

```
flyctl -c fly.production.toml scale show
```

Check the available VM size presets:

```
flyctl platform vm-sizes
```

Change the VM size:


```
flyctl -c fly.production.toml scale vm performance-1x
```

Change memory:

```
flyctl -c fly.production.toml scale memory 2048
```


# Monitoring Performance

Fly hosts a Grafana dashboard [here](https://fly-metrics.net/d/fly-app/fly-app?orgId=179263&var-app=indexer-v2) with LB and instance level metrics.
