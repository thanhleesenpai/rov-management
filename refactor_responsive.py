import os
import re

file_path = r"d:\Code\rov-management\frontend\src\features\dives\DiveDetailPage.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Update left column
c = c.replace(
    'className="w-full lg:w-56 flex-none lg:shrink lg:min-h-0 flex flex-col gap-3 order-2 lg:order-1"',
    'className="w-full lg:w-56 flex-none flex flex-col gap-3 order-2 lg:order-1 lg:min-h-0"'
)

# 2. Update ResizeObserver logic (change 60 to 100, and remove fixed 16/9 assumption if possible, but actually 16/9 is fine for now since we don't have video natural dimensions easily accessible in this scope)
c = c.replace('cHeight - videoActualHeight > 60', 'cHeight - videoActualHeight >= 100')

# 3. Drop chartExpanded state and inline chart, replace with BottomChart component
# First, remove chartExpanded state
c = re.sub(r'const \[chartExpanded,\s*setChartExpanded\]\s*=\s*useState\(false\)\n?', '', c)

# Then, replace the inline chart block with <BottomChart />
# Find from "{/* ─── BOTTOM CHART" to the end of the div
start_idx = c.find("{/* ─── BOTTOM CHART")
if start_idx != -1:
    end_idx = c.find("      </div>\n\n      {/* Modals & Popups", start_idx)
    if end_idx != -1:
        bottom_chart_jsx = """      {/* ─── BOTTOM CHART ───────────────────────────────────────────────────────────── */}
      <BottomChart
        chartExpanded={false}
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
"""
        c = c[:start_idx] + bottom_chart_jsx + c[end_idx:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(c)

print("Applied modifications to DiveDetailPage.jsx")
