import { cn } from "@/lib/utils";

interface HeroBlobsProps {
  className?: string;
}

export function HeroBlobs({ className }: HeroBlobsProps) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)} aria-hidden="true">
      <div className="blob bg-emerald-200 w-72 h-72 -top-20 -left-20 animate-blob" />
      <div className="blob bg-teal-200 w-80 h-80 -bottom-24 -right-16 animate-blob" style={{ animationDelay: "-4s" }} />
      <div className="blob bg-cyan-200 w-64 h-64 top-1/3 -right-24 animate-blob" style={{ animationDelay: "-8s" }} />
    </div>
  );
}
