import Image from "next/image";
import { cn } from "@/lib/utils";

const BROKER_LOGOS: Record<string, { src: string; alt: string }> = {
  SPTD: { src: "/SPTD.png", alt: "SpeedTrader" },
  TOS:  { src: "/TOS.png",  alt: "Schwab (TOS)" },
  CBRA:  { src: "/CBRA.jpg",  alt: "Cobra" },
};

export function BrokerLogo({
  broker,
  size = 16,
  className,
}: {
  broker: string;
  size?: number;
  className?: string;
}) {
  const meta = BROKER_LOGOS[broker];
  if (!meta) {
    return (
      <span className={cn("text-[10px] text-slate-500 font-mono", className)}>
        {broker}
      </span>
    );
  }
  return (
    <Image
      src={meta.src}
      alt={meta.alt}
      width={size}
      height={size}
      className={cn("rounded-sm object-contain", className)}
      title={meta.alt}
    />
  );
}
