// Runs on every Jenkins startup via init.groovy.d
// Idempotent — skips if linode-kube cloud already exists in config
import jenkins.model.*
import org.csanchez.jenkins.plugins.kubernetes.*
import org.csanchez.jenkins.plugins.kubernetes.pod.yaml.Merge
import org.csanchez.jenkins.plugins.kubernetes.pod.retention.Never as NeverRetain

def jenkins = Jenkins.get()

if (jenkins.clouds.getByName('linode-kube') != null) {
    println "[init] linode-kube cloud already configured, skipping."
    return
}

// ── Pod template ──────────────────────────────────────────────────────────────
def podTemplate = new PodTemplate()
podTemplate.setName('common-agent')
podTemplate.setLabel('common-agent')
podTemplate.setNamespace('default')
podTemplate.setSlaveConnectTimeout(1000)
podTemplate.setPodRetention(new NeverRetain())
podTemplate.setNodeSelector('')
podTemplate.setAgentContainer('jnlp')
podTemplate.setAgentInjection(true)

// Containers — resource limits live in the raw YAML below
def gitC = new ContainerTemplate('git', 'alpine/git:latest')
gitC.setCommand('cat'); gitC.setTtyEnabled(true); gitC.setWorkingDir('/home/jenkins/agent')

def kanikoC = new ContainerTemplate('kaniko', 'gcr.io/kaniko-project/executor:v1.24.0-debug')
kanikoC.setCommand('/busybox/cat'); kanikoC.setTtyEnabled(true); kanikoC.setWorkingDir('/home/jenkins/agent')

def kubectlC = new ContainerTemplate('kubectl', 'alpine/k8s:1.28.0')
kubectlC.setCommand('cat'); kubectlC.setTtyEnabled(true); kubectlC.setWorkingDir('/home/jenkins/agent')

def trivyC = new ContainerTemplate('trivy', 'aquasec/trivy:0.48.0')
trivyC.setCommand('cat'); trivyC.setTtyEnabled(true); trivyC.setWorkingDir('/home/jenkins/agent')

podTemplate.setContainers([gitC, kanikoC, kubectlC, trivyC])

podTemplate.setYaml('''\
spec:
  dnsPolicy: ClusterFirst
  dnsConfig:
    nameservers:
      - 8.8.8.8
      - 8.8.4.4
  containers:
    - name: git
      resources:
        requests:
          memory: "256Mi"
          cpu: "100m"
        limits:
          memory: "1Gi"
          cpu: "500m"
    - name: kaniko
      resources:
        requests:
          memory: "4Gi"      # Increased for Next.js builds
          cpu: "500m"
        limits:
          memory: "6Gi"
          cpu: "1"
    - name: kubectl
      resources:
        requests:
          memory: "128Mi"
          cpu: "100m"
        limits:
          memory: "256Mi"
          cpu: "500m"
    - name: trivy
      resources:
        requests:
          memory: "256Mi"
          cpu: "100m"
        limits:
          memory: "1Gi"
          cpu: "500m"
''')
podTemplate.setYamlMergeStrategy(new Merge())

// ── Cloud ─────────────────────────────────────────────────────────────────────
def cloud = new KubernetesCloud('linode-kube')
cloud.setServerUrl('https://139.59.1.6:6443')
cloud.setSkipTlsVerify(true)
cloud.setNamespace('default')
cloud.setWebSocket(true)
cloud.setJenkinsUrl('http://170.187.238.34:8080')
cloud.setCredentialsId('kubeconfig_file')
cloud.setContainerCap(10)
cloud.setRetentionTimeout(5)
cloud.setConnectTimeout(5)
cloud.setReadTimeout(15)
cloud.setWaitForPodSec(600)
try {
    def gcClass = Class.forName('org.csanchez.jenkins.plugins.kubernetes.GarbageCollection')
    def gc = gcClass.getDeclaredConstructor().newInstance()
    gc.setTimeout(300)
    cloud.setGarbageCollection(gc)
} catch (Exception e) {
    println "[init] Warning: could not set garbage collection: ${e.message}"
}
cloud.setPodRetention(new NeverRetain())
try {
    def f = cloud.getClass().getDeclaredField('podLabels')
    f.setAccessible(true)
    def list = f.get(cloud)
    list.add(new PodLabel('jenkins', 'slave'))
    list.add(new PodLabel('label',   'k8s-agent'))
} catch (Exception e) {
    println "[init] Warning: could not set cloud pod labels via reflection: ${e.message}"
}
cloud.addTemplate(podTemplate)

jenkins.clouds.add(cloud)
jenkins.save()

println "[init] linode-kube cloud + common-agent pod template configured automatically."
