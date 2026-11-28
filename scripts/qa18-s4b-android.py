"""Operate the installed S4-B APK through Android accessibility and ADB."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

PACKAGE = "com.jingjingshangri.jingjingshangri_app.pm03joint"
DUMP = "/sdcard/jx-s4b-window.xml"


def adb(*args, timeout=15):
    return subprocess.check_output([str(ADB), "-s", SERIAL, *args], timeout=timeout)


def controls():
    result = adb("shell", "uiautomator", "dump", "--compressed", DUMP, timeout=20)
    if b"dumped to" not in result:
        raise RuntimeError("Android did not produce a fresh accessibility dump")
    nodes = ET.fromstring(adb("exec-out", "cat", DUMP))
    return [node.attrib for node in nodes.iter("node")]


def label(node):
    return " / ".join(filter(None, (node.get("text"), node.get("content-desc"))))


def match_control(nodes, text, mode="exact"):
    for node in nodes:
        names = (node.get("text", ""), node.get("content-desc", ""))
        matches = text in names if mode == "exact" else any(text in name for name in names)
        if matches:
            return node
    return None


def hit(node, left_edge=False):
    left, top, right, bottom = map(int, re.findall(r"\d+", node["bounds"]))
    if left == right or top == bottom:
        raise ValueError("Empty Android control bounds")
    x = left + min(48, (right - left) // 2) if left_edge else (left + right) // 2
    adb("shell", "input", "tap", str(x), str((top + bottom) // 2))


def find(text, mode="exact", timeout=14):
    until = time.monotonic() + timeout
    visible = []
    while time.monotonic() < until:
        try:
            nodes = controls()
        except RuntimeError:
            continue
        visible = [label(node) for node in nodes if label(node)]
        node = match_control(nodes, text, mode)
        if node:
            return node
        time.sleep(0.4)
    safe = re.sub(r"(?<!\d)\d{6,11}(?!\d)", "[NUMBER]", " | ".join(visible))
    raise RuntimeError(f"Missing visible control {text!r}. Current labels {safe}")


def enter(value):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", value):
        raise ValueError("Only an ASCII synthetic fixture value is allowed")
    adb("shell", "input", "text", value)


def screenshot(name):
    (OUT / name).write_bytes(adb("exec-out", "screencap", "-p"))


def phone_for(role):
    return json.loads((BATCH / "access.json").read_text(encoding="utf-8"))["accounts"][role]["phone"]


def latest_otp(role, begin):
    phone = phone_for(role)
    until = time.monotonic() + 12
    while time.monotonic() < until:
        for file in (BATCH / "sms").glob("*.json"):
            if file.stat().st_mtime < begin:
                continue
            try:
                item = json.loads(file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            if item.get("synthetic_only") and item.get("phone") == phone and re.fullmatch(r"\d{6}", item.get("code", "")):
                return item["code"]
        time.sleep(0.25)
    raise RuntimeError("No new local SMS receipt for this synthetic role")


def edit_fields(nodes):
    return [node for node in nodes if node["class"] == "android.widget.EditText"]


def login(role):
    find("登录晶晶日上")
    nodes = controls()
    fields = edit_fields(nodes)
    send = match_control(nodes, "获取验证码")
    agreement = match_control(nodes, "同意用户协议与隐私政策", "contains")
    submit = match_control(nodes, "登录并继续")
    assert len(fields) == 2
    assert send and agreement and submit
    hit(fields[0])
    enter(phone_for(role))
    adb("shell", "input", "keyevent", "4")
    begin = time.time()
    hit(send)
    otp = latest_otp(role, begin)
    hit(fields[1])
    enter(otp)
    adb("shell", "input", "keyevent", "4")
    if agreement.get("checked") != "true":
        hit(agreement,left_edge=True)
    hit(submit)
    find("全部作品")


def fill_feedback():
    find("意见反馈")
    fields = edit_fields(controls())
    assert len(fields) == 2
    for node, value in zip(fields, ("S4B-Android-Smoke", "S4B-Synthetic-attachment-and-support")):
        hit(node)
        enter(value)
        adb("shell", "input", "keyevent", "4")


def swipe(direction="down"):
    coordinates = ("1790", "540", "720", "400") if direction == "down" else ("720", "540", "1790", "400")
    adb("shell", "input", "swipe", "540", *coordinates)
    time.sleep(0.4)


def scroll_find(text, mode="exact", attempts=5, direction="down"):
    for _ in range(attempts):
        target = match_control(controls(), text, mode)
        if target:
            return target
        swipe(direction)
    raise RuntimeError(f"Control not found after scrolling: {text}")


def sample():
    filename = "/sdcard/Download/jx-s4b-synthetic.jpg"
    adb("push", str(BATCH / "samples/test-portrait.jpg"), filename)
    adb("shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", "file://" + filename)


def submit_feedback():
    sample()
    hit(find("我的", "contains"))
    hit(scroll_find("账号与帮助", "contains"))
    hit(scroll_find("帮助与反馈"))
    hit(find("向平台提交问题"))
    fill_feedback()
    hit(scroll_find("选择并上传附件"))
    hit(find("jx-s4b-synthetic.jpg"))
    find("已上传，等待本次明确提交", "contains")
    hit(find("提交反馈"))
    find("已提交，等待受理", "contains")
    screenshot("android-submitted.png")


def verify_reply(asset):
    if not re.fullmatch(r"[\da-f-]{36}", asset):
        raise ValueError("Provide the same ticket attachment UUID")
    hit(scroll_find("重新读取进度"))
    find("重新提出问题")
    screenshot("android-answered.png")
    # The file picker can only save bytes after an authorized App download.
    swipe("up")
    target = scroll_find("下载本次材料", "contains", direction="up")
    hit(target)
    hit(find("SAVE"))
    find("附件已保存。")
    remote = "/sdcard/Download/反馈附件-" + asset + ".bin"
    adb("pull", remote, str(OUT / "android-downloaded.bin"))
    assert (OUT / "android-downloaded.bin").read_bytes() == (BATCH / "samples/test-portrait.jpg").read_bytes()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("adb",type=Path)
    parser.add_argument("serial")
    parser.add_argument("batch",type=Path)
    parser.add_argument("out",type=Path)
    parser.add_argument("action",choices=["inspect","tap","open","type","swipe","key","screenshot","sample","login",
                                          "fill-feedback","submit-feedback","verify-reply"])
    parser.add_argument("value",nargs="?")
    parser.add_argument("--contains",action="store_true")
    args = parser.parse_args()
    ADB, SERIAL, BATCH, OUT = args.adb, args.serial, args.batch.resolve(), args.out.resolve()
    if SERIAL != "emulator-5554" or adb("emu","avd","name").splitlines()[0] != b"JX_API35":
        raise SystemExit("Only the project JX_API35 emulator is permitted")
    if not re.fullmatch(r"jx_test_stock_pm03_[\da-f]{24}", BATCH.name) or ".local" not in OUT.parts:
        raise SystemExit("Use the QA run directory and a PM03 synthetic batch")
    match args.action:
        case "inspect":
            for node in controls():
                if label(node) or node.get("class","").endswith("EditText"):
                    safe = re.sub(r"(?<!\d)\d{6,11}(?!\d)", "[NUMBER]", label(node))
                    print(node.get("class"), node.get("bounds"), safe)
        case "tap":
            hit(find(args.value,"contains" if args.contains else "exact"))
        case "open":
            adb("shell","am","start","-W","-n",f"{PACKAGE}/com.jingjingshangri.jingjingshangri_app.MainActivity")
        case "type":
            enter(args.value)
        case "swipe":
            swipe(args.value)
        case "key":
            adb("shell","input","keyevent",args.value)
        case "screenshot":
            if not re.fullmatch(r"[a-z0-9-]+\.png",args.value):
                raise ValueError("Expected an evidence filename")
            screenshot(args.value)
        case "sample":
            sample()
        case "login":
            login(args.value)
        case "fill-feedback":
            fill_feedback()
        case "submit-feedback":
            submit_feedback()
        case "verify-reply":
            verify_reply(args.value)
