import os
import re

file_path = r"d:\Code\rov-management\frontend\src\features\dives\components\evidence\EvidenceShared.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('function EvidencePanel', 'export function EvidencePanel')
c = c.replace('function EvidenceViewer', 'export function EvidenceViewer')
c = c.replace('function EvidenceVideoControls', 'export function EvidenceVideoControls')
c = "import { useMediaUrl, resolveType } from '../media/MediaShared'\n" + c

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(c)
