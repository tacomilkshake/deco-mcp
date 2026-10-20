#!/usr/bin/env bash
set -euo pipefail
docker run --rm -i --network none -e DECO_HOST=http://127.0.0.1:9 -e DECO_PASSWORD=ci-fixture --entrypoint python "$1" - <<'PYTEST'
import server,json
from unittest.mock import Mock
client=Mock()
client.request.return_value={'client_list':[{'name':'VGVzdA==','mac':'00:00:00:00:00:01','online':True}]}
server.get_client=lambda:client
rows=json.loads(server.clients_list())
assert rows[0]['name']=='Test' and rows[0]['online'] is True
client.logout.assert_called_once()
client.reset_mock()
client.request.side_effect=RuntimeError('controller unavailable')
try: server.clients_list()
except RuntimeError: pass
else: raise AssertionError('controller failure was hidden')
client.logout.assert_called_once()
PYTEST
