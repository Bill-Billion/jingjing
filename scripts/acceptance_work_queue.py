"""Generate a read-only acceptance work queue; never mark tests as passed."""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs/testing/FULL_BUSINESS_ACCEPTANCE_20261028.json"
OUT = ROOT / "docs/testing/ACCEPTANCE_WORK_QUEUE_20261102.md"
CASES = {"normal": "正常办理", "reverse": "取消/退款/撤回", "unauthorized": "越权拒绝", "duplicate": "重复操作",
         "state_change": "权限或状态变化", "recovery": "中断恢复", "login_return": "重新登录返回",
         "dirty_form": "未保存输入", "field_error": "错误字段", "pagination": "分页返回",
         "pending_recovery": "未知结果恢复", "review": "审阅证据"}
SURFACES = {"api": "后端", "app": "App", "web": "网页", "operations": "运营", "review": "独立审阅"}

def cell(value):
    return str(value).replace("|", "／").replace("\n", " ")

def render(data):
    items = data["items"] + data["supplemental_items"]
    assert len(items) == 151 and len({i["id"] for i in items}) == 151
    count = Counter(i["status"] for i in items)
    partial_count = sum(bool(i.get("partial_evidence")) for i in items)
    lines = ["# 151条验收：逐条工作队列", "",
        "由 scripts/acceptance_work_queue.py 从正式登记生成；不执行测试，不改变验收状态。",
        "后端负责人 chengcongcong222 主测及记录；前端负责人 Bill-Billion 修页面并提供同版产物。原18组和12路线不变。", "",
        f"登记共{len(items)}条；状态：{dict(count)}；其中{partial_count}条有显式登记的局部证据关联。",
        "局部证据关联数不等于通过数；未挂关联也不等于未开发。历史检查未系统逐条归档，仍须按下表核完整预期。", "",
        "先办理现货、人工定制、试镜商单与机构，随后共创/权益/抽奖/余额/成长，再隐私/参演发行；遇到页面缺口归负责人，其余路线继续。",
        "新合同扩展另见合同收尾和财务交接；不得改掉原预期以凑通过。正式通过仍须同版、同记录、所需端和全部场景的证据及独立审阅。", "",
        "|标准/工作|所需端|必测场景|已有局部线索|当前登记|",
        "|---|---|---|---|---|"]
    for item in items:
        refs = []
        for partial in item.get("partial_evidence", []):
            a = partial["artifact"]
            target = (ROOT / a["path"]).resolve()
            assert target.is_relative_to(ROOT) and target.is_file(), a["path"]
            assert hashlib.sha256(target.read_bytes()).hexdigest() == a["sha256"], a["path"]
            report = json.loads(target.read_text(encoding="utf-8"))
            available = {x["id"] for x in report.get("items", report.get("checks", []))}
            assert set(partial["checks"]) <= available, item["id"]
            refs.append(", ".join(partial["checks"]) + "（局部）")
        # Show the approved current expectation; preserve original wording in the register.
        work = item.get("effective_expected") or item.get("work", "")
        lines.append("|" + "|".join(map(cell, [
            item["id"] + " " + work,
            "、".join(SURFACES.get(v, v) for v in item["required_surfaces"]),
            "、".join(CASES.get(v, v) for v in item["required_cases"]),
            "；".join(refs) or "尚待按完整预期整理",
            item["status"]])) + "|")
    lines += ["", "原始预期、需求变化依据、局部报告路径和哈希保存在 FULL_BUSINESS_ACCEPTANCE_20261028.json；本表是可读队列，不替代正式登记。", ""]
    return "\n".join(lines)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    from full_business_check import read, validate, SOURCE as REQUIREMENTS
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    errors = validate(ROOT, data, read(ROOT, "docs/tasks/board.json"), read(ROOT, REQUIREMENTS))
    if errors:
        raise SystemExit("Invalid register: " + "; ".join(errors))
    content = render(data)
    if args.check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != content:
            raise SystemExit("Acceptance queue stale; run python scripts/acceptance_work_queue.py")
    else:
        OUT.write_text(content, encoding="utf-8")
    items = data["items"] + data["supplemental_items"]
    count = Counter(i["status"] for i in items)
    partial_count = sum(bool(i.get("partial_evidence")) for i in items)
    print(json.dumps({"registered": len(items), "statuses": dict(count), "partial_links": partial_count,
                      "status_changed": False, "output": str(OUT.relative_to(ROOT))}, ensure_ascii=False))

if __name__ == "__main__":
    main()
