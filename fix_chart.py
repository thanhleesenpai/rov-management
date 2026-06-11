import os

file_path = r"d:\Code\rov-management\frontend\src\features\dives\DiveDetailPage.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# The inline chart starts around line 1310.
# Let's find exactly where it is!
start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "BOTTOM CHART" in line and start_idx == -1:
        start_idx = i
    if "modals" in line.lower() and start_idx != -1 and end_idx == -1:
        end_idx = i - 1  # 1561 is the closing div of the main container

if start_idx != -1 and end_idx != -1:
    new_lines = lines[:start_idx]
    new_lines.append("""      {/* ─── BOTTOM CHART ───────────────────────────────────────────────────────────── */}
      <BottomChart
        chartTab={chartTab}
        setChartTab={setChartTab}
        hidden={hidden}
        setHidden={setHidden}
        hasNavData={hasNavData}
        hasPowerData={hasPowerData}
        chartData={chartData}
        syncIdx={syncIdx}
        anomalySet={anomalySet}
        isDark={true}
        hasSensor={hasSensor}
      />
""")
    new_lines.extend(lines[end_idx:])
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("Chart replaced successfully.")
else:
    print(f"Could not find bounds! start_idx={start_idx}, end_idx={end_idx}")
