"""Compile the independent C experiment and measure relocatable code/data.

LLVM's Z80 backend emits assembly but cannot emit objects directly in this build.
Normalize its directives and raw byte strings for the bundled GNU assembler.
Unresolved helpers are reported; their size is not included in the object total.
"""
from pathlib import Path
import re
import subprocess
import json

root = Path(__file__).resolve().parent
tools = root / 'tools' / 'CEdev'
out = root / 'out'
out.mkdir(exist_ok=True)

def run(exe, *args):
    result = subprocess.run([str(exe), *map(str, args)], check=True, capture_output=True)
    return result.stdout.decode('utf-8', errors='replace')

results = []
for opt in ['Oz', 'Os', 'O2']:
    asm = out / f'llvm-{opt}.s'
    obj = out / f'llvm-{opt}.o'
    run(tools / 'bin/ez80-clang.exe', '--target=z80', '-'+opt,
        '-ffreestanding', '-fno-builtin', '-S', root / 'chess.c', '-o', asm)
    code = asm.read_bytes()
    code = re.sub(rb'\bdb\s+"([^"\n]*)"', lambda m:
                  b'.byte ' + b','.join(str(b).encode() for b in m[1]), code)
    code = re.sub(rb'^\s*public\s+', b'\t.global ', code, flags=re.M)
    code = re.sub(rb'^\s*private[^\n]*', b'', code, flags=re.M)
    code = re.sub(rb'^\s*extern\s+', b'\t.extern ', code, flags=re.M)
    code = re.sub(rb'^\s*\.addrsig[^\n]*', b'', code, flags=re.M)
    gas = out / f'llvm-{opt}-gas.s'
    gas.write_bytes(code)
    run(tools / 'binutils/bin/z80-none-elf-as.exe', '-march=z80+xyhl', gas, '-o', obj)
    size = run(tools / 'binutils/bin/z80-none-elf-size.exe', obj)
    undefined = run(tools / 'binutils/bin/z80-none-elf-nm.exe', '-u', obj)
    print(opt, size, undefined)
    fields = size.splitlines()[-1].split()
    results.append({'optimization': opt, 'code_and_data_bytes': int(fields[3]),
                    'unresolved_symbols': [line.split()[-1] for line in undefined.splitlines() if line.strip()],
                    'runnable_in_simulator': False})
(root / 'llvm-results.json').write_text(json.dumps(results, indent=2)+'\n')
