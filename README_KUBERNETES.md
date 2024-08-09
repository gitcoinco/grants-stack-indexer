## TLDR

### Manual WebServer Deployment to DigitalOcean:

```
# build docker image
docker build -f Dockerfile.web -t gitcoinco/indexer-index:latest .

# login into docker (engineering account - 1Password)
docker login

# push the image to DockerHub
docker push gitcoinco/indexer-web:latest

# if you didn't do it before, generate a token https://cloud.digitalocean.com/account/api/tokens
# and authenticate with it in doctl
doctl auth init -t {token}

# save locally kubernetes cluster config to use kubectl
doctl kubernetes cluster kubeconfig save k8s-indexer-web

# create config map with the env file (production envs)
# to update it, delete it and create a new one with that name
kubectl create configmap indexer-web-envs --from-env-file=.env

# deploy to kubernetes cluster
kubectl apply -f ./k8s/web-deployment.yaml
```

### Force restart and pull of latest image version

```
kubectl rollout restart deployment indexer-web
```

### Getting data and logs from the cluster examples

- `kubectl get nodes`

- `kubectl get deployment indexer-web`

- `kubectl get hpa`

- `kubectl get pods`

- `kubectl get svc`

- `kubectl logs {podname}`

- `helm repo list`

- `kubectl get all -n ingress-nginx`

- `kubectl get all -n backend-web`

- `kubectl get secrets -n backend-web`

- `kubectl get crds`

- `kubectl get crds | grep cert-manager`

  - `kubectl get order -n backend-web`

  - `kubectl get certificaterequest -n backend-web`

  - `kubectl get certificate -n backend-web`

# How did we do it?

We followed this tutorials as reference:

- https://www.digitalocean.com/community/tutorials/deploying-an-express-application-on-a-kubernetes-cluster
- https://www.digitalocean.com/community/tech-talks/securing-your-kubernetes-ingress-with-lets-encrypt

## Requirements

- docker
- kubectl (https://kubernetes.io/docs/tasks/tools)
- doctl (https://docs.digitalocean.com/reference/doctl/how-to/install)
- helm (https://helm.sh/docs/intro/install)

## Building Docker image and pushing to DockerHub

This step is needed everytime we make changes in the repo

### Build docker image of Dockerfile.web

```
docker build -f Dockerfile.web -t gitcoinco/indexer-index:latest .
```

### Login into Dockerhub with Engineering account

```
docker login
```

### Push the image to DockerHub

```
docker push gitcoinco/indexer-web:latest
```

## Kubernetes Cluster Setup

### Create the cluster in DigitalOcean with `doctl`

Run:

```
doctl kubernetes cluster create k8s-indexer-web \
  --region nyc1 \
  --tag indexer-do,indexer-do-web \
  --node-pool "name=pool-indexer-web;size=s-2vcpu-4gb;count=2;auto-scale=true;min-nodes=2;max-nodes=5;tag=indexer-do;tag=indexer-do-web"
```

This commands creates a kubernetes cluster in DigitalOcean with this specs:

- name: `k8s-indexer-web`
- region: New York - 1
- tags: `indexer-do` & `indexer-do-web`
- a pool of 2 nodes initially with auto-scaling set to minimum 2 nodes and maximum 5
- each node runs in a vm machine type `s-2vcpu-4gb`
- each node with tag values `indexer-do` & `indexer-do-web`

### Save the created cluster config in your local kubectl

After the creation of the cluster has finished, run:

```
doctl kubernetes cluster kubeconfig save k8s-indexer-web
```

### Create a config map with env values (kubernetes doesn't support .env file):

- Create a config map (with .env having production values):

  ```
  kubectl create configmap indexer-web-envs --from-env-file=.env
  ```

- `indexer-web-envs` is referenced in `k8s/web-deployment.yaml` and **needed for deployment**

### Deploy web server

```
# Create namespace backend-web
kubectl create ns backend-web

# Deploy web server
kubectl apply -f ./k8s/web-deployment.yaml

# Deploy horizontal pod auto-scaling
kubectl apply -f ./k8s/web-hpa-autoscaling.yaml
```

### SSL, Ingress-nginx, LetsEncrypt

#### Install ingress-nginx

```
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx

helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx --namespace ingress-nginx --create-namespace
```

#### Apply web-ingress config

web-ingress.yml should have `annotations` and `tls` sections commented at this point

```
kubectl apply -f k8s/web-ingress.yaml
```

#### Install cert-manager

```
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.15.2/cert-manager.crds.yaml

helm repo add jetstack https://charts.jetstack.io --force-update

helm repo update jetstack

helm install cert-manager jetstack/cert-manager --version v1.15.2 -f ./k8s/cert-manager-values.yaml --namespace cert-manager --create-namespace
```

#### Apply cert-issuer config

```
kubectl apply -f ./k8s/cert-issuer.yaml
```

#### Uncomment annotations and tls sections in web-ingress config and apply the changes

```
kubectl apply -f ./k8s/web-ingress.yaml
```

#### Wait until the certificate has been emited (READY = True)

```
✗ kubectl get certificate -n backend-web

NAME                READY   SECRET              AGE
letsencrypt-nginx   True    letsencrypt-nginx   80m
```

#### Upgrade ingress-nginx with nginx-values config file

```
helm upgrade ingress-nginx ingress-nginx/ingress-nginx -f ./k8s/nginx-values.yaml -n ingress-nginx
```
