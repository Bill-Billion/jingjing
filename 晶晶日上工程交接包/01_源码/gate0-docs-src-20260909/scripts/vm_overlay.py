import json
import websocket

ws = websocket.create_connection("ws://127.0.0.1:32947/uruwExujANo=/ws", timeout=10)

def call(method, params=None, _i=[0]):
    _i[0] += 1
    ws.send(json.dumps({"jsonrpc": "2.0", "id": str(_i[0]), "method": method, "params": params or {}}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == str(_i[0]):
            return r

vm = call("getVM")
iso = vm["result"]["isolates"][0]["id"]
print("isolate:", iso)
r = call("ext.flutter.showPerformanceOverlay", {"isolateId": iso, "enabled": "true"})
print("overlay:", r)
ws.close()
