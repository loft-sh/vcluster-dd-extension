FROM --platform=$BUILDPLATFORM node:18.3.0-alpine3.16 AS client-builder

WORKDIR /ui

# cache packages in layer
COPY ui/package.json /ui/package.json
COPY ui/package-lock.json /ui/package-lock.json

RUN --mount=type=cache,target=/usr/src/app/.npm \
    npm set cache /usr/src/app/.npm && \
    npm ci

# install
COPY ui /ui
RUN npm run build

FROM alpine
LABEL org.opencontainers.image.title="vcluster" \
    org.opencontainers.image.description="Manage your vclusters running on docker-desktop." \
    org.opencontainers.image.vendor="Loft Inc." \
    org.opencontainers.image.licenses="Apache-2.0" \
    com.docker.desktop.extension.icon="https://i.ibb.co/mXhVjv8/vcluster.png" \
    com.docker.desktop.extension.api.version=">= 0.2.3" \
    com.docker.extension.screenshots="[{\"alt\": \"vcluster\", \"url\": \"https://raw.githubusercontent.com/loft-sh/vcluster-dd-extension/master/media/vcluster-screenshot.png?token=GHSAT0AAAAAABQI4KZCJEFROWWQJ3SYW3U6YWETFVA\"},{\"alt\": \"vcluster\", \"url\": \"https://www.vcluster.com/docs/media/diagrams/vcluster-architecture.svg\"}]" \
    com.docker.extension.detailed-description="Create fully functional virtual Kubernetes clusters - Each vcluster runs inside a namespace of the underlying k8s cluster. It's cheaper than creating separate full-blown clusters and it offers better multi-tenancy and isolation than regular namespaces.<br /><h1>Why Virtual Kubernetes Clusters?</h1><br />- <b>Cluster Scoped Resources</b>: much more powerful than simple namespaces (virtual clusters allow users to use CRDs, namespaces, cluster roles etc.)<br />- <b>Ease of Use</b>: usable in any Kubernetes cluster and created in seconds either via a single command or <a href=\"https://github.com/loft-sh/cluster-api-provider-vcluster\">cluster-api</a><br />- <b>Cost Efficient</b>: much cheaper and efficient than "real" clusters (single pod and shared resources just like for namespaces)<br />- <b>Lightweight</b>: built upon the ultra-fast k3s distribution with minimal overhead per virtual cluster (other distributions work as well)<br />- <b>Strict isolation</b>: complete separate Kubernetes control plane and access point for each vcluster while still being able to share certain services of the underlying host cluster<br />- <b>Cluster Wide Permissions</b>: allow users to install apps which require cluster-wide permissions while being limited to actually just one namespace within the host cluster<br />- <b>Great for Testing</b>: allow you to test different Kubernetes versions inside a single host cluster which may have a different version than the virtual clusters<br /><br />Learn more on <a href=\"https://vcluster.com\">www.vcluster.com</a>." \
    com.docker.extension.publisher-url="https://www.vcluster.com" \
    com.docker.extension.additional-urls="[{\"title\":\"vcluster\",\"url\":\"https:\/\/vcluster.com\"},{\"title\":\"vcluster Documentation\",\"url\":\"https:\/\/vcluster.com/docs\"},{\"title\":\"Loft Inc.\",\"url\":\"https:\/\/loft.sh\"}]" \
    com.docker.extension.changelog="<li>Create/Delete/Upgrade vcluster</li><li>Pause/Resume vcluster</li><li>Connect/Disconnect vcluster</li>"

RUN apk add curl
RUN curl -LO https://storage.googleapis.com/kubernetes-release/release/$(curl -s https://storage.googleapis.com/kubernetes-release/release/stable.txt)/bin/linux/amd64/kubectl \
    && chmod +x ./kubectl && mv ./kubectl /usr/local/bin/kubectl \
    && curl -L -o vcluster "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-linux-amd64" \
    && chmod +x vcluster && mv vcluster /usr/local/bin \
    && mkdir /linux \
    && cp /usr/local/bin/kubectl /linux/ \
    && cp /usr/local/bin/vcluster /linux/

RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/darwin/amd64/kubectl" \
    && curl -L -o vcluster "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-darwin-amd64" \
    && mkdir /darwin \
    && chmod +x ./kubectl && mv ./kubectl /darwin/ \
    && chmod +x ./vcluster && mv ./vcluster /darwin/

RUN curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/windows/amd64/kubectl.exe" \
    && curl -L -o vcluster.exe "https://github.com/loft-sh/vcluster/releases/latest/download/vcluster-windows-amd64.exe" \
    && mkdir /windows \
    && chmod +x ./kubectl.exe && mv ./kubectl.exe /windows/ \
    && chmod +x ./vcluster.exe && mv ./vcluster.exe /windows/

COPY metadata.json .
COPY vcluster.svg .
COPY --from=client-builder /ui/build ui
