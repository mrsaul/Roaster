import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { addDays, format, getDay, startOfDay } from "date-fns";

interface DeliveryDatePickerProps {
  selected: string | null;
  onSelect: (date: string) => void;
}

function getDeliveryDates(): { date: Date; available: boolean }[] {
  const today = startOfDay(new Date());
  const dates: { date: Date; available: boolean }[] = [];

  for (let i = 1; i <= 28; i++) {
    const d = addDays(today, i);
    const day = getDay(d);
    const available = day === 2 || day === 5;

    if (available) {
      dates.push({ date: d, available: true });
    }
  }

  return dates;
}

export function DeliveryDatePicker({ selected, onSelect }: DeliveryDatePickerProps) {
  const dates = getDeliveryDates();

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      {dates.map(({ date, available }) => {
        const iso = format(date, "yyyy-MM-dd");
        const isSelected = selected === iso;
        return (
          <motion.button
            key={iso}
            whileTap={available ? { scale: 0.95 } : undefined}
            disabled={!available}
            onClick={() => onSelect(iso)}
            className={cn(
              "flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border text-foreground transition-colors duration-150",
              available && !isSelected && "border-border bg-card hover:bg-muted",
              available && isSelected && "border-primary bg-primary text-primary-foreground",
              !available && "border-border bg-secondary text-muted-foreground opacity-30 line-through cursor-not-allowed"
            )}
          >
            <span className="text-[9px] font-medium uppercase tracking-[0.18em]">
              {format(date, "EEE")}
            </span>
            <span className="text-base font-semibold tabular-nums leading-none">
              {format(date, "d")}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
