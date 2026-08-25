# Data-science image for the agentcore code interpreter (S3).
#
# The sandbox runs with --network none, so libraries can't be pip-installed at
# runtime — they must be baked here. Build this image and point the runner at it:
#
#   docker build -t ahura-agent-sandbox:latest -f sandbox.Dockerfile .
#   # then on the agent-runner:
#   SANDBOX_IMAGE=ahura-agent-sandbox:latest
#
# Default remains python:3.12-slim (stdlib only) so a plain deploy still works;
# set SANDBOX_IMAGE to this image to enable data wrangling / plotting.
#
# Runtime hardening (--user 65534, --read-only, --cap-drop ALL, memory/pids caps)
# is applied by the pool at `docker run`; nothing to configure here.
FROM python:3.12-slim

# Common general-purpose data libraries. Pinned loosely; pin exactly for prod.
RUN pip install --no-cache-dir \
      numpy \
      pandas \
      scipy \
      matplotlib \
      python-dateutil \
      openpyxl \
      tabulate \
  && python -c "import numpy, pandas, scipy, matplotlib; print('sandbox libs OK')"

# matplotlib in a headless container: default to the Agg backend (no display).
ENV MPLBACKEND=Agg
