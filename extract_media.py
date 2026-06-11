import os
import re

file_path = r"d:\Code\rov-management\frontend\src\features\dives\DiveDetailPage.jsx"
with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

def get_block(start_line_1_idx, end_line_1_idx):
    return "".join(lines[start_line_1_idx-1:end_line_1_idx])

media_helpers = get_block(44, 63)
thumb_vertical = get_block(102, 147)
recorded_at_editor = get_block(148, 199)
custom_video_controls = get_block(200, 535) # Actually AIAnalyzePopover and RetryAnalysisButton are here too
evidence_video_controls = get_block(536, 666)
evidence_viewer = get_block(667, 1131)
main_media_renderer = get_block(1132, 1222)
evidence_panel = get_block(1225, 1356)

media_shared_content = f"""import React, {{ useState, useEffect, useRef }} from 'react'
import {{ useQuery, useQueryClient }} from '@tanstack/react-query'
import {{ createPortal }} from 'react-dom'
import {{ 
  File, FileText, CheckCircle2, AlertTriangle, X, Play, Pause, 
  Volume2, VolumeX, Maximize2, Minimize2, Loader, 
  Clock, Info, Trash2, Camera, Clapperboard, Square, Images
}} from 'lucide-react'
import api from '@/lib/axios'
import {{ Skeleton }} from '@/components/shared/Skeleton'
import {{ useAuthStore }} from '@/store/auth.store'

{media_helpers}
{thumb_vertical}
{recorded_at_editor}
{custom_video_controls}
{main_media_renderer}
"""

evidence_shared_content = f"""import React, {{ useState, useEffect, useRef }} from 'react'
import {{ useQuery, useQueryClient }} from '@tanstack/react-query'
import {{ 
  File, FileText, CheckCircle2, AlertTriangle, X, Play, Pause, 
  Volume2, VolumeX, Maximize2, Minimize2, Loader, 
  Clock, Info, Trash2, Camera, Clapperboard, Square, Images, Eye, EyeOff
}} from 'lucide-react'
import api from '@/lib/axios'

{evidence_video_controls}
{evidence_viewer}
{evidence_panel}
"""

with open(r"d:\Code\rov-management\frontend\src\features\dives\components\media\MediaShared.jsx", 'w', encoding='utf-8') as f:
    f.write(media_shared_content)

with open(r"d:\Code\rov-management\frontend\src\features\dives\components\evidence\EvidenceShared.jsx", 'w', encoding='utf-8') as f:
    f.write(evidence_shared_content)

print("Files generated!")
