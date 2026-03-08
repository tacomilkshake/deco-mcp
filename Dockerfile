FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./

RUN addgroup --gid 1001 deco && \
    adduser --disabled-password --uid 1001 --gid 1001 deco
USER deco

EXPOSE 8086

CMD ["python", "server.py"]
