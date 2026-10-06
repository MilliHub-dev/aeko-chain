import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'
export function TooltipProvider({children}:{children:ReactNode}){return <TooltipPrimitive.Provider delayDuration={250}>{children}</TooltipPrimitive.Provider>}
export function Tooltip({children,label}:{children:ReactNode;label:string}){return <TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content side="right" sideOffset={8} className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-md">{label}<TooltipPrimitive.Arrow className="fill-popover"/></TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root>}
