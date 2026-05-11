FROM jenkins/jenkins:2.528.2-lts-jdk21

USER jenkins
COPY plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt

# Auto-configure linode-kube cloud + common-agent pod template on first boot
COPY init.d/ /usr/share/jenkins/ref/init.groovy.d/
