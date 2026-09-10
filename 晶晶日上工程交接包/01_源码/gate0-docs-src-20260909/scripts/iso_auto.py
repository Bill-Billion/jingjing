"""Gate0 隔离实验自驱采集：冷启动 App（内建 V0–V7 自动轮换+统计上屏），
持续滚动并每 5s 截屏。跑完后用 make_sheet.py 把各截图顶部报告条拼成大图。

用法：python iso_auto.py
"""
import subprocess, time, os

ADB = r"C:\Android\platform-tools\adb.exe"
PKG = "com.jingjingshangri.jingjingshangri_app"
ACT = f"{PKG}/.MainActivity"
OUT = os.path.dirname(os.path.abspath(__file__))

def sh(*a):
    return subprocess.run([ADB, *a], capture_output=True)

def snap(name):
    p = subprocess.run([ADB, "exec-out", "screencap", "-p"], capture_output=True)
    with open(name, "wb") as f:
        f.write(p.stdout)

def main():
    sh("shell", "input", "keyevent", "KEYCODE_WAKEUP")
    sh("shell", "am", "force-stop", PKG)
    time.sleep(1.5)
    sh("shell", "am", "start", "-n", ACT)
    t0 = time.time()
    print("launched at", t0)
    time.sleep(10)  # 等冷启动进入首页（轮换从首帧起 8×15s=120s）
    end = t0 + 190  # 11 变体 × 15s = 165s（自首帧起），留足尾部余量
    k = 0
    n = 0
    next_snap = time.time()
    while time.time() < end:
        if k % 5 == 4:
            sh("shell", "input", "swipe", "576", "700", "576", "1900", "280")
        else:
            sh("shell", "input", "swipe", "576", "1900", "576", "500", "280")
        k += 1
        time.sleep(0.85)
        if time.time() >= next_snap:
            n += 1
            snap(os.path.join(OUT, f"_isoA_{n:02d}.png"))
            print("snap", n, f"t={time.time()-t0:.1f}s")
            next_snap = time.time() + 5.0
    print("done, total snaps:", n)

if __name__ == "__main__":
    main()
