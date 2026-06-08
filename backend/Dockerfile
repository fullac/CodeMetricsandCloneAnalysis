FROM node:20-bookworm-slim

ARG SONAR_SCANNER_VERSION=6.2.1.4610
ARG TARGETARCH
ENV SONAR_SCANNER_HOME=/opt/sonar-scanner
ENV PATH="${SONAR_SCANNER_HOME}/bin:${PATH}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl unzip openjdk-17-jre-headless ca-certificates \
  && case "${TARGETARCH}" in \
      "amd64") SCANNER_ARCH="x64" ;; \
      "arm64") SCANNER_ARCH="aarch64" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" && exit 1 ;; \
    esac \
  && rm -rf /var/lib/apt/lists/* \
  && curl -fsSL "https://binaries.sonarsource.com/Distribution/sonar-scanner-cli/sonar-scanner-cli-${SONAR_SCANNER_VERSION}-linux-${SCANNER_ARCH}.zip" -o /tmp/sonar-scanner.zip \
  && unzip /tmp/sonar-scanner.zip -d /opt \
  && mv "/opt/sonar-scanner-${SONAR_SCANNER_VERSION}-linux-${SCANNER_ARCH}" "${SONAR_SCANNER_HOME}" \
  && rm -f /tmp/sonar-scanner.zip

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
