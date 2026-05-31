import React from 'react'
import { MapPin } from 'lucide-react'
import { SectionLabel } from '../ui/SectionLabel'
import DiveMap from '@/features/dives/components/DiveMap'

export function LocationPanel({ dive, hasGps }) {
  return (
    <div className="flex-none lg:flex-1 h-[250px] lg:h-auto lg:min-h-[150px] flex flex-col rounded-xl bg-card border border-border overflow-hidden">
      <SectionLabel>
        <span className="px-3 pt-3 block">Location</span>
      </SectionLabel>
      <div className="flex-1 min-h-0 relative z-0">
        {hasGps ? (
          <DiveMap lat={dive.gpsLocation.lat} lng={dive.gpsLocation.lng} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-muted">
            <MapPin size={22} className="text-muted-foreground/40" />
            <p className="text-[10px] text-muted-foreground">No GPS data</p>
          </div>
        )}
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
