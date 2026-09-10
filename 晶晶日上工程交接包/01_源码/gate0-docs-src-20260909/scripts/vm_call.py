import json, sys, argparse, websocket

def call(ws, method, params=None):
    import json
    i = [0]
    i[0] += 1
    ws.send(json.dumps({"jsonrpc": "2.0", "id": str(i[0]), "method": method, "params": params or {}}))
    while True:
        r = json.loads(ws.recv())
        if r.get("id") == str(i[0]):
            return r

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ws", required=True, help="ws://127.0.0.1:PORT/TOKEN=/ws")
    ap.add_argument("--method", required=True)
    ap.add_argument("--params", default="{}", help="json string of params")
    ap.add_argument("--isolate", default="", help="isolateId; if empty auto-fetch first isolate")
    args = ap.parse_args()
    ws = websocket.create_connection(args.ws, timeout=15)
    if args.isolate:
        iso = args.isolate
    else:
        vm = call(ws, "getVM")
        iso = vm["result"]["isolates"][0]["id"]
    params = json.loads(args.params)
    params["isolateId"] = iso
    r = call(ws, args.method, params)
    print(json.dumps(r, ensure_ascii=False))
    ws.close()

if __name__ == "__main__":
    main()
