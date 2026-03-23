# Jenkins Cloud Settings (linode-kube)

Source: production Jenkins config snapshot on 2026-03-23.

## Cloud
- Name: `linode-kube`
- Type: `KubernetesCloud`
- Server URL: `https://139.59.1.6:6443`
- Namespace: `default`
- Credentials ID: `kubeconfig_file`
- Skip TLS Verify: `true`
- WebSocket: `true`
- Jenkins URL: `http://170.187.238.34:8080`
- Container Cap: `10`
- Retention Timeout (min): `5`
- Connect Timeout (sec): `5`
- Read Timeout (sec): `15`
- Wait for Pod (sec): `600`
- Pod retention: `Never`

## Pod Template
- Name: `common-agent`
- Label: `common-agent`
- Namespace: `default`
- Agent container: `jnlp`
- Agent injection: `true`
- Pod retention: `Never`
- Timeout for Jenkins connection (sec): `1000`
- YAML merge strategy: `Merge`

## Pod Labels
- `jenkins=slave`
- `label=k8s-agent`
