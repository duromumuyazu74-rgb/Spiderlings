"""Bundle the four editable originals, their brief and an unchanged test Mod."""
import json
import shutil
import zipfile
from pathlib import Path

mod = Path(__file__).resolve().parents[1]
workspace = mod.parent
version = json.loads((mod / 'mod.json').read_text(encoding='utf-8-sig'))['modbuild']
base = workspace / f'Spiderlings_{version}.zip'
kit = workspace / '.scratch' / 'spiderlings-spinner-art-test10' / 'artist-kit'
kit.mkdir(parents=True, exist_ok=True)
files = ['Base-Mod.zip', 'Build-Preview.ps1', 'BUILD-PREVIEW.cmd', 'README.txt']
shutil.copyfile(base, kit / 'Base-Mod.zip')
for name in ['Build-Preview.ps1', 'BUILD-PREVIEW.cmd']:
    shutil.copyfile(mod / 'tools' / 'artist-kit' / name, kit / name)
folder = Path('Models/SpiderlingsSpinnerLegbinder')
(kit / folder).mkdir(parents=True, exist_ok=True)
for name in ['Band.png', 'Tail.png', 'Finished.png', 'Closure.png', 'README.en.html', 'README.zh-CN.html']:
    relative = folder / name
    shutil.copyfile(mod / relative, kit / relative)
    files.append(relative.as_posix())
(kit / 'README.txt').write_text(
    f'Spiderlings {version} artist kit\n\n'
    'Open Models/SpiderlingsSpinnerLegbinder/README.en.html first.\n'
    'Replace the four PNGs in that folder, preserving RGBA canvases and placement.\n'
    'Double-click BUILD-PREVIEW.cmd to create Preview.zip.\n'
    'Fully reload the game, disable other Spiderlings packages, and load Preview.zip.\n'
    'Start a new character with the Spinner field trial perk.\n'
    'Base-Mod.zip is the unmodified installable reference.\n\n'
    '先阅读 Models/SpiderlingsSpinnerLegbinder/README.zh-CN.html。\n'
    '替换同目录四张 PNG，保持画布和位置；双击 BUILD-PREVIEW.cmd 生成 Preview.zip。\n'
    '重载游戏，只启用 Preview.zip，新建角色选择“结网幼蛛试玩”。\n', encoding='utf-8-sig')
output = workspace / f'Spiderlings_{version}-artist-kit.zip'
if output.exists():
    raise SystemExit(f'Refusing to overwrite existing delivery: {output}')
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
    for relative in files:
        archive.write(kit / relative, relative)
print(f'Wrote {output} with {len(files)} explicit entries.')
