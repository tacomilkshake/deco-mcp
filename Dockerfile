FROM docker.io/library/python:3.15-slim-trixie@sha256:2da676046630d7bf14c6764ae1143dc7fa0377a53f94bf5a642f0b214aca5bce

RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --require-hashes -r requirements.txt

COPY server.py ./

RUN addgroup --gid 1001 deco && \
    adduser --disabled-password --uid 1001 --gid 1001 deco
USER deco

EXPOSE 8086

CMD ["python", "server.py"]
