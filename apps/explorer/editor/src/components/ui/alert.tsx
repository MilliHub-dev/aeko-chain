import * as React from 'react'
import { cn } from '../../lib/utils'
export const Alert=({className,...props}:React.ComponentProps<'div'>)=><div role="alert" className={cn('relative w-full rounded-lg border border-border bg-card p-4 text-sm text-card-foreground',className)} {...props}/>
export const AlertTitle=({className,...props}:React.ComponentProps<'h5'>)=><h5 className={cn('mb-1 font-medium leading-none',className)} {...props}/>
export const AlertDescription=({className,...props}:React.ComponentProps<'div'>)=><div className={cn('text-sm text-muted-foreground',className)} {...props}/>
