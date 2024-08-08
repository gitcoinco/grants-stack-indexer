We followed this tutorial: https://www.digitalocean.com/community/tutorials/deploying-an-express-application-on-a-kubernetes-cluster

- To build the docker images:

  ```
  docker build -f Dockerfile.index -t indexer/index .
  docker build -f Dockerfile.web -t indexer/web .
  ```

- To push the images to docker hub:

  ```
  docker tag indexer/index:latest gitcoinco/indexer-index:latest
  docker push gitcoinco/indexer-index:latest

  docker tag indexer/web:latest gitcoinco/indexer-web:latest
  docker push gitcoinco/indexer-web:latest
  ```

### SOLUTION FOR ENVIRONMENT VARIABLES (kubernetes doesn't support .env file):

- Created a config map:

  ```
  kubectl create configmap indexer-web-config --from-env-file=.env
  ```

- Reference the config map in kb-deployment.yml with:

  ```
  envFrom:
    - configMapRef:
        name: indexer-web-config
  ```

- NOT DONE - For sensitive data we could have creaded a secret with:

  ```
  kubectl create secret generic indexer-web-secrets --from-env-file=.env
  ```

- NOT DONE - And referenced the secret in kb-deployment.yml with:

  ```
  envFrom:
    - secretRef:
        name: indexer-web-secrets
  ```

### Logs

Get the current instances of server:

```
kubectl get pods
```

Possible response:

```
NAME                                      READY   STATUS    RESTARTS   AGE
indexer-web-554574455d-lg98l   1/1        Running              0          41m
indexer-web-554574455d-t4tgj   1/1        Running               0          41m
```

Then to see the logs of the first instance:

```
kubectl logs indexer-web-554574455d-lg98l
```
