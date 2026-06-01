# Required Jenkins Credentials

These IDs are hard-coded in pipeline generators and must exist in Jenkins.

## 1) `dockerhublogin`
- Kind: Username with password
- Purpose: Push container images to Docker Hub from BuildKit stage

## 2) `kubeconfig_file`
- Kind: Secret file
- Purpose: `KUBECONFIG` for Kubernetes deployment and rollout checks

## Optional but recommended
- Git provider tokens (GitHub/GitLab/Bitbucket) if private repos are deployed
- Notification/webhook credentials if you enforce authenticated callback endpoints
