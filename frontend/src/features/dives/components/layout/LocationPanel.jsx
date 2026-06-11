import React from 'react'
import { SectionLabel } from '../ui/SectionLabel'
import { TrajectoryViewer } from '@/features/dives/components/TrajectoryViewer'

export function LocationPanel({ dive, hasGps }) {
  return (
    <div className="flex-none lg:flex-1 h-[250px] lg:h-auto lg:min-h-[150px] flex flex-col rounded-xl bg-card border border-border overflow-hidden">
      <SectionLabel>
        <span className="px-3 pt-3 block">Location</span>
      </SectionLabel>
      <div className="flex-1 min-h-0 relative z-0">
        <TrajectoryViewer
          diveId={dive._id}
          hasGps={hasGps}
          gpsLocation={dive.gpsLocation}
        />
      </div>
      {hasGps && dive.locationName && (
        <div className="shrink-0 px-3 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground truncate" title={dive.locationName}>
            {dive.locationName}
          </p>
        </div>
      )}
    </div>
  )
}
