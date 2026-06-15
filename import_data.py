# -*- coding: utf-8 -*-
"""
将 robots_data.json 通过 Supabase API 批量导入数据库。
用法: python import_data.py <SUPABASE_URL> <SUPABASE_ANON_KEY>
前提: 已运行 convert_xlsx_to_json.py 生成 robots_data.json
"""

import json
import sys
import urllib.request
import urllib.error

DATA_FILE = "robots_data.json"
BATCH_SIZE = 20


def import_data(url, key):
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        robots = json.load(f)

    print(f"读取到 {len(robots)} 条记录")

    endpoint = f"{url}/rest/v1/robots"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    success = 0
    errors = 0

    for i in range(0, len(robots), BATCH_SIZE):
        batch = robots[i : i + BATCH_SIZE]
        data = json.dumps(batch).encode("utf-8")

        req = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as resp:
                if resp.status in (200, 201):
                    success += len(batch)
                else:
                    errors += len(batch)
                    print(f"  批次 {i//BATCH_SIZE + 1} 失败: HTTP {resp.status}")
        except urllib.error.HTTPError as e:
            errors += len(batch)
            body = e.read().decode("utf-8", errors="replace")
            print(f"  批次 {i//BATCH_SIZE + 1} 失败: {e.code} - {body[:200]}")

        print(f"  进度: {success + errors}/{len(robots)}")

    print(f"\n导入完成: {success} 成功, {errors} 失败")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("用法: python import_data.py <SUPABASE_URL> <SUPABASE_ANON_KEY>")
        print('示例: python import_data.py https://xxx.supabase.co "eyJ..."')
        sys.exit(1)

    import_data(sys.argv[1], sys.argv[2])
