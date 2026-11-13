import sys, re, argparse

P = [chr(0xFF08)+chr(0x7C98)+chr(0x8D34), chr(0x5B)+chr(0x586B)+chr(0x5165),
     chr(0x5F)*4, chr(0x3A)+chr(0x5F)*2, chr(0x2E)*3,
     chr(0x7565), chr(0x5DF2)+chr(0x5F52)+chr(0x6863),
     chr(0x5F85)+chr(0x586B), chr(0x5F85)+chr(0x8865),
     chr(0x2026), chr(0x7701)+chr(0x7565), chr(0x53C2)+chr(0x89C1),
     chr(0x54)+chr(0x42)+chr(0x44)]

def scan_text(text):
    return any(re.search(re.escape(p), text) for p in P)

def validate_echo(text):
    markers = re.findall(r'\[回显开始\](.*?)\[回显结束\]', text, re.DOTALL)
    if text.count('[回显开始]') != text.count('[回显结束]'):
        return False, "标记不成对"
    for block in markers:
        lines = [line.strip() for line in block.strip().splitlines() if line.strip()]
        if not lines:
            continue
        first_line = lines[0]
        if not (first_line.startswith('mac@') or first_line.startswith('$ ')):
            return False, "首非空行非命令回显"
        for line in lines:
            if '..' in line and '...' not in line:
                return False, "疑似手工改写"
    return True, "OK"

def run_body(path):
    text = open(path, encoding='utf-8').read()
    valid, msg = validate_echo(text)
    if not valid:
        print(f"EXIT 3: {msg}")
        sys.exit(3)
    body = re.sub(r'\[回显开始\].*?\[回显结束\]', '', text, flags=re.DOTALL)
    if scan_text(body):
        print("HIT 业务正文违规")
        sys.exit(2)
    print("CLEAN")
    print("EXEMPT: 回显段豁免")
    sys.exit(0)

def run_selftest():
    print(f"PATTERN_COUNT: {len(P)}")
    c1 = "正文干净。\n[回显开始]\nmac@host % git status -sb\n## main...origin [ahead 1]\n[回显结束]"
    c2 = "正文有____拦截"
    c3 = "SQL ... where"
    c4 = "正文 [回显结束] 缺开始"
    c5 = "[回显开始]\nmac@host % git\n## main..origin\n[回显结束]"
    
    passed = 0
    valid, _ = validate_echo(c1)
    if valid and not scan_text(re.sub(r'\[回显开始\].*?\[回显结束\]', '', c1, flags=re.DOTALL)):
        print("CASE_1: CLEAN + EXEMPT"); passed += 1
    else: print("CASE_1: FAIL"); return 1

    if scan_text(c2): print("CASE_2: HIT 命中"); passed += 1
    else: print("CASE_2: FAIL")

    if scan_text(c3): print("CASE_3: HIT 命中"); passed += 1
    else: print("CASE_3: FAIL")

    v4, _ = validate_echo(c4)
    v5, _ = validate_echo(c5)
    if not v4 and not v5:
        print("CASE_4: PASS 硬校验成功"); passed += 1
    else:
        print("CASE_4: FAIL")

    if passed == 4:
        print("ALL_PASS")
        sys.exit(0)
    else:
        print("ALL_PASS 缺失")
        sys.exit(3)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--body')
    parser.add_argument('--selftest', action='store_true')
    args = parser.parse_args()
    if args.selftest:
        run_selftest()
    elif args.body:
        run_body(args.body)
