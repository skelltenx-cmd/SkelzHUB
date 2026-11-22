import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        // Shimmer gradient (bukan pulse abu polos) — terasa hidup & premium.
        // Keyframes `shimmer` sudah ada di globals.css (@theme --animate-shimmer).
        "animate-shimmer rounded-md",
        "bg-[linear-gradient(110deg,var(--muted)_8%,color-mix(in_oklab,var(--foreground)_7%,var(--muted))_18%,var(--muted)_33%)] bg-[length:200%_100%]",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
